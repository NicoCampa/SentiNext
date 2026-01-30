'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useGlobalFilters } from '@/contexts/GlobalFiltersContext';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { applyGlobalReviewFilters } from '@/lib/reviewFilters';
import { fetchDatabaseReviews, fetchDatabaseStats, fetchDatabaseGames } from '@/lib/api';
import type { DatabaseReviewsResponse, DatabaseReviewItem, DatabaseGameOption } from '@/types';
import type { DatabaseStats } from '@/lib/api';

const MAIN_CATEGORY_LABELS: Record<string, string> = {
  gameplay: 'Gameplay',
  technical: 'Technical',
  content_design: 'Content & Design',
  ui_ux_accessibility: 'UI/UX & Accessibility',
  onboarding: 'Onboarding',
  presentation: 'Presentation',
  online_community: 'Online & Community',
  developer_updates: 'Developer & Updates',
  monetization_value: 'Monetization & Value',
  other: 'Other / Meta',
};

function titleize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'ui') return 'UI';
      if (lower === 'ux') return 'UX';
      if (lower === 'ugc') return 'UGC';
      if (lower === 'ai') return 'AI';
      if (lower === 'dlc') return 'DLC';
      if (lower === 'p2w') return 'P2W';
      if (lower === 'ctd') return 'CTD';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function formatTaxonomyLabel(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase();
  const direct = MAIN_CATEGORY_LABELS[normalized];
  if (direct) return direct;
  if (trimmed.includes('/')) {
    const [mainRaw, subRaw] = trimmed.split('/', 2);
    const main = MAIN_CATEGORY_LABELS[mainRaw.toLowerCase()] ?? titleize(mainRaw);
    return `${main} / ${titleize(subRaw)}`;
  }
  return titleize(trimmed);
}

function hasIssue(review: DatabaseReviewItem): boolean {
  return (
    review.llm_has_issue === true ||
    (Array.isArray(review.llm_issue_subcategories) && review.llm_issue_subcategories.length > 0)
  );
}

function hasRequest(review: DatabaseReviewItem): boolean {
  return (
    review.llm_has_request === true ||
    (Array.isArray(review.llm_request_subcategories) && review.llm_request_subcategories.length > 0)
  );
}

function formatReviewDate(value?: string | null): string {
  if (!value) return 'Date unknown';
  const parsed = Number(value);
  const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleDateString();
}

