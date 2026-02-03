'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { DatabaseExportCount } from '@/lib/api';

interface ExportPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'csv' | 'jsonl', options: ExportOptions) => void;
  previewData: DatabaseExportCount | null;
  loading: boolean;
  exporting: boolean;
}

export interface ExportOptions {
  includeLabels: boolean;
  includeEvidence: boolean;
  maxRows: number;
}

const MAX_ROW_OPTIONS = [500, 1000, 5000, 10000, 50000];

export function ExportPreviewDialog({
  isOpen,
  onClose,
  onExport,
  previewData,
  loading,
  exporting,
}: ExportPreviewDialogProps) {
  const [includeLabels, setIncludeLabels] = useState(true);
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [maxRows, setMaxRows] = useState(10000);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="button"
        tabIndex={-1}
      />
      <Card variant="glass" className="relative z-10 w-full max-w-lg p-6">
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Export Preview</h2>
            <p className="text-xs text-slate-400">Configure your export settings</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-slate-400 transition hover:bg-slate-900/60 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-sky-400"></div>
            <p className="mt-3 text-sm text-slate-400">Loading preview...</p>
          </div>
        ) : previewData ? (
          <>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Current filters will export:</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Total reviews:</span>
                    <span className="font-semibold text-white">{previewData.total.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Games:</span>
                    <span className="font-semibold text-white">{previewData.games.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {previewData.top_games.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Top games:</p>
                  <div className="mt-3 space-y-2">
                    {previewData.top_games.map((game) => (
                      <div key={game.app_id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{game.name}</span>
                        <span className="text-slate-400">{game.count.toLocaleString()} reviews</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="mb-3 text-xs uppercase tracking-wider text-slate-500">Export options:</p>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={includeLabels}
                      onChange={(e) => setIncludeLabels(e.target.checked)}
                      className="h-4 w-4 rounded border-white/10 bg-slate-950/40 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-slate-300">Include labels (categories, issues, requests)</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={includeEvidence}
                      onChange={(e) => setIncludeEvidence(e.target.checked)}
                      className="h-4 w-4 rounded border-white/10 bg-slate-950/40 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-slate-300">Include evidence snippets</span>
                  </label>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Maximum rows:</label>
                    <select
                      value={maxRows}
                      onChange={(e) => setMaxRows(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      {MAX_ROW_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value.toLocaleString()} rows
                        </option>
                      ))}
                    </select>
                    {previewData.total > maxRows && (
                      <p className="text-xs text-amber-400">
                        Note: Export will be limited to {maxRows.toLocaleString()} rows
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {exporting ? (
              <div className="mt-6 rounded-xl border border-sky-500/50 bg-sky-500/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-300 border-t-transparent"></div>
                  <div>
                    <p className="text-sm font-medium text-sky-200">Preparing export...</p>
                    <p className="text-xs text-sky-300/70">This may take a moment for large datasets</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex items-center justify-end gap-3">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => onExport('csv', { includeLabels, includeEvidence, maxRows })}
                >
                  Export as CSV
                </Button>
                <Button
                  variant="primary"
                  onClick={() => onExport('jsonl', { includeLabels, includeEvidence, maxRows })}
                >
                  Export as JSONL
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-rose-400">Failed to load export preview</p>
          </div>
        )}
      </Card>
    </div>
  );
}
