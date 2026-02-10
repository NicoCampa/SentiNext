'use client';

import { MetricCard } from '@/components/ui/card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import type { DatabaseStats } from '@/lib/api';

interface OverviewTabProps {
  stats: DatabaseStats | null;
  loadingStats: boolean;
  scope: 'me' | 'all';
  quickSentiment: 'all' | 'positive' | 'negative';
  setQuickSentiment: (v: 'all' | 'positive' | 'negative') => void;
  quickType: 'all' | 'issue' | 'request';
  setQuickType: (v: 'all' | 'issue' | 'request') => void;
  t: (key: string) => string;
}

export function OverviewTab({
  stats,
  loadingStats,
  scope,
  quickSentiment,
  setQuickSentiment,
  quickType,
  setQuickType,
  t,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('database.stats')}</h2>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {scope === 'all' ? t('database.allUsers') : t('database.myData')}
            </span>
          </div>
          {loadingStats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, idx) => (
                <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard title={t('common.games')} value={stats.games.toLocaleString()} />
              <MetricCard title={t('common.reviews')} value={stats.reviews.toLocaleString()} />
              <MetricCard title={t('database.starred')} value={stats.starred_games.toLocaleString()} />
              <MetricCard title={t('common.labels')} value={stats.labels.toLocaleString()} />
            </div>
          ) : (
            <div className="sm:col-span-2 lg:col-span-4">
              <EmptyState
                title={t('database.noData')}
                description={t('database.noDataDesc')}
                icon="DB"
                variant="info"
                action={
                  <a href="/dashboard">
                    <Button variant="primary">{t('dashboard.analyze')}</Button>
                  </a>
                }
              />
            </div>
          )}
        </div>

        <Card variant="glass" className="p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('database.quickFilters')}</p>
          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">{t('database.sentiment')}</p>
              <div className="flex flex-wrap gap-2">
                {(['all', 'positive', 'negative'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setQuickSentiment(value)}
                    className={`rounded-full border px-3 py-1 text-[11px] transition ${
                      quickSentiment === value
                        ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/40'
                    }`}
                  >
                    {value === 'all' ? t('common.all') : value === 'positive' ? t('common.recommended') : t('common.notRecommended')}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">{t('database.type')}</p>
              <div className="flex flex-wrap gap-2">
                {(['all', 'issue', 'request'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setQuickType(value)}
                    className={`rounded-full border px-3 py-1 text-[11px] transition ${
                      quickType === value
                        ? 'border-purple-400 bg-purple-500/20 text-purple-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/40'
                    }`}
                  >
                    {value === 'all' ? t('common.all') : value === 'issue' ? t('common.issues') : t('common.requests')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
