'use client';

import { useEffect, useMemo, useState, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { removeStarredGame, generateComparisonSummary } from "@/lib/api";
import { useStarredGames } from "@/contexts/StarredGamesContext";
import { StarredGameDTO, SubcategoryInsight, GameComparisonData, ReviewRow, TrendPoint } from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Portal } from "@/components/Portal";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { buildCategoryRates, buildSubcategoryInsights } from "@/lib/derivedInsights";
import { formatPercentage } from "@/utils/format";
import { getRecommendationColor } from "@/utils/colors";
import { useLanguage } from "@/contexts/LanguageContext";
import { OverviewComparisonCard } from "@/components/compare/OverviewComparisonCard";
import { ComparisonSummaryDisplay } from "@/components/compare/ComparisonSummaryDisplay";
import { PageTransition } from "@/components/PageTransition";
import { LANGUAGE_OPTIONS } from "@/lib/languageOptions";

const MAX_SELECTION = 2;

const MAIN_CATEGORY_LABELS: Record<string, string> = {
  gameplay: "Gameplay",
  technical: "Technical",
  content_design: "Content & Design",
  ui_ux_accessibility: "UI/UX & Accessibility",
  onboarding: "Onboarding",
  presentation: "Presentation",
  online_community: "Online & Community",
  developer_updates: "Developer & Updates",
  monetization_value: "Monetization & Value",
  other: "Other / Meta",
};

const CATEGORY_KEYS = Object.keys(MAIN_CATEGORY_LABELS).filter((key) => key !== "other");
const TREND_COLORS = [
  { line: "rgba(56,189,248,1)", fill: "rgba(56,189,248,0.18)", bar: "rgba(56,189,248,0.55)" },
  { line: "rgba(167,139,250,1)", fill: "rgba(167,139,250,0.18)", bar: "rgba(167,139,250,0.55)" },
  { line: "rgba(34,197,94,1)", fill: "rgba(34,197,94,0.18)", bar: "rgba(34,197,94,0.55)" },
];

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Tooltip,
  Legend,
  Filler
);

type TrendSeriesPoint = {
  label: string;
  date: Date | null;
  recommendation_rate: number;
  reviews: number;
};

function parseReviewDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = numeric < 1e12 ? numeric * 1000 : numeric;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isRecommended(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      ["true", "1", "yes", "positive", "recommended", "recommend", "thumbs_up", "thumbsup", "up"].includes(normalized)
    ) {
      return true;
    }
    if (
      ["false", "0", "no", "negative", "not recommended", "not_recommended", "thumbs_down", "thumbsdown", "down"].includes(
        normalized
      )
    ) {
      return false;
    }
  }
  return false;
}

function extractReviewDate(review: ReviewRow): Date | null {
  const fallback = (review as unknown as { [key: string]: unknown }) || {};
  return (
    parseReviewDate(review.created_at) ||
    parseReviewDate(fallback.timestamp_created) ||
    parseReviewDate(fallback.created_utc) ||
    parseReviewDate(fallback.timestamp) ||
    parseReviewDate(fallback.createdAt)
  );
}

function formatTrendLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function buildTrendSeriesFromReviews(reviews: ReviewRow[]): TrendSeriesPoint[] {
  const buckets = new Map<string, { date: Date; total: number; recommended: number }>();
  let minTime: number | null = null;
  let maxTime: number | null = null;
  reviews.forEach((review) => {
    const created = extractReviewDate(review);
    if (!created) return;
    const weekStart = startOfWeek(created);
    const weekTime = weekStart.getTime();
    if (minTime === null || weekTime < minTime) minTime = weekTime;
    if (maxTime === null || weekTime > maxTime) maxTime = weekTime;
    const key = weekStart.toISOString().slice(0, 10);
    const bucket = buckets.get(key) || { date: weekStart, total: 0, recommended: 0 };
    bucket.total += 1;
    if (isRecommended(review.voted_up)) bucket.recommended += 1;
    buckets.set(key, bucket);
  });

  if (minTime === null || maxTime === null) return [];

  const series: TrendSeriesPoint[] = [];
  const cursor = new Date(minTime);
  while (cursor.getTime() <= maxTime) {
    const key = cursor.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    const total = bucket?.total ?? 0;
    const recommended = bucket?.recommended ?? 0;
    series.push({
      label: formatTrendLabel(cursor),
      date: new Date(cursor),
      recommendation_rate: total > 0 ? recommended / total : 0,
      reviews: total,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return series;
}

function normalizeTrendSeries(trend: TrendPoint[] | undefined): TrendSeriesPoint[] {
  if (!trend || trend.length === 0) return [];
  const parsedPoints = trend
    .map((point, index) => {
      const parsed = parseReviewDate(point.period);
      const labelDate = parsed ? startOfWeek(parsed) : null;
      return {
        label: labelDate ? formatTrendLabel(labelDate) : point.period,
        date: parsed,
        recommendation_rate: Number(point.recommendation_rate ?? 0),
        reviews: Number(point.reviews ?? 0),
        order: parsed ? parsed.getTime() : index,
      };
    })
    .filter((point) => point.date);

  if (parsedPoints.length === 0) return [];

  parsedPoints.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const startTime = startOfWeek(parsedPoints[0].date as Date).getTime();
  const endTime = startOfWeek(parsedPoints[parsedPoints.length - 1].date as Date).getTime();
  const byDate = new Map<string, Omit<TrendSeriesPoint, "label"> & { label?: string }>();
  parsedPoints.forEach((point) => {
    const date = startOfWeek(point.date as Date);
    const key = date.toISOString().slice(0, 10);
    byDate.set(key, {
      date,
      recommendation_rate: point.recommendation_rate,
      reviews: point.reviews,
      label: point.label,
    });
  });

  const series: TrendSeriesPoint[] = [];
  const cursor = new Date(startTime);
  while (cursor.getTime() <= endTime) {
    const key = cursor.toISOString().slice(0, 10);
    const point = byDate.get(key);
    series.push({
      label: point?.label ?? formatTrendLabel(cursor),
      date: new Date(cursor),
      recommendation_rate: point?.recommendation_rate ?? 0,
      reviews: point?.reviews ?? 0,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return series;
}

// Filter types for comparison dashboard
type CompareFilters = {
  sentiment: "all" | "positive" | "negative";
  dateRange: "all" | "30d" | "90d" | "365d" | "custom";
  minHelpful: 0 | 10 | 25 | 50;
  playtime: "all" | "lt2h" | "2to20h" | "20hplus";
  language: string;
  customStartDate: string | null;
  customEndDate: string | null;
};

const DEFAULT_COMPARE_FILTERS: CompareFilters = {
  sentiment: "all",
  dateRange: "all",
  minHelpful: 0,
  playtime: "all",
  language: "all",
  customStartDate: null,
  customEndDate: null,
};

function maxDaysFromDateRange(range: CompareFilters["dateRange"]): number | null {
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  if (range === "365d") return 365;
  return null;
}

function matchesPlaytime(minutes: number, filter: CompareFilters["playtime"]): boolean {
  if (filter === "all") return true;
  if (filter === "lt2h") return minutes < 120;
  if (filter === "2to20h") return minutes >= 120 && minutes < 1200;
  if (filter === "20hplus") return minutes >= 1200;
  return true;
}

function applyCompareFilters(reviews: ReviewRow[], filters: CompareFilters): ReviewRow[] {
  if (!reviews.length) return [];

  const now = new Date();
  const maxDays = maxDaysFromDateRange(filters.dateRange);
  const lang = (filters.language || "all").trim().toLowerCase();

  // Parse custom date range if set
  const customStart = filters.customStartDate ? new Date(filters.customStartDate) : null;
  const customEnd = filters.customEndDate ? new Date(filters.customEndDate) : null;
  // Set customEnd to end of day
  if (customEnd) {
    customEnd.setHours(23, 59, 59, 999);
  }

  return reviews.filter((review) => {
    if (filters.sentiment !== "all") {
      const positive = isRecommended(review.voted_up);
      if (filters.sentiment === "positive" && !positive) return false;
      if (filters.sentiment === "negative" && positive) return false;
    }

    if (filters.minHelpful > 0) {
      const helpful = Number(review.votes_up ?? 0);
      if (!Number.isFinite(helpful) || helpful < filters.minHelpful) return false;
    }

    // Handle custom date range
    if (filters.dateRange === "custom" && (customStart || customEnd)) {
      const created = extractReviewDate(review);
      if (!created) return false;
      if (customStart && created < customStart) return false;
      if (customEnd && created > customEnd) return false;
    } else if (maxDays !== null) {
      const created = extractReviewDate(review);
      if (!created) return false;
      const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > maxDays) return false;
    }

    if (filters.playtime !== "all") {
      const minutes = Number(review.author_playtime_forever ?? 0);
      if (!Number.isFinite(minutes)) return false;
      if (!matchesPlaytime(minutes, filters.playtime)) return false;
    }

    if (lang && lang !== "all") {
      const reviewLang = String((review as { language?: unknown }).language ?? "")
        .trim()
        .toLowerCase();
      if (!reviewLang) return false;
      if (reviewLang !== lang) return false;
    }

    return true;
  });
}

function compareFiltersActive(filters: CompareFilters): boolean {
  const dateRangeActive =
    filters.dateRange !== "all" &&
    (filters.dateRange !== "custom" || !!filters.customStartDate || !!filters.customEndDate);

  return (
    filters.sentiment !== "all" ||
    dateRangeActive ||
    filters.minHelpful > 0 ||
    filters.playtime !== "all" ||
    (!!filters.language && filters.language !== "all")
  );
}

export default function ComparePage() {
  const { t } = useLanguage();
  const { games: analyzedGames, loading, removeGame } = useStarredGames();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [initialSelectionDone, setInitialSelectionDone] = useState(false);
  const [swapCandidateId, setSwapCandidateId] = useState<number | null>(null);

  // Set initial selection when games load
  useEffect(() => {
    if (!loading && analyzedGames.length > 0 && !initialSelectionDone) {
      const initialSelection = analyzedGames.slice(0, Math.min(2, analyzedGames.length)).map(g => g.app_id);
      setSelectedIds(initialSelection);
      setInitialSelectionDone(true);
    }
  }, [loading, analyzedGames, initialSelectionDone]);

  const selectedGames = useMemo(() => {
    return analyzedGames.filter((g) => selectedIds.includes(g.app_id));
  }, [analyzedGames, selectedIds]);
  const swapCandidate = useMemo(() => {
    if (swapCandidateId === null) return null;
    return analyzedGames.find((g) => g.app_id === swapCandidateId) || null;
  }, [analyzedGames, swapCandidateId]);

  function toggleGame(appId: number) {
    setSelectedIds((prev) => {
      if (prev.includes(appId)) {
        setSwapCandidateId(null);
        return prev.filter((id) => id !== appId);
      }
      if (prev.length >= MAX_SELECTION) {
        setSwapCandidateId(appId);
        return prev;
      }
      setSwapCandidateId(null);
      return [...prev, appId];
    });
  }

  function handleSwap(targetId: number) {
    if (swapCandidateId === null) return;
    setSelectedIds((prev) => {
      const next = prev.filter((id) => id !== targetId);
      return [...next, swapCandidateId].slice(-MAX_SELECTION);
    });
    setSwapCandidateId(null);
  }

  async function handleRemove(appId: number) {
    if (!confirm("Remove this game from your analyzed games?")) return;
    try {
      await removeStarredGame(appId);
      removeGame(appId); // Update context cache
      setSelectedIds((prev) => prev.filter((id) => id !== appId));
      setSwapCandidateId((prev) => (prev === appId ? null : prev));
    } catch (err) {
      console.error("Failed to remove game:", err);
    }
  }


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

  if (analyzedGames.length === 0) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <EmptyState
            title="No analyzed games"
            description="Analyze some games first to compare them here."
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
        <div className="mx-auto max-w-7xl px-4 py-10 space-y-10 sm:space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h1 className="text-3xl font-bold">
                <span className="text-white">
                  Game Comparison
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Compare 2 games side-by-side - {selectedIds.length} selected
              </p>
            </div>
          </div>

          {swapCandidate && selectedIds.length >= MAX_SELECTION && (
            <Card variant="glass" className="p-4 border border-amber-500/30 bg-amber-500/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-amber-200">
                    {t("compare.swapPrompt").replace("{game}", swapCandidate.name)}
                  </p>
                  <p className="text-xs text-amber-300/80">{t("compare.swapHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedGames.map((game) => (
                    <Button
                      key={game.app_id}
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSwap(game.app_id)}
                    >
                      {t("compare.swapReplace").replace("{game}", game.name)}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setSwapCandidateId(null)}>
                    {t("common.dismiss")}
                  </Button>
                </div>
              </div>
            </Card>
          )}

        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Select Games to Compare ({analyzedGames.length} analyzed)
          </h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {analyzedGames.map((game) => {
              const isSelected = selectedIds.includes(game.app_id);
              const previewSample = game.sample ?? [];
              const previewRecommendation = previewSample.length
                ? previewSample.reduce((sum, review) => sum + (review.voted_up ? 1 : 0), 0) / previewSample.length
                : 0;
              return (
                <button
                  key={game.app_id}
                  onClick={() => toggleGame(game.app_id)}
                  className={`relative overflow-hidden rounded-lg border transition-all ${
                    isSelected
                      ? "border-sky-500 ring-2 ring-sky-500/50"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="aspect-[460/215] relative">
                    <SteamImage
                      appId={game.app_id}
                      variant="header"
                      alt={game.name}
                      className="h-full w-full object-cover"
                      imageUrl={game.metadata.header_image}
                    />
                  </div>
                  <div className="p-3 bg-slate-900/90">
                    <p className="text-sm font-medium text-white truncate">{game.name}</p>
                    {game.sample?.length ? (
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: getRecommendationColor(previewRecommendation) }}
                      >
                        {formatPercentage(previewRecommendation)} recommend
                      </p>
                    ) : null}
                  </div>
                  {isSelected && (
                    <div className="absolute right-2 top-2 rounded-full bg-sky-500 px-2 py-1 text-xs font-bold text-white z-10">
                      Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {selectedGames.length < 2 ? (
          <EmptyState
            title={t('compare.selectGames')}
            description="Select 2 games from your analyzed games to compare their performance."
            variant="default"
          />
        ) : (
          <ComparisonDashboard games={selectedGames} onRemove={handleRemove} />
        )}
        </div>
      </PageTransition>
    </AppLayout>
  );
}

function ComparisonDashboard({
  games,
  onRemove,
}: {
  games: StarredGameDTO[];
  onRemove: (appId: number) => void;
}) {
  const { t } = useLanguage();
  const [reviewsModal, setReviewsModal] = useState<{ subcategory: string; label: string } | null>(null);
  const [subcategorySummary, setSubcategorySummary] = useState<any | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<CompareFilters>(() => ({ ...DEFAULT_COMPARE_FILTERS }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const updateFilters = (patch: Partial<CompareFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const resetFilters = () => {
    setFilters({ ...DEFAULT_COMPARE_FILTERS });
    setSearchQuery("");
  };

  const filtersActive = compareFiltersActive(filters) || searchQuery.trim().length > 0;

  // Lock body scroll when modal is open
  useEffect(() => {
    if (reviewsModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [reviewsModal]);

  const gameData = useMemo(() => {
    return games.map((game) => {
      const sample = game.sample ?? [];
      let filteredSample = applyCompareFilters(sample, filters);

      // Apply text search filter
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        filteredSample = filteredSample.filter((review) => {
          const text = (review.review ?? "").toLowerCase();
          return text.includes(query);
        });
      }
      const subcategoryInsights = buildSubcategoryInsights(filteredSample) as SubcategoryInsight[];
      const subcategoriesByMain = new Map<string, SubcategoryInsight[]>();
      subcategoryInsights.forEach((entry) => {
        const main = mainCategoryForEntry(entry);
        const list = subcategoriesByMain.get(main) ?? [];
        list.push(entry);
        subcategoriesByMain.set(main, list);
      });
      for (const [key, list] of subcategoriesByMain.entries()) {
        list.sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0));
        subcategoriesByMain.set(key, list);
      }

      const recommendation = filteredSample.length
        ? filteredSample.reduce((sum, review) => sum + (review.voted_up ? 1 : 0), 0) / filteredSample.length
        : 0;

      return {
        appId: game.app_id,
        name: game.name,
        metadata: game.metadata,
        recommendation,
        categoryRates: buildCategoryRates(filteredSample),
        subcategoriesByMain,
        sampleCount: sample.length,
        filteredCount: filteredSample.length,
        sample: filteredSample,
      };
    });
  }, [games, filters, searchQuery]);

  const categories = useMemo(() => {
    let cats = CATEGORY_KEYS.map((key) => {
      const perGame = gameData.map((game) => {
        const categoryRate = game.categoryRates?.[key];
        const subcats = game.subcategoriesByMain.get(key) ?? [];
        const count =
          Number(categoryRate?.count ?? 0) ||
          subcats.reduce((sum, entry) => sum + Number(entry.count ?? 0), 0);
        const subcatMap = new Map<string, SubcategoryInsight>();
        subcats.forEach((entry) => {
          const normalized = normalizeSubcategoryKey(entry);
          if (!subcatMap.has(normalized)) {
            subcatMap.set(normalized, entry);
          }
        });
        return {
          name: game.name,
          rate: categoryRate?.rate,
          count,
          subcats,
          subcatMap,
        };
      });

      // Calculate winner for this category (highest rate)
      const validRates = perGame.map((g, idx) => ({ idx, rate: g.rate ?? 0 })).filter(x => x.rate > 0);
      const maxRate = validRates.length > 0 ? Math.max(...validRates.map(x => x.rate)) : 0;
      const winnerIndices = validRates.filter(x => x.rate === maxRate).map(x => x.idx);

      // Calculate rate differences (max - min)
      const rates = perGame.map(g => g.rate ?? 0).filter(r => r > 0);
      const rateDiff = rates.length >= 2 ? Math.max(...rates) - Math.min(...rates) : 0;

      const subcategoryTotals = new Map<string, number>();
      perGame.forEach((game) => {
        game.subcats.forEach((entry) => {
          const normalized = normalizeSubcategoryKey(entry);
          const current = subcategoryTotals.get(normalized) ?? 0;
          subcategoryTotals.set(normalized, current + Number(entry.count ?? 0));
        });
      });

      const subcategoryRows = Array.from(subcategoryTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([subcategoryKey]) => {
          const label = subcategoryLabel(subcategoryKey);
          const perGameMetrics = perGame.map((game) => {
            const entry = game.subcatMap.get(subcategoryKey);
            return {
              rate: entry?.recommendation_rate,
              count: Number(entry?.count ?? 0),
            };
          });

          // Calculate winner for this subcategory
          const validSubRates = perGameMetrics.map((m, idx) => ({ idx, rate: m.rate ?? 0 })).filter(x => x.rate > 0);
          const maxSubRate = validSubRates.length > 0 ? Math.max(...validSubRates.map(x => x.rate)) : 0;
          const subWinnerIndices = validSubRates.filter(x => x.rate === maxSubRate).map(x => x.idx);

          return {
            key: subcategoryKey,
            label,
            perGameMetrics,
            winnerIndices: subWinnerIndices,
          };
        });

      const totalTagged = perGame.reduce((sum, item) => sum + item.count, 0);

      return {
        key,
        label: MAIN_CATEGORY_LABELS[key] ?? toTitleCase(key),
        totalTagged,
        perGame,
        subcategoryRows,
        winnerIndices,
        rateDiff,
      };
    });

    // Filter out categories with no data
    cats = cats.filter(cat => cat.totalTagged > 0);

    return cats;
  }, [gameData]);

  const gridCols = games.length === 2 ? "grid-cols-2" : "grid-cols-1";
  const rowGridCols = games.length === 2
    ? "grid-cols-[minmax(0,1fr)_176px]"
    : "grid-cols-[minmax(0,1fr)_88px]";

  const trendSeriesByGame = useMemo(() => {
    return gameData.map((game, idx) => {
      // When filters are active, build trend from filtered sample
      // Otherwise use insights trend if available
      let filteredSample = applyCompareFilters(games[idx]?.sample ?? [], filters);

      // Apply text search filter
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        filteredSample = filteredSample.filter((review) => {
          const text = (review.review ?? "").toLowerCase();
          return text.includes(query);
        });
      }

      const fromInsights = filtersActive ? [] : normalizeTrendSeries(games[idx]?.insights?.trend);
      const fromReviews = buildTrendSeriesFromReviews(filteredSample);
      const series = fromInsights.length ? fromInsights : fromReviews;
      const byKey = new Map<string, TrendSeriesPoint>();
      series.forEach((point) => {
        if (!point.date) return;
        byKey.set(point.date.toISOString().slice(0, 10), point);
      });
      return {
        name: game.name,
        series,
        byKey,
        color: TREND_COLORS[idx % TREND_COLORS.length],
      };
    });
  }, [gameData, games, filters, filtersActive, searchQuery]);

  const trendKeys = useMemo(() => {
    const keys = new Set<string>();
    trendSeriesByGame.forEach((entry) => {
      entry.series.forEach((point) => {
        if (!point.date) return;
        keys.add(point.date.toISOString().slice(0, 10));
      });
    });
    return Array.from(keys).sort();
  }, [trendSeriesByGame]);

  const trendLabels = useMemo(
    () => trendKeys.map((key) => formatTrendLabel(new Date(key))),
    [trendKeys]
  );
  const trendRangeLabel =
    trendKeys.length > 1
      ? `${formatTrendLabel(new Date(trendKeys[0]))} → ${formatTrendLabel(new Date(trendKeys[trendKeys.length - 1]))}`
      : "";

  const recommendationTrendData = useMemo(
    () => ({
      labels: trendLabels,
      datasets: trendSeriesByGame.map((entry) => ({
        label: entry.name,
        data: trendKeys.map((key) => {
          const point = entry.byKey.get(key);
          return point ? Math.round(point.recommendation_rate * 100) : null;
        }),
        borderColor: entry.color.line,
        backgroundColor: entry.color.fill,
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        spanGaps: false,
      })),
    }),
    [trendLabels, trendSeriesByGame, trendKeys]
  );

  const volumeTrendData = useMemo(
    () => ({
      labels: trendLabels,
      datasets: trendSeriesByGame.map((entry) => ({
        label: entry.name,
        data: trendKeys.map((key) => entry.byKey.get(key)?.reviews ?? 0),
        backgroundColor: entry.color.bar,
        borderColor: entry.color.line,
        borderWidth: 1,
      })),
    }),
    [trendLabels, trendSeriesByGame, trendKeys]
  );

  const trendGridColor = "rgba(148,163,184,0.12)";
  const trendAxisColor = "rgba(148,163,184,0.7)";
  const recommendationTrendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: "#cbd5f5", font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${context.parsed.y}% rec`,
        },
      },
    },
    scales: {
      x: { grid: { color: trendGridColor }, ticks: { color: trendAxisColor, font: { size: 10 } } },
      y: {
        min: 0,
        max: 100,
        grid: { color: trendGridColor },
        ticks: {
          color: trendAxisColor,
          font: { size: 10 },
          callback: (value: any) => `${value}%`,
        },
      },
    },
  };

  const volumeTrendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: "#cbd5f5", font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${context.parsed.y.toLocaleString()} reviews`,
        },
      },
    },
    scales: {
      x: { grid: { color: trendGridColor }, ticks: { color: trendAxisColor, font: { size: 10 } } },
      y: {
        grid: { color: trendGridColor },
        ticks: {
          color: trendAxisColor,
          font: { size: 10 },
          callback: (value: any) => value.toLocaleString(),
        },
      },
    },
  };

  // Radar chart data
  return (
    <div className="space-y-8">
      {/* Filters Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFiltersOpen((prev) => !prev)}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          {filtersOpen ? t("dashboard.hideFilters") : t("dashboard.showFilters")} {filtersOpen ? "↑" : "→"}
        </button>

        {filtersActive && (
          <button
            onClick={resetFilters}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {t("common.clearFilters")}
          </button>
        )}

        {filtersActive && (
          <span className="text-xs text-slate-500">
            ({gameData.reduce((sum, g) => sum + g.filteredCount, 0).toLocaleString()} of {gameData.reduce((sum, g) => sum + g.sampleCount, 0).toLocaleString()} reviews)
          </span>
        )}
      </div>

      {filtersOpen && (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-slate-500">{t("common.filters")}:</span>

            <select
              value={filters.sentiment}
              onChange={(e) => updateFilters({ sentiment: e.target.value as CompareFilters["sentiment"] })}
              className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
            >
              <option value="all">{t("filters.allSentiment")}</option>
              <option value="positive">{t("common.recommended")}</option>
              <option value="negative">{t("common.notRecommended")}</option>
            </select>

            <select
              value={filters.dateRange}
              onChange={(e) => {
                const value = e.target.value as CompareFilters["dateRange"];
                if (value !== "custom") {
                  updateFilters({ dateRange: value, customStartDate: null, customEndDate: null });
                } else {
                  updateFilters({ dateRange: value });
                }
              }}
              className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
            >
              <option value="all">{t("filters.allTime")}</option>
              <option value="30d">{t("filters.last30Days")}</option>
              <option value="90d">{t("filters.last90Days")}</option>
              <option value="365d">{t("filters.last12Months")}</option>
              <option value="custom">{t("filters.customRange")}</option>
            </select>

            {filters.dateRange === "custom" && (
              <>
                <input
                  type="date"
                  value={filters.customStartDate || ""}
                  onChange={(e) => updateFilters({ customStartDate: e.target.value || null })}
                  className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
                  placeholder="Start date"
                />
                <span className="text-xs text-slate-500">to</span>
                <input
                  type="date"
                  value={filters.customEndDate || ""}
                  onChange={(e) => updateFilters({ customEndDate: e.target.value || null })}
                  className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
                  placeholder="End date"
                />
              </>
            )}

            <select
              value={filters.minHelpful}
              onChange={(e) => updateFilters({ minHelpful: Number(e.target.value) as CompareFilters["minHelpful"] })}
              className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
            >
              <option value={0}>{t("filters.allHelpful")}</option>
              <option value={10}>{t("filters.helpfulVotes10")}</option>
              <option value={25}>{t("filters.helpfulVotes25")}</option>
              <option value={50}>{t("filters.helpfulVotes50")}</option>
            </select>

            <select
              value={filters.playtime}
              onChange={(e) => updateFilters({ playtime: e.target.value as CompareFilters["playtime"] })}
              className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
            >
              <option value="all">{t("filters.allPlaytime")}</option>
              <option value="lt2h">{t("filters.playtimeLt2h")}</option>
              <option value="2to20h">{t("filters.playtime2to20h")}</option>
              <option value="20hplus">{t("filters.playtime20hplus")}</option>
            </select>

            <select
              value={filters.language || "all"}
              onChange={(e) => updateFilters({ language: e.target.value })}
              className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('database.searchPlaceholder')}
              className="flex-1 min-w-[200px] rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>
        </div>
      )}

      <Card variant="glass" className="p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white">Category Comparison</h3>
          <p className="mt-1 text-sm text-slate-400">Compare recommendation rates across categories</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            return (
            <div
              key={category.key}
              className="rounded-xl border border-white/10 bg-slate-900/30 p-5"
            >
              <div className="mb-4">
                <p className="text-sm font-semibold text-white">
                  {category.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatCount(category.totalTagged)} tagged reviews
                </p>
              </div>

              <div className={`grid gap-3 ${gridCols}`}>
                {category.perGame.map((game, idx) => {
                  const isWinner = category.winnerIndices.includes(idx) && category.winnerIndices.length < games.length;
                  const rates = category.perGame.map(g => g.rate ?? 0).filter(r => r > 0);
                  const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
                  const isHighest = (game.rate ?? 0) === maxRate && maxRate > 0;

                  return (
                  <div key={game.name} className={`space-y-1 p-2 rounded-lg ${isHighest ? 'ring-2 ring-blue-500/50 bg-blue-500/5' : ''}`}>
                    <p className="text-xs uppercase tracking-wider text-slate-500 truncate">
                      {game.name.length > 12 ? game.name.substring(0, 12) + '...' : game.name}
                    </p>
                    <p
                      className="text-xl font-bold"
                      style={{ color: getRecommendationColor(game.rate) }}
                    >
                      {formatPercentOrDash(game.rate)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCount(game.count)} reviews
                    </p>
                  </div>
                )})}
              </div>

              <div className="mt-4 space-y-1.5">
                {category.subcategoryRows.length === 0 ? (
                  <p className="text-xs text-slate-500">No tagged subcategories</p>
                ) : (
                  category.subcategoryRows.map((row) => (
                    <button
                      key={row.key}
                      onClick={() => setReviewsModal({ subcategory: row.key, label: row.label })}
                      className={`w-full grid ${rowGridCols} items-center gap-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 transition-colors text-left`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-slate-300 truncate">{row.label}</p>
                      </div>
                      <div className={`grid gap-2 ${gridCols} w-full`}>
                        {row.perGameMetrics.map((metric, idx) => {
                          const rates = row.perGameMetrics.map(m => m.rate ?? 0).filter(r => r > 0);
                          const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
                          const isHighest = (metric.rate ?? 0) === maxRate && maxRate > 0;

                          return (
                          <div key={`${row.key}-${idx}`} className={`w-full px-1.5 py-0.5 text-center ${isHighest ? 'ring-1 ring-blue-400/50 bg-blue-500/10' : ''}`}>
                            <p
                              className="text-xs font-semibold"
                              style={{ color: getRecommendationColor(metric.rate) }}
                            >
                              {formatPercentOrDash(metric.rate)}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatCount(metric.count)} tags
                            </p>
                          </div>
                        )})}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )})}
        </div>
      </Card>

      <Card variant="glass" className="p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Trends</h3>
            <p className="mt-1 text-sm text-slate-400">Recommendation rate and review volume over time</p>
          </div>
          {trendRangeLabel && (
            <span className="text-xs text-slate-500">{trendRangeLabel}</span>
          )}
        </div>

        {trendKeys.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Trend data is not available for these games yet. Re-run analysis to include timestamps.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="border border-white/10 bg-slate-900/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Recommendation rate</p>
                {trendRangeLabel && (
                  <span className="text-xs text-slate-500">{trendRangeLabel}</span>
                )}
              </div>
              <div className="mt-3 h-40">
                <Chart type="line" data={recommendationTrendData} options={recommendationTrendOptions as any} />
              </div>
            </div>

            <div className="border border-white/10 bg-slate-900/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Review volume</p>
                {trendRangeLabel && (
                  <span className="text-xs text-slate-500">{trendRangeLabel}</span>
                )}
              </div>
              <div className="mt-3 h-40">
                <Chart type="bar" data={volumeTrendData} options={volumeTrendOptions as any} />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Sample Reviews Modal */}
      {reviewsModal && (
        <Portal>
          <div
            ref={modalOverlayRef}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-start justify-center p-4 pt-12 overflow-y-auto animate-modal-overlay"
            onClick={() => {
              setReviewsModal(null);
              setSubcategorySummary(null);
              setSummaryError(null);
            }}
            style={{ WebkitBackdropFilter: 'blur(12px)' }}
          >
              <div
                className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-white/20 bg-slate-900 p-6 shadow-2xl mb-8 animate-modal-content"
                onClick={(e) => e.stopPropagation()}
              >
            {/* Fixed Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-white">{reviewsModal.label}</h3>
                <p className="text-sm text-slate-400 mt-1">Compare how each game performs in this subcategory</p>
              </div>
              <button
                onClick={() => {
                  setReviewsModal(null);
                  setSubcategorySummary(null);
                  setSummaryError(null);
                }}
                className="text-slate-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 hover:scrollbar-thumb-slate-500" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
            {/* AI Comparison Button */}
            <div className="mb-6">
              {!subcategorySummary && (
                <button
                  onClick={async () => {
                    setSummaryLoading(true);
                    setSummaryError(null);
                    try {
                      const gamesData: GameComparisonData[] = gameData.map(game => {
                        const filteredSample = game.sample ?? [];
                        const subcatReviews = filteredSample
                          .filter((review: any) => {
                            const subcats = review.llm_subcategories || [];
                            return subcats.some((s: string) => normalizeSubcategoryKey({ subcategory: s } as any) === reviewsModal.subcategory);
                          })
                          .sort((a: any, b: any) => (b.votes_up ?? 0) - (a.votes_up ?? 0))
                          .slice(0, 50);

                        return {
                          app_id: game.appId,
                          name: game.name,
                          reviews: subcatReviews,
                          metrics: {
                            recommendation_rate: game.recommendation,
                            total_reviews: subcatReviews.length,
                          },
                        };
                      });

                      const category = reviewsModal.subcategory.includes('/')
                        ? reviewsModal.subcategory.split('/')[0]
                        : undefined;

                      const result = await generateComparisonSummary({
                        games: gamesData,
                        comparison_type: 'subcategory',
                        category,
                        subcategory: reviewsModal.subcategory,
                      });

                      setSubcategorySummary(result);
                    } catch (err: any) {
                      setSummaryError(err.message || 'Failed to generate comparison');
                    } finally {
                      setSummaryLoading(false);
                    }
                  }}
                  disabled={summaryLoading}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-medium uppercase tracking-wider border border-sky-500/50 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {summaryLoading ? (
                    <>
                      <div className="w-4 h-4 spinner-blue-sm animate-spin" />
                      <span>Summarizing...</span>
                    </>
                  ) : (
                    <span>Summarize</span>
                  )}
                </button>
              )}

              {summaryError && (
                <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg text-sm text-red-400">
                  {summaryError}
                </div>
              )}

              {subcategorySummary && (
                <div className="p-4 bg-slate-800/50 rounded-xl border border-white/10">
                  <ComparisonSummaryDisplay
                    summary={subcategorySummary}
                    gameNames={Object.fromEntries(gameData.map(g => [g.appId, g.name]))}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {gameData.map((game) => {
                const filteredSample = game.sample ?? [];
                const exampleReviews = filteredSample
                  .filter((review: any) => {
                    const subcats = review.llm_subcategories || [];
                    return subcats.some((s: string) => normalizeSubcategoryKey({ subcategory: s } as any) === reviewsModal.subcategory);
                  })
                  .sort((a: any, b: any) => (b.votes_up ?? 0) - (a.votes_up ?? 0))
                  .slice(0, 3); // Show top 3 by helpfulness

                return (
                  <div key={game.appId} className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
                    <h4 className="text-sm font-semibold text-sky-300 mb-3">{game.name}</h4>
                    {exampleReviews.length === 0 ? (
                      <p className="text-xs text-slate-500">No reviews tagged with this subcategory</p>
                    ) : (
                      <div className="space-y-3">
                        {exampleReviews.map((review: any, idx: number) => (
                          <div key={idx} className="rounded-lg bg-white/5 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="text-xs font-semibold"
                                style={{ color: getRecommendationColor(review.voted_up ? 1 : 0) }}
                              >
                                {review.voted_up ? 'Recommended' : 'Not Recommended'}
                              </span>
                              <span className="text-xs text-slate-500">
                                {review.author?.playtime_forever ? `${Math.floor((review.author.playtime_forever || 0) / 60)}h played` : 'No playtime data'}
                              </span>
                              {review.votes_up > 0 && (
                                <span className="text-xs text-slate-500">
                                  {review.votes_up} helpful
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-200 line-clamp-4">
                              {review.review || 'No review text'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
              </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

function mainCategoryForEntry(entry: SubcategoryInsight): string {
  const main = (entry.main_category || "").trim();
  if (main) return main.toLowerCase();
  const raw = (entry.subcategory || "").trim();
  if (raw.includes("/")) {
    return raw.split("/", 1)[0].toLowerCase();
  }
  return "other";
}

function normalizeSubcategoryKey(entry: SubcategoryInsight): string {
  const raw = (entry.subcategory || "").trim();
  if (raw) return raw;
  const main = (entry.main_category || "").trim();
  const sub = (entry.sub_category || "").trim();
  if (main && sub) {
    return `${main}/${sub}`;
  }
  return sub || "other/general";
}

function subcategoryLabel(value: string): string {
  if (!value) return "";
  const raw = value.includes("/") ? value.split("/", 2)[1] : value;
  return titleize(raw);
}

function toTitleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed.toLowerCase();
  const direct = MAIN_CATEGORY_LABELS[normalized];
  if (direct) return direct;

  return titleize(trimmed);
}

function titleize(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ui") return "UI";
      if (lower === "ux") return "UX";
      if (lower === "ugc") return "UGC";
      if (lower === "ai") return "AI";
      if (lower === "dlc") return "DLC";
      if (lower === "fomo") return "FOMO";
      if (lower === "p2w") return "P2W";
      if (lower === "ctd") return "CTD";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function formatPercentOrDash(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  if (!Number.isFinite(value)) return "—";
  return formatPercentage(value);
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString();
}
