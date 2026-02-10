'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExportPreviewDialog, type ExportOptions } from '@/components/database/ExportPreviewDialog';
import {
  clearEntireDatabase,
  deleteGame,
  downloadDatabaseExport,
  fetchDatabaseExportCount,
  type DatabaseExportCount,
  type DatabaseScope,
} from '@/lib/api';
import type { DatabaseGameOption } from '@/types';

interface ActionsTabProps {
  games: DatabaseGameOption[];
  scope: DatabaseScope;
  onStatsRefresh: () => Promise<void>;
  t: (key: string) => string;
}

export function ActionsTab({ games, scope, onStatsRefresh, t }: ActionsTabProps) {
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState<DatabaseExportCount | null>(null);
  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);

  async function handleExportPreview() {
    setDownloadError(null);
    setExportPreviewOpen(true);
    setExportPreviewLoading(true);
    setExportPreviewData(null);
    try {
      const data = await fetchDatabaseExportCount({
        scope,
        app_id: selectedGameId,
        language: null,
        query: null,
      });
      setExportPreviewData(data);
    } catch (err) {
      console.error('Failed to fetch export preview:', err);
      setDownloadError((err as Error).message || 'Failed to load export preview.');
    } finally {
      setExportPreviewLoading(false);
    }
  }

  async function handleDownload(format: 'csv' | 'jsonl', options: ExportOptions) {
    setDownloadBusy(true);
    setDownloadError(null);
    setExportPreviewOpen(false);
    try {
      await downloadDatabaseExport({
        format,
        scope,
        app_id: selectedGameId,
        language: null,
        query: null,
        max_rows: options.maxRows,
      });
    } catch (err) {
      setDownloadError((err as Error).message || 'Download failed.');
    } finally {
      setDownloadBusy(false);
    }
  }

  async function handleDeleteGame() {
    if (!selectedGameId) {
      setAdminError('Select a game to delete.');
      return;
    }
    const confirmDelete = window.confirm(
      `Delete all stored data for app ${selectedGameId}? This removes reviews, labels, and analysis results.`,
    );
    if (!confirmDelete) return;

    setAdminBusy(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await deleteGame(selectedGameId);
      setAdminSuccess(`Successfully deleted data for app ${selectedGameId}.`);
      setSelectedGameId(null);
      await onStatsRefresh();
    } catch (err) {
      setAdminError((err as Error).message || 'Failed to delete game data.');
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleClearDatabase() {
    const confirmText = window.prompt(
      'Type DELETE ALL to clear the entire database for all users. This cannot be undone.',
    );
    if (confirmText !== 'DELETE ALL') return;

    setAdminBusy(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await clearEntireDatabase();
      setAdminSuccess('Database cleared successfully.');
      setSelectedGameId(null);
      await onStatsRefresh();
    } catch (err) {
      setAdminError((err as Error).message || 'Failed to clear database.');
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ExportPreviewDialog
        isOpen={exportPreviewOpen}
        onClose={() => setExportPreviewOpen(false)}
        onExport={handleDownload}
        previewData={exportPreviewData}
        loading={exportPreviewLoading}
        exporting={downloadBusy}
      />

      {/* Export Section */}
      <Card variant="glass" className="p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Export Data</p>
        <p className="mt-2 text-sm text-slate-400">Download your review data as CSV or JSONL.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={selectedGameId ?? ''}
            onChange={(e) => setSelectedGameId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g.app_id} value={g.app_id}>
                {g.name || `App ${g.app_id}`}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportPreview}
            disabled={downloadBusy}
          >
            {downloadBusy ? t('database.preparingExport') : t('database.previewExport')}
          </Button>
        </div>
        {downloadError && <p className="mt-3 text-xs text-rose-300">{downloadError}</p>}
      </Card>

      {/* Danger Zone */}
      <Card variant="glass" className="border-rose-500/20 p-5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-rose-500" />
          <p className="text-xs uppercase tracking-[0.25em] text-rose-400">Danger Zone</p>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          These actions are destructive and cannot be undone.
        </p>

        <div className="mt-5 space-y-4">
          {/* Delete selected game */}
          <div className="space-y-3 rounded-xl border border-rose-500/10 bg-rose-500/5 p-4">
            <p className="text-sm font-medium text-slate-200">Delete game data</p>
            <p className="text-xs text-slate-400">
              Remove all reviews, labels, and analysis results for a specific game.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedGameId ?? ''}
                onChange={(e) => setSelectedGameId(e.target.value ? Number(e.target.value) : null)}
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
                loading={adminBusy}
                onClick={handleDeleteGame}
                disabled={adminBusy || !selectedGameId}
              >
                Delete selected game
              </Button>
            </div>
          </div>

          {/* Clear entire database */}
          <div className="space-y-3 rounded-xl border border-rose-500/10 bg-rose-500/5 p-4">
            <p className="text-sm font-medium text-slate-200">Clear entire database</p>
            <p className="text-xs text-slate-400">
              Remove all data for all users. You will be asked to type &quot;DELETE ALL&quot; to confirm.
            </p>
            <Button
              variant="danger"
              size="sm"
              loading={adminBusy}
              onClick={handleClearDatabase}
              disabled={adminBusy}
            >
              Delete all games
            </Button>
          </div>
        </div>

        {adminError && <p className="mt-3 text-xs text-rose-300">{adminError}</p>}
        {adminSuccess && <p className="mt-3 text-xs text-emerald-300">{adminSuccess}</p>}
      </Card>
    </div>
  );
}
