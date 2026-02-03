'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageTransition } from '@/components/PageTransition';
import { FilterSidebar } from '@/components/database/FilterSidebar';
import { FilterPills } from '@/components/database/FilterPills';
import { ReviewModal } from '@/components/database/ReviewModal';
import { ExportPreviewDialog, type ExportOptions } from '@/components/database/ExportPreviewDialog';
import { useGlobalFilters } from '@/contexts/GlobalFiltersContext';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { applyGlobalReviewFilters } from '@/lib/reviewFilters';
import { deleteGame, downloadDatabaseExport, fetchAuthStatus, fetchDatabaseReviews, fetchDatabaseStats, fetchDatabaseGames, fetchDatabaseExportCount, type DatabaseExportCount } from '@/lib/api';
import { formatTaxonomyLabel, MAIN_CATEGORY_LABELS, titleize } from '@/lib/taxonomyLabels';
import type { DatabaseReviewsResponse, DatabaseReviewItem, DatabaseGameOption } from '@/types';
import type { AuthStatus, DatabaseScope, DatabaseStats } from '@/lib/api';

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState<DatabaseExportCount | null>(null);
  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);

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
    if (selectedIndex === null) return;
    const item = document.getElementById(`db-review-item-${selectedIndex}`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function handleApplyQuery() {
    setActiveQuery(queryInput.trim());
    setOffset(0);
  }

  function handleClearAll() {
    setQueryInput('');
    setActiveQuery('');
    setLanguageFilter('all');
    setSelectedAppId(null);
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setQuickSentiment('all');
    setQuickType('all');
    setOffset(0);
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeQuery) count++;
    if (languageFilter !== 'all') count++;
    if (selectedAppId !== null) count++;
    if (selectedCategory !== 'all') count++;
    if (selectedSubcategory !== 'all') count++;
    if (quickSentiment !== 'all') count++;
    if (quickType !== 'all') count++;
    return count;
  }, [activeQuery, languageFilter, selectedAppId, selectedCategory, selectedSubcategory, quickSentiment, quickType]);

  const filterPills = useMemo(() => {
    const pills = [];
    if (activeQuery) {
      pills.push({
        key: 'query',
        label: 'Search',
        value: activeQuery,
        onRemove: () => {
          setQueryInput('');
          setActiveQuery('');
          setOffset(0);
        },
      });
    }
    if (languageFilter !== 'all') {
      pills.push({
        key: 'language',
        label: 'Language',
        value: languageFilter,
        onRemove: () => {
          setLanguageFilter('all');
          setOffset(0);
        },
      });
    }
    if (selectedAppId !== null) {
      const game = games.find((g) => g.app_id === selectedAppId);
      pills.push({
        key: 'game',
        label: 'Game',
        value: game?.name || `App ${selectedAppId}`,
        onRemove: () => {
          setSelectedAppId(null);
          setOffset(0);
        },
      });
    }
    if (selectedCategory !== 'all') {
      pills.push({
        key: 'category',
        label: 'Category',
        value: formatTaxonomyLabel(selectedCategory),
        onRemove: () => {
          setSelectedCategory('all');
          setOffset(0);
        },
      });
    }
    if (selectedSubcategory !== 'all') {
      pills.push({
        key: 'subcategory',
        label: 'Subcategory',
        value: formatTaxonomyLabel(selectedSubcategory),
        onRemove: () => {
          setSelectedSubcategory('all');
          setOffset(0);
        },
      });
    }
    if (quickSentiment !== 'all') {
      pills.push({
        key: 'sentiment',
        label: 'Sentiment',
        value: quickSentiment === 'positive' ? 'Recommended' : 'Not Recommended',
        onRemove: () => {
          setQuickSentiment('all');
        },
      });
    }
    if (quickType !== 'all') {
      pills.push({
        key: 'type',
        label: 'Type',
        value: quickType === 'issue' ? 'Issues' : 'Requests',
        onRemove: () => {
          setQuickType('all');
        },
      });
    }
    return pills;
  }, [activeQuery, languageFilter, selectedAppId, selectedCategory, selectedSubcategory, quickSentiment, quickType, games]);

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

  async function handleExportPreview() {
    setExportPreviewOpen(true);
    setExportPreviewLoading(true);
    setExportPreviewData(null);
    try {
      const data = await fetchDatabaseExportCount({
        scope,
        app_id: selectedAppId,
        language: languageFilter === 'all' ? null : languageFilter,
        query: activeQuery || null,
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
        app_id: selectedAppId,
        language: languageFilter === 'all' ? null : languageFilter,
        query: activeQuery || null,
        max_rows: options.maxRows,
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
      <PageTransition>
        <div className="flex h-full">
        <FilterSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          queryInput={queryInput}
          setQueryInput={setQueryInput}
          onApplyQuery={handleApplyQuery}
          languageFilter={languageFilter}
          setLanguageFilter={(value) => {
            setLanguageFilter(value);
            setOffset(0);
          }}
          selectedAppId={selectedAppId}
          setSelectedAppId={(value) => {
            setSelectedAppId(value);
            setOffset(0);
          }}
          games={games}
          scope={scope}
          setScope={setScope}
          isAdmin={isAdmin}
          selectedCategory={selectedCategory}
          setSelectedCategory={(value) => {
            setSelectedCategory(value);
            setSelectedSubcategory('all');
            setOffset(0);
          }}
          selectedSubcategory={selectedSubcategory}
          setSelectedSubcategory={(value) => {
            setSelectedSubcategory(value);
            setOffset(0);
          }}
          categoryOptions={categoryOptions}
          subcategoryOptions={subcategoryOptions}
          quickSentiment={quickSentiment}
          setQuickSentiment={setQuickSentiment}
          quickType={quickType}
          setQuickType={setQuickType}
          onClearAll={handleClearAll}
          activeFilterCount={activeFilterCount}
          onExportPreview={handleExportPreview}
          downloadBusy={downloadBusy}
          t={t}
        />
        <ExportPreviewDialog
          isOpen={exportPreviewOpen}
          onClose={() => setExportPreviewOpen(false)}
          onExport={handleDownload}
          previewData={exportPreviewData}
          loading={exportPreviewLoading}
          exporting={downloadBusy}
        />
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl space-y-10 sm:space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg border border-white/10 bg-slate-900/50 p-2 text-slate-400 transition hover:bg-slate-900/70 hover:text-white lg:hidden"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-3xl font-semibold tracking-tight">
                <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                  {t('database.title')}
                </span>
              </h1>
            </div>
            <p className="text-sm text-slate-400">
              {t('database.subtitle')}
            </p>
          </div>
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

        <FilterPills pills={filterPills} />

        <Card variant="glass" className="p-5">
          <h2 className="mb-3 text-base font-semibold text-white">{t('database.stats')}</h2>
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

        {downloadError && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4">
            <p className="text-sm text-rose-300">{downloadError}</p>
          </div>
        )}

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
        </div>
      </div>

      {expandedReview && selectedIndex !== null && (
        <ReviewModal
          review={expandedReview}
          currentIndex={selectedIndex}
          totalCount={filteredReviews.length}
          onClose={() => setExpandedReview(null)}
          onPrevious={() => {
            if (selectedIndex > 0) {
              const newIndex = selectedIndex - 1;
              setSelectedIndex(newIndex);
              setExpandedReview(filteredReviews[newIndex]);
            }
          }}
          onNext={() => {
            if (selectedIndex < filteredReviews.length - 1) {
              const newIndex = selectedIndex + 1;
              setSelectedIndex(newIndex);
              setExpandedReview(filteredReviews[newIndex]);
            }
          }}
          isAdmin={isAdmin}
          t={t}
        />
      )}
      </PageTransition>
    </AppLayout>
  );
}
