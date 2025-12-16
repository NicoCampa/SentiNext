'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { analyzeGame, fetchAnalysisResult, fetchProgress, saveStarredGame } from '@/lib/api';
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

  // Poll progress for active analyses
  useEffect(() => {
    const activeTasks = Array.from(tasks.entries()).filter(
      ([, task]) => task.status === 'analyzing'
    );

    if (activeTasks.length === 0) return;

    const interval = setInterval(async () => {
      for (const [appId, task] of activeTasks) {
        try {
          const progress = await fetchProgress(appId);
          setTasks((prev) => {
            const newTasks = new Map(prev);
            const existing = newTasks.get(appId);
            if (existing) {
              newTasks.set(appId, { ...existing, progress });
            }
            return newTasks;
          });
        } catch (err) {
          console.error(`Progress fetch error for ${appId}:`, err);
        }

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
        } catch (err) {
          // Likely 404 while job is still running; ignore quietly
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [tasks]);

  const startAnalysis = useCallback(async (game: SearchResult, options: StartAnalysisOptions = {}) => {
    const appId = game.appid;
    const persist = options.persist ?? true;
    const refresh = options.refresh ?? false;

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
      const result = await analyzeGame({
        app_id: appId,
        review_count: 1000,
        language: 'english',
        filter: 'recent',
        persist,
        refresh,
        refresh_days: refresh ? 30 : undefined,
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
