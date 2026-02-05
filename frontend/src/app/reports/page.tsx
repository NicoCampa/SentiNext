'use client';

import { useEffect, useState } from 'react';
import { fetchReportMonths, downloadExecutiveSummary, type ReportMonth } from '@/lib/api';
import type { StarredGameDTO } from '@/types';
import { AppLayout } from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SteamImage } from '@/components/SteamImage';
import { MonthSelector } from '@/components/reports/MonthSelector';
import { PageTransition } from '@/components/PageTransition';
import { useStarredGames } from '@/contexts/StarredGamesContext';

export default function ReportsPage() {
  const { games: starredGames, loading } = useStarredGames();
  const [selectedGame, setSelectedGame] = useState<StarredGameDTO | null>(null);
  const [availableMonths, setAvailableMonths] = useState<ReportMonth[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<ReportMonth | null>(null);
  const [monthsLoading, setMonthsLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load available months when game is selected
  useEffect(() => {
    if (!selectedGame) {
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
  }, [selectedGame]);

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

  if (loading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Card variant="glass" className="p-8">
            <div className="flex items-center justify-center gap-4">
              <div className="h-8 w-8 animate-spin spinner-blue" />
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
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Reports</h1>
            <p className="text-sm text-slate-400">Generate a monthly executive PDF from existing analysis data.</p>
          </div>

          {/* Game Selection Grid */}
          <Card variant="glass" className={`p-4 sm:p-6 ${mounted ? 'animate-fade-slide-up' : 'opacity-0'}`}>
            <div className="mb-3 sm:mb-4 flex items-center justify-between">
              <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Choose game</h2>
              <span className="text-[10px] sm:text-xs text-slate-500">{starredGames.length} analyzed</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {starredGames.map((game) => {
                const isSelected = selectedGame?.app_id === game.app_id;
                return (
                  <button
                    key={game.app_id}
                    onClick={() => handleGameSelect(game)}
                    className={`relative overflow-hidden border rounded-lg transition-all active:scale-[0.98] ${
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
                          <div className="bg-sky-500 text-white p-1.5 sm:p-2 rounded-full">
                            <svg
                              className="w-4 h-4 sm:w-6 sm:h-6"
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
                    <div className="p-2 sm:p-3 bg-slate-900/90">
                      <p className="text-xs sm:text-sm font-medium text-white truncate">{game.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

        {/* Report Configuration Card */}
          {selectedGame && (
            <Card variant="glass" className={`p-6 space-y-5 ${mounted ? 'animate-fade-slide-up animation-delay-100' : 'opacity-0'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Report</p>
                  <h2 className="text-lg font-semibold text-white mt-1">{selectedGame.name}</h2>
                </div>
                {selectedMonth && (
                  <div className="text-right text-xs text-slate-400">
                    <p className="text-slate-300">{selectedMonth.review_count.toLocaleString()} reviews</p>
                    {selectedRange && <p className="mt-1">{selectedRange}</p>}
                  </div>
                )}
              </div>

              <MonthSelector
                months={availableMonths}
                selected={selectedMonth}
                onChange={setSelectedMonth}
                loading={monthsLoading}
              />

              {error && (
                <div className="border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <Button
                  onClick={handleDownload}
                  disabled={!selectedMonth || downloadLoading}
                  variant="primary"
                >
                  {downloadLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin spinner-blue-sm mr-2" />
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
                      Download PDF
                    </>
                  )}
                </Button>
                {lastGeneratedAt ? (
                  <div className="text-xs text-slate-500">
                    Last generated {lastGeneratedAt.toLocaleString()}
                  </div>
                ) : null}
              </div>
            </Card>
          )}
        </div>
      </PageTransition>
    </AppLayout>
  );
}
