'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Chart as ChartJS,
  BarController,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Chart } from "react-chartjs-2";

import { searchGames, summarizeSubcategory, SubcategorySummaryResponse, translateText } from "@/lib/api";
import { useCredits } from "@/contexts/CreditsContext";
import type {
  AnalyzeResponse,
  AnalyzeEstimateResponse,
  CategoryRecommendationRate,
  CrossSegmentAnalysis,
  PlayerSegments,
  PlatformSegmentInsights,
  LanguageSegmentInsights,
  ProgressStatus,
  QualityWeightedInsights,
  TrendPoint,
  ReviewRow,
  SearchResult,
  SubcategoryInsight,
  ThemeDefinition,
} from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { PageTransition } from "@/components/PageTransition";
import { Portal } from "@/components/Portal";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { useGameContext } from "@/contexts/GameContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildCategoryRates, buildSubcategoryInsights } from "@/lib/derivedInsights";
import { LANGUAGE_OPTIONS } from "@/lib/languageOptions";
import { getRecommendationColor, hexToRgba } from "@/utils/colors";
import { formatSavedLabel } from "@/utils/format";

ChartJS.register(
  BarController,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
);

const EMPTY_REVIEWS: ReviewRow[] = [];
const ESTIMATED_SECONDS_PER_LLM_REVIEW = 1.1;

const DEFAULT_THEME: ThemeDefinition = {
  name: "Twilight",
  gradient: ["#6366f1", "#22d3ee", "#0b1120"],
  palette: {
    accent: "#6366f1",
    secondary: "#22d3ee",
    positive: "#22c55e",
    neutral: "#94a3b8",
    negative: "#ef4444",
    surface: "#151635",
    surface_alt: "#0f172a",
    border: "rgba(129,140,248,0.25)",
  },
};

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

const CATEGORY_ACCENTS: Record<string, string> = {
  gameplay: "#6366f1",
  technical: "#ef4444",
  content_design: "#22d3ee",
  ui_ux_accessibility: "#8b5cf6",
  onboarding: "#38bdf8",
  presentation: "#f59e0b",
  online_community: "#10b981",
  developer_updates: "#f97316",
  monetization_value: "#ef4444",
  other: "#94a3b8",
};

// Map Steam language codes to our app language codes for translation
const STEAM_TO_APP_LANGUAGE: Record<string, string> = {
  english: 'en',
  italian: 'it',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  portuguese: 'pt',
  brazilian: 'pt',
  russian: 'ru',
  japanese: 'ja',
  koreana: 'ko',
  schinese: 'zh',
  tchinese: 'zh',
  polish: 'pl',
  turkish: 'tr',
  dutch: 'nl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  ukrainian: 'uk',
  thai: 'th',
  vietnamese: 'vi',
  arabic: 'ar',
  indonesian: 'id',
  greek: 'el',
};

type DashboardSentimentFilter = "all" | "positive" | "negative";
type DashboardDateRangeFilter = "all" | "30d" | "90d" | "365d" | "custom";
type DashboardHelpfulFilter = 0 | 10 | 25 | 50;
type DashboardPlaytimeFilter = "all" | "lt2h" | "2to20h" | "20hplus";

interface DashboardFilters {
  sentiment: DashboardSentimentFilter;
  dateRange: DashboardDateRangeFilter;
  minHelpful: DashboardHelpfulFilter;
  playtime: DashboardPlaytimeFilter;
  language: string;
  customStartDate: string | null;
  customEndDate: string | null;
}

const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  sentiment: "all",
  dateRange: "all",
  minHelpful: 0,
  playtime: "all",
  language: "all",
  customStartDate: null,
  customEndDate: null,
};

function maxDaysFromDateRange(range: DashboardDateRangeFilter): number | null {
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  if (range === "365d") return 365;
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function matchesPlaytime(minutes: number, filter: DashboardPlaytimeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "lt2h") return minutes < 120;
  if (filter === "2to20h") return minutes >= 120 && minutes < 1200;
  if (filter === "20hplus") return minutes >= 1200;
  return true;
}

