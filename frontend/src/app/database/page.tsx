'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useGlobalFilters } from '@/contexts/GlobalFiltersContext';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { applyGlobalReviewFilters } from '@/lib/reviewFilters';
import { deleteGame, downloadDatabaseExport, fetchAuthStatus, fetchDatabaseReviews, fetchDatabaseStats, fetchDatabaseGames } from '@/lib/api';
import type { DatabaseReviewsResponse, DatabaseReviewItem, DatabaseGameOption } from '@/types';
import type { AuthStatus, DatabaseScope, DatabaseStats } from '@/lib/api';

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
  const { t } = useLanguage();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [games, setGames] = useState<DatabaseGameOption[]>([]);
  const [reviewsResponse, setReviewsResponse] = useState<DatabaseReviewsResponse | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [scope, setScope] = useState<DatabaseScope>('me');
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
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [expandedReview, setExpandedReview] = useState<DatabaseReviewItem | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const compact = density === 'compact';
  const isAdmin = authStatus?.is_admin ?? false;

  useEffect(() => {
    async function loadAuthStatus() {
      try {
        const data = await fetchAuthStatus();
        setAuthStatus(data);
        if (!data.is_admin) {
          setScope('me');
        }
      } catch (err) {
        console.error('Failed to load auth status:', err);
      }
    }

    async function loadStats() {
      setLoadingStats(true);
      try {
        const data = await fetchDatabaseStats(scope);
        setStats(data);
      } catch (err) {
        console.error('Failed to load database stats:', err);
      } finally {
        setLoadingStats(false);
      }
    }

    async function loadGames() {
      try {
        const data = await fetchDatabaseGames(scope);
        setGames(data);
      } catch (err) {
        console.error('Failed to load database games:', err);
      }
    }

    loadAuthStatus();
    loadStats();
    loadGames();
  }, [scope]);

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
          scope,
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
  }, [activeQuery, languageFilter, limit, offset, selectedAppId, scope]);

  const pageItems = reviewsResponse?.items ?? [];
  const pageTotal = reviewsResponse?.total ?? 0;

  const categoryOptions = useMemo(() => {
    const mains = new Set<string>();
    pageItems.forEach((review) => {
      if (review.llm_main_category) {
        mains.add(review.llm_main_category.toLowerCase());
      }
      const subcats = [
        ...(review.llm_subcategories ?? []),
        ...(review.llm_issue_subcategories ?? []),
        ...(review.llm_request_subcategories ?? []),
      ];
      subcats.forEach((value) => {
        const [main] = value.split('/', 1);
        if (main) {
          mains.add(main.toLowerCase());
        }
      });
    });
    return Array.from(mains)
      .sort()
      .map((value) => ({
        value,
        label: MAIN_CATEGORY_LABELS[value] ?? titleize(value),
      }));
  }, [pageItems]);

  const subcategoryOptions = useMemo(() => {
    const subs = new Map<string, { value: string; label: string; main?: string }>();
    pageItems.forEach((review) => {
      const subcats = [
        ...(review.llm_subcategories ?? []),
        ...(review.llm_issue_subcategories ?? []),
        ...(review.llm_request_subcategories ?? []),
      ];
      subcats.forEach((value) => {
        const trimmed = value?.trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();
        const main = trimmed.includes('/') ? trimmed.split('/', 1)[0].toLowerCase() : undefined;
        subs.set(lower, {
          value: lower,
          label: formatTaxonomyLabel(trimmed),
          main,
        });
      });
    });
    return Array.from(subs.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pageItems]);

  const filteredReviews = useMemo(() => {
    const scoped = applyGlobalReviewFilters(pageItems, filters);
    return scoped.filter((review) => {
      if (quickSentiment === 'positive' && !review.voted_up) return false;
      if (quickSentiment === 'negative' && review.voted_up) return false;
      if (quickType === 'issue' && !hasIssue(review)) return false;
      if (quickType === 'request' && !hasRequest(review)) return false;
      if (selectedCategory !== 'all') {
        const main = review.llm_main_category?.toLowerCase();
        if (main !== selectedCategory) {
          const subcats = [
            ...(review.llm_subcategories ?? []),
            ...(review.llm_issue_subcategories ?? []),
            ...(review.llm_request_subcategories ?? []),
          ];
          const matches = subcats.some((value) => value.toLowerCase().startsWith(`${selectedCategory}/`));
          if (!matches) return false;
        }
      }
      if (selectedSubcategory !== 'all') {
        const subcats = [
          ...(review.llm_subcategories ?? []),
          ...(review.llm_issue_subcategories ?? []),
          ...(review.llm_request_subcategories ?? []),
        ];
        if (!subcats.some((value) => value.toLowerCase() === selectedSubcategory)) return false;
      }
      return true;
    });
  }, [filters, pageItems, quickSentiment, quickType, selectedCategory, selectedSubcategory]);

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
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpandedReview(null);
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (selectedIndex === null) return;
    const item = document.getElementById(`db-review-item-${selectedIndex}`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function handleApplyQuery() {
    setActiveQuery(queryInput.trim());
    setOffset(0);
  }

  async function handleAdminDelete() {
    if (!selectedAppId) {
      setAdminError('Select a game to delete.');
      return;
    }
    const confirmDelete = window.confirm(
      `Delete all stored data for app ${selectedAppId}? This removes reviews, labels, and analysis results.`,
    );
    if (!confirmDelete) return;

    setAdminBusy(true);
    setAdminError(null);
    try {
      await deleteGame(selectedAppId);
      setSelectedAppId(null);
      setOffset(0);
      const [newStats, newGames] = await Promise.all([
        fetchDatabaseStats(scope),
        fetchDatabaseGames(scope),
      ]);
      setStats(newStats);
      setGames(newGames);
    } catch (err) {
      setAdminError((err as Error).message || 'Failed to delete game data.');
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleDownload(format: 'csv' | 'jsonl') {
    setDownloadBusy(true);
    setDownloadError(null);
    try {
      await downloadDatabaseExport({
        format,
        scope,
        app_id: selectedAppId,
        language: languageFilter === 'all' ? null : languageFilter,
        query: activeQuery || null,
      });
    } catch (err) {
      setDownloadError((err as Error).message || 'Download failed.');
    } finally {
      setDownloadBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(pageTotal / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-10 sm:space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
              {t('database.title')}
            </span>
          </h1>
          <p className="text-sm text-slate-400">
            {t('database.subtitle')}
          </p>
        </div>

        <Card variant="glass" className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">{t('database.stats')}</h2>
            {isAdmin && (
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 p-1 text-[10px] uppercase tracking-[0.25em] text-slate-400">
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
            )}
          </div>
          {loadingStats ? (
            <p className="text-sm text-slate-400">{t('database.loadingStats')}</p>
          ) : stats ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs">
                <span className="text-slate-400">{t('common.games')}</span> · {stats.games.toLocaleString()}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs">
                <span className="text-slate-400">{t('common.reviews')}</span> · {stats.reviews.toLocaleString()}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs">
                <span className="text-slate-400">{t('database.starred')}</span> · {stats.starred_games.toLocaleString()}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs">
                <span className="text-slate-400">{t('common.labels')}</span> · {stats.labels.toLocaleString()}
              </span>
            </div>
          ) : (
            <EmptyState
              title={t('database.noData')}
              description={t('database.noDataDesc')}
              icon="DB"
              variant="info"
              action={
                <a href="/dashboard">
                  <Button variant="primary">{t('dashboard.analyze')}</Button>
                </a>
              }
            />
          )}
        </Card>

        <Card variant="glass" className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{t('database.filters')}</h2>
              <p className="text-xs text-slate-400">{t('database.filtersDesc')}</p>
            </div>
            <div className="flex flex-col items-start gap-2 text-xs text-slate-500 sm:items-end">
              <div>
                Page {currentPage} of {totalPages} - {pageTotal.toLocaleString()} total reviews
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={downloadBusy || loadingReviews}
                  onClick={() => handleDownload('csv')}
                >
                  {downloadBusy ? 'Preparing…' : t('database.downloadCSV')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={downloadBusy || loadingReviews}
                  onClick={() => handleDownload('jsonl')}
                >
                  {downloadBusy ? 'Preparing…' : t('database.downloadJSON')}
                </Button>
              </div>
            </div>
          </div>
          {downloadError ? <p className="mt-3 text-xs text-rose-300">{downloadError}</p> : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{t('database.searchText')}</span>
              <div className="flex gap-3">
                <input
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleApplyQuery()}
                  placeholder={t('database.searchPlaceholder')}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                />
                <Button variant="secondary" onClick={handleApplyQuery}>
                  Apply
                </Button>
              </div>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{t('database.game')}</span>
              <select
                value={selectedAppId ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedAppId(value ? Number(value) : null);
                  setOffset(0);
                }}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="">{t('database.allGames')}</option>
                {games.map((game) => (
                  <option key={game.app_id} value={game.app_id}>
                    {game.name ? `${game.name} (${game.app_id})` : `App ${game.app_id}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{t('database.language')}</span>
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

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{t('database.category')}</span>
              <select
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  setSelectedSubcategory('all');
                  setOffset(0);
                }}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="all">{t('database.allCategories')}</option>
                {categoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{t('database.subcategory')}</span>
              <select
                value={selectedSubcategory}
                onChange={(event) => {
                  setSelectedSubcategory(event.target.value);
                  setOffset(0);
                }}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="all">{t('database.allSubcategories')}</option>
                {subcategoryOptions
                  .filter((opt) => !selectedCategory || selectedCategory === 'all' || opt.main === selectedCategory)
                  .map((subcategory) => (
                    <option key={subcategory.value} value={subcategory.value}>
                      {subcategory.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{t('database.quickFilters')}</span>
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
                {value === 'all' ? t('database.allSentiment') : value === 'positive' ? t('common.recommended') : t('common.notRecommended')}
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
                {value === 'all' ? t('database.allLabels') : value === 'issue' ? t('common.issues') : t('common.requests')}
              </button>
            ))}
          </div>
        </Card>

        {isAdmin && (
          <Card variant="glass" className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Admin actions</h2>
                <p className="text-xs text-slate-400">
                  Manage the shared database across all accounts.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                loading={adminBusy}
                onClick={handleAdminDelete}
                disabled={adminBusy}
              >
                Delete selected game
              </Button>
            </div>
            {adminError ? <p className="mt-3 text-xs text-rose-300">{adminError}</p> : null}
          </Card>
        )}

        <div className="grid gap-6">
          <Card variant="glass" className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{t('common.reviews')}</h2>
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
                  {t('database.noReviews')}
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
                        onClick={() => {
                          setSelectedIndex(idx);
                          setExpandedReview(review);
                        }}
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
                              {review.voted_up ? t('common.recommended') : t('common.notRecommended')}
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
                                {t('common.issues')}
                              </span>
                            ) : null}
                            {hasRequest(review) ? (
                              <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-200">
                                {t('common.requests')}
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
        </div>
      </div>

      {expandedReview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-8">
          <div
            className="absolute inset-0"
            onClick={() => setExpandedReview(null)}
            role="button"
            tabIndex={-1}
          />
          <Card
            variant="glass"
            className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-auto p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{t('database.reviewDetails')}</h2>
                <p className="text-xs text-slate-400">
                  {formatReviewDate(expandedReview.created_at)} - {expandedReview.votes_up || 0} helpful
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    expandedReview.voted_up ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'
                  }`}
                >
                  {expandedReview.voted_up ? t('common.recommended') : t('common.notRecommended')}
                </span>
                {expandedReview.llm_main_category ? (
                  <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs text-indigo-200">
                    {formatTaxonomyLabel(expandedReview.llm_main_category)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
              <p className="whitespace-pre-line">{expandedReview.review}</p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('common.labels')}</p>
                {expandedReview.llm_subcategories?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {expandedReview.llm_subcategories.map((value, idx) => (
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
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('common.issues')} & {t('common.requests')}</p>
                <div className="space-y-3 text-xs text-slate-300">
                  {expandedReview.llm_issue_subcategories?.length ? (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">{t('common.issues')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {expandedReview.llm_issue_subcategories.map((value, idx) => (
                          <span key={`${value}-${idx}`} className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-200">
                            {formatTaxonomyLabel(value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No issues tagged.</p>
                  )}
                  {expandedReview.llm_request_subcategories?.length ? (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">{t('common.requests')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {expandedReview.llm_request_subcategories.map((value, idx) => (
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
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('common.evidence')}</p>
              {expandedReview.llm_subcategory_evidence && Object.keys(expandedReview.llm_subcategory_evidence).length ? (
                <div className="mt-3 space-y-3 text-sm text-slate-200">
                  {Object.entries(expandedReview.llm_subcategory_evidence).map(([subcategory, snippets]) => (
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

            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={() => setExpandedReview(null)}>
                {t('common.close')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
