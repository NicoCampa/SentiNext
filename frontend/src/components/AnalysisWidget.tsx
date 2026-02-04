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
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {(() => {
                            const phase = task.progress?.phase;
                            const total = task.progress?.total ?? 0;
                            const processed = task.progress?.processed ?? 0;
                            const fetchedCount = task.progress?.fetched_count ?? 0;

                            // Use phase if available (more reliable)
                            if (phase === 'fetching') {
                              return fetchedCount > 0
                                ? `Fetching reviews from Steam... (${fetchedCount})`
                                : 'Fetching reviews from Steam...';
                            }
                            if (phase === 'classifying') {
                              return processed >= total && total > 0
                                ? 'Building insights...'
                                : 'Classifying reviews with AI...';
                            }
                            // When phase is 'idle' or undefined with no meaningful data,
                            // show finalizing to avoid confusion (completion event is imminent)
                            if (phase === 'idle') {
                              return 'Finalizing...';
                            }

                            // Fallback for backwards compatibility (no phase data)
                            if (!task.progress || total === 0) {
                              return 'Fetching reviews from Steam...';
                            }
                            if (processed < total) {
                              return 'Classifying reviews with AI...';
                            }
                            return 'Building insights...';
                          })()}
                        </span>
                        {task.progress && task.progress.total > 0 && (
                          <span>
                            {task.progress.processed} / {task.progress.total}
                          </span>
                        )}
                      </div>
                      {task.progress && task.progress.total > 0 && (
                        <>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                            <div
                              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
                              style={{
                                width: `${(task.progress.processed / task.progress.total) * 100}%`,
                              }}
                            />
                          </div>
                          {remainingLabel && (
                            <p className="text-[11px] tracking-wide text-slate-400">
                              Est. time remaining:{' '}
                              <span className="font-mono text-slate-200">{remainingLabel}</span>
                            </p>
                          )}
                        </>
                      )}
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
