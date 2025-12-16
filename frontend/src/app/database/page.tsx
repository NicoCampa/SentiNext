'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { fetchDatabaseStats, clearLabels, clearEntireDatabase } from '@/lib/api';
import type { DatabaseStats } from '@/lib/api';

export default function DatabasePage() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<{
    action: 'clear_old_labels' | 'clear_all_labels' | 'clear_database' | null;
    message: string;
  }>({ action: null, message: '' });

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

  const handleClearOldLabels = async () => {
    setOperation('clear_old_labels');
    try {
      const result = await clearLabels(true);
      alert(`Deleted ${result.deleted} old schema labels. Reviews will be re-analyzed with new schema.`);
      await loadStats();
    } catch (err) {
      alert(`Failed to clear old labels: ${(err as Error).message}`);
    } finally {
      setOperation(null);
      setShowConfirm({ action: null, message: '' });
    }
  };

  const handleClearAllLabels = async () => {
    setOperation('clear_all_labels');
    try {
      const result = await clearLabels(false);
      alert(`Deleted ${result.deleted} labels. All reviews will need to be re-analyzed.`);
      await loadStats();
    } catch (err) {
      alert(`Failed to clear labels: ${(err as Error).message}`);
    } finally {
      setOperation(null);
      setShowConfirm({ action: null, message: '' });
    }
  };

  const handleClearDatabase = async () => {
    setOperation('clear_database');
    try {
      const result = await clearEntireDatabase();
      const total =
        result.deleted.reviews +
        result.deleted.labels +
        result.deleted.progress +
        result.deleted.starred_games;
      alert(`Database cleared! Deleted ${total} total records.`);
      await loadStats();
    } catch (err) {
      alert(`Failed to clear database: ${(err as Error).message}`);
    } finally {
      setOperation(null);
      setShowConfirm({ action: null, message: '' });
    }
  };

  const confirmAction = (action: 'clear_old_labels' | 'clear_all_labels' | 'clear_database', message: string) => {
    setShowConfirm({ action, message });
  };

  const executeConfirmedAction = () => {
    if (showConfirm.action === 'clear_old_labels') {
      handleClearOldLabels();
    } else if (showConfirm.action === 'clear_all_labels') {
      handleClearAllLabels();
    } else if (showConfirm.action === 'clear_database') {
      handleClearDatabase();
    }
  };

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
              Database Management
            </span>
          </h1>
          <p className="text-sm text-slate-400">
            View statistics and manage your local database
          </p>
        </div>

        {/* Database Statistics */}
        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-medium">Database Statistics</h2>
          {stats && (
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
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
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">New Schema</p>
                <p className="text-2xl font-semibold text-emerald-400">
                  {stats.labels_new_schema.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">Old Schema</p>
                <p className="text-2xl font-semibold text-amber-400">
                  {stats.labels_old_schema.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Warning for old schema */}
        {stats && stats.labels_old_schema > 0 && (
          <Card variant="glass" className="border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-400">▲</span>
              <div className="flex-1 space-y-2 text-sm">
                <p className="font-medium text-amber-300">Old Schema Labels Detected</p>
                <p className="text-slate-300">
                  {stats.labels_old_schema.toLocaleString()} labels are using the old schema and missing
                  category/urgency fields. Clear them to re-analyze with the new schema.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Management Actions */}
        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-medium">Management Actions</h2>
          <div className="space-y-3">
            {/* Clear old labels */}
            <div className="flex items-start justify-between gap-4 rounded-lg border border-white/5 bg-white/5 p-4">
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-medium text-sky-300">Clear Old Schema Labels</h3>
                <p className="text-xs text-slate-400">
                  Delete labels missing category/urgency fields. Reviews will be re-analyzed on next view.
                </p>
              </div>
              <button
                onClick={() =>
                  confirmAction(
                    'clear_old_labels',
                    `Delete ${stats?.labels_old_schema.toLocaleString()} old schema labels?`
                  )
                }
                disabled={operation !== null || (stats?.labels_old_schema ?? 0) === 0}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {operation === 'clear_old_labels' ? 'Clearing...' : 'Clear Old'}
              </button>
            </div>

            {/* Clear all labels */}
            <div className="flex items-start justify-between gap-4 rounded-lg border border-white/5 bg-white/5 p-4">
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-medium text-orange-300">Clear All Labels</h3>
                <p className="text-xs text-slate-400">
                  Delete all LLM analysis labels. Reviews will be re-analyzed on next view.
                </p>
              </div>
              <button
                onClick={() =>
                  confirmAction('clear_all_labels', `Delete all ${stats?.labels.toLocaleString()} labels?`)
                }
                disabled={operation !== null || (stats?.labels ?? 0) === 0}
                className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-400 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {operation === 'clear_all_labels' ? 'Clearing...' : 'Clear All'}
              </button>
            </div>

            {/* Clear entire database */}
            <div className="flex items-start justify-between gap-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-medium text-rose-300">Clear Entire Database</h3>
                <p className="text-xs text-slate-400">
                  Delete all data: reviews, labels, progress, and starred games. This cannot be undone.
                </p>
              </div>
              <button
                onClick={() => confirmAction('clear_database', 'Delete all data from database? This cannot be undone.')}
                disabled={operation !== null || (stats?.reviews ?? 0) === 0}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-400 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {operation === 'clear_database' ? 'Clearing...' : 'Clear Database'}
              </button>
            </div>
          </div>
        </Card>

        {/* Info */}
        <Card variant="glass" className="border-sky-500/20 bg-sky-500/5 p-4">
          <div className="flex items-start gap-3">
            <span className="text-sky-400">●</span>
            <div className="flex-1 space-y-2 text-xs text-slate-300">
              <p>
                <strong className="text-sky-300">New Schema:</strong> Labels with category (bug, performance, balance,
                content, ux, other) and urgency (critical, high, medium, low) fields.
              </p>
              <p>
                <strong className="text-sky-300">Old Schema:</strong> Labels from before the strategic pivot, missing
                actionable insights fields.
              </p>
              <p>
                <strong className="text-sky-300">Note:</strong> Clearing labels does not delete reviews. Reviews will
                be automatically re-analyzed when you view them.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Confirmation Modal */}
      {showConfirm.action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Card variant="glass" className="w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-medium text-rose-300">Confirm Action</h3>
            <p className="mb-6 text-sm text-slate-300">{showConfirm.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm({ action: null, message: '' })}
                disabled={operation !== null}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={operation !== null}
                className="flex-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-400 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {operation ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}