export default function DatabasePage() {
  const { filters } = useGlobalFilters();
  const { density } = useUiPreferences();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [games, setGames] = useState<DatabaseGameOption[]>([]);
  const [reviewsResponse, setReviewsResponse] = useState<DatabaseReviewsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [limit, setLimit] = useState(200);
  const [offset, setOffset] = useState(0);
  const [quickSentiment, setQuickSentiment] = useState<'all' | 'positive' | 'negative'>('all');
  const [quickType, setQuickType] = useState<'all' | 'issue' | 'request'>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);

  const compact = density === 'compact';

  useEffect(() => {
    async function loadStats() {
      setLoadingStats(true);
      try {
        const data = await fetchDatabaseStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load database stats:', err);
      } finally {
        setLoadingStats(false);
      }
    }

    async function loadGames() {
      try {
        const data = await fetchDatabaseGames();
        setGames(data);
      } catch (err) {
        console.error('Failed to load database games:', err);
      }
    }

    loadStats();
    loadGames();
  }, []);

  useEffect(() => {
    async function loadReviews() {
      setLoadingReviews(true);
      setError(null);
      try {
        const response = await fetchDatabaseReviews({
          limit,
          offset,
          app_id: selectedAppId,
          language: languageFilter === 'all' ? null : languageFilter,
          query: activeQuery || null,
        });
        setReviewsResponse(response);
      } catch (err) {
        console.error('Failed to load reviews:', err);
        setError((err as Error).message || 'Failed to load reviews');
      } finally {
        setLoadingReviews(false);
      }
    }

    loadReviews();
  }, [activeQuery, languageFilter, limit, offset, selectedAppId]);

  const pageItems = reviewsResponse?.items ?? [];
  const pageTotal = reviewsResponse?.total ?? 0;

  const filteredReviews = useMemo(() => {
    const scoped = applyGlobalReviewFilters(pageItems, filters);
    return scoped.filter((review) => {
      if (quickSentiment === 'positive' && !review.voted_up) return false;
      if (quickSentiment === 'negative' && review.voted_up) return false;
      if (quickType === 'issue' && !hasIssue(review)) return false;
      if (quickType === 'request' && !hasRequest(review)) return false;
      return true;
    });
  }, [filters, pageItems, quickSentiment, quickType]);

  useEffect(() => {
    if (filteredReviews.length === 0) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return prev < filteredReviews.length ? prev : 0;
    });
  }, [filteredReviews]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.isContentEditable) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!filteredReviews.length) return;

      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, filteredReviews.length - 1);
        });
      }
      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredReviews]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const item = document.getElementById(`db-review-item-${selectedIndex}`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectedReview = selectedIndex !== null ? filteredReviews[selectedIndex] : null;

  function handleApplyQuery() {
    setActiveQuery(queryInput.trim());
    setOffset(0);
  }

  const totalPages = Math.max(1, Math.ceil(pageTotal / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-10 sm:space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
              Database Explorer
            </span>
          </h1>
          <p className="text-sm text-slate-400">Browse every stored review across your local dataset.</p>
        </div>

        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-medium">Database Statistics</h2>
          {loadingStats ? (
            <p className="text-sm text-slate-400">Loading stats...</p>
          ) : stats ? (
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
              icon="DB"
              variant="info"
              action={
                <a href="/dashboard">
                  <Button variant="primary">Analyze a Game</Button>
                </a>
              }
            />
          )}
        </Card>

        <Card variant="glass" className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Dataset filters</h2>
              <p className="text-xs text-slate-400">Search and filter across the entire database.</p>
            </div>
            <div className="text-xs text-slate-500">
              Page {currentPage} of {totalPages} - {pageTotal.toLocaleString()} total reviews
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Search text</span>
              <div className="flex gap-3">
                <input
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleApplyQuery()}
                  placeholder="Search review text"
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                />
                <Button variant="secondary" onClick={handleApplyQuery}>
                  Apply
                </Button>
              </div>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Game</span>
              <select
                value={selectedAppId ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedAppId(value ? Number(value) : null);
                  setOffset(0);
                }}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="">All games</option>
                {games.map((game) => (
                  <option key={game.app_id} value={game.app_id}>
                    {game.name ? `${game.name} (${game.app_id})` : `App ${game.app_id}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Language</span>
              <input
                value={languageFilter}
                onChange={(event) => {
                  setLanguageFilter(event.target.value || 'all');
                  setOffset(0);
                }}
                placeholder="all"
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Quick filters</span>
            {(['all', 'positive', 'negative'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setQuickSentiment(value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  quickSentiment === value
                    ? 'border-sky-400 bg-sky-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/40 hover:text-white'
                }`}
                type="button"
              >
                {value === 'all' ? 'All sentiment' : value === 'positive' ? 'Recommended' : 'Not recommended'}
              </button>
            ))}
            {(['all', 'issue', 'request'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setQuickType(value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  quickType === value
                    ? 'border-purple-400 bg-purple-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/40 hover:text-white'
                }`}
                type="button"
              >
                {value === 'all' ? 'All labels' : value === 'issue' ? 'Issues' : 'Requests'}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card variant="glass" className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Reviews</h2>
                <p className="text-xs text-slate-400">Use Up/Down or J/K to navigate</p>
              </div>
              <div className="text-xs text-slate-500">
                Showing {filteredReviews.length} of {pageItems.length} loaded
              </div>
            </div>

            <div className="mt-4 flex-1 overflow-auto pr-1">
              {loadingReviews ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, idx) => (
                    <div key={idx} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-slate-900/40" />
                  ))}
                </div>
              ) : error ? (
                <p className="text-sm text-rose-400">{error}</p>
              ) : filteredReviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                  No reviews match these filters. Try adjusting search or global filters.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReviews.map((review, idx) => {
                    const isActive = idx === selectedIndex;
                    const playtime = review.author_playtime_hours ?? (review.author_playtime_forever || 0) / 60;
                    const appLabel = review.app_name ? review.app_name : `App ${review.app_id}`;
                    return (
                      <button
                        key={`${review.review_id}-${idx}`}
                        id={`db-review-item-${idx}`}
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className={`w-full rounded-2xl border text-left transition ${
                          isActive
                            ? 'border-sky-400/60 bg-sky-500/10'
                            : 'border-white/10 bg-slate-900/30 hover:border-sky-500/40'
                        } ${compact ? 'p-3' : 'p-4'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] ${
                                review.voted_up ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                              }`}
                            >
                              {review.voted_up ? 'Recommended' : 'Not recommended'}
                            </span>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-slate-200">
                              {appLabel}
                            </span>
                            {review.llm_main_category ? (
                              <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-[11px] text-indigo-200">
                                {formatTaxonomyLabel(review.llm_main_category)}
                              </span>
                            ) : null}
                            {hasIssue(review) ? (
                              <span className="rounded-full bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">
                                Issue
                              </span>
                            ) : null}
                            {hasRequest(review) ? (
                              <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-200">
                                Request
                              </span>
                            ) : null}
                          </div>
                          <span>{playtime.toFixed(1)}h</span>
                        </div>
                        <p className={`mt-2 line-clamp-3 text-sm text-slate-100 ${compact ? 'leading-snug' : 'leading-relaxed'}`}>
                          {review.review}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{formatReviewDate(review.created_at)}</span>
                          {review.votes_up ? <span>{review.votes_up} helpful</span> : <span>-</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <div>
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0 || loadingReviews}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= pageTotal || loadingReviews}
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>

          <Card variant="glass" className="flex flex-col p-6">
            {selectedReview ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Review details</h2>
                    <p className="text-xs text-slate-400">
                      {formatReviewDate(selectedReview.created_at)} - {selectedReview.votes_up || 0} helpful
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        selectedReview.voted_up ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'
                      }`}
                    >
                      {selectedReview.voted_up ? 'Recommended' : 'Not recommended'}
                    </span>
                    {selectedReview.llm_main_category ? (
                      <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs text-indigo-200">
                        {formatTaxonomyLabel(selectedReview.llm_main_category)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
                  <p className="whitespace-pre-line">{selectedReview.review}</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Labels</p>
                    {selectedReview.llm_subcategories?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedReview.llm_subcategories.map((value, idx) => (
                          <span key={`${value}-${idx}`} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                            {formatTaxonomyLabel(value)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No subcategories tagged.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Issues & Requests</p>
                    <div className="space-y-3 text-xs text-slate-300">
                      {selectedReview.llm_issue_subcategories?.length ? (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">Issues</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedReview.llm_issue_subcategories.map((value, idx) => (
                              <span key={`${value}-${idx}`} className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-200">
                                {formatTaxonomyLabel(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No issues tagged.</p>
                      )}
                      {selectedReview.llm_request_subcategories?.length ? (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Requests</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedReview.llm_request_subcategories.map((value, idx) => (
                              <span key={`${value}-${idx}`} className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs text-cyan-200">
                                {formatTaxonomyLabel(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Evidence</p>
                  {selectedReview.llm_subcategory_evidence && Object.keys(selectedReview.llm_subcategory_evidence).length ? (
                    <div className="mt-3 space-y-3 text-sm text-slate-200">
                      {Object.entries(selectedReview.llm_subcategory_evidence).map(([subcategory, snippets]) => (
                        <div key={subcategory} className="rounded-xl border border-white/5 bg-white/5 p-3">
                          <p className="text-xs font-semibold text-slate-300">{formatTaxonomyLabel(subcategory)}</p>
                          <div className="mt-2 space-y-2 text-xs text-slate-200">
                            {snippets.map((snippet, idx) => (
                              <p key={`${subcategory}-${idx}`} className="rounded-lg bg-slate-950/40 px-3 py-2">
                                {snippet}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No evidence snippets saved for this review.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-400">
                <p>Select a review to see labels and evidence.</p>
                <p className="text-xs text-slate-500">Tip: use Up/Down or J/K to move quickly.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
