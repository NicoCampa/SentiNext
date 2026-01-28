'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchDatabaseStats } from '@/lib/api';
import type { DatabaseStats } from '@/lib/api';

export default function DatabasePage() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await fetchDatabaseStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load database stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center p-20">
          <p className="text-slate-400">Loading database stats...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-8 p-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
              Database Overview
            </span>
          </h1>
          <p className="text-sm text-slate-400">View statistics for your local database</p>
        </div>

        {/* Database Statistics */}
        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-medium">Database Statistics</h2>
          {stats ? (
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">Games</p>
                <p className="text-2xl font-semibold text-sky-300">{stats.games.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">Reviews</p>
                <p className="text-2xl font-semibold text-sky-300">{stats.reviews.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">Starred</p>
                <p className="text-2xl font-semibold text-sky-300">{stats.starred_games.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">Labels (Total)</p>
                <p className="text-2xl font-semibold text-sky-300">{stats.labels.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No local data yet"
              description="Run your first analysis to populate the database."
              icon="◫"
              variant="info"
              action={
                <a href="/dashboard">
                  <Button variant="primary">Analyze a Game</Button>
                </a>
              }
            />
          )}
        </Card>

      </div>

    </AppLayout>
  );
}
