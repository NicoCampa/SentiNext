'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { analyzeGame, fetchAnalysisResult, fetchProgress, saveStarredGame, subscribeToProgress } from '@/lib/api';
import { loadDefaultAnalysisReviewCount, saveDefaultAnalysisReviewCount } from '@/lib/analysisDefaults';
import { SearchResult, AnalyzeResponse, ProgressStatus } from '@/types';

interface AnalysisTask {
  game: SearchResult;
  status: 'analyzing' | 'completed' | 'error';
  progress: ProgressStatus | null;
  result: AnalyzeResponse | null;
  error: string | null;
}

interface StartAnalysisOptions {
  refresh?: boolean;
  persist?: boolean;
  review_count?: number;
  language?: string;
  filter?: string;
  day_range?: number | null;
  refresh_days?: number | null;
}

interface AnalysisContextType {
  tasks: Map<number, AnalysisTask>;
  startAnalysis: (game: SearchResult, options?: StartAnalysisOptions) => Promise<void>;
  getTask: (appId: number) => AnalysisTask | undefined;
  clearTask: (appId: number) => void;
}

const AnalysisContext = createContext<AnalysisContextType | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Map<number, AnalysisTask>>(new Map());

  // Track progress for active analyses using SSE with polling fallback
  useEffect(() => {
    const activeTasks = Array.from(tasks.entries()).filter(
      ([, task]) => task.status === 'analyzing'
    );

    if (activeTasks.length === 0) return;

    const cleanups: (() => void)[] = [];
    const pollingFallbacks = new Map<number, NodeJS.Timeout>();

    // Helper to handle completion
    const handleCompletion = async (appId: number, task: AnalysisTask) => {
      try {
        const analysis = await fetchAnalysisResult(appId);
        if (analysis.status === 'completed') {
          if (analysis.metadata && analysis.insights) {
            try {
              await saveStarredGame({
                app_id: appId,
                name: task.game.name,
                metadata: analysis.metadata,
                insights: analysis.insights,
                sample: analysis.reviews,
              });
            } catch (err) {
              console.error('Failed to persist analysis result', err);
            }
          }
          setTasks((prev) => {
            const newTasks = new Map(prev);
            const existing = newTasks.get(appId);
            if (existing) {
              newTasks.set(appId, {
                ...existing,
                status: 'completed',
                result: {
                  metadata: analysis.metadata || existing.result?.metadata || {
                    app_id: appId,
                    requested: 0,
                    retrieved: 0,
                    language: 'unknown',
                    fetched_at: '',
                  },
                  insights: analysis.insights,
                  reviews: analysis.reviews,
                } as AnalyzeResponse,
                progress: null,
                error: null,
              });
            }
            return newTasks;
          });
        } else if (analysis.status === 'failed') {
          setTasks((prev) => {
            const newTasks = new Map(prev);
            const existing = newTasks.get(appId);
            if (existing) {
              newTasks.set(appId, {
                ...existing,
                status: 'error',
                progress: null,
                error: analysis.error || 'Analysis failed',
              });
            }
            return newTasks;
          });
        }
      } catch {
        // Ignore fetch errors during completion check
      }
    };

    // Start polling fallback for a task
    const startPollingFallback = (appId: number, task: AnalysisTask) => {
      if (pollingFallbacks.has(appId)) return;

      const interval = setInterval(async () => {
        try {
          const progress = await fetchProgress(appId);
          setTasks((prev) => {
            const newTasks = new Map(prev);
            const existing = newTasks.get(appId);
            if (existing && existing.status === 'analyzing') {
              newTasks.set(appId, { ...existing, progress });
            }
            return newTasks;
          });

          // Check if completed
          if (!progress.active && progress.total > 0) {
            await handleCompletion(appId, task);
            clearInterval(interval);
            pollingFallbacks.delete(appId);
          }
        } catch (err) {
          console.error(`Progress fetch error for ${appId}:`, err);
        }
      }, 1500);

      pollingFallbacks.set(appId, interval);
    };

    // Try SSE first, fall back to polling
    for (const [appId, task] of activeTasks) {
      try {
        const cleanup = subscribeToProgress(appId, {
          onProgress: (processed, total, active) => {
            setTasks((prev) => {
              const newTasks = new Map(prev);
              const existing = newTasks.get(appId);
              if (existing && existing.status === 'analyzing') {
                newTasks.set(appId, {
                  ...existing,
                  progress: { app_id: appId, processed, total, active, updated_at: null },
                });
              }
              return newTasks;
            });
          },
          onCompleted: () => {
            handleCompletion(appId, task);
          },
          onError: (error) => {
            console.warn(`SSE error for ${appId}, falling back to polling:`, error);
            startPollingFallback(appId, task);
          },
          onTimeout: () => {
            console.warn(`SSE timeout for ${appId}`);
            startPollingFallback(appId, task);
          },
        });
        cleanups.push(cleanup);
      } catch {
        // SSE not supported or failed, use polling
        startPollingFallback(appId, task);
      }
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      pollingFallbacks.forEach((interval) => clearInterval(interval));
    };
  }, [tasks]);

  const startAnalysis = useCallback(async (game: SearchResult, options: StartAnalysisOptions = {}) => {
    const appId = game.appid;
    const persist = options.persist ?? true;
    const refresh = options.refresh ?? false;
    const reviewCount = options.review_count ?? loadDefaultAnalysisReviewCount();
    const language = options.language ?? "english";
    const filter = options.filter ?? "recent";
    const refreshDays = refresh ? (options.refresh_days ?? 30) : undefined;
    const dayRange = options.day_range ?? undefined;
    // Check if already analyzing
    const existing = tasks.get(appId);
    if (existing && existing.status === 'analyzing') {
      console.log(`Already analyzing ${game.name}`);
      return;
    }

    // Start new analysis
    setTasks((prev) => {
      const newTasks = new Map(prev);
      newTasks.set(appId, {
        game,
        status: 'analyzing',
        progress: null,
        result: null,
        error: null,
      });
      return newTasks;
      });

    try {
      saveDefaultAnalysisReviewCount(reviewCount);
      const result = await analyzeGame({
        app_id: appId,
        review_count: reviewCount,
        language,
        filter,
        day_range: dayRange,
        persist,
        refresh,
        refresh_days: refreshDays,
      });

      // Update task metadata but leave status as analyzing (LLM runs in background)
      setTasks((prev) => {
        const newTasks = new Map(prev);
        newTasks.set(appId, {
          game,
          status: 'analyzing',
          progress: null,
          result: result,
          error: null,
        });
        return newTasks;
      });
    } catch (err) {
      const error = (err as Error).message || 'Analysis failed';
      setTasks((prev) => {
        const newTasks = new Map(prev);
        newTasks.set(appId, {
          game,
          status: 'error',
          progress: null,
          result: null,
          error,
        });
        return newTasks;
      });
    }
  }, [tasks]);

  const getTask = useCallback(
    (appId: number) => {
      return tasks.get(appId);
    },
    [tasks]
  );

  const clearTask = useCallback((appId: number) => {
    setTasks((prev) => {
      const newTasks = new Map(prev);
      newTasks.delete(appId);
      return newTasks;
    });
  }, []);

  return (
    <AnalysisContext.Provider value={{ tasks, startAnalysis, getTask, clearTask }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error('useAnalysis must be used within AnalysisProvider');
  }
  return context;
}
