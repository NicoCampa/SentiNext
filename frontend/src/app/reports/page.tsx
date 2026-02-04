'use client';

import { useEffect, useState } from 'react';
import { fetchStarredGames, fetchReportMonths, downloadExecutiveSummary, type ReportMonth } from '@/lib/api';
import type { StarredGameDTO } from '@/types';
import { AppLayout } from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SteamImage } from '@/components/SteamImage';
import { MonthSelector } from '@/components/reports/MonthSelector';
import { BackButton } from '@/components/BackButton';
import { PageTransition } from '@/components/PageTransition';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { ComingSoon } from '@/components/ComingSoon';

export default function ReportsPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdminStatus();
  const showComingSoon = true;
  const [starredGames, setStarredGames] = useState<StarredGameDTO[]>([]);
  const [selectedGame, setSelectedGame] = useState<StarredGameDTO | null>(null);
  const [availableMonths, setAvailableMonths] = useState<ReportMonth[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<ReportMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthsLoading, setMonthsLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null);

  // Load starred games on mount
  useEffect(() => {
    if (showComingSoon || isAdminLoading || !isAdmin) return;
    async function load() {
      try {
        const games = await fetchStarredGames();
        setStarredGames(games);
      } catch (err) {
        console.error('Failed to load starred games:', err);
        setError('Failed to load games. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAdmin, isAdminLoading]);

  // Load available months when game is selected
  useEffect(() => {
    if (showComingSoon || !selectedGame || isAdminLoading || !isAdmin) {
      setAvailableMonths([]);
      setSelectedMonth(null);
      setLastGeneratedAt(null);
      return;
    }

    const game = selectedGame; // Capture for async function

    async function loadMonths() {
      setMonthsLoading(true);
      setError(null);
      try {
        const response = await fetchReportMonths(game.app_id);
        setAvailableMonths(response.months);
        // Auto-select the first month
        if (response.months.length > 0) {
          setSelectedMonth(response.months[0]);
        } else {
          setSelectedMonth(null);
        }
      } catch (err) {
        console.error('Failed to load available months:', err);
        setError('Failed to load available months');
        setAvailableMonths([]);
        setSelectedMonth(null);
      } finally {
        setMonthsLoading(false);
      }
    }
    loadMonths();
  }, [selectedGame, isAdmin, isAdminLoading]);

  useEffect(() => {
    setLastGeneratedAt(null);
  }, [selectedMonth?.year, selectedMonth?.month]);

  const handleGameSelect = (game: StarredGameDTO) => {
    setSelectedGame(game);
  };

  const handleDownload = async () => {
    if (!selectedGame || !selectedMonth) return;

    setDownloadLoading(true);
    setError(null);
    try {
      await downloadExecutiveSummary(selectedGame.app_id, selectedMonth.year, selectedMonth.month);
      setLastGeneratedAt(new Date());
    } catch (err) {
      console.error('Failed to download report:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setDownloadLoading(false);
    }
  };

  const selectedRange = selectedMonth
    ? (() => {
        const start = new Date(selectedMonth.year, selectedMonth.month - 1, 1);
        const end = new Date(selectedMonth.year, selectedMonth.month, 0);
        return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
      })()
    : null;

  if (showComingSoon || isAdminLoading || !isAdmin) {
    return (
      <AppLayout>
        <PageTransition>
          <ComingSoon
            title="Reports coming soon"
            description="This section is under construction. Check back soon."
          />
        </PageTransition>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Card variant="glass" className="p-8">
            <div className="flex items-center justify-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-sky-500" />
              <p className="text-lg text-slate-300">Loading games...</p>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (starredGames.length === 0) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <EmptyState
            title="No analyzed games"
            description="Analyze some games first to generate reports."
            variant="info"
            action={
              <a href="/dashboard">
                <Button variant="primary">Analyze Games</Button>
              </a>
            }
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
          {/* Back Button */}
          <BackButton />

          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                Executive Summary Reports
              </span>
            </h1>
            <p className="text-sm text-slate-400">
              Generate monthly PDF reports with insights, trends, and key metrics
            </p>
          </div>

        {/* Game Selection Grid */}
        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Select Game ({starredGames.length} analyzed)
          </h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {starredGames.map((game) => {
              const isSelected = selectedGame?.app_id === game.app_id;
              return (
                <button
                  key={game.app_id}
                  onClick={() => handleGameSelect(game)}
                  className={`relative overflow-hidden rounded-lg border transition-all ${
                    isSelected
                      ? 'border-sky-500 ring-2 ring-sky-500/50'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="aspect-[460/215] relative">
                    <SteamImage
                      appId={game.app_id}
                      variant="header"
                      alt={game.name}
                      className="h-full w-full object-cover"
                      imageUrl={game.metadata?.header_image}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-sky-500/20 flex items-center justify-center">
                        <div className="bg-sky-500 text-white rounded-full p-2">
                          <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-slate-900/90">
                    <p className="text-sm font-medium text-white truncate">{game.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Report Configuration Card */}
        {selectedGame && (
          <Card variant="glass" className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Generate Report</h2>
              <p className="text-sm text-slate-400">
                Select a month to generate an executive summary PDF report
              </p>
            </div>

            {/* Month Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Report Period</label>
              <MonthSelector
                months={availableMonths}
                selected={selectedMonth}
                onChange={setSelectedMonth}
                loading={monthsLoading}
              />
            </div>

            {/* Stats Preview */}
            {selectedMonth && (
              <div className="rounded-lg bg-slate-900/50 border border-white/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-300">Selected Period</p>
                    <p className="text-lg font-semibold text-white">{selectedMonth.label}</p>
                    {selectedRange && (
                      <p className="text-xs text-slate-500 mt-1">{selectedRange}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-300">Reviews</p>
                    <p className="text-lg font-semibold text-sky-400">
                      {selectedMonth.review_count.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs text-slate-400">
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="uppercase tracking-wider text-xs text-slate-500">Pages</p>
                    <p className="text-sm text-slate-200 mt-1">6 pages</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="uppercase tracking-wider text-xs text-slate-500">Last generated</p>
                    <p className="text-sm text-slate-200 mt-1">
                      {lastGeneratedAt ? lastGeneratedAt.toLocaleString() : "Not generated yet"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="uppercase tracking-wider text-xs text-slate-500">Includes</p>
                    <p className="text-sm text-slate-200 mt-1">Summary + insights</p>
                  </div>
                </div>
              </div>
            )}

            {selectedMonth && (
              <div className="rounded-lg border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 mb-3">Report contents</p>
                <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-300">
                  {[
                    "Executive overview & key metrics",
                    "Sentiment trends + risk signals",
                    "Top issues and complaints",
                    "Top feature requests",
                    "Player segment breakdowns",
                    "Executive recommendations",
                  ].map((item) => (
                    <div key={item} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Download Button */}
            <div className="flex gap-4">
              <Button
                onClick={handleDownload}
                disabled={!selectedMonth || downloadLoading}
                variant="primary"
                className="flex-1"
              >
                {downloadLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Download PDF Report
                  </>
                )}
              </Button>
            </div>

            {/* Info Note */}
            <div className="rounded-lg bg-sky-500/10 border border-sky-500/30 p-4">
              <p className="text-xs text-sky-300">
                Reports are generated using your existing analysis data and do not consume additional credits.
              </p>
            </div>
          </Card>
        )}
        </div>
      </PageTransition>
    </AppLayout>
  );
}
