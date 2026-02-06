'use client';

import { useState } from 'react';
import { useAnalysis } from '@/contexts/AnalysisContext';
import { SteamImage } from './SteamImage';
import clsx from 'clsx';

function formatRemainingTime(seconds?: number | null) {
  if (seconds === undefined || seconds === null) {
    return null;
  }
  if (seconds <= 0) {
    return 'Less than a second';
  }
  const value = Math.round(seconds);
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainder}s`;
  }
  return `${remainder}s`;
}

export function AnalysisWidget() {
  const { tasks, clearTask } = useAnalysis();
  const [isMinimized, setIsMinimized] = useState(false);

  const activeTasks = Array.from(tasks.entries());
  const hasActiveTasks = activeTasks.length > 0;

  if (!hasActiveTasks) {
    return null;
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:bottom-6 sm:right-6 sm:w-96 sm:max-w-[calc(100vw-3rem)]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-800/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">
              Analysis Queue ({activeTasks.length})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
              aria-label={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* Task List */}
        {!isMinimized && (
          <div className="max-h-96 space-y-2 overflow-y-auto p-4">
            {activeTasks.map(([appId, task]) => {
              const remainingLabel = task.progress
                ? formatRemainingTime(task.progress.remainingSeconds)
                : null;
              return (
                <div
                key={appId}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-800/30 p-3"
              >
                <SteamImage
                  appId={task.game.appid}
                  variant="capsule"
                  alt={task.game.name}
                  className="h-12 w-20 flex-shrink-0 rounded object-cover"
                  imageUrl={task.game.image_url}
                />

                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white line-clamp-1">
                      {task.game.name}
                    </p>
                    {(task.status === 'completed' || task.status === 'analyzing') && (
                      <button
                        onClick={() => clearTask(appId)}
                        className="flex-shrink-0 rounded p-0.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
                        title={task.status === 'analyzing' ? 'Cancel analysis' : 'Dismiss'}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Status */}
                  {task.status === 'analyzing' && (
                    <div className="space-y-1.5">
                      {/* Phase indicator with step number */}
                      {(() => {
                        const phase = task.progress?.phase;
                        const total = task.progress?.total ?? 0;
                        const processed = task.progress?.processed ?? 0;
                        const fetchedCount = task.progress?.fetched_count ?? 0;
                        const labelEstimate = task.result?.label_estimate;
                        const cachedReviews = labelEstimate?.cached_reviews ?? 0;
                        const llmReviews = labelEstimate?.llm_reviews ?? 0;
                        const estimatedTotal = labelEstimate?.total_reviews ?? 0;

                        // Determine current step and label
                        let stepNumber = 1;
                        let stepLabel = '';
                        let stepDetail = '';
                        let cacheDetail = '';
                        let showProgress = false;

                        if (phase === 'fetching' || (!phase && total === 0 && !task.progress)) {
                          stepNumber = 1;
                          stepLabel = 'Fetching reviews from Steam';
                          stepDetail = fetchedCount > 0 ? `${fetchedCount} reviews fetched` : 'Connecting to Steam API...';
                        } else if (phase === 'classifying' || (!phase && processed < total)) {
                          stepNumber = 2;
                          stepLabel = 'Classifying reviews with AI';
                          stepDetail = total > 0 ? `${processed} of ${total} reviews analyzed` : 'Preparing classification...';
                          showProgress = total > 0;

                          if (labelEstimate && estimatedTotal > 0) {
                            if (llmReviews === 0 && cachedReviews > 0) {
                              cacheDetail = `All ${cachedReviews.toLocaleString()} reviews already labeled (cached).`;
                            } else if (cachedReviews > 0 && llmReviews > 0) {
                              cacheDetail = `Using cached labels for ${cachedReviews.toLocaleString()} reviews; ${llmReviews.toLocaleString()} need new labels.`;
                            }
                          }
                        } else if (phase === 'building_insights') {
                          stepNumber = 3;
                          stepLabel = 'Building insights';
                          stepDetail = 'Aggregating categories, trends & segments...';
                        } else if (phase === 'idle' && total > 0) {
                          // Only show "Finalizing" when total > 0, meaning
                          // classification actually happened and is wrapping up.
                          stepNumber = 4;
                          stepLabel = 'Finalizing';
                          stepDetail = 'Saving results...';
                        } else {
                          // Fallback - either initial state or unknown phase
                          stepNumber = 1;
                          stepLabel = 'Starting analysis';
                          stepDetail = 'Preparing...';
                        }

                        return (
                          <>
                            {/* Step indicator */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-200">
                                {stepLabel}
                              </span>
                            </div>

                            {/* Detail text */}
                            <p className="text-[11px] text-slate-400">
                              {stepDetail}
                            </p>
                            {cacheDetail && (
                              <p className="text-[11px] text-emerald-300/80">
                                {cacheDetail}
                              </p>
                            )}

                            {/* Progress bar for classification phase */}
                            {showProgress && (
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                                <div
                                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
                                  style={{
                                    width: `${(processed / total) * 100}%`,
                                  }}
                                />
                              </div>
                            )}

                            {/* Time estimate */}
                            {remainingLabel && showProgress && (
                              <p className="text-[11px] tracking-wide text-slate-400">
                                Est. remaining:{' '}
                                <span className="font-mono text-slate-200">{remainingLabel}</span>
                              </p>
                            )}

                            {/* Pipeline steps overview */}
                            <div className="flex items-center gap-1 pt-1">
                              {[1, 2, 3, 4].map((step) => (
                                <div
                                  key={step}
                                  className={clsx(
                                    'h-1 flex-1 rounded-full transition-colors',
                                    step < stepNumber && 'bg-sky-500',
                                    step === stepNumber && 'bg-sky-500 animate-pulse',
                                    step > stepNumber && 'bg-slate-700'
                                  )}
                                />
                              ))}
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-500">
                              <span>Fetch</span>
                              <span>Classify</span>
                              <span>Insights</span>
                              <span>Save</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {task.status === 'completed' && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <span>Analysis complete</span>
                      <a
                              href={`/dashboard?game=${appId}`}
                              className="ml-auto text-sky-400 hover:text-sky-300 hover:underline"
                            >
                              View
                            </a>
                          </div>
                        )}

                        {task.status === 'error' && (
                          <div className="text-xs text-rose-400">
                            Error: {task.error}
                          </div>
                        )}
                      </div>
                    </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
