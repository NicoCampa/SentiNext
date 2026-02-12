'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { PageTransition } from '@/components/PageTransition';
import { ReviewsTab } from '@/components/database/tabs/ReviewsTab';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStarredGames } from '@/contexts/StarredGamesContext';
import {
  fetchDatabaseStats,
  fetchDatabaseGames,
  deleteGame,
  clearEntireDatabase,
} from '@/lib/api';
import type { DatabaseGameOption } from '@/types';
import type { DatabaseStats } from '@/lib/api';

export default function DatabasePage() {
  const { t } = useLanguage();
  const { refresh: refreshStarred } = useStarredGames();

  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [games, setGames] = useState<DatabaseGameOption[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const loadData = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [newStats, newGames] = await Promise.all([
        fetchDatabaseStats(),
        fetchDatabaseGames(),
      ]);
      setStats(newStats);
      setGames(newGames);
    } catch (err) {
      console.error('Failed to load database data:', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDeleteGame(appId: number) {
    await deleteGame(appId);
    await Promise.all([loadData(), refreshStarred()]);
  }

  async function handleClearDatabase() {
    await clearEntireDatabase();
    await Promise.all([loadData(), refreshStarred()]);
  }

  const statItems = [
    { label: t('common.games'), value: stats?.games },
    { label: t('common.reviews'), value: stats?.reviews },
    { label: t('common.labels'), value: stats?.labels },
  ];

  return (
    <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {t('database.title')}
              </h1>
              <p className="mt-1 text-sm text-slate-400">{t('database.subtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
              {statItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-1.5"
                >
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {item.label}
                  </span>
                  <span className="text-sm font-medium text-white">
                    {loadingStats ? '...' : (item.value ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews explorer */}
          <Suspense
            fallback={
              <Card variant="glass" className="p-6 text-sm text-slate-400">
                Loading reviews explorer...
              </Card>
            }
          >
            <ReviewsTab games={games} onDeleteGame={handleDeleteGame} onClearDatabase={handleClearDatabase} t={t} />
          </Suspense>

        </div>
      </PageTransition>
    </AppLayout>
  );
}