function applyDashboardReviewFilters(reviews: ReviewRow[], filters: DashboardFilters): ReviewRow[] {
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
      const isPositive = isRecommended(review.voted_up);
      if (filters.sentiment === "positive" && !isPositive) return false;
      if (filters.sentiment === "negative" && isPositive) return false;
    }

    if (filters.minHelpful > 0) {
      const helpful = Number(review.votes_up ?? 0);
      if (!Number.isFinite(helpful) || helpful < filters.minHelpful) return false;
    }

    // Handle custom date range
    if (filters.dateRange === "custom" && (customStart || customEnd)) {
      const created = parseDate((review as { created_at?: unknown }).created_at);
      if (!created) return false;
      if (customStart && created < customStart) return false;
      if (customEnd && created > customEnd) return false;
    } else if (maxDays !== null) {
      const created = parseDate((review as { created_at?: unknown }).created_at);
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

function dashboardFiltersActive(filters: DashboardFilters): boolean {
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

interface TrendSeriesPoint {
  label: string;
  date: Date | null;
  recommendation_rate: number;
  reviews: number;
}

interface TrendWeekSelection {
  key: string;
  start: Date;
  end: Date;
  label: string;
}

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
        normalized,
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
  const diff = (day + 6) % 7; // Monday as start of week
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatWeekRangeLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatTrendLabel(start)} → ${formatTrendLabel(end)}`;
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

export default function DashboardPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<div className="p-6 text-white">{t('common.loading')}</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameParam = searchParams.get("game");
  const viewParam = searchParams.get("view");
  const { startAnalysis, getTask, tasks } = useAnalysis();
  const { games, loading: gamesLoading, refreshGames, selectGameById, setTemporaryGame, selectedStarredGame, toggleFavorite } = useGameContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<SearchResult | null>(null);

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const reviewCount = 1000; // Fixed at 1000 latest reviews
  const fetchFilter = "recent"; // Fixed to recent (latest reviews)
  const { credits, refresh: refreshCredits } = useCredits();

  const currentTask = selectedGame ? getTask(selectedGame.appid) : undefined;
  const isAnalyzing = currentTask?.status === "analyzing";
  const progress = currentTask?.progress ?? null;

  useEffect(() => {
    if (!gameParam) return;
    const appId = parseInt(gameParam, 10);
    if (Number.isNaN(appId)) return;

    const game = games.find((entry) => entry.app_id === appId);
    if (game && game.insights) {
      setSelectedGame({
        appid: game.app_id,
        name: game.name,
        price: null,
        url: `https://store.steampowered.com/app/${game.app_id}`,
        image_url: game.metadata.header_image ?? null,
      });
      setAnalysis({ metadata: game.metadata, insights: game.insights, reviews: game.sample ?? [] });
      selectGameById(appId);
    }
    if (!gamesLoading && !game) {
      setError("Saved analysis not found for this game.");
    }
  }, [gameParam, games, gamesLoading, selectGameById]);

  useEffect(() => {
    if (!selectedStarredGame) return;
    if (selectedGame?.appid === selectedStarredGame.app_id && analysis?.metadata?.app_id === selectedStarredGame.app_id) {
      return;
    }
    setSelectedGame({
      appid: selectedStarredGame.app_id,
      name: selectedStarredGame.name,
      price: null,
      url: `https://store.steampowered.com/app/${selectedStarredGame.app_id}`,
      image_url: selectedStarredGame.metadata.header_image ?? null,
    });
    setAnalysis({
      metadata: selectedStarredGame.metadata,
      insights: selectedStarredGame.insights,
      reviews: selectedStarredGame.sample ?? [],
    });
  }, [selectedStarredGame, selectedGame, analysis]);

  useEffect(() => {
    if (currentTask?.status === "completed" && currentTask.result) {
      setAnalysis(currentTask.result);
      refreshGames().catch(() => null);
      refreshCredits().catch(() => null);
      if (selectedGame) {
        selectGameById(selectedGame.appid);
      }
    }
  }, [currentTask, refreshGames, refreshCredits, selectGameById, selectedGame]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const results = await searchGames(searchQuery);
      setSearchResults(results);
      if (!results.length) {
        setError(t('dashboard.noGamesFound'));
      }
    } catch (err) {
      setError((err as Error).message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleAnalyze(game: SearchResult) {
    setError(null);
    const existingGame = games.find((entry) => entry.app_id === game.appid);
    setTemporaryGame(game);

    try {
      const lastFetchedAt = existingGame?.metadata?.fetched_at;
      const lastFetchDate = lastFetchedAt ? new Date(lastFetchedAt) : null;
      const hasValidFetchDate = lastFetchDate instanceof Date && !Number.isNaN(lastFetchDate.getTime());
      const daysSinceLastRun = hasValidFetchDate
        ? Math.max(
            Math.ceil((Date.now() - lastFetchDate.getTime()) / (1000 * 60 * 60 * 24)),
            1,
          )
        : undefined;
      const shouldRefresh = Boolean(existingGame && hasValidFetchDate);

      await startAnalysis(game, {
        refresh: shouldRefresh,
        review_count: reviewCount,
        language: "all", // Always analyze all languages
        languages: undefined,
        filter: fetchFilter,
        refresh_days: shouldRefresh ? daysSinceLastRun : undefined,
      });
    } catch (err) {
      setError((err as Error).message || "Failed to start analysis");
    }
  }

  const handleReset = useCallback(() => {
    setSelectedGame(null);
    setAnalysis(null);
    setSearchQuery("");
    setSearchResults([]);
    setError(null);
    setTemporaryGame(null);
    selectGameById(null);
    router.replace("/dashboard");
  }, [router, selectGameById, setTemporaryGame]);

  useEffect(() => {
    if (viewParam === "home") {
      handleReset();
    }
  }, [handleReset, viewParam]);

  const loadingStarred = Boolean(gameParam && gamesLoading && !analysis);
  const recentAnalyses = games.slice(0, 6);
  const favoriteGames = useMemo(() => games.filter(game => game.is_favorite), [games]);
  const transitionKey = selectedGame ? `game-${selectedGame.appid}` : `home-${viewParam ?? "default"}`;

  const handleToggleFavorite = async (appId: number, currentStatus: boolean) => {
    try {
      await toggleFavorite(appId, !currentStatus);
    } catch (err) {
      setError("Failed to update favorite status");
    }
  };

  if (loadingStarred) {
    return (
      <AppLayout>
        <PageTransition key={`loading-${gameParam ?? "none"}`}>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-6">
            <Card variant="glass" className="p-5">
              <div className="flex items-center justify-center gap-4">
                <div className="h-8 w-8 animate-spin spinner-blue" />
                <p className="text-lg text-slate-300">{t('common.loading')}</p>
              </div>
            </Card>
          </div>
        </PageTransition>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageTransition key={transitionKey}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-6 space-y-8 sm:space-y-6">
          {selectedGame ? (
            <div className="flex items-center justify-between">
              <button
                onClick={handleReset}
                className="group inline-flex items-center gap-2 text-sm text-slate-400 hover:text-sky-400 transition-colors"
              >
                <svg
                  className="w-4 h-4 transition-transform duration-200 ease-out group-hover:-translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Home
              </button>
            </div>
          ) : null}

          {!selectedGame && (
            <>
              <Card variant="glass" className="p-6">
                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{t('dashboard.welcome')}</p>
                  <div>
                  <h1 className="text-2xl font-semibold">
                    <span className="text-white">
                      {t('dashboard.welcomeTo')}
                    </span>
                  </h1>
                  <p className="mt-2 text-sm text-slate-400">
                    {t('dashboard.subtitle')}
                  </p>
                </div>
              </div>
            </Card>

            <div id="new-analysis">
              <Card variant="glass" className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{t('dashboard.newAnalysis')}</h2>
                    <p className="text-xs text-slate-400">{t('dashboard.newAnalysisDesc')}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                      placeholder={t('dashboard.searchPlaceholder')}
                      className="flex-1 rounded-xl border border-white/20 bg-slate-900/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      variant="primary"
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      {searching ? t('dashboard.searching') : t('common.search')}
                    </Button>
                  </div>

                  {error && searchResults.length === 0 && <p className="text-sm text-rose-400">{error}</p>}

                  {searchResults.length > 0 && (
                    <div className="mt-6 space-y-3">
                      <p className="text-sm text-slate-400">{searchResults.length} games found</p>
                      <div className="grid gap-4 md:grid-cols-2">
                        {searchResults.map((game) => {
                          const gameTask = getTask(game.appid);
                          const isAnalyzingGame = gameTask?.status === "analyzing";
                          const isAlreadyAnalyzed = games.some((entry) => entry.app_id === game.appid);
                          return (
                            <div
                              key={game.appid}
                              className="flex gap-4 rounded-xl border border-white/10 bg-slate-900/30 p-4 transition hover:border-sky-500/50"
                            >
                              <SteamImage
                                appId={game.appid}
                                variant="capsule"
                                alt={game.name}
                                className="h-16 w-28 rounded-lg object-cover flex-shrink-0"
                                imageUrl={game.image_url}
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-white truncate">{game.name}</h3>
                                {game.price && <p className="mt-1 text-sm text-slate-400">{game.price}</p>}
                                <Button
                                  onClick={() => handleAnalyze(game)}
                                  disabled={isAnalyzingGame}
                                  variant={isAlreadyAnalyzed ? "update" : "primary"}
                                  size="sm"
                                  className="mt-3"
                                >
                                  {isAnalyzingGame
                                    ? t('dashboard.analyzing')
                                    : isAlreadyAnalyzed
                                      ? t('dashboard.update')
                                      : t('dashboard.analyze')}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Favorites Section */}
            {favoriteGames.length > 0 && (
              <Card variant="glass" className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span className="text-amber-400">★</span>
                      Favorite Games
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500">{favoriteGames.length} game{favoriteGames.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {favoriteGames.map((game) => {
                    const sample = game.sample ?? [];
                    const rate = sample.length
                      ? sample.reduce((sum, review) => sum + (isRecommended(review.voted_up) ? 1 : 0), 0) / sample.length
                      : null;
                    return (
                      <div
                        key={game.app_id}
                        className="group relative rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden transition hover:border-amber-500/50 hover:bg-amber-500/10"
                      >
                        <button
                          onClick={() => router.push(`/dashboard?game=${game.app_id}`)}
                          className="w-full text-left"
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
                          <div className="p-2.5">
                            <p className="text-xs font-semibold text-white line-clamp-1">{game.name}</p>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs text-slate-500">{sample.length.toLocaleString()} reviews</p>
                              <p className="text-xs font-semibold" style={{ color: getRecommendationColor(rate ?? 0) }}>
                                {formatPercentOrDash(rate)}
                              </p>
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(game.app_id, true);
                          }}
                          className="absolute top-1 right-1 px-2 py-1.5 rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                          title="Remove from favorites"
                        >
                          <span className="text-amber-400 text-sm">★</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card variant="glass" className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">{t('dashboard.recentAnalyses')}</h2>
                  <p className="text-xs text-slate-400">{t('dashboard.recentDesc')}</p>
                </div>
                {recentAnalyses.length > 0 ? (
                  <a href="/compare" className="text-xs text-sky-400 hover:text-sky-300">
                    {t('dashboard.viewAll')}
                  </a>
                ) : null}
              </div>

              <div className="mt-4">
                {gamesLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {[...Array(4)].map((_, idx) => (
                      <div key={idx} className="h-32 animate-pulse rounded-xl border border-white/10 bg-slate-900/40" />
                    ))}
                  </div>
                ) : recentAnalyses.length === 0 ? (
                  <EmptyState
                    title={t('dashboard.noAnalyses')}
                    description={t('dashboard.noAnalysesDesc')}
                    variant="info"
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {recentAnalyses.map((game) => {
                      const sample = game.sample ?? [];
                      const rate = sample.length
                        ? sample.reduce((sum, review) => sum + (isRecommended(review.voted_up) ? 1 : 0), 0) / sample.length
                        : null;
                      const isFavorite = game.is_favorite ?? false;
                      return (
                        <div
                          key={game.app_id}
                          className="group relative rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden transition hover:border-sky-500/40 hover:bg-slate-900/50"
                        >
                          <button
                            onClick={() => router.push(`/dashboard?game=${game.app_id}`)}
                            className="w-full text-left"
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
                            <div className="p-2.5">
                              <p className="text-xs font-semibold text-white line-clamp-1">{game.name}</p>
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-slate-500">{sample.length.toLocaleString()} reviews</p>
                                <p className="text-xs font-semibold" style={{ color: getRecommendationColor(rate ?? 0) }}>
                                  {formatPercentOrDash(rate)}
                                </p>
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(game.app_id, isFavorite);
                            }}
                            className="absolute top-1 right-1 px-2 py-1.5 rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            <span className={`text-sm ${isFavorite ? 'text-amber-400' : 'text-white/70 hover:text-amber-400'}`}>
                              {isFavorite ? '★' : '☆'}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        {/* Show loading state when analysis is complete but insights not yet available */}
        {analysis && !analysis.insights && !isAnalyzing && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="animate-spin h-8 w-8 spinner-blue mx-auto" />
              <p className="text-slate-400">Loading analysis results...</p>
            </div>
          </div>
        )}

        {analysis && analysis.insights && (
          <AnalysisResults
            analysis={analysis}
            selectedGame={selectedGame}
            updateSuccess={updateSuccess}
            error={error}
            onUpdate={async () => {
              if (!selectedGame || !analysis?.metadata?.fetched_at) return;

              // Clear previous messages
              setError(null);
              setUpdateSuccess(null);

              // Calculate days since last analysis
              const lastFetchDate = new Date(analysis.metadata.fetched_at);
              const now = new Date();
              const daysSinceLastRun = Math.ceil((now.getTime() - lastFetchDate.getTime()) / (1000 * 60 * 60 * 24));

              // Trigger analysis with only new reviews since last run
              try {
                await startAnalysis(selectedGame, {
                  refresh: true,
                  review_count: reviewCount,
                  language: "all",
                  languages: undefined,
                  filter: fetchFilter,
                  refresh_days: daysSinceLastRun,
                });

                // Show success message
                setUpdateSuccess("You are up to date");
                // Auto-hide after 3 seconds
                setTimeout(() => setUpdateSuccess(null), 3000);
              } catch (err) {
                setError((err as Error).message || "Failed to update analysis");
              }
            }}
          />
        )}
      </div>
      </PageTransition>
    </AppLayout>
  );
}

function DashboardFiltersBar({
  filters,
  onChange,
}: {
  filters: DashboardFilters;
  onChange: (patch: Partial<DashboardFilters>) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">{t("common.filters")}:</span>

        <select
          value={filters.sentiment}
          onChange={(event) => onChange({ sentiment: event.target.value as DashboardSentimentFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">{t("filters.allSentiment")}</option>
          <option value="positive">{t("common.recommended")}</option>
          <option value="negative">{t("common.notRecommended")}</option>
        </select>

        <select
          value={filters.dateRange}
          onChange={(event) => {
            const value = event.target.value as DashboardDateRangeFilter;
            if (value !== "custom") {
              onChange({ dateRange: value, customStartDate: null, customEndDate: null });
            } else {
              onChange({ dateRange: value });
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
              onChange={(event) => onChange({ customStartDate: event.target.value || null })}
              className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
              placeholder="Start date"
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              value={filters.customEndDate || ""}
              onChange={(event) => onChange({ customEndDate: event.target.value || null })}
              className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
              placeholder="End date"
            />
          </>
        )}

        <select
          value={filters.minHelpful}
          onChange={(event) => onChange({ minHelpful: Number(event.target.value) as DashboardHelpfulFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value={0}>{t("filters.allHelpful")}</option>
          <option value={10}>{t("filters.helpfulVotes10")}</option>
          <option value={25}>{t("filters.helpfulVotes25")}</option>
          <option value={50}>{t("filters.helpfulVotes50")}</option>
        </select>

        <select
          value={filters.playtime}
          onChange={(event) => onChange({ playtime: event.target.value as DashboardPlaytimeFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">{t("filters.allPlaytime")}</option>
          <option value="lt2h">{t("filters.playtimeLt2h")}</option>
          <option value="2to20h">{t("filters.playtime2to20h")}</option>
          <option value="20hplus">{t("filters.playtime20hplus")}</option>
        </select>

        <select
          value={filters.language || "all"}
          onChange={(event) => onChange({ language: event.target.value })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AnalysisResults({
  analysis,
  selectedGame,
  onUpdate,
  updateSuccess,
  error,
}: {
  analysis: AnalyzeResponse;
  selectedGame: SearchResult | null;
  onUpdate?: () => void;
  updateSuccess?: string | null;
  error?: string | null;
}) {
  const { t, language: userLanguage } = useLanguage();
  const { silentRefresh: refreshCredits } = useCredits();
  const router = useRouter();
  const insights = analysis.insights ?? null;
  const theme = (insights?.theme as ThemeDefinition | undefined) ?? DEFAULT_THEME;
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedSubcategoryType, setSelectedSubcategoryType] = useState<'issue' | 'request' | 'general'>('general');
  const [selectedSubcategoryLanguage, setSelectedSubcategoryLanguage] = useState<{ key: string; label: string } | null>(null);
  const [selectedTrendWeek, setSelectedTrendWeek] = useState<TrendWeekSelection | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<{
    type: 'experience' | 'purchase' | 'activity' | 'engagement' | 'language';
    key: string;
    label: string;
    description: string;
  } | null>(null);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState<DashboardFilters>(() => ({ ...DEFAULT_DASHBOARD_FILTERS }));
  const [reviewQuery, setReviewQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [subcategorySummary, setSubcategorySummary] = useState<SubcategorySummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Trigger animations on mount
  useEffect(() => {
    setMounted(true);
  }, []);
  // Translation state: key is reviewKey, value is { text: string, loading: boolean, show: boolean }
  const [translations, setTranslations] = useState<Map<string, { text: string | null; loading: boolean; show: boolean }>>(new Map());

  const categoryRates = insights?.category_recommendation_rates;
  const subcategoryInsights = insights?.subcategory_insights;

  const reviewSample = analysis.reviews ?? EMPTY_REVIEWS;
  const filtersActive = useMemo(
    () => dashboardFiltersActive(filters) || reviewQuery.trim().length > 0,
    [filters, reviewQuery],
  );
  const filteredReviewSample = useMemo(() => {
    const filtered = applyDashboardReviewFilters(reviewSample, filters);
    const query = reviewQuery.trim().toLowerCase();
    if (!query) return filtered;
    return filtered.filter((review) => {
      const text = (review.review ?? "").toLowerCase();
      return text.includes(query);
    });
  }, [reviewSample, filters, reviewQuery]);
  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_DASHBOARD_FILTERS });
    setReviewQuery("");
  }, []);
  const updateFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);
  const clearSelectedSubcategory = useCallback(() => {
    setSelectedSubcategory(null);
    setSelectedSubcategoryLanguage(null);
  }, []);
  const openSubcategory = useCallback(
    (subcategory: string, type: 'issue' | 'request' | 'general', language?: { key: string; label?: string }) => {
      const languageKey = language?.key?.toLowerCase() ?? null;
      const currentLanguageKey = selectedSubcategoryLanguage?.key?.toLowerCase() ?? null;
      const isSameSelection = selectedSubcategory === subcategory && currentLanguageKey === languageKey;
      if (isSameSelection) {
        clearSelectedSubcategory();
        return;
      }
      setSelectedSubcategory(subcategory);
      setSelectedSubcategoryType(type);
      if (languageKey) {
        setSelectedSubcategoryLanguage({
          key: languageKey,
          label: language?.label ?? toTitleCase(languageKey),
        });
      } else {
        setSelectedSubcategoryLanguage(null);
      }
    },
    [clearSelectedSubcategory, selectedSubcategory, selectedSubcategoryLanguage],
  );

  const trendSeries = useMemo(() => {
    if (filtersActive) {
      return buildTrendSeriesFromReviews(filteredReviewSample);
    }
    const normalized = normalizeTrendSeries(analysis.insights?.trend);
    if (normalized.length) return normalized;
    return buildTrendSeriesFromReviews(reviewSample);
  }, [analysis.insights?.trend, filteredReviewSample, filtersActive, reviewSample]);

  const latestTrend = trendSeries.length ? trendSeries[trendSeries.length - 1] : null;
  const previousTrend = trendSeries.length > 1 ? trendSeries[trendSeries.length - 2] : null;
  const recDelta =
    latestTrend && previousTrend
      ? latestTrend.recommendation_rate - previousTrend.recommendation_rate
      : null;
  const volumeDelta = latestTrend && previousTrend ? latestTrend.reviews - previousTrend.reviews : null;
  const recDeltaLabel =
    recDelta === null ? "—" : `${recDelta >= 0 ? "+" : ""}${Math.round(recDelta * 100)}%`;
  const volumeDeltaLabel =
    volumeDelta === null ? "—" : `${volumeDelta >= 0 ? "+" : ""}${volumeDelta.toLocaleString()}`;
  const recDeltaClass =
    recDelta === null ? "text-slate-500" : recDelta >= 0 ? "text-emerald-400" : "text-rose-400";
  const volumeDeltaClass =
    volumeDelta === null ? "text-slate-500" : volumeDelta >= 0 ? "text-emerald-400" : "text-rose-400";
  const trendRangeLabel =
    trendSeries.length > 1 ? `${trendSeries[0].label} → ${trendSeries[trendSeries.length - 1].label}` : "";

  const activeSubcategoryInsights = useMemo(() => {
    if (!filtersActive && subcategoryInsights && subcategoryInsights.length) return subcategoryInsights;
    return buildSubcategoryInsights(filteredReviewSample);
  }, [filteredReviewSample, filtersActive, subcategoryInsights]);

  const activeCategoryRates = useMemo(() => {
    if (!filtersActive && categoryRates && Object.keys(categoryRates).length) return categoryRates;
    return buildCategoryRates(filteredReviewSample);
  }, [categoryRates, filteredReviewSample, filtersActive]);

  const subcatsByMain = useMemo(() => {
    const buckets = new Map<string, SubcategoryInsight[]>();
    (activeSubcategoryInsights ?? []).forEach((entry) => {
      const main = (entry.main_category || entry.subcategory?.split("/", 1)[0] || "other").toLowerCase();
      const list = buckets.get(main) ?? [];
      list.push(entry);
      buckets.set(main, list);
    });
    for (const [key, list] of buckets.entries()) {
      list.sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0));
      buckets.set(key, list);
    }
    return buckets;
  }, [activeSubcategoryInsights]);

  const categories = useMemo(() => {
    const order = Object.keys(MAIN_CATEGORY_LABELS).filter((key) => key !== "other");
    return order.map((key) => {
      const payload = activeCategoryRates?.[key];
      const fallbackCount = (subcatsByMain.get(key) ?? []).reduce((sum, item) => sum + Number(item.count ?? 0), 0);
      const count = Number(payload?.count ?? fallbackCount);
      return {
        key,
        label: MAIN_CATEGORY_LABELS[key] ?? toTitleCase(key),
        accent: CATEGORY_ACCENTS[key] ?? theme.palette.accent,
        rate: payload?.rate,
        count,
        subcategories: subcatsByMain.get(key) ?? [],
      };
    });
  }, [activeCategoryRates, subcatsByMain, theme.palette.accent]);

  
  const issueItems = useMemo(() => {
    return (activeSubcategoryInsights ?? [])
      .filter((entry) => Number(entry.issue_count ?? 0) > 0)
      .sort((a, b) => Number(b.issue_count ?? 0) - Number(a.issue_count ?? 0))
      .slice(0, 5);
  }, [activeSubcategoryInsights]);

  const requestItems = useMemo(() => {
    return (activeSubcategoryInsights ?? [])
      .filter((entry) => Number(entry.request_count ?? 0) > 0)
      .sort((a, b) => Number(b.request_count ?? 0) - Number(a.request_count ?? 0))
      .slice(0, 5);
  }, [activeSubcategoryInsights]);

  const playerSegments = useMemo(() => {
    if (!filtersActive && insights?.player_segments) {
      // Use backend data but supplement with client-side calculations for new segments
      // that may be missing from older analyses
      const backendSegments = insights.player_segments;
      if (!backendSegments.platform || !backendSegments.language) {
        const clientSegments = buildPlayerSegments(filteredReviewSample);
        return {
          ...backendSegments,
          platform: backendSegments.platform || clientSegments.platform,
          language: backendSegments.language || clientSegments.language,
        };
      }
      return backendSegments;
    }
    return buildPlayerSegments(filteredReviewSample);
  }, [filteredReviewSample, filtersActive, insights?.player_segments]);

  const selectedWeekReviews = useMemo(() => {
    if (!selectedTrendWeek) return [];
    const start = selectedTrendWeek.start;
    const end = selectedTrendWeek.end;
    return filteredReviewSample
      .filter((review) => {
        const created = extractReviewDate(review);
        if (!created) return false;
        return created >= start && created < end;
      })
      .sort((a, b) => Number(b.votes_up ?? 0) - Number(a.votes_up ?? 0));
  }, [filteredReviewSample, selectedTrendWeek]);

  const selectedReviews = useMemo(() => {
    if (!selectedSubcategory) return [];
    return filteredReviewSample
      .filter((review) => {
        const subcats = review.llm_subcategories ?? [];
        const matchesSubcategory = Array.isArray(subcats) && subcats.includes(selectedSubcategory);
        if (!matchesSubcategory) return false;
        if (selectedSubcategoryLanguage?.key) {
          const reviewLang = (review.language || '').toLowerCase();
          return reviewLang === selectedSubcategoryLanguage.key.toLowerCase();
        }
        return true;
      })
      .sort((a, b) => Number(b.votes_up ?? 0) - Number(a.votes_up ?? 0));
  }, [filteredReviewSample, selectedSubcategory, selectedSubcategoryLanguage]);

  const selectedSegmentReviews = useMemo(() => {
    if (!selectedSegment) return [];
    const minutesFor = (review: ReviewRow) => {
      const val = review.author_playtime_forever;
      if (typeof val === "number") return val;
      if (typeof val === "string") return parseFloat(val) || 0;
      return 0;
    };
    const recentMinutesFor = (review: ReviewRow) => {
      const val = review.author_playtime_last_two_weeks;
      if (typeof val === "number") return val;
      if (typeof val === "string") return parseFloat(val) || 0;
      return 0;
    };
    const gamesOwned = (review: ReviewRow) => {
      const val = review.author_num_games_owned;
      if (typeof val === "number") return val;
      if (typeof val === "string") return parseInt(val, 10) || 0;
      return 0;
    };

    return filteredReviewSample
      .filter((review) => {
        switch (selectedSegment.type) {
          case 'experience': {
            const games = gamesOwned(review);
            switch (selectedSegment.key) {
              case 'newcomers': return games < 50;
              case 'casual': return games >= 50 && games < 200;
              case 'experienced': return games >= 200 && games < 500;
              case 'veterans': return games >= 500;
              default: return false;
            }
          }
          case 'purchase': {
            switch (selectedSegment.key) {
              case 'steam_buyers': return review.steam_purchase === true;
              case 'key_users': return review.steam_purchase === false && review.received_for_free === false;
              case 'free_users': return review.received_for_free === true;
              default: return false;
            }
          }
          case 'activity': {
            const recent = recentMinutesFor(review);
            const total = minutesFor(review);
            switch (selectedSegment.key) {
              case 'currently_active': return recent > 0;
              case 'recently_stopped': return recent === 0 && total > 0;
              case 'inactive': return total === 0;
              default: return false;
            }
          }
          case 'engagement': {
            const minutes = minutesFor(review);
            switch (selectedSegment.key) {
              case 'highly_engaged': return minutes >= 1200; // 20h+
              case 'moderately_engaged': return minutes >= 120 && minutes < 1200; // 2-20h
              case 'low_engagement': return minutes < 120; // <2h
              default: return false;
            }
          }
          case 'language': {
            const reviewLang = (review.language || '').toLowerCase();
            return reviewLang === selectedSegment.key.toLowerCase();
          }
          default:
            return false;
        }
      })
      .sort((a, b) => Number(b.votes_up ?? 0) - Number(a.votes_up ?? 0));
  }, [filteredReviewSample, selectedSegment]);

  const highlightEvidence = (text: string, evidence: string[]): React.ReactNode => {
    if (!evidence || evidence.length === 0) return text;

    // Sort evidence by length (longest first) to handle overlapping matches
    const sortedEvidence = [...evidence].sort((a, b) => b.length - a.length);

    // Create a list of segments with their highlight status
    const segments: Array<{ text: string; highlight: boolean }> = [];
    let remainingText = text;
    let currentIndex = 0;

    // Find all evidence positions
    const matches: Array<{ start: number; end: number; text: string }> = [];
    sortedEvidence.forEach(snippet => {
      if (!snippet.trim()) return;
      const lowerText = text.toLowerCase();
      const lowerSnippet = snippet.toLowerCase();
      let index = lowerText.indexOf(lowerSnippet);
      while (index !== -1) {
        matches.push({ start: index, end: index + snippet.length, text: snippet });
        index = lowerText.indexOf(lowerSnippet, index + 1);
      }
    });

    // Sort matches by position and merge overlapping
    matches.sort((a, b) => a.start - b.start);
    const mergedMatches: typeof matches = [];
    matches.forEach(match => {
      if (mergedMatches.length === 0) {
        mergedMatches.push(match);
      } else {
        const last = mergedMatches[mergedMatches.length - 1];
        if (match.start <= last.end) {
          // Overlapping or adjacent - extend the last match
          last.end = Math.max(last.end, match.end);
        } else {
          mergedMatches.push(match);
        }
      }
    });

    // Build segments
    mergedMatches.forEach(match => {
      if (match.start > currentIndex) {
        segments.push({ text: text.slice(currentIndex, match.start), highlight: false });
      }
      segments.push({ text: text.slice(match.start, match.end), highlight: true });
      currentIndex = match.end;
    });

    if (currentIndex < text.length) {
      segments.push({ text: text.slice(currentIndex), highlight: false });
    }

    if (segments.length === 0) return text;

    return (
      <>
        {segments.map((segment, idx) =>
          segment.highlight ? (
            <mark
              key={idx}
              className="bg-yellow-400/30 text-yellow-100 rounded px-0.5"
            >
              {segment.text}
            </mark>
          ) : (
            <span key={idx}>{segment.text}</span>
          )
        )}
      </>
    );
  };

  const selectedSubcategoryLabel = selectedSubcategory ? toSubcategoryLabel(selectedSubcategory) : "";
  const selectedMainLabel = selectedSubcategory
    ? MAIN_CATEGORY_LABELS[selectedSubcategory.split("/", 1)[0]?.toLowerCase() ?? ""] ?? toTitleCase(selectedSubcategory)
    : "";
  const selectedSubcategoryLanguageLabel = selectedSubcategoryLanguage?.label ?? "";
  const summaryTotal = filteredReviewSample.length;
  const summaryRecommendationRate =
    summaryTotal > 0
      ? filteredReviewSample.reduce((sum, review) => sum + (isRecommended(review.voted_up) ? 1 : 0), 0) / summaryTotal
      : null;
  const summaryIssueRate =
    summaryTotal > 0
      ? filteredReviewSample.reduce((sum, review) => sum + (listifyStrings(review.llm_issue_subcategories).length ? 1 : 0), 0) /
        summaryTotal
      : null;
  const summaryRequestRate =
    summaryTotal > 0
      ? filteredReviewSample.reduce((sum, review) => sum + (listifyStrings(review.llm_request_subcategories).length ? 1 : 0), 0) /
        summaryTotal
      : null;

  const trendLabels = trendSeries.map((point) => point.label);
  const recLineColor = theme.palette.secondary ?? theme.palette.accent;
  const recFillColor = hexToRgba(recLineColor, 0.18);
  const volumeBarColor = hexToRgba(theme.palette.accent, 0.55);
  const volumeBarHighlight = hexToRgba(theme.palette.accent, 0.9);
  const gridColor = "rgba(148,163,184,0.12)";
  const axisColor = "rgba(148,163,184,0.7)";
  const selectedTrendKey = selectedTrendWeek?.key ?? null;

  const recommendationTrendData = {
    labels: trendLabels,
    datasets: [
      {
        data: trendSeries.map((point) => Math.round(point.recommendation_rate * 100)),
        borderColor: recLineColor,
        backgroundColor: recFillColor,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  const volumeTrendData = {
    labels: trendLabels,
    datasets: [
      {
        data: trendSeries.map((point) => point.reviews),
        backgroundColor: trendSeries.map((point) => {
          const key = point.date ? startOfWeek(point.date).toISOString().slice(0, 10) : point.label;
          return selectedTrendKey && key === selectedTrendKey ? volumeBarHighlight : volumeBarColor;
        }),
        borderRadius: 0,
        maxBarThickness: 28,
      },
    ],
  };

  const handleVolumeBarClick = useCallback(
    (index: number) => {
      const point = trendSeries[index];
      if (!point?.date) return;
      const start = startOfWeek(point.date);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const key = start.toISOString().slice(0, 10);
      const label = formatWeekRangeLabel(start);
      clearSelectedSubcategory();
      setSelectedTrendWeek((prev) => (prev?.key === key ? null : { key, start, end, label }));
    },
    [clearSelectedSubcategory, trendSeries],
  );

  const recommendationTrendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.y}% rec`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: axisColor, font: { size: 10 } },
      },
      y: {
        min: 0,
        max: 100,
        grid: { color: gridColor },
        ticks: {
          color: axisColor,
          font: { size: 10 },
          callback: (value: any) => `${value}%`,
        },
      },
    },
  };

  const volumeTrendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: Array<{ index: number }>) => {
      if (!elements || elements.length === 0) return;
      handleVolumeBarClick(elements[0].index);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.y.toLocaleString()} reviews`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: axisColor, font: { size: 10 } },
      },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: axisColor,
          font: { size: 10 },
          callback: (value: any) => value.toLocaleString(),
        },
      },
    },
  };

  const hasOverlay = Boolean(selectedSubcategory || selectedTrendWeek || selectedSegment);

  useEffect(() => {
    if (!hasOverlay) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedSegment) {
          setSelectedSegment(null);
          return;
        }
        if (selectedTrendWeek) {
          setSelectedTrendWeek(null);
          return;
        }
        if (selectedSubcategory) {
          clearSelectedSubcategory();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [hasOverlay, selectedTrendWeek, selectedSubcategory, selectedSegment, clearSelectedSubcategory]);

  useEffect(() => {
    setExpandedReviews(new Set());
    setSubcategorySummary(null);
    setSummaryError(null);
    setSummaryLoading(false);
  }, [selectedSubcategory]);

  useEffect(() => {
    if (!selectedTrendWeek) return;
    setExpandedReviews(new Set());
  }, [selectedTrendWeek]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (hasOverlay) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [hasOverlay]);

  const handleSummarize = async () => {
    if (!selectedSubcategory || !selectedGame || selectedReviews.length === 0) return;

    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const result = await summarizeSubcategory({
        app_id: selectedGame.appid,
        subcategory: selectedSubcategory,
        summary_type: selectedSubcategoryType,
        reviews: selectedReviews.slice(0, 50).map((r) => ({
          review_id: String(r.review_id ?? ""),
          review: r.review ?? "",
          voted_up: r.voted_up,
          llm_subcategory_evidence: r.llm_subcategory_evidence ?? {},
          llm_subcategories: r.llm_subcategories ?? [],
        })),
      });
      setSubcategorySummary(result);
      // Refresh credits after consuming them
      refreshCredits();
    } catch (err) {
      setSummaryError((err as Error).message || "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card variant="glass" className={`p-6 ${mounted ? 'animate-fade-slide-up' : 'opacity-0'}`}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-5">
            {selectedGame ? (
              <SteamImage
                appId={selectedGame.appid}
                variant="header"
                alt={selectedGame.name}
                className="h-24 w-44 rounded-xl object-cover"
                imageUrl={analysis.metadata.header_image}
              />
            ) : null}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-white">
                  {selectedGame?.name ?? "Analysis"}
                </h2>
              </div>
              <p className="text-sm text-slate-400">
                Last run {new Date(analysis.metadata.fetched_at).toLocaleDateString()}
              </p>
              <p className="text-xs text-slate-500">
                {analysis.metadata.retrieved.toLocaleString()} reviews analyzed
              </p>
            </div>
          </div>

        {updateSuccess && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <p className="text-sm text-green-400">{updateSuccess}</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        {onUpdate && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button onClick={onUpdate} variant="ghost" size="sm">
              Update
            </Button>
          </div>
        )}
      </div>

        <div className="mt-4 flex items-center gap-3">
          {filtersActive && (
            <button onClick={resetFilters} className="text-xs text-slate-500 hover:text-slate-300">
              {t('common.clearFilters')}
            </button>
          )}
          {filtersActive && <span className="text-xs text-emerald-400">•</span>}
          <button
            onClick={() => setFiltersOpen((prev) => !prev)}
            className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
          >
            {filtersOpen ? t('dashboard.hideFilters') : t('dashboard.showFilters')} {filtersOpen ? "↑" : "→"}
          </button>
        </div>

        {filtersOpen && (
          <Card variant="glass" className="mt-2 p-4">
            <DashboardFiltersBar filters={filters} onChange={updateFilters} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                value={reviewQuery}
                onChange={(event) => setReviewQuery(event.target.value)}
                placeholder={t('database.searchPlaceholder')}
                className="flex-1 min-w-[200px] rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
              <span className="text-xs text-slate-500">
                {filteredReviewSample.length} / {reviewSample.length} reviews
              </span>
            </div>
          </Card>
        )}

        <div className="mt-5 grid gap-3 sm:gap-2 sm:grid-cols-3">
          <div className={`rounded-2xl border border-white/10 bg-slate-900/30 p-3 ${mounted ? 'animate-scale-in animation-delay-100' : 'opacity-0'}`}>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{t('dashboard.recommendation')}</p>
            <p
              className="mt-1.5 text-xl font-semibold"
              style={{ color: getRecommendationColor(summaryRecommendationRate ?? 0) }}
            >
              {formatPercentOrDash(summaryRecommendationRate)}
            </p>
          </div>
          <div className={`rounded-2xl border border-white/10 bg-slate-900/30 p-3 ${mounted ? 'animate-scale-in animation-delay-200' : 'opacity-0'}`}>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{t('dashboard.issueRate')}</p>
            <p className="mt-1.5 text-xl font-semibold text-white">{formatPercentOrDash(summaryIssueRate)}</p>
          </div>
          <div className={`rounded-2xl border border-white/10 bg-slate-900/30 p-3 ${mounted ? 'animate-scale-in animation-delay-300' : 'opacity-0'}`}>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{t('dashboard.requestRate')}</p>
            <p className="mt-1.5 text-xl font-semibold text-white">{formatPercentOrDash(summaryRequestRate)}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-6">

        <Card variant="glass" className={`p-6 ${mounted ? 'animate-fade-slide-up animation-delay-200' : 'opacity-0'}`}>
          <div>
            <h4 className="text-lg font-semibold text-white">{t('dashboard.categoriesOverview')}</h4>
            <p className="mt-1 text-sm text-slate-400">Recommendation rate by main category and tagged subcategories</p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {categories.map((category) => {
              const rateText = formatPercentOrDash(category.rate);
              const rateColor = getRecommendationColor(category.rate);
              return (
                <div
                  key={category.key}
                  className="rounded-2xl border border-white/10 bg-slate-900/30 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{category.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{category.count.toLocaleString()} tagged reviews</p>
                    </div>
                    <p className="text-3xl font-semibold" style={{ color: rateColor }}>
                      {rateText}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {category.subcategories.length === 0 ? (
                      <p className="text-sm text-slate-500 col-span-2">No tagged subcategories.</p>
                    ) : (
                      category.subcategories.map((sub) => (
                        <button
                          key={sub.subcategory}
                          type="button"
                          onClick={() => {
                            openSubcategory(sub.subcategory, 'general');
                          }}
                          className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left ${
                            selectedSubcategory === sub.subcategory
                              ? "border-sky-400/50 bg-sky-500/10"
                              : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                          }`}
                        >
                          <div className="w-full min-w-0">
                            <p className="truncate text-sm text-slate-200">
                              {toSubcategoryLabel(sub.subcategory, sub.sub_category)}
                            </p>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <p className="text-xs text-slate-500">{Number(sub.count ?? 0).toLocaleString()} tags</p>
                              <p
                                className="text-sm font-semibold"
                                style={{ color: getRecommendationColor(sub.recommendation_rate) }}
                              >
                                {formatPercentOrDash(sub.recommendation_rate)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card variant="glass" className={`p-6 ${mounted ? 'animate-fade-slide-up animation-delay-300' : 'opacity-0'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-white">{t('dashboard.topIssues')}</h4>
                <p className="mt-1 text-sm text-slate-400">Subcategories with the most reported issues</p>
              </div>
              <span className="text-xs text-slate-500">{issueItems.length} items</span>
            </div>
            {issueItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No issue tags found yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {issueItems.map((entry) => {
                  const subcategoryKey = entry.subcategory || entry.sub_category || "other/general";
                  const label = toSubcategoryLabel(subcategoryKey, entry.sub_category) || "Other";
                  const issueCount = Number(entry.issue_count ?? 0);
                  const totalCount = Number(entry.count ?? 0);
                  const issuePercentage = totalCount > 0 ? Math.round((issueCount / totalCount) * 100) : 0;
                  const snippet = entry.issue_snippets?.[0] ?? "";
                  return (
                    <button
                      key={subcategoryKey}
                      type="button"
                      onClick={() => {
                        openSubcategory(subcategoryKey, 'issue');
                      }}
                      className={`flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left ${
                        selectedSubcategory === subcategoryKey
                          ? "border-sky-400/50 bg-sky-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm text-slate-200">{label}</p>
                        <p className="text-xs text-slate-500">
                          {issueCount.toLocaleString()} issues ({issuePercentage}% of reviews)
                        </p>
                        {snippet ? (
                          <p className="text-xs text-slate-400">{snippet}</p>
                        ) : (
                          <p className="text-xs text-slate-600">No evidence captured yet.</p>
                        )}
                      </div>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: getRecommendationColor(entry.recommendation_rate) }}
                      >
                        {formatPercentOrDash(entry.recommendation_rate)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card variant="glass" className={`p-6 ${mounted ? 'animate-fade-slide-up animation-delay-400' : 'opacity-0'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-white">{t('dashboard.topRequests')}</h4>
                <p className="mt-1 text-sm text-slate-400">Most requested improvements and additions</p>
              </div>
              <span className="text-xs text-slate-500">{requestItems.length} items</span>
            </div>
            {requestItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No feature requests tagged yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {requestItems.map((entry) => {
                  const subcategoryKey = entry.subcategory || entry.sub_category || "other/general";
                  const label = toSubcategoryLabel(subcategoryKey, entry.sub_category) || "Other";
                  const requestCount = Number(entry.request_count ?? 0);
                  const totalCount = Number(entry.count ?? 0);
                  const requestPercentage = totalCount > 0 ? Math.round((requestCount / totalCount) * 100) : 0;
                  const snippet = entry.request_snippets?.[0] ?? "";
                  return (
                    <button
                      key={subcategoryKey}
                      type="button"
                      onClick={() => {
                        openSubcategory(subcategoryKey, 'request');
                      }}
                      className={`flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left ${
                        selectedSubcategory === subcategoryKey
                          ? "border-sky-400/50 bg-sky-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm text-slate-200">{label}</p>
                        <p className="text-xs text-slate-500">
                          {requestCount.toLocaleString()} requests ({requestPercentage}% of reviews)
                        </p>
                        {snippet ? (
                          <p className="text-xs text-slate-400">{snippet}</p>
                        ) : (
                          <p className="text-xs text-slate-600">No evidence captured yet.</p>
                        )}
                      </div>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: getRecommendationColor(entry.recommendation_rate) }}
                      >
                        {formatPercentOrDash(entry.recommendation_rate)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <Card variant="glass" className={`p-6 ${mounted ? 'animate-fade-slide-up animation-delay-500' : 'opacity-0'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">Trends</h4>
              <p className="mt-1 text-sm text-slate-400">How sentiment and volume shift over time</p>
            </div>
            {latestTrend && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-400">
                  Latest {formatPercentOrDash(latestTrend.recommendation_rate)} rec
                </span>
                <span className={recDeltaClass}>{recDeltaLabel}</span>
                <span className="text-slate-400">{latestTrend.reviews.toLocaleString()} reviews</span>
                <span className={volumeDeltaClass}>{volumeDeltaLabel}</span>
                {filtersActive && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                    filtered view
                  </span>
                )}
              </div>
            )}
          </div>

          {trendSeries.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {filtersActive && filteredReviewSample.length === 0
                ? "No reviews match the current filters."
                : reviewSample.length > 0
                ? "Trend data is missing for this analysis. Re-run analysis to include timestamps."
                : "Trend data is not available for this analysis."}
            </p>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
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

              <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Review volume</p>
                  <div className="flex items-center gap-2">
                    {trendRangeLabel && (
                      <span className="text-xs text-slate-500">{trendRangeLabel}</span>
                    )}
                    {selectedTrendWeek && (
                      <button
                        type="button"
                        onClick={() => setSelectedTrendWeek(null)}
                        className="text-xs text-sky-300 hover:text-sky-200"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">Click a bar to view reviews from that week.</p>
                {selectedTrendWeek && (
                  <p className="mt-1 text-xs text-sky-300">Selected {selectedTrendWeek.label}</p>
                )}
                <div className="mt-3 h-40">
                  <Chart type="bar" data={volumeTrendData} options={volumeTrendOptions as any} />
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card variant="glass" className={`p-6 ${mounted ? 'animate-fade-slide-up animation-delay-600' : 'opacity-0'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">Userbase segmentation</h4>
              <p className="mt-1 text-sm text-slate-400">Who is reviewing and what they care about</p>
            </div>
          </div>

          {!playerSegments ? (
            <p className="mt-4 text-sm text-slate-500">Segmentation data is not available for this analysis.</p>
          ) : (
            <div className="mt-5 space-y-6">
              {/* Regional breakdown with top issues */}
              {playerSegments.language && playerSegments.language.languages?.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Regional Breakdown</h5>
                    <span className="text-xs text-slate-500">{playerSegments.language.total_languages} languages</span>
                  </div>
                  <div className="space-y-4">
                    {(() => {
                      const langs = playerSegments.language.languages.slice(0, 5);
                      // Calculate total reviews across all displayed languages for percentage
                      const totalReviews = langs.reduce((sum, l) => sum + l.count, 0);
                      return langs.map((lang) => {
                        // Bar width as percentage of total reviews (not relative to max)
                        const barWidth = totalReviews > 0 ? (lang.count / totalReviews) * 100 : 0;
                        const topIssues = lang.top_issues?.slice(0, 5) ?? [];
                        const langKey = lang.language.toLowerCase();
                        const langLabel = lang.language.charAt(0).toUpperCase() + lang.language.slice(1);
                        const isSelected = selectedSegment?.type === 'language' && selectedSegment?.key === langKey;
                        return (
                          <div key={lang.language} className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setSelectedSegment(isSelected ? null : { type: 'language', key: langKey, label: langLabel, description: `${lang.count.toLocaleString()} reviews` })}
                              className={clsx(
                                "w-full flex items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors",
                                isSelected ? "bg-indigo-500/20" : "hover:bg-white/5"
                              )}
                            >
                              <span className="w-20 text-xs text-slate-300 truncate text-left">
                                {langLabel}
                              </span>
                              <div className="flex-1 h-6 bg-slate-950/50 rounded relative overflow-hidden">
                                <div
                                  className="h-full rounded transition-all bg-indigo-500/40"
                                  style={{ width: `${barWidth}%` }}
                                />
                                <div className="absolute inset-0 flex items-center justify-between px-2">
                                  <span className="text-[10px] text-slate-400">
                                    {lang.count.toLocaleString()} ({Math.round(barWidth)}%)
                                  </span>
                                  <span
                                    className="text-xs font-medium"
                                    style={{ color: getRecommendationColor(lang.recommendation_rate) }}
                                  >
                                    {formatPercent(lang.recommendation_rate)}
                                  </span>
                                </div>
                              </div>
                            </button>
                            {topIssues.length > 0 && (
                              <div className="ml-[5.5rem] flex flex-wrap items-center gap-1.5">
                                <span className="text-[9px] text-slate-500 uppercase tracking-wide mr-1">Top issues:</span>
                                {topIssues.map((issue) => (
                                  <button
                                    key={issue.category}
                                    type="button"
                                    onClick={() => {
                                      openSubcategory(issue.category, 'issue', { key: langKey, label: langLabel });
                                    }}
                                    className={clsx(
                                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                                      selectedSubcategory === issue.category && selectedSubcategoryLanguage?.key === langKey
                                        ? "bg-rose-500/20 border-rose-500/30"
                                        : "bg-slate-800/50 border-white/5 hover:bg-slate-700/50 hover:border-white/10"
                                    )}
                                  >
                                    <span className="text-rose-300">{toSubcategoryLabel(issue.category)}</span>
                                    <span className="text-slate-500">({issue.count})</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Main segments grid - Compact cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Experience Cohorts - Based on total games owned */}
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Experience</h5>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wide">Rec%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Steam library size</p>
                  <div className="space-y-2">
                    {[
                      { label: "New", subLabel: "<10 games", key: "newcomers", data: playerSegments.experience_level?.newcomers },
                      { label: "Casual", subLabel: "10-50", key: "casual", data: playerSegments.experience_level?.casual },
                      { label: "Regular", subLabel: "50-150", key: "experienced", data: playerSegments.experience_level?.experienced },
                      { label: "Veteran", subLabel: "150+", key: "veterans", data: playerSegments.experience_level?.veterans },
                    ].map((row) => {
                      const count = row.data?.count ?? 0;
                      const rec = row.data?.recommendation_rate ?? 0;
                      const total = (playerSegments.experience_level?.newcomers?.count ?? 0) +
                                   (playerSegments.experience_level?.casual?.count ?? 0) +
                                   (playerSegments.experience_level?.experienced?.count ?? 0) +
                                   (playerSegments.experience_level?.veterans?.count ?? 0);
                      const share = total > 0 ? Math.round((count / total) * 100) : 0;
                      const isSelected = selectedSegment?.type === 'experience' && selectedSegment?.key === row.key;
                      return (
                        <button
                          key={row.label}
                          type="button"
                          onClick={() => setSelectedSegment(isSelected ? null : { type: 'experience', key: row.key, label: row.label, description: row.subLabel })}
                          className={clsx(
                            "w-full flex items-center justify-between py-1 px-1 -mx-1 rounded transition-colors",
                            isSelected ? "bg-indigo-500/20" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs text-slate-300">{row.label}</span>
                            <span className="text-[10px] text-slate-500">{row.subLabel}</span>
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: getRecommendationColor(rec) }}
                          >
                            {formatPercent(rec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Purchase Type */}
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Purchase</h5>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wide">Rec%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">How they got the game</p>
                  <div className="space-y-2">
                    {[
                      { label: "Steam", key: "steam_buyers", desc: "Steam purchase", data: playerSegments.purchase_type?.steam_buyers },
                      { label: "Key", key: "key_users", desc: "Activated key", data: playerSegments.purchase_type?.key_users },
                      { label: "Free", key: "free_users", desc: "Received free", data: playerSegments.purchase_type?.free_users },
                    ].map((row) => {
                      const count = row.data?.count ?? 0;
                      const rec = row.data?.recommendation_rate ?? 0;
                      const total = (playerSegments.purchase_type?.steam_buyers?.count ?? 0) +
                                   (playerSegments.purchase_type?.key_users?.count ?? 0) +
                                   (playerSegments.purchase_type?.free_users?.count ?? 0);
                      const share = total > 0 ? Math.round((count / total) * 100) : 0;
                      const isSelected = selectedSegment?.type === 'purchase' && selectedSegment?.key === row.key;
                      return (
                        <button
                          key={row.label}
                          type="button"
                          onClick={() => setSelectedSegment(isSelected ? null : { type: 'purchase', key: row.key, label: row.label, description: row.desc })}
                          className={clsx(
                            "w-full flex items-center justify-between py-1 px-1 -mx-1 rounded transition-colors",
                            isSelected ? "bg-sky-500/20" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-sky-500/70 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs text-slate-300">{row.label}</span>
                            <span className="text-[10px] text-slate-500">{share}%</span>
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: getRecommendationColor(rec) }}
                          >
                            {formatPercent(rec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Activity Status - Based on recent play activity */}
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Activity</h5>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wide">Rec%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Played in last 2 weeks</p>
                  <div className="space-y-2">
                    {[
                      { label: "Active", subLabel: "recent", key: "currently_active", desc: "Played recently", data: playerSegments.activity_status?.currently_active, color: "bg-emerald-500/70", selectedColor: "bg-emerald-500/20" },
                      { label: "Stopped", subLabel: "not recent", key: "recently_stopped", desc: "Stopped playing", data: playerSegments.activity_status?.recently_stopped, color: "bg-amber-500/70", selectedColor: "bg-amber-500/20" },
                      { label: "Inactive", subLabel: "never", key: "inactive", desc: "Never played", data: playerSegments.activity_status?.inactive, color: "bg-slate-500/70", selectedColor: "bg-slate-500/20" },
                    ].map((row) => {
                      const count = row.data?.count ?? 0;
                      const rec = row.data?.recommendation_rate ?? 0;
                      const total = (playerSegments.activity_status?.currently_active?.count ?? 0) +
                                   (playerSegments.activity_status?.recently_stopped?.count ?? 0) +
                                   (playerSegments.activity_status?.inactive?.count ?? 0);
                      const share = total > 0 ? Math.round((count / total) * 100) : 0;
                      const isSelected = selectedSegment?.type === 'activity' && selectedSegment?.key === row.key;
                      return (
                        <button
                          key={row.label}
                          type="button"
                          onClick={() => setSelectedSegment(isSelected ? null : { type: 'activity', key: row.key, label: row.label, description: row.desc })}
                          className={clsx(
                            "w-full flex items-center justify-between py-1 px-1 -mx-1 rounded transition-colors",
                            isSelected ? row.selectedColor : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${row.color}`} style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs text-slate-300">{row.label}</span>
                            <span className="text-[10px] text-slate-500">{share}%</span>
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: getRecommendationColor(rec) }}
                          >
                            {formatPercent(rec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Engagement - Based on playtime for this game */}
                <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Engagement</h5>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wide">Rec%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Playtime in this game</p>
                  <div className="space-y-2">
                    {[
                      { label: "High", subLabel: "20h+", key: "highly_engaged", desc: "20+ hours played", data: playerSegments.engagement_topics?.highly_engaged },
                      { label: "Medium", subLabel: "2-20h", key: "moderately_engaged", desc: "2-20 hours played", data: playerSegments.engagement_topics?.moderately_engaged },
                      { label: "Low", subLabel: "<2h", key: "low_engagement", desc: "Under 2 hours played", data: playerSegments.engagement_topics?.low_engagement },
                    ].map((row) => {
                      const count = row.data?.count ?? 0;
                      const rec = row.data?.recommendation_rate ?? 0;
                      const total = (playerSegments.engagement_topics?.highly_engaged?.count ?? 0) +
                                   (playerSegments.engagement_topics?.moderately_engaged?.count ?? 0) +
                                   (playerSegments.engagement_topics?.low_engagement?.count ?? 0);
                      const share = total > 0 ? Math.round((count / total) * 100) : 0;
                      const isSelected = selectedSegment?.type === 'engagement' && selectedSegment?.key === row.key;
                      return (
                        <button
                          key={row.label}
                          type="button"
                          onClick={() => setSelectedSegment(isSelected ? null : { type: 'engagement', key: row.key, label: row.label, description: row.desc })}
                          className={clsx(
                            "w-full flex items-center justify-between py-1 px-1 -mx-1 rounded transition-colors",
                            isSelected ? "bg-teal-500/20" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500/70 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs text-slate-300">{row.label}</span>
                            <span className="text-[10px] text-slate-500">{row.subLabel}</span>
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: getRecommendationColor(rec) }}
                          >
                            {formatPercent(rec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {selectedSubcategory ? (
        <Portal>
          <div
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md overflow-y-auto animate-modal-overlay"
            onClick={clearSelectedSubcategory}
            style={{ WebkitBackdropFilter: 'blur(12px)' }}
          >
            <div className="min-h-screen flex items-center justify-center p-4">
              <div
                className="w-full max-w-4xl rounded-2xl border border-white/20 bg-slate-900 p-6 shadow-2xl my-8 animate-modal-content"
                onClick={(event) => event.stopPropagation()}
              >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedSubcategoryLabel}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedMainLabel} · {selectedReviews.length.toLocaleString()} reviews
                  {selectedSubcategoryLanguageLabel ? ` · ${selectedSubcategoryLanguageLabel} only` : ""}
                  {filtersActive ? " · filters applied" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={handleSummarize}
                  disabled={summaryLoading || selectedReviews.length === 0}
                >
                  {summaryLoading ? "Summarizing..." : subcategorySummary ? "Refresh Summary" : "Summarize"}
                </Button>
                <Button variant="secondary" onClick={clearSelectedSubcategory}>
                  Close
                </Button>
              </div>
            </div>

            {/* Summary Section */}
            {summaryError && (
              <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
                <p className="text-sm text-rose-400">{summaryError}</p>
              </div>
            )}

            {subcategorySummary && (
              <div className="mt-4 space-y-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-sky-400 mb-2">Summary</h4>
                  <p className="text-sm text-slate-200 leading-relaxed">{subcategorySummary.summary}</p>
                </div>

                <div className={selectedSubcategoryType === 'general' ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
                  {subcategorySummary.pros.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {selectedSubcategoryType === 'request' ? 'Feature Requests' : 'Pros'}
                      </h4>
                      <ul className="space-y-1.5">
                        {subcategorySummary.pros.map((pro, idx) => (
                          <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                            <span className="text-emerald-400 mt-1">
                              {selectedSubcategoryType === 'request' ? '→' : '+'}
                            </span>
                            <span>{pro}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {subcategorySummary.cons.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        {selectedSubcategoryType === 'issue' ? 'Issues' : 'Cons'}
                      </h4>
                      <ul className="space-y-1.5">
                        {subcategorySummary.cons.map((con, idx) => (
                          <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                            <span className="text-rose-400 mt-1">
                              {selectedSubcategoryType === 'issue' ? '!' : '−'}
                            </span>
                            <span>{con}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-500 pt-2 border-t border-white/10">
                  Based on {Math.min(selectedReviews.length, 50)} reviews
                </p>
              </div>
            )}
            {selectedReviews.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No reviews found for this subcategory.</p>
            ) : (
              <div className="mt-4 max-h-[32rem] space-y-3 overflow-auto pr-2">
                {selectedReviews.map((review, idx) => {
                  const reviewKey = String(review.review_id ?? idx);
                  const text = review.review ?? "";
                  const evidence = selectedSubcategory
                    ? (review.llm_subcategory_evidence?.[selectedSubcategory] ?? [])
                    : [];
                  const createdAt = review.created_at ? new Date(review.created_at) : null;
                  const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
                    ? createdAt.toLocaleDateString()
                    : "Date unknown";
                  const shouldClamp = text.length > 240 || text.split("\n").length > 3;
                  const isExpanded = expandedReviews.has(reviewKey);
                  // Translation check
                  const reviewLangCode = STEAM_TO_APP_LANGUAGE[review.language?.toLowerCase() || ''] || review.language?.toLowerCase();
                  const needsTranslation = reviewLangCode !== userLanguage && review.language;
                  const translationState = translations.get(reviewKey);
                  const isTranslating = translationState?.loading ?? false;
                  const translatedText = translationState?.text ?? null;
                  const showTranslation = translationState?.show ?? false;

                  const handleTranslate = async () => {
                    if (translatedText) {
                      // Toggle visibility if already translated
                      setTranslations((prev) => {
                        const next = new Map(prev);
                        const current = next.get(reviewKey);
                        if (current) {
                          next.set(reviewKey, { ...current, show: !current.show });
                        }
                        return next;
                      });
                      return;
                    }
                    // Start translation
                    setTranslations((prev) => {
                      const next = new Map(prev);
                      next.set(reviewKey, { text: null, loading: true, show: false });
                      return next;
                    });
                    try {
                      const result = await translateText({
                        text,
                        target_language: userLanguage,
                      });
                      setTranslations((prev) => {
                        const next = new Map(prev);
                        next.set(reviewKey, { text: result.translated_text, loading: false, show: true });
                        return next;
                      });
                      // Refresh credits after translation
                      refreshCredits();
                    } catch (error) {
                      console.error('Translation failed:', error);
                      setTranslations((prev) => {
                        const next = new Map(prev);
                        next.set(reviewKey, { text: null, loading: false, show: false });
                        return next;
                      });
                    }
                  };

                  return (
                    <div
                      key={reviewKey}
                      className="rounded-xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <span>Review ID {review.review_id ?? "—"}</span>
                        <div className="flex flex-wrap items-center gap-3">
                          <span>{createdLabel}</span>
                          <span>{review.votes_up ?? 0} helpful</span>
                          {evidence.length > 0 && (
                            <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-yellow-300">
                              {evidence.length} evidence
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Translation controls */}
                      {needsTranslation && (
                        <div className="mt-2 flex items-center justify-between border-b border-white/10 pb-2">
                          <span className="text-[10px] text-slate-500">
                            Original: {review.language}
                          </span>
                          <button
                            type="button"
                            onClick={handleTranslate}
                            disabled={isTranslating}
                            className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
                          >
                            {isTranslating ? (
                              <>
                                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Translating...
                              </>
                            ) : translatedText ? (
                              <>
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                </svg>
                                {showTranslation ? 'Original' : 'Translated'}
                              </>
                            ) : (
                              <>
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                </svg>
                                Translate
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {/* Translated text */}
                      {showTranslation && translatedText && (
                        <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">
                          <p className="whitespace-pre-line text-sm text-slate-200">
                            {translatedText}
                          </p>
                        </div>
                      )}
                      <p
                        className="mt-2 whitespace-pre-line text-sm text-slate-100"
                        style={
                          !isExpanded && shouldClamp
                            ? {
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }
                            : undefined
                        }
                      >
                        {highlightEvidence(text, evidence)}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span
                          className={`rounded-full px-2 py-1 ${
                            isRecommended(review.voted_up) ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {isRecommended(review.voted_up) ? "Recommended" : "Not recommended"}
                        </span>
                        {shouldClamp ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReviews((prev) => {
                                const next = new Set(prev);
                                if (next.has(reviewKey)) {
                                  next.delete(reviewKey);
                                } else {
                                  next.add(reviewKey);
                                }
                                return next;
                              })
                            }
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white/80 hover:border-white/20 hover:bg-white/10"
                            aria-label={isExpanded ? "Read less" : "Read more"}
                          >
                            {isExpanded ? "Read less" : "Read more"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {selectedTrendWeek ? (
        <Portal>
          <div
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-md overflow-y-auto animate-modal-overlay"
            onClick={() => setSelectedTrendWeek(null)}
            style={{ WebkitBackdropFilter: 'blur(12px)' }}
          >
            <div className="min-h-screen flex items-center justify-center p-4">
              <div
                className="w-full max-w-4xl rounded-2xl border border-white/20 bg-slate-900 p-6 shadow-2xl my-8 animate-modal-content"
                onClick={(event) => event.stopPropagation()}
              >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Week of {formatTrendLabel(selectedTrendWeek.start)}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {selectedTrendWeek.label} - {selectedWeekReviews.length.toLocaleString()} reviews
                    {filtersActive ? " - filters applied" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setSelectedTrendWeek(null)}>
                    Close
                  </Button>
                </div>
              </div>

              {selectedWeekReviews.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No reviews found for this week.</p>
              ) : (
                <div className="mt-4 max-h-[32rem] space-y-3 overflow-auto pr-2">
                  {selectedWeekReviews.map((review, idx) => {
                    const reviewKey = String(review.review_id ?? idx);
                    const text = review.review ?? "";
                    const createdAt = review.created_at ? new Date(review.created_at) : null;
                    const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
                      ? createdAt.toLocaleDateString()
                      : "Date unknown";
                    const shouldClamp = text.length > 240 || text.split("\n").length > 3;
                    const isExpanded = expandedReviews.has(reviewKey);
                    const reviewLangCode = STEAM_TO_APP_LANGUAGE[review.language?.toLowerCase() || ''] || review.language?.toLowerCase();
                    const needsTranslation = reviewLangCode !== userLanguage && review.language;
                    const translationState = translations.get(reviewKey);
                    const isTranslating = translationState?.loading ?? false;
                    const translatedText = translationState?.text ?? null;
                    const showTranslation = translationState?.show ?? false;

                    const handleTranslate = async () => {
                      if (translatedText) {
                        setTranslations((prev) => {
                          const next = new Map(prev);
                          const current = next.get(reviewKey);
                          if (current) {
                            next.set(reviewKey, { ...current, show: !current.show });
                          }
                          return next;
                        });
                        return;
                      }
                      setTranslations((prev) => {
                        const next = new Map(prev);
                        next.set(reviewKey, { text: null, loading: true, show: false });
                        return next;
                      });
                      try {
                        const result = await translateText({
                          text,
                          target_language: userLanguage,
                        });
                        setTranslations((prev) => {
                          const next = new Map(prev);
                          next.set(reviewKey, { text: result.translated_text, loading: false, show: true });
                          return next;
                        });
                        refreshCredits();
                      } catch (error) {
                        console.error("Translation error:", error);
                        setTranslations((prev) => {
                          const next = new Map(prev);
                          next.delete(reviewKey);
                          return next;
                        });
                      }
                    };

                    return (
                      <div
                        key={reviewKey}
                        className="rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-slate-500">{createdLabel}</p>
                            <p className="mt-1 text-sm text-slate-200">{review.language}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {needsTranslation && (
                              <button
                                type="button"
                                onClick={handleTranslate}
                                disabled={isTranslating}
                                className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
                              >
                                {isTranslating ? (
                                  <>
                                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Translating...
                                  </>
                                ) : translatedText ? (
                                  <>
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                    </svg>
                                    {showTranslation ? 'Original' : 'Translated'}
                                  </>
                                ) : (
                                  <>
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                    </svg>
                                    Translate
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {showTranslation && translatedText && (
                          <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">
                            <p className="whitespace-pre-line text-sm text-slate-200">
                              {translatedText}
                            </p>
                          </div>
                        )}

                        <p
                          className="mt-2 whitespace-pre-line text-sm text-slate-100"
                          style={
                            !isExpanded && shouldClamp
                              ? {
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }
                              : undefined
                          }
                        >
                          {text}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                          <span
                            className={`rounded-full px-2 py-1 ${
                              isRecommended(review.voted_up) ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {isRecommended(review.voted_up) ? "Recommended" : "Not recommended"}
                          </span>
                          {shouldClamp ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedReviews((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(reviewKey)) {
                                    next.delete(reviewKey);
                                  } else {
                                    next.add(reviewKey);
                                  }
                                  return next;
                                })
                              }
                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white/80 hover:border-white/20 hover:bg-white/10"
                              aria-label={isExpanded ? "Read less" : "Read more"}
                            >
                              {isExpanded ? "Read less" : "Read more"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {selectedSegment ? (
        <Portal>
          <div
            className="fixed inset-0 z-[9997] bg-black/60 backdrop-blur-md overflow-y-auto animate-modal-overlay"
            onClick={() => setSelectedSegment(null)}
            style={{ WebkitBackdropFilter: 'blur(12px)' }}
          >
            <div className="min-h-screen flex items-center justify-center p-4">
              <div
                className="w-full max-w-4xl rounded-2xl border border-white/20 bg-slate-900 p-6 shadow-2xl my-8 animate-modal-content"
                onClick={(event) => event.stopPropagation()}
              >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {selectedSegment.label} {selectedSegment.type === 'experience' ? 'Players' : selectedSegment.type === 'purchase' ? 'Users' : selectedSegment.type === 'activity' ? 'Players' : 'Players'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {selectedSegment.description} - {selectedSegmentReviews.length.toLocaleString()} reviews
                    {filtersActive ? " - filters applied" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setSelectedSegment(null)}>
                    Close
                  </Button>
                </div>
              </div>

              {selectedSegmentReviews.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No reviews found for this segment.</p>
              ) : (
                <div className="mt-4 max-h-[32rem] space-y-3 overflow-auto pr-2">
                  {selectedSegmentReviews.map((review, idx) => {
                    const reviewKey = `seg-${String(review.review_id ?? idx)}`;
                    const text = review.review ?? "";
                    const createdAt = review.created_at ? new Date(review.created_at) : null;
                    const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
                      ? createdAt.toLocaleDateString()
                      : "Date unknown";
                    const shouldClamp = text.length > 240 || text.split("\n").length > 3;
                    const isExpanded = expandedReviews.has(reviewKey);
                    const reviewLangCode = STEAM_TO_APP_LANGUAGE[review.language?.toLowerCase() || ''] || review.language?.toLowerCase();
                    const needsTranslation = reviewLangCode !== userLanguage && review.language;
                    const translationState = translations.get(reviewKey);
                    const isTranslating = translationState?.loading ?? false;
                    const translatedText = translationState?.text ?? null;
                    const showTranslation = translationState?.show ?? false;

                    const handleTranslate = async () => {
                      if (translatedText) {
                        setTranslations((prev) => {
                          const next = new Map(prev);
                          const current = next.get(reviewKey);
                          if (current) {
                            next.set(reviewKey, { ...current, show: !current.show });
                          }
                          return next;
                        });
                        return;
                      }
                      setTranslations((prev) => {
                        const next = new Map(prev);
                        next.set(reviewKey, { text: null, loading: true, show: false });
                        return next;
                      });
                      try {
                        const result = await translateText({
                          text,
                          target_language: userLanguage,
                        });
                        setTranslations((prev) => {
                          const next = new Map(prev);
                          next.set(reviewKey, { text: result.translated_text, loading: false, show: true });
                          return next;
                        });
                        refreshCredits();
                      } catch (error) {
                        console.error('Translation failed:', error);
                        setTranslations((prev) => {
                          const next = new Map(prev);
                          next.set(reviewKey, { text: null, loading: false, show: false });
                          return next;
                        });
                      }
                    };

                    return (
                      <div
                        key={reviewKey}
                        className="rounded-xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <span>Review ID {review.review_id ?? "—"}</span>
                          <div className="flex flex-wrap items-center gap-3">
                            <span>{createdLabel}</span>
                            <span>{review.votes_up ?? 0} helpful</span>
                          </div>
                        </div>
                        {needsTranslation && (
                          <div className="mt-2 flex items-center justify-between border-b border-white/10 pb-2">
                            <span className="text-[10px] text-slate-500">
                              Original: {review.language}
                            </span>
                            <button
                              type="button"
                              onClick={handleTranslate}
                              disabled={isTranslating}
                              className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
                            >
                              {isTranslating ? (
                                <>
                                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Translating...
                                </>
                              ) : translatedText ? (
                                <>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                  </svg>
                                  {showTranslation ? 'Original' : 'Translated'}
                                </>
                              ) : (
                                <>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                  </svg>
                                  Translate
                                </>
                              )}
                            </button>
                          </div>
                        )}
                        {showTranslation && translatedText && (
                          <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">
                            <p className="whitespace-pre-line text-sm text-slate-200">
                              {translatedText}
                            </p>
                          </div>
                        )}
                        <p
                          className="mt-2 whitespace-pre-line text-sm text-slate-100"
                          style={
                            !isExpanded && shouldClamp
                              ? {
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }
                              : undefined
                          }
                        >
                          {text}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                          <span
                            className={`rounded-full px-2 py-1 ${
                              isRecommended(review.voted_up) ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {isRecommended(review.voted_up) ? "Recommended" : "Not recommended"}
                          </span>
                          {shouldClamp ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedReviews((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(reviewKey)) {
                                    next.delete(reviewKey);
                                  } else {
                                    next.add(reviewKey);
                                  }
                                  return next;
                                })
                              }
                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white/80 hover:border-white/20 hover:bg-white/10"
                              aria-label={isExpanded ? "Read less" : "Read more"}
                            >
                              {isExpanded ? "Read less" : "Read more"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}

function listifyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function buildPlayerSegments(reviews: ReviewRow[]): PlayerSegments {
  const emptySegments: PlayerSegments = {
    experience_level: {
      newcomers: { count: 0, recommendation_rate: 0 },
      casual: { count: 0, recommendation_rate: 0 },
      experienced: { count: 0, recommendation_rate: 0 },
      veterans: { count: 0, recommendation_rate: 0 },
    },
    purchase_type: {
      steam_buyers: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
      key_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
      free_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
    },
    engagement_topics: {
      highly_engaged: { count: 0, recommendation_rate: 0 },
      moderately_engaged: { count: 0, recommendation_rate: 0 },
      low_engagement: { count: 0, recommendation_rate: 0 },
    },
    activity_status: {
      currently_active: { count: 0, recommendation_rate: 0, issue_count: 0 },
      recently_stopped: { count: 0, recommendation_rate: 0, issue_count: 0 },
      inactive: { count: 0, recommendation_rate: 0, issue_count: 0 },
    },
  };

  if (!reviews.length) return emptySegments;

  const hasIssueField = reviews.some((review) => review.llm_issue_subcategories !== undefined);
  const hasRequestField = reviews.some((review) => review.llm_request_subcategories !== undefined);

  const countRecommendationRate = (segment: ReviewRow[]) => {
    if (!segment.length) return 0;
    const recommended = segment.reduce((sum, review) => sum + (isRecommended(review.voted_up) ? 1 : 0), 0);
    return recommended / segment.length;
  };

  const countIssueReviews = (segment: ReviewRow[]) => {
    if (!hasIssueField) return 0;
    return segment.reduce((sum, review) => sum + (listifyStrings(review.llm_issue_subcategories).length > 0 ? 1 : 0), 0);
  };

  const topIssueCategories = (segment: ReviewRow[]) => {
    if (!segment.length) return [];
    const counts = new Map<string, number>();
    segment.forEach((review) => {
      const items = hasIssueField ? review.llm_issue_subcategories : review.llm_subcategories;
      listifyStrings(items).forEach((item) => {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
  };

  const featureRequestRate = (segment: ReviewRow[]) => {
    if (!segment.length || !hasRequestField) return 0;
    const withRequest = segment.reduce(
      (sum, review) => sum + (listifyStrings(review.llm_request_subcategories).length > 0 ? 1 : 0),
      0,
    );
    return withRequest / segment.length;
  };

  const minutesFor = (review: ReviewRow) => {
    const value = review.author_playtime_forever;
    if (typeof value === "number") return value;
    if (typeof value === "string") return parseFloat(value) || 0;
    return 0;
  };
  const recentMinutesFor = (review: ReviewRow) => Number(review.author_playtime_last_two_weeks ?? 0);
  const gamesOwnedFor = (review: ReviewRow) => Number(review.author_num_games_owned ?? 0);

  // Experience level based on Steam library size
  const newcomers = reviews.filter((review) => gamesOwnedFor(review) < 10);
  const casual = reviews.filter((review) => gamesOwnedFor(review) >= 10 && gamesOwnedFor(review) < 50);
  const experienced = reviews.filter((review) => gamesOwnedFor(review) >= 50 && gamesOwnedFor(review) < 150);
  const veterans = reviews.filter((review) => gamesOwnedFor(review) >= 150);

  const experience_level = {
    newcomers: {
      count: newcomers.length,
      recommendation_rate: countRecommendationRate(newcomers),
    },
    casual: {
      count: casual.length,
      recommendation_rate: countRecommendationRate(casual),
    },
    experienced: {
      count: experienced.length,
      recommendation_rate: countRecommendationRate(experienced),
    },
    veterans: {
      count: veterans.length,
      recommendation_rate: countRecommendationRate(veterans),
    },
  };

  const steam_buyers = reviews.filter((review) => review.steam_purchase === true);
  const key_users = reviews.filter(
    (review) => review.steam_purchase === false && review.received_for_free === false,
  );
  const free_users = reviews.filter((review) => review.received_for_free === true);

  const purchase_type = {
    steam_buyers: {
      count: steam_buyers.length,
      feature_request_rate: featureRequestRate(steam_buyers),
      recommendation_rate: countRecommendationRate(steam_buyers),
    },
    key_users: {
      count: key_users.length,
      feature_request_rate: featureRequestRate(key_users),
      recommendation_rate: countRecommendationRate(key_users),
    },
    free_users: {
      count: free_users.length,
      feature_request_rate: featureRequestRate(free_users),
      recommendation_rate: countRecommendationRate(free_users),
    },
  };

  const mainCategoryForReview = (review: ReviewRow) => {
    if (typeof review.llm_main_category === "string" && review.llm_main_category.trim()) {
      return review.llm_main_category.trim().toLowerCase();
    }
    const subcats = listifyStrings(review.llm_subcategories);
    if (!subcats.length) return null;
    const main = subcats[0].includes("/") ? subcats[0].split("/", 1)[0] : subcats[0];
    return main ? main.toLowerCase() : null;
  };

  const topTopics = (segment: ReviewRow[]) => {
    if (!segment.length) return [];
    const counts = new Map<string, number>();
    segment.forEach((review) => {
      const main = mainCategoryForReview(review);
      if (!main) return;
      counts.set(main, (counts.get(main) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));
  };

  const highly_engaged = reviews.filter((review) => minutesFor(review) >= 6000);
  const moderately_engaged = reviews.filter((review) => minutesFor(review) >= 600 && minutesFor(review) < 6000);
  const low_engagement = reviews.filter((review) => minutesFor(review) < 600);

  const engagement_topics = {
    highly_engaged: {
      count: highly_engaged.length,
      recommendation_rate: countRecommendationRate(highly_engaged),
    },
    moderately_engaged: {
      count: moderately_engaged.length,
      recommendation_rate: countRecommendationRate(moderately_engaged),
    },
    low_engagement: {
      count: low_engagement.length,
      recommendation_rate: countRecommendationRate(low_engagement),
    },
  };

  const currently_active = reviews.filter((review) => recentMinutesFor(review) > 0);
  const recently_stopped = reviews.filter(
    (review) => recentMinutesFor(review) === 0 && minutesFor(review) > 0,
  );
  const inactive = reviews.filter((review) => minutesFor(review) === 0);

  const activity_status = {
    currently_active: {
      count: currently_active.length,
      recommendation_rate: countRecommendationRate(currently_active),
      issue_count: countIssueReviews(currently_active),
    },
    recently_stopped: {
      count: recently_stopped.length,
      recommendation_rate: countRecommendationRate(recently_stopped),
      issue_count: countIssueReviews(recently_stopped),
    },
    inactive: {
      count: inactive.length,
      recommendation_rate: countRecommendationRate(inactive),
      issue_count: countIssueReviews(inactive),
    },
  };

  // Platform segmentation (Steam Deck vs Desktop)
  const steamDeckReviews = reviews.filter((review) => review.primarily_steam_deck === true);
  const desktopReviews = reviews.filter((review) => review.primarily_steam_deck !== true);

  const platform: PlatformSegmentInsights = {
    steam_deck: {
      count: steamDeckReviews.length,
      recommendation_rate: countRecommendationRate(steamDeckReviews),
      top_issues: topIssueCategories(steamDeckReviews),
      issue_count: countIssueReviews(steamDeckReviews),
    },
    desktop: {
      count: desktopReviews.length,
      recommendation_rate: countRecommendationRate(desktopReviews),
      top_issues: topIssueCategories(desktopReviews),
      issue_count: countIssueReviews(desktopReviews),
    },
  };

  // Language segmentation
  const languageMap = new Map<string, ReviewRow[]>();
  reviews.forEach((review) => {
    const lang = review.language;
    if (lang) {
      const existing = languageMap.get(lang) || [];
      existing.push(review);
      languageMap.set(lang, existing);
    }
  });

  const languageStats = Array.from(languageMap.entries())
    .map(([lang, langReviews]) => ({
      language: lang,
      count: langReviews.length,
      recommendation_rate: countRecommendationRate(langReviews),
      top_issues: topIssueCategories(langReviews),
      issue_count: countIssueReviews(langReviews),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const language: LanguageSegmentInsights = {
    languages: languageStats,
    total_languages: languageMap.size,
  };

  return { experience_level, purchase_type, engagement_topics, activity_status, platform, language };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatPercentOrDash(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  if (!Number.isFinite(value)) return "—";
  return formatPercent(value);
}

function formatMainCategoryLabel(value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  return MAIN_CATEGORY_LABELS[normalized] ?? toTitleCase(trimmed);
}

function toSubcategoryLabel(value: string, subCategory?: string): string {
  const raw = (subCategory || value || "").trim();
  if (!raw) return "";
  const sub = raw.includes("/") ? raw.split("/", 2)[1] : raw;
  return titleize(sub);
}

function toTitleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed.toLowerCase();
  const direct = MAIN_CATEGORY_LABELS[normalized];
  if (direct) return direct;

  if (trimmed.includes("/")) {
    const [mainRaw, subRaw] = trimmed.split("/", 2);
    const main = MAIN_CATEGORY_LABELS[mainRaw.toLowerCase()] ?? titleize(mainRaw);
    const sub = titleize(subRaw);
    return `${main} / ${sub}`;
  }

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
