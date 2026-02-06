'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef, useMemo } from 'react';
import { analyzeGame, fetchAnalysisResult, fetchProgress, saveStarredGame, subscribeToProgress, cancelAnalysis } from '@/lib/api';
import { loadDefaultAnalysisReviewCount, saveDefaultAnalysisReviewCount } from '@/lib/analysisDefaults';
import { SearchResult, AnalyzeResponse, ProgressStatus } from '@/types';

interface ProgressWithEstimate extends ProgressStatus {
  remainingSeconds?: number | null;
}

interface AnalysisTask {
  game: SearchResult;
  status: 'analyzing' | 'completed' | 'error';
  progress: ProgressWithEstimate | null;
  result: AnalyzeResponse | null;
  error: string | null;
}

interface StartAnalysisOptions {
  refresh?: boolean;
  persist?: boolean;
  review_count?: number;
  language?: string;
  languages?: string[];
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

const PROGRESS_SMOOTHING = 0.25;

interface ProgressStats {
  startTime: number;
  smoothedSeconds: number | null;
  lastProcessed: number;
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Map<number, AnalysisTask>>(new Map());
  const progressStatsRef = useRef<Map<number, ProgressStats>>(new Map());

  const resetProgressStats = useCallback((appId: number) => {
    progressStatsRef.current.delete(appId);
  }, []);

  const attachProgressEstimate = useCallback(
    (appId: number, progress: ProgressStatus): ProgressWithEstimate => {
      const now = Date.now();
      const statsMap = progressStatsRef.current;
      const existing = statsMap.get(appId);
      const processed = Math.max(progress.processed, 0);
      const total = Math.max(progress.total, 0);

      let stats: ProgressStats;
      if (!existing || processed < existing.lastProcessed) {
        stats = {
          startTime: now,
          smoothedSeconds: null,
          lastProcessed: processed,
        };
      } else {
        stats = existing;
      }

      const elapsedSeconds = Math.max((now - stats.startTime) / 1000, 1);
      let remainingSeconds: number | null = null;

      if (total > 0) {
        if (processed >= total) {
          remainingSeconds = 0;
        } else if (processed > 0) {
          const rate = processed / elapsedSeconds;
          if (rate > 0.01) {
            remainingSeconds = (total - processed) / rate;
          }
        }
      }

      if (remainingSeconds === null && stats.smoothedSeconds !== null) {
        remainingSeconds = stats.smoothedSeconds;
      }

      if (remainingSeconds !== null && remainingSeconds >= 0) {
        stats.smoothedSeconds =
          stats.smoothedSeconds === null
            ? remainingSeconds
            : stats.smoothedSeconds * (1 - PROGRESS_SMOOTHING) + remainingSeconds * PROGRESS_SMOOTHING;
        remainingSeconds = stats.smoothedSeconds;
      }

      stats.lastProcessed = processed;
      statsMap.set(appId, stats);

      return { ...progress, remainingSeconds };
    },
    []
  );

  // Compute a stable key for active tasks - only changes when the set of analyzing appIds changes
  const activeTaskIds = useMemo(() => {
    const ids = Array.from(tasks.entries())
      .filter(([, task]) => task.status === 'analyzing')
      .map(([appId]) => appId)
      .sort((a, b) => a - b);
    return ids.join(',');
  }, [tasks]);

