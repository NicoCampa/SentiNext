'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, MetricCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageTransition } from '@/components/PageTransition';
import { FilterSidebar } from '@/components/database/FilterSidebar';
import { FilterPills } from '@/components/database/FilterPills';
import { ReviewModal } from '@/components/database/ReviewModal';
import { ReviewDetailPanel } from '@/components/database/ReviewDetailPanel';
import { ExportPreviewDialog, type ExportOptions } from '@/components/database/ExportPreviewDialog';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { clearEntireDatabase, deleteGame, downloadDatabaseExport, fetchDatabaseReviews, fetchDatabaseStats, fetchDatabaseGames, fetchDatabaseExportCount, type DatabaseExportCount } from '@/lib/api';
import { formatTaxonomyLabel, MAIN_CATEGORY_LABELS, titleize } from '@/lib/taxonomyLabels';
import { languageLabelFor } from '@/lib/languageOptions';
import type { DatabaseReviewsResponse, DatabaseReviewItem, DatabaseGameOption } from '@/types';
import type { DatabaseScope, DatabaseStats } from '@/lib/api';
import { ComingSoon } from '@/components/ComingSoon';

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

function reviewTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

export default function DatabasePage() {
  const { density } = useUiPreferences();
  const { t } = useLanguage();
  const { isAdmin, isLoading: isAdminLoading } = useAdminStatus();
  const showComingSoon = !isAdmin;
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [games, setGames] = useState<DatabaseGameOption[]>([]);
  const [reviewsResponse, setReviewsResponse] = useState<DatabaseReviewsResponse | null>(null);
  const [scope, setScope] = useState<DatabaseScope>('me');
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [draftLanguageFilter, setDraftLanguageFilter] = useState('all');
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [draftSelectedAppId, setDraftSelectedAppId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [draftSelectedCategory, setDraftSelectedCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [draftSelectedSubcategory, setDraftSelectedSubcategory] = useState('all');
  const [limit, setLimit] = useState(200);
  const [offset, setOffset] = useState(0);
  const [quickSentiment, setQuickSentiment] = useState<'all' | 'positive' | 'negative'>('all');
  const [quickType, setQuickType] = useState<'all' | 'issue' | 'request'>('all');
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'helpful'>('recent');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedReview, setExpandedReview] = useState<DatabaseReviewItem | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState<DatabaseExportCount | null>(null);
  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const compact = density === 'compact';
  useEffect(() => {
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

    if (showComingSoon || isAdminLoading || !isAdmin) return;
    loadStats();
    loadGames();
  }, [scope, isAdminLoading, isAdmin, showComingSoon]);

  useEffect(() => {
    setDraftLanguageFilter(languageFilter);
  }, [languageFilter]);

  useEffect(() => {
    setDraftSelectedAppId(selectedAppId);
  }, [selectedAppId]);

  useEffect(() => {
    setDraftSelectedCategory(selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    setDraftSelectedSubcategory(selectedSubcategory);
  }, [selectedSubcategory]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setAdminError(null);
  }, [selectedAppId]);

  useEffect(() => {
    async function loadReviews() {
      if (showComingSoon || isAdminLoading || !isAdmin) {
        setLoadingReviews(false);
        setError(null);
        return;
      }
      if (!hasAppliedFilters) {
        setLoadingReviews(false);
        setError(null);
        return;
      }
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
  }, [activeQuery, languageFilter, limit, offset, selectedAppId, scope, hasAppliedFilters, isAdmin, isAdminLoading, showComingSoon]);

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
    return pageItems.filter((review) => {
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
  }, [pageItems, quickSentiment, quickType, selectedCategory, selectedSubcategory]);

  const sortedReviews = useMemo(() => {
    const next = [...filteredReviews];
    if (sortOrder === 'helpful') {
      next.sort((a, b) => (b.votes_up || 0) - (a.votes_up || 0));
      return next;
    }
    next.sort((a, b) => {
      const delta = reviewTimestamp(b.created_at) - reviewTimestamp(a.created_at);
      return sortOrder === 'recent' ? delta : -delta;
    });
    return next;
  }, [filteredReviews, sortOrder]);

  useEffect(() => {
    if (sortedReviews.length === 0) {
      setSelectedIndex(null);
      setExpandedReview(null);
      return;
    }
    setSelectedIndex((prev) => {
      if (prev === null) return isDesktop ? 0 : null;
      if (prev < sortedReviews.length) return prev;
      return isDesktop ? 0 : null;
    });
  }, [sortedReviews, isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
    if (selectedIndex === null) {
      setExpandedReview(null);
      return;
    }
    setExpandedReview(sortedReviews[selectedIndex] ?? null);
  }, [selectedIndex, sortedReviews, isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      setExpandedReview(null);
    }
  }, [isDesktop]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.isContentEditable) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!sortedReviews.length) return;

      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, sortedReviews.length - 1);
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
  }, [sortedReviews]);


  useEffect(() => {
    if (selectedIndex === null) return;
    const item = document.getElementById(`db-review-item-${selectedIndex}`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function handleApplyFilters() {
    setActiveQuery(queryInput.trim());
    setLanguageFilter(draftLanguageFilter);
    setSelectedAppId(draftSelectedAppId);
    setSelectedCategory(draftSelectedCategory);
    setSelectedSubcategory(draftSelectedSubcategory);
    setOffset(0);
    setHasAppliedFilters(true);
  }

  function handleClearAll() {
    setQueryInput('');
    setActiveQuery('');
    setLanguageFilter('all');
    setDraftLanguageFilter('all');
    setSelectedAppId(null);
    setDraftSelectedAppId(null);
    setSelectedCategory('all');
    setDraftSelectedCategory('all');
    setSelectedSubcategory('all');
    setDraftSelectedSubcategory('all');
    setQuickSentiment('all');
    setQuickType('all');
    setScope('me');
    setOffset(0);
    setHasAppliedFilters(false);
    setReviewsResponse(null);
    setSelectedIndex(null);
    setExpandedReview(null);
    setError(null);
  }

  const hasPendingChanges = useMemo(() => {
    if (queryInput.trim() !== activeQuery) return true;
    if (draftLanguageFilter !== languageFilter) return true;
    if (draftSelectedAppId !== selectedAppId) return true;
    if (draftSelectedCategory !== selectedCategory) return true;
    if (draftSelectedSubcategory !== selectedSubcategory) return true;
    return false;
  }, [
    queryInput,
    activeQuery,
    draftLanguageFilter,
    languageFilter,
    draftSelectedAppId,
    selectedAppId,
    draftSelectedCategory,
    selectedCategory,
    draftSelectedSubcategory,
    selectedSubcategory,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeQuery) count++;
    if (languageFilter !== 'all') count++;
    if (selectedAppId !== null) count++;
    if (selectedCategory !== 'all') count++;
    if (selectedSubcategory !== 'all') count++;
    if (quickSentiment !== 'all') count++;
    if (quickType !== 'all') count++;
    if (scope === 'all') count++;
    return count;
  }, [activeQuery, languageFilter, selectedAppId, selectedCategory, selectedSubcategory, quickSentiment, quickType, scope]);

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
        value: languageLabelFor(languageFilter),
        onRemove: () => {
          setLanguageFilter('all');
          setDraftLanguageFilter('all');
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
          setDraftSelectedAppId(null);
          setOffset(0);
        },
      });
    }
    if (scope === 'all') {
      pills.push({
        key: 'scope',
        label: 'Scope',
        value: 'All users',
        onRemove: () => {
          setScope('me');
          setDraftScope('me');
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
          setDraftSelectedCategory('all');
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
          setDraftSelectedSubcategory('all');
          setOffset(0);
        },
      });
    }
    if (quickSentiment !== 'all') {
      pills.push({
        key: 'sentiment',
        label: 'Sentiment',
        value: quickSentiment === 'positive' ? 'Recommended' : 'Not recommended',
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

  async function handleAdminClearDatabase() {
    const confirmText = window.prompt(
      'Type DELETE ALL to clear the entire database for all users. This cannot be undone.',
    );
    if (confirmText !== 'DELETE ALL') {
      return;
    }

    setAdminBusy(true);
    setAdminError(null);
    try {
      await clearEntireDatabase();
      setSelectedAppId(null);
      setDraftSelectedAppId(null);
      setSelectedIndex(null);
      setExpandedReview(null);
      setReviewsResponse(null);
      setHasAppliedFilters(false);
      setActiveQuery('');
      setQueryInput('');
      setOffset(0);
      const [newStats, newGames] = await Promise.all([
        fetchDatabaseStats(scope),
        fetchDatabaseGames(scope),
      ]);
      setStats(newStats);
      setGames(newGames);
    } catch (err) {
      setAdminError((err as Error).message || 'Failed to clear database.');
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleExportPreview() {
    setDownloadError(null);
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

  const totalPages = hasAppliedFilters ? Math.max(1, Math.ceil(pageTotal / limit)) : 0;
  const currentPage = hasAppliedFilters ? Math.floor(offset / limit) + 1 : 0;

  if (showComingSoon || isAdminLoading || !isAdmin) {
    return (
      <AppLayout>
        <PageTransition>
          <ComingSoon
            title="Database coming soon"
            description="The database explorer is under construction. Check back soon."
          />
        </PageTransition>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="flex h-full">
          <FilterSidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            queryInput={queryInput}
            setQueryInput={setQueryInput}
            onApplyFilters={handleApplyFilters}
            languageFilter={draftLanguageFilter}
            setLanguageFilter={setDraftLanguageFilter}
            selectedAppId={draftSelectedAppId}
            setSelectedAppId={setDraftSelectedAppId}
            games={games}
            selectedCategory={draftSelectedCategory}
            setSelectedCategory={setDraftSelectedCategory}
            selectedSubcategory={draftSelectedSubcategory}
            setSelectedSubcategory={setDraftSelectedSubcategory}
            categoryOptions={categoryOptions}
            subcategoryOptions={subcategoryOptions}
            onClearAll={handleClearAll}
            activeFilterCount={activeFilterCount}
            hasPendingChanges={hasPendingChanges}
            hasAppliedFilters={hasAppliedFilters}
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
            <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
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
                <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
                  {isAdmin && (
                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 p-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                      <button
                        type="button"
                        onClick={() => {
                          setScope('me');
                          setOffset(0);
                        }}
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
                        onClick={() => {
                          setScope('all');
                          setOffset(0);
                        }}
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
                  <Card variant="glass" className="w-full sm:w-[320px] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Dataset actions</p>
                      {downloadBusy ? (
                        <span className="text-[10px] uppercase tracking-wider text-sky-300">
                          {t('database.preparingExport')}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleExportPreview}
                        disabled={downloadBusy}
                      >
                        {t('database.previewExport')}
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={adminBusy}
                            onClick={handleAdminDelete}
                            disabled={adminBusy || !selectedAppId}
                          >
                            Delete selected game
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={adminBusy}
                            onClick={handleAdminClearDatabase}
                            disabled={adminBusy}
                          >
                            Delete all games
                          </Button>
                        </>
                      )}
                    </div>
                    {downloadError ? (
                      <p className="mt-3 text-xs text-rose-300">{downloadError}</p>
                    ) : null}
                    {adminError ? (
                      <p className="mt-2 text-xs text-rose-300">{adminError}</p>
                    ) : null}
                  </Card>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('database.stats')}</h2>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      {scope === 'all' ? t('database.allUsers') : t('database.myData')}
                    </span>
                  </div>
                  {loadingStats ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[...Array(4)].map((_, idx) => (
                        <div key={idx} className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse" />
                      ))}
                    </div>
                  ) : stats ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricCard title={t('common.games')} value={stats.games.toLocaleString()} />
                      <MetricCard title={t('common.reviews')} value={stats.reviews.toLocaleString()} />
                      <MetricCard title={t('database.starred')} value={stats.starred_games.toLocaleString()} />
                      <MetricCard title={t('common.labels')} value={stats.labels.toLocaleString()} />
                    </div>
                  ) : (
                    <div className="sm:col-span-2 lg:col-span-4">
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
                    </div>
                  )}
                </div>
                <Card variant="glass" className="p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('database.quickFilters')}</p>
                  <div className="mt-3 space-y-4">
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">{t('database.sentiment')}</p>
                      <div className="flex flex-wrap gap-2">
                        {(['all', 'positive', 'negative'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setQuickSentiment(value)}
                            className={`rounded-full border px-3 py-1 text-[11px] transition ${
                              quickSentiment === value
                                ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/40'
                            }`}
                          >
                            {value === 'all' ? t('common.all') : value === 'positive' ? t('common.recommended') : t('common.notRecommended')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">{t('database.type')}</p>
                      <div className="flex flex-wrap gap-2">
                        {(['all', 'issue', 'request'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setQuickType(value)}
                            className={`rounded-full border px-3 py-1 text-[11px] transition ${
                              quickType === value
                                ? 'border-purple-400 bg-purple-500/20 text-purple-100'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/40'
                            }`}
                          >
                            {value === 'all' ? t('common.all') : value === 'issue' ? t('common.issues') : t('common.requests')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <Card variant="glass" className="flex flex-col p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{t('common.reviews')}</h2>
                      <p className="text-xs text-slate-400">Use Up/Down or J/K to navigate</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>
                        {hasAppliedFilters
                          ? `Showing ${sortedReviews.length} of ${pageItems.length} loaded`
                          : 'No reviews loaded yet'}
                      </span>
                      <label className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">{t('common.sort')}</span>
                        <select
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value as 'recent' | 'oldest' | 'helpful')}
                          className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                        >
                          <option value="recent">Most recent</option>
                          <option value="oldest">Oldest</option>
                          <option value="helpful">Most helpful</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <FilterPills pills={filterPills} />
                    {activeFilterCount > 0 ? (
                      <Button variant="secondary" size="sm" onClick={handleClearAll}>
                        {t('common.clearFilters')}
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <div>
                      {hasAppliedFilters ? `Page ${currentPage} of ${totalPages}` : 'Apply filters to load reviews'}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setOffset(Math.max(0, offset - limit))}
                        disabled={!hasAppliedFilters || offset === 0 || loadingReviews}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setOffset(offset + limit)}
                        disabled={!hasAppliedFilters || offset + limit >= pageTotal || loadingReviews}
                      >
                        Next
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex-1 overflow-auto pr-1">
                    {!hasAppliedFilters ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                        <p>Use the filters to load reviews from the database.</p>
                        <div className="mt-4 flex justify-center">
                          <Button variant="primary" size="sm" onClick={handleApplyFilters} disabled={!hasPendingChanges && hasAppliedFilters}>
                            Load reviews
                          </Button>
                        </div>
                      </div>
                    ) : loadingReviews ? (
                      <div className="space-y-3">
                        {[...Array(4)].map((_, idx) => (
                          <div key={idx} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-slate-900/40" />
                        ))}
                      </div>
                    ) : error ? (
                      <p className="text-sm text-rose-400">{error}</p>
                    ) : sortedReviews.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                        {t('database.noReviews')}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sortedReviews.map((review, idx) => {
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
                      {hasAppliedFilters ? `Page ${currentPage} of ${totalPages}` : 'Apply filters to load reviews'}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setOffset(Math.max(0, offset - limit))}
                        disabled={!hasAppliedFilters || offset === 0 || loadingReviews}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setOffset(offset + limit)}
                        disabled={!hasAppliedFilters || offset + limit >= pageTotal || loadingReviews}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </Card>

                <div className="hidden lg:block lg:sticky lg:top-6">
                  {expandedReview && selectedIndex !== null ? (
                    <ReviewDetailPanel
                      review={expandedReview}
                      currentIndex={selectedIndex}
                      totalCount={sortedReviews.length}
                      onPrevious={() => {
                        if (selectedIndex > 0) {
                          const newIndex = selectedIndex - 1;
                          setSelectedIndex(newIndex);
                          setExpandedReview(sortedReviews[newIndex]);
                        }
                      }}
                      onNext={() => {
                        if (selectedIndex < sortedReviews.length - 1) {
                          const newIndex = selectedIndex + 1;
                          setSelectedIndex(newIndex);
                          setExpandedReview(sortedReviews[newIndex]);
                        }
                      }}
                      isAdmin={isAdmin}
                      t={t}
                    />
                  ) : (
                    <Card variant="glass" className="p-6">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('database.reviewDetails')}</p>
                      <p className="mt-3 text-sm text-slate-400">
                        {hasAppliedFilters ? 'Select a review to see details.' : 'Apply filters to load reviews.'}
                      </p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {!isDesktop && expandedReview && selectedIndex !== null && (
          <ReviewModal
            review={expandedReview}
            currentIndex={selectedIndex}
            totalCount={sortedReviews.length}
            onClose={() => setExpandedReview(null)}
            onPrevious={() => {
              if (selectedIndex > 0) {
                const newIndex = selectedIndex - 1;
                setSelectedIndex(newIndex);
                setExpandedReview(sortedReviews[newIndex]);
              }
            }}
            onNext={() => {
              if (selectedIndex < sortedReviews.length - 1) {
                const newIndex = selectedIndex + 1;
                setSelectedIndex(newIndex);
                setExpandedReview(sortedReviews[newIndex]);
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
