'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { PageTransition } from '@/components/PageTransition';
import { ComingSoon } from '@/components/ComingSoon';
import { DatabaseTabBar, type DatabaseTab } from '@/components/database/DatabaseTabBar';
import { OverviewTab } from '@/components/database/tabs/OverviewTab';
import { ReviewsTab } from '@/components/database/tabs/ReviewsTab';
import { ActionsTab } from '@/components/database/tabs/ActionsTab';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { fetchDatabaseStats, fetchDatabaseGames } from '@/lib/api';
import type { DatabaseGameOption } from '@/types';
import type { DatabaseScope, DatabaseStats } from '@/lib/api';

export default function DatabasePage() {
  const { t } = useLanguage();
  const { isAdmin, isLoading: isAdminLoading } = useAdminStatus();
  const searchParams = useSearchParams();

  const [scope, setScope] = useState<DatabaseScope>('me');
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [games, setGames] = useState<DatabaseGameOption[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [quickSentiment, setQuickSentiment] = useState<'all' | 'positive' | 'negative'>('all');
  const [quickType, setQuickType] = useState<'all' | 'issue' | 'request'>('all');
  const [activeTab, setActiveTab] = useState<DatabaseTab>(() => {
    const tab = searchParams?.get('tab');
    if (tab === 'reviews' || tab === 'actions') return tab;
    return 'overview';
  });

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStats(true);
    try {
      const [newStats, newGames] = await Promise.all([
        fetchDatabaseStats(scope),
        fetchDatabaseGames(scope),
      ]);
      setStats(newStats);
      setGames(newGames);
    } catch (err) {
      console.error('Failed to load database data:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [scope, isAdmin]);

  useEffect(() => {
    if (isAdminLoading || !isAdmin) return;
    loadData();
  }, [loadData, isAdminLoading, isAdmin]);

  if (isAdminLoading || !isAdmin) {
    return (
      <AppLayout>
        <PageTransition>
          <ComingSoon
            title="Database coming soon"
            description="The database explorer is under construction. Check back soon."
          />
        </PageTransition>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                <span className="text-white">{t('database.title')}</span>
              </h1>
              <p className="text-sm text-slate-400">{t('database.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 p-1 text-xs uppercase tracking-[0.25em] text-slate-400">
              <button
                type="button"
                onClick={() => setScope('me')}
                className={`rounded-full px-3 py-1 transition ${
                  scope === 'me'
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('database.myData')}
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`rounded-full px-3 py-1 transition ${
                  scope === 'all'
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('database.allUsers')}
              </button>
            </div>
          </div>

          {/* Tab Bar */}
          <DatabaseTabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              loadingStats={loadingStats}
              scope={scope}
              quickSentiment={quickSentiment}
              setQuickSentiment={setQuickSentiment}
              quickType={quickType}
              setQuickType={setQuickType}
              t={t}
            />
          )}
          {activeTab === 'reviews' && (
            <ReviewsTab
              scope={scope}
              games={games}
              quickSentiment={quickSentiment}
              setQuickSentiment={setQuickSentiment}
              quickType={quickType}
              setQuickType={setQuickType}
              t={t}
            />
          )}
          {activeTab === 'actions' && (
            <ActionsTab
              games={games}
              scope={scope}
              onStatsRefresh={loadData}
              t={t}
            />
          )}
        </div>
      </PageTransition>
    </AppLayout>
  );
}
