'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { PageTransition } from '@/components/PageTransition';
import { ReviewsTab } from '@/components/database/tabs/ReviewsTab';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
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

  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [games, setGames] = useState<DatabaseGameOption[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const [dangerOpen, setDangerOpen] = useState(false);
  const [selectedDeleteGameId, setSelectedDeleteGameId] = useState<number | null>(null);
  const [busy, setAdminBusy] = useState(false);
  const [actionError, setAdminError] = useState<string | null>(null);
  const [actionSuccess, setAdminSuccess] = useState<string | null>(null);

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

  async function handleDeleteGame() {
    if (!selectedDeleteGameId) return;
    const game = games.find((g) => g.app_id === selectedDeleteGameId);
    const label = game?.name || `App ${selectedDeleteGameId}`;
    if (!window.confirm(`Delete all data for ${label}? This cannot be undone.`)) return;

    setAdminBusy(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await deleteGame(selectedDeleteGameId);
      setAdminSuccess(`Deleted data for ${label}.`);
      setSelectedDeleteGameId(null);
      await loadData();
    } catch (err) {
      setAdminError((err as Error).message || 'Failed to delete.');
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleClearDatabase() {
    if (window.prompt('Type DELETE ALL to confirm.') !== 'DELETE ALL') return;

    setAdminBusy(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await clearEntireDatabase();
      setAdminSuccess('Database cleared.');
      setSelectedDeleteGameId(null);
      await loadData();
    } catch (err) {
      setAdminError((err as Error).message || 'Failed to clear.');
    } finally {
      setAdminBusy(false);
    }
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
          <ReviewsTab games={games} t={t} />

          {/* Danger zone - collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setDangerOpen(!dangerOpen)}
              className="flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              <span className="uppercase tracking-[0.2em]">Danger zone</span>
              <svg
                className={`h-3 w-3 transition-transform ${dangerOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {dangerOpen && (
              <Card variant="glass" className="mt-3 border-rose-500/20 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-200">Delete game data</p>
                    <p className="text-xs text-slate-400">
                      Remove all reviews, labels, and analysis results for one game.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedDeleteGameId ?? ''}
                        onChange={(e) =>
                          setSelectedDeleteGameId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                      >
                        <option value="">Select a game</option>
                        {games.map((g) => (
                          <option key={g.app_id} value={g.app_id}>
                            {g.name || `App ${g.app_id}`}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busy}
                        onClick={handleDeleteGame}
                        disabled={busy || !selectedDeleteGameId}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-200">Clear entire database</p>
                    <p className="text-xs text-slate-400">
                      Remove all data. You will be asked to type &quot;DELETE ALL&quot; to confirm.
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busy}
                      onClick={handleClearDatabase}
                      disabled={busy}
                    >
                      Delete all data
                    </Button>
                  </div>
                </div>

                {actionError && <p className="mt-3 text-xs text-rose-300">{actionError}</p>}
                {actionSuccess && <p className="mt-3 text-xs text-emerald-300">{actionSuccess}</p>}
              </Card>
            )}
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
