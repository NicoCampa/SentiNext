'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FilterSidebar } from '@/components/database/FilterSidebar';
import { FilterPills } from '@/components/database/FilterPills';
import { ReviewModal } from '@/components/database/ReviewModal';
import { ReviewDetailPanel } from '@/components/database/ReviewDetailPanel';
import { ExportPreviewDialog, type ExportOptions } from '@/components/database/ExportPreviewDialog';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import {
  fetchDatabaseReviews,
  fetchDatabaseExportCount,
  downloadDatabaseExport,
  type DatabaseExportCount,
} from '@/lib/api';
import { formatTaxonomyLabel, MAIN_CATEGORY_LABELS, titleize } from '@/lib/taxonomyLabels';
import { languageLabelFor } from '@/lib/languageOptions';
import type { DatabaseReviewsResponse, DatabaseReviewItem, DatabaseGameOption } from '@/types';

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

interface ReviewsTabProps {
  games: DatabaseGameOption[];
  t: (key: string) => string;
}

export function ReviewsTab({ games, t }: ReviewsTabProps) {
  const { density } = useUiPreferences();
  const compact = density === 'compact';

  // API-level filters
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);

  // Client-side filters
  const [quickSentiment, setQuickSentiment] = useState<'all' | 'positive' | 'negative'>('all');
  const [quickType, setQuickType] = useState<'all' | 'issue' | 'request'>('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');

  // Pagination & sort
  const [limit, setLimit] = useState(200);
  const [offset, setOffset] = useState(0);
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'helpful'>('recent');

  // Data
  const [reviewsResponse, setReviewsResponse] = useState<DatabaseReviewsResponse | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedReview, setExpandedReview] = useState<DatabaseReviewItem | null>(null);

  // Mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Export
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState<DatabaseExportCount | null>(null);
  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Desktop detection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Load reviews automatically
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

  // Category/subcategory options derived from loaded data
  const categoryOptions = useMemo(() => {
    const mains = new Set<string>();
    pageItems.forEach((review) => {
      if (review.llm_main_category) mains.add(review.llm_main_category.toLowerCase());
      const subcats = [
        ...(review.llm_subcategories ?? []),
        ...(review.llm_issue_subcategories ?? []),
        ...(review.llm_request_subcategories ?? []),
      ];
      subcats.forEach((v) => {
        const [main] = v.split('/', 1);
        if (main) mains.add(main.toLowerCase());
      });
    });
    return Array.from(mains)
      .sort()
      .map((v) => ({ value: v, label: MAIN_CATEGORY_LABELS[v] ?? titleize(v) }));
  }, [pageItems]);

  const subcategoryOptions = useMemo(() => {
    const subs = new Map<string, { value: string; label: string; main?: string }>();
    pageItems.forEach((review) => {
      const subcats = [
        ...(review.llm_subcategories ?? []),
        ...(review.llm_issue_subcategories ?? []),
        ...(review.llm_request_subcategories ?? []),
      ];
      subcats.forEach((v) => {
        const trimmed = v?.trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();
        const main = trimmed.includes('/') ? trimmed.split('/', 1)[0].toLowerCase() : undefined;
        subs.set(lower, { value: lower, label: formatTaxonomyLabel(trimmed), main });
      });
    });
    return Array.from(subs.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pageItems]);

  // Client-side filtering
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
          if (!subcats.some((v) => v.toLowerCase().startsWith(`${selectedCategory}/`)))
            return false;
        }
      }
      if (selectedSubcategory !== 'all') {
        const subcats = [
          ...(review.llm_subcategories ?? []),
          ...(review.llm_issue_subcategories ?? []),
          ...(review.llm_request_subcategories ?? []),
        ];
        if (!subcats.some((v) => v.toLowerCase() === selectedSubcategory)) return false;
      }
      return true;
    });
  }, [pageItems, quickSentiment, quickType, selectedCategory, selectedSubcategory]);

  // Sorting
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

  // Selection sync
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
    if (!isDesktop) setExpandedReview(null);
  }, [isDesktop]);

  // Keyboard navigation
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
        setSelectedIndex((prev) =>
          prev === null ? 0 : Math.min(prev + 1, sortedReviews.length - 1),
        );
      }
      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev === null ? 0 : Math.max(prev - 1, 0)));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sortedReviews]);

  useEffect(() => {
    if (selectedIndex === null) return;
    document.getElementById(`db-review-item-${selectedIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Search handler (text search applies on Enter)
  function handleSearch() {
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
    setSelectedIndex(null);
    setExpandedReview(null);
    setError(null);
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
  }, [
    activeQuery,
    languageFilter,
    selectedAppId,
    selectedCategory,
    selectedSubcategory,
    quickSentiment,
    quickType,
  ]);

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
        label: 'Recommendation',
        value: quickSentiment === 'positive' ? 'Recommended' : 'Not recommended',
        onRemove: () => setQuickSentiment('all'),
      });
    }
    if (quickType !== 'all') {
      pills.push({
        key: 'type',
        label: 'Type',
        value: quickType === 'issue' ? 'Issues' : 'Requests',
        onRemove: () => setQuickType('all'),
      });
    }
    return pills;
  }, [
    activeQuery,
    languageFilter,
    selectedAppId,
    selectedCategory,
    selectedSubcategory,
    quickSentiment,
    quickType,
    games,
  ]);

  // Export
  async function handleExportPreview() {
    setDownloadError(null);
    setExportPreviewOpen(true);
    setExportPreviewLoading(true);
    setExportPreviewData(null);
    try {
      const data = await fetchDatabaseExportCount({
        app_id: selectedAppId,
        language: languageFilter === 'all' ? null : languageFilter,
        query: activeQuery || null,
      });
      setExportPreviewData(data);
    } catch (err) {
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
    <>
      <ExportPreviewDialog
        isOpen={exportPreviewOpen}
        onClose={() => setExportPreviewOpen(false)}
        onExport={handleDownload}
        previewData={exportPreviewData}
        loading={exportPreviewLoading}
        exporting={downloadBusy}
      />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Filter sidebar */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <FilterSidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            queryInput={queryInput}
            setQueryInput={setQueryInput}
            onSearch={handleSearch}
            languageFilter={languageFilter}
            setLanguageFilter={(v) => {
              setLanguageFilter(v);
              setOffset(0);
            }}
            selectedAppId={selectedAppId}
            setSelectedAppId={(v) => {
              setSelectedAppId(v);
              setOffset(0);
            }}
            games={games}
            selectedCategory={selectedCategory}
            setSelectedCategory={(v) => {
              setSelectedCategory(v);
              setSelectedSubcategory('all');
            }}
            selectedSubcategory={selectedSubcategory}
            setSelectedSubcategory={setSelectedSubcategory}
            categoryOptions={categoryOptions}
            subcategoryOptions={subcategoryOptions}
            onClearAll={handleClearAll}
            activeFilterCount={activeFilterCount}
            t={t}
          />
        </div>

        {/* Main content */}
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg border border-white/10 bg-slate-900/50 p-2 text-slate-400 hover:text-white lg:hidden"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <p className="text-sm text-slate-300">
                {loadingReviews
                  ? 'Loading...'
                  : `${sortedReviews.length} of ${pageTotal.toLocaleString()} reviews`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Quick sentiment filter */}
              {(['all', 'positive', 'negative'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQuickSentiment(v)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    quickSentiment === v
                      ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                      : 'border-white/10 text-slate-400 hover:border-sky-400/40'
                  }`}
                >
                  {v === 'all'
                    ? t('common.all')
                    : v === 'positive'
                      ? t('common.recommended')
                      : t('common.notRecommended')}
                </button>
              ))}

              <div className="mx-1 h-4 w-px bg-white/10" />

              {/* Quick type filter */}
              {(['all', 'issue', 'request'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQuickType(v)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    quickType === v
                      ? 'border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-100'
                      : 'border-white/10 text-slate-400 hover:border-fuchsia-400/40'
                  }`}
                >
                  {v === 'all'
                    ? t('common.all')
                    : v === 'issue'
                      ? t('common.issues')
                      : t('common.requests')}
                </button>
              ))}

              <div className="mx-1 h-4 w-px bg-white/10" />

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1 text-xs text-slate-200 focus:outline-none"
              >
                <option value="recent">Recent</option>
                <option value="oldest">Oldest</option>
                <option value="helpful">Helpful</option>
              </select>

              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
                className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1 text-xs text-slate-200 focus:outline-none"
              >
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>

              <Button
                variant="primary"
                size="sm"
                onClick={handleExportPreview}
                disabled={downloadBusy}
              >
                {t('database.export')}
              </Button>
            </div>
          </div>

          {/* Active filter pills */}
          {filterPills.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <FilterPills pills={filterPills} />
              <Button variant="secondary" size="sm" onClick={handleClearAll}>
                {t('common.clearFilters')}
              </Button>
            </div>
          )}

          {downloadError && <p className="text-xs text-rose-300">{downloadError}</p>}

          {/* Review list + detail panel */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              {loadingReviews ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, idx) => (
                    <div
                      key={idx}
                      className="h-24 animate-pulse rounded-xl border border-white/10 bg-slate-900/40"
                    />
                  ))}
                </div>
              ) : error ? (
                <p className="text-sm text-rose-400">{error}</p>
              ) : sortedReviews.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                  {t('database.noReviews')}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedReviews.map((review, idx) => {
                    const isActive = idx === selectedIndex;
                    const playtime =
                      review.author_playtime_hours ??
                      (review.author_playtime_forever || 0) / 60;
                    const appLabel = review.app_name || `App ${review.app_id}`;
                    return (
                      <button
                        key={`${review.review_id}-${idx}`}
                        id={`db-review-item-${idx}`}
                        type="button"
                        onClick={() => {
                          setSelectedIndex(idx);
                          setExpandedReview(review);
                        }}
                        className={`w-full rounded-xl border text-left transition ${
                          isActive
                            ? 'border-sky-400/60 bg-sky-500/10'
                            : 'border-white/10 bg-slate-900/30 hover:border-sky-500/40'
                        } ${compact ? 'p-3' : 'p-4'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                review.voted_up
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-rose-500/15 text-rose-300'
                              }`}
                            >
                              {review.voted_up
                                ? t('common.recommended')
                                : t('common.notRecommended')}
                            </span>
                            <span className="text-[11px] text-slate-300">{appLabel}</span>
                            {review.llm_main_category && (
                              <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-200">
                                {formatTaxonomyLabel(review.llm_main_category)}
                              </span>
                            )}
                            {hasIssue(review) && (
                              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">
                                {t('common.issues')}
                              </span>
                            )}
                            {hasRequest(review) && (
                              <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-200">
                                {t('common.requests')}
                              </span>
                            )}
                          </div>
                          <span>{formatReviewDate(review.created_at)}</span>
                        </div>
                        <p
                          className={`mt-2 line-clamp-2 text-sm text-slate-100 ${compact ? 'leading-snug' : 'leading-relaxed'}`}
                        >
                          {review.review}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                          <span>{playtime.toFixed(1)}h played</span>
                          {review.votes_up ? <span>{review.votes_up} helpful</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {pageTotal > limit && (
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex gap-2">
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
              )}
            </div>

            {/* Detail panel - desktop */}
            <div className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
              {expandedReview && selectedIndex !== null ? (
                <ReviewDetailPanel
                  review={expandedReview}
                  currentIndex={selectedIndex}
                  totalCount={sortedReviews.length}
                  onPrevious={() => {
                    if (selectedIndex > 0) {
                      const n = selectedIndex - 1;
                      setSelectedIndex(n);
                      setExpandedReview(sortedReviews[n]);
                    }
                  }}
                  onNext={() => {
                    if (selectedIndex < sortedReviews.length - 1) {
                      const n = selectedIndex + 1;
                      setSelectedIndex(n);
                      setExpandedReview(sortedReviews[n]);
                    }
                  }}
                  t={t}
                />
              ) : (
                <Card variant="glass" className="p-6">
                  <p className="text-sm text-slate-400">Select a review to see details.</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile modal */}
      {!isDesktop && expandedReview && selectedIndex !== null && (
        <ReviewModal
          review={expandedReview}
          currentIndex={selectedIndex}
          totalCount={sortedReviews.length}
          onClose={() => setExpandedReview(null)}
          onPrevious={() => {
            if (selectedIndex > 0) {
              const n = selectedIndex - 1;
              setSelectedIndex(n);
              setExpandedReview(sortedReviews[n]);
            }
          }}
          onNext={() => {
            if (selectedIndex < sortedReviews.length - 1) {
              const n = selectedIndex + 1;
              setSelectedIndex(n);
              setExpandedReview(sortedReviews[n]);
            }
          }}
          t={t}
        />
      )}
    </>
  );
}