  // Store tasks in a ref so the effect can access current state without re-running
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Track progress for active analyses using SSE with polling fallback
  // Only re-run when the SET of active task IDs changes, not on every progress update
  useEffect(() => {
    const activeIds = activeTaskIds ? activeTaskIds.split(',').map(Number) : [];
    if (activeIds.length === 0) return;

    const activeTasks = activeIds
      .map((appId) => [appId, tasksRef.current.get(appId)] as const)
      .filter((entry): entry is [number, AnalysisTask] => entry[1] !== undefined);

    if (activeTasks.length === 0) return;

    const cleanups: (() => void)[] = [];
    const pollingFallbacks = new Map<number, NodeJS.Timeout>();
    const completedTasks = new Set<number>(); // Track completed to avoid duplicate handling

    // Helper to handle completion
    const handleCompletion = async (appId: number, task: AnalysisTask) => {
      if (completedTasks.has(appId)) return; // Avoid duplicate completion handling
      completedTasks.add(appId);

      try {
        const analysis = await fetchAnalysisResult(appId);
        if (analysis.status === 'completed') {
          resetProgressStats(appId);
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
          resetProgressStats(appId);
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
        } else {
          // Status is still 'analyzing' or something else - remove from completed so we can retry
          completedTasks.delete(appId);
        }
      } catch {
        // Fetch failed - remove from completed so we can retry
        completedTasks.delete(appId);
      }
    };

    // Start polling fallback for a task
    const startPollingFallback = (appId: number, task: AnalysisTask) => {
      if (pollingFallbacks.has(appId)) return;

      const interval = setInterval(async () => {
        // Check if task is still analyzing
        const currentTask = tasksRef.current.get(appId);
        if (!currentTask || currentTask.status !== 'analyzing') {
          clearInterval(interval);
          pollingFallbacks.delete(appId);
          return;
        }

        try {
          const progress = await fetchProgress(appId);
          const progressWithEstimate = attachProgressEstimate(appId, progress);
          setTasks((prev) => {
            const newTasks = new Map(prev);
            const existing = newTasks.get(appId);
            if (existing && existing.status === 'analyzing') {
              newTasks.set(appId, { ...existing, progress: progressWithEstimate });
            }
            return newTasks;
          });

          // Check if completed: require total > 0 and either not active or fully processed.
          // The active flag from the backend accounts for the analysis_result status,
          // so active=false with total=0 during the "fetching" phase is not completion.
          const isComplete =
            progressWithEstimate.total > 0 &&
            (!progressWithEstimate.active || progressWithEstimate.processed >= progressWithEstimate.total);

          if (isComplete) {
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
          onProgress: (processed, total, active, phase, fetchedCount) => {
            // Check if task is still analyzing
            const currentTask = tasksRef.current.get(appId);
            if (!currentTask || currentTask.status !== 'analyzing') return;

            setTasks((prev) => {
              const newTasks = new Map(prev);
              const existing = newTasks.get(appId);
              if (existing && existing.status === 'analyzing') {
                const rawProgress: ProgressStatus = {
                  app_id: appId,
                  processed,
                  total,
                  active,
                  updated_at: new Date().toISOString(),
                  phase,
                  fetched_count: fetchedCount,
                };
                newTasks.set(appId, {
                  ...existing,
                  progress: attachProgressEstimate(appId, rawProgress),
                });
              }
              return newTasks;
            });

            // Also check for completion in SSE progress updates
            const isComplete =
              total > 0 && (!active || processed >= total);
            if (isComplete) {
              handleCompletion(appId, task);
            }
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
  }, [activeTaskIds, resetProgressStats, attachProgressEstimate]);

  const startAnalysis = useCallback(async (game: SearchResult, options: StartAnalysisOptions = {}) => {
    const appId = game.appid;
    const persist = options.persist ?? true;
    const refresh = options.refresh ?? false;
    const reviewCount = options.review_count ?? loadDefaultAnalysisReviewCount();
    const language = options.language ?? "all";
    const languages = options.languages;
    const filter = options.filter ?? "recent";
    const refreshDays = refresh ? (options.refresh_days ?? 30) : undefined;
    const dayRange = options.day_range ?? undefined;
    // Check if already analyzing
    const existing = tasks.get(appId);
    if (existing && existing.status === 'analyzing') {
      return;
    }

    // Reset progress stats before starting
    resetProgressStats(appId);

    // Call API first — if it rejects (402/429), re-throw so the caller
    // can show the error inline instead of flashing the AnalysisWidget.
    saveDefaultAnalysisReviewCount(reviewCount);
    const result = await analyzeGame({
      app_id: appId,
      review_count: reviewCount,
      language,
      languages,
      filter,
      day_range: dayRange,
      persist,
      refresh,
      refresh_days: refreshDays,
    });

    // API accepted — now create the task so the widget appears
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
  }, [tasks, resetProgressStats]);

  const getTask = useCallback(
    (appId: number) => {
      return tasks.get(appId);
    },
    [tasks]
  );

  const clearTask = useCallback(async (appId: number) => {
    // Check if task is still analyzing - if so, cancel it on the backend
    const task = tasksRef.current.get(appId);
    if (task && task.status === 'analyzing') {
      try {
        await cancelAnalysis(appId);
      } catch (err) {
        console.error('Failed to cancel analysis:', err);
      }
    }

    resetProgressStats(appId);
    setTasks((prev) => {
      const newTasks = new Map(prev);
      newTasks.delete(appId);
      return newTasks;
    });
  }, [resetProgressStats]);

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
