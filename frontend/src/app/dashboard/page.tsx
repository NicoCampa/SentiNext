'use client';

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { searchGames, fetchStarredGames } from "@/lib/api";
import type {
  AnalyzeResponse,
  CategoryRecommendationRate,
  PlayerSegments,
  ProgressStatus,
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
import { useAnalysis } from "@/contexts/AnalysisContext";
import { getRecommendationColor } from "@/utils/colors";

const REVIEW_COUNT = 100;

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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameParam = searchParams.get("game");
  const { startAnalysis, getTask } = useAnalysis();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<SearchResult | null>(null);

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStarred, setLoadingStarred] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  const currentTask = selectedGame ? getTask(selectedGame.appid) : undefined;
  const isAnalyzing = currentTask?.status === "analyzing";
  const progress = currentTask?.progress ?? null;

  useEffect(() => {
    if (!gameParam) return;
    const appId = parseInt(gameParam, 10);
    if (Number.isNaN(appId)) return;

    async function loadStarredGame() {
      setLoadingStarred(true);
      try {
        const starred = await fetchStarredGames();
        const game = starred.find((entry) => entry.app_id === appId);
          if (game && game.insights) {
            setSelectedGame({
              appid: game.app_id,
              name: game.name,
              price: null,
              url: `https://store.steampowered.com/app/${game.app_id}`,
              image_url: game.metadata.header_image ?? null,
            });
            setAnalysis({ metadata: game.metadata, insights: game.insights, reviews: game.sample ?? [] });
            setForceRefresh(false);
          }
      } catch (err) {
        console.error("Failed to load starred game", err);
        setError("Failed to load saved analysis");
      } finally {
        setLoadingStarred(false);
      }
    }

    loadStarredGame();
  }, [gameParam]);

  useEffect(() => {
    if (currentTask?.status === "completed" && currentTask.result) {
      setAnalysis(currentTask.result);
    }
  }, [currentTask]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const results = await searchGames(searchQuery);
      setSearchResults(results);
      if (!results.length) {
        setError("No games found. Try a different search term.");
      }
    } catch (err) {
      setError((err as Error).message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function handleSelectGame(game: SearchResult) {
    setSelectedGame(game);
    setSearchResults([]);
    setAnalysis(null);
    setError(null);
    setForceRefresh(false);
  }

  async function handleAnalyze() {
    if (!selectedGame) return;
    setError(null);
    try {
      await startAnalysis(selectedGame, {
        refresh: forceRefresh,
      });
    } catch (err) {
      setError((err as Error).message || "Failed to start analysis");
    }
  }

  function handleReset() {
    setSelectedGame(null);
    setAnalysis(null);
    setSearchQuery("");
    setSearchResults([]);
    setError(null);
    setForceRefresh(false);
  }

  if (loadingStarred) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-6">
          <Card variant="glass" className="p-5">
            <div className="flex items-center justify-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-sky-500" />
              <p className="text-lg text-slate-300">Loading analysis...</p>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Game Analysis</h1>
            <p className="text-xs text-slate-400">Category insights, top issues/requests, and user segmentation</p>
          </div>
          {selectedGame && (
            <Button onClick={handleReset} variant="secondary">
              ← New Search
            </Button>
          )}
        </div>

        {!selectedGame && (
          <Card variant="glass" className="p-5">
            <div className="space-y-4">
              <div className="flex gap-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                  placeholder="Search for a game (e.g., Baldur's Gate 3)"
                  className="flex-1 rounded-xl border border-white/20 bg-slate-900/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()} variant="primary" size="lg">
                  {searching ? "Searching..." : "Search"}
                </Button>
              </div>

              {error && searchResults.length === 0 && <p className="text-sm text-rose-400">{error}</p>}

              {searchResults.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-slate-400">{searchResults.length} games found</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {searchResults.map((game) => (
                      <button
                        key={game.appid}
                        onClick={() => handleSelectGame(game)}
                        className="flex gap-4 rounded-xl border border-white/10 bg-slate-900/30 p-4 text-left transition hover:border-sky-500/50 hover:bg-slate-900/50"
                      >
                        <SteamImage
                          appId={game.appid}
                          variant="capsule"
                          alt={game.name}
                          className="h-16 w-28 rounded-lg object-cover"
                          imageUrl={game.image_url}
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-white">{game.name}</h3>
                          {game.price && <p className="mt-1 text-sm text-slate-400">{game.price}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {selectedGame && !analysis && (
          <Card variant="glass" className="p-6">
            <div className="flex flex-col gap-6 md:flex-row">
              <SteamImage
                appId={selectedGame.appid}
                variant="header"
                alt={selectedGame.name}
                className="h-32 w-full max-w-xs rounded-xl object-cover"
                imageUrl={selectedGame.image_url}
              />
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedGame.name}</h2>
                  {selectedGame.price && <p className="text-sm text-slate-400">{selectedGame.price}</p>}
                  <p className="mt-3 text-sm text-slate-400">
                    Run an analysis to classify up to {REVIEW_COUNT.toLocaleString()} recent Steam reviews.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border border-white/30 bg-slate-900 text-sky-500 focus:ring-sky-500"
                    checked={forceRefresh}
                    onChange={(event) => setForceRefresh(event.target.checked)}
                  />
                  Refresh from Steam (fetch new reviews)
                </label>
                <Button onClick={handleAnalyze} disabled={isAnalyzing} variant="primary" size="lg" className="w-full md:w-auto">
                  {isAnalyzing ? "Analyzing..." : `Analyze ${REVIEW_COUNT} Reviews`}
                </Button>
                {isAnalyzing && progress ? <ProgressPill progress={progress} /> : null}
              </div>
            </div>
          </Card>
        )}

        {selectedGame && !analysis && !isAnalyzing && (
          <EmptyState
            title="No analysis yet"
            description="Kick off an analysis to surface recommendation rates by category and subcategory."
          />
        )}

        {analysis && analysis.insights && (
          <AnalysisResults
            analysis={analysis}
            selectedGame={selectedGame}
            onReanalyze={handleAnalyze}
            forceRefresh={forceRefresh}
            onToggleRefresh={setForceRefresh}
            isAnalyzing={isAnalyzing}
            progress={progress}
          />
        )}
      </div>
    </AppLayout>
  );
}

function ProgressPill({ progress }: { progress: ProgressStatus }) {
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Processing reviews with AI...</span>
        <span>
          {progress.processed} / {progress.total} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AnalysisResults({
  analysis,
  selectedGame,
  onReanalyze,
  forceRefresh,
  onToggleRefresh,
  isAnalyzing,
  progress,
}: {
  analysis: AnalyzeResponse;
  selectedGame: SearchResult | null;
  onReanalyze: () => void;
  forceRefresh: boolean;
  onToggleRefresh: (value: boolean) => void;
  isAnalyzing: boolean;
  progress: ProgressStatus | null;
}) {
  const router = useRouter();
  const insights = analysis.insights ?? null;
  const theme = (insights?.theme as ThemeDefinition | undefined) ?? DEFAULT_THEME;
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(() => new Set());
  const [reviewSentimentFilter, setReviewSentimentFilter] = useState<"all" | "positive" | "negative">("all");
  const [reviewHelpfulFilter, setReviewHelpfulFilter] = useState<0 | 10 | 25 | 50>(0);
  const [reviewDateFilter, setReviewDateFilter] = useState<"all" | "30d" | "90d" | "365d">("all");
  const [reviewQuery, setReviewQuery] = useState("");
  const resetFilters = () => {
    setReviewSentimentFilter("all");
    setReviewHelpfulFilter(0);
    setReviewDateFilter("all");
    setReviewQuery("");
  };

  const categoryRates = insights?.category_recommendation_rates;
  const subcategoryInsights = insights?.subcategory_insights;

  const reviewSample = analysis.reviews ?? [];
  const filtersActive =
    reviewSentimentFilter !== "all" ||
    reviewHelpfulFilter > 0 ||
    reviewDateFilter !== "all" ||
    reviewQuery.trim().length > 0;

  const filteredReviewSample = useMemo(() => {
    if (!reviewSample.length) return [];
    const now = new Date();
    const query = reviewQuery.trim().toLowerCase();
    return reviewSample.filter((review) => {
      if (reviewSentimentFilter !== "all") {
        const isPositive = Boolean(review.voted_up);
        if (reviewSentimentFilter === "positive" && !isPositive) return false;
        if (reviewSentimentFilter === "negative" && isPositive) return false;
      }

      if (reviewHelpfulFilter > 0) {
        const helpful = Number(review.votes_up ?? 0);
        if (helpful < reviewHelpfulFilter) return false;
      }

      if (reviewDateFilter !== "all") {
        const raw = review.created_at;
        if (!raw) return false;
        const created = new Date(raw);
        if (Number.isNaN(created.getTime())) return false;
        const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        const maxDays = reviewDateFilter === "30d" ? 30 : reviewDateFilter === "90d" ? 90 : 365;
        if (diffDays > maxDays) return false;
      }

      if (query) {
        const text = (review.review ?? "").toLowerCase();
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [reviewDateFilter, reviewHelpfulFilter, reviewQuery, reviewSentimentFilter, reviewSample]);

  const activeSubcategoryInsights = useMemo(() => {
    if (!filtersActive) return subcategoryInsights ?? [];
    return buildSubcategoryInsights(filteredReviewSample);
  }, [filteredReviewSample, filtersActive, subcategoryInsights]);

  const activeCategoryRates = useMemo(() => {
    if (!filtersActive) return categoryRates ?? {};
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
    if (!filtersActive) return insights?.player_segments;
    return buildPlayerSegments(filteredReviewSample);
  }, [filteredReviewSample, filtersActive, insights?.player_segments]);

  const selectedReviews = useMemo(() => {
    if (!selectedSubcategory) return [];
    return filteredReviewSample
      .filter((review) => {
        const subcats = review.llm_subcategories ?? [];
        return Array.isArray(subcats) && subcats.includes(selectedSubcategory);
      })
      .sort((a, b) => Number(b.votes_up ?? 0) - Number(a.votes_up ?? 0));
  }, [filteredReviewSample, selectedSubcategory]);

  const selectedSubcategoryLabel = selectedSubcategory ? toSubcategoryLabel(selectedSubcategory) : "";
  const selectedMainLabel = selectedSubcategory
    ? MAIN_CATEGORY_LABELS[selectedSubcategory.split("/", 1)[0]?.toLowerCase() ?? ""] ?? toTitleCase(selectedSubcategory)
    : "";

  useEffect(() => {
    if (!selectedSubcategory) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedSubcategory(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [selectedSubcategory]);

  useEffect(() => {
    setExpandedReviews(new Set());
  }, [selectedSubcategory]);

  const toggleCategoryExpand = (key: string, expanded: boolean) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (expanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card variant="glass" className="p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-5">
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
              <h2 className="text-2xl font-semibold text-white">{selectedGame?.name ?? "Analysis"}</h2>
              <p className="text-sm text-slate-400">
                {new Date(analysis.metadata.fetched_at).toLocaleString()} · {analysis.metadata.retrieved.toLocaleString()} /{" "}
                {analysis.metadata.requested.toLocaleString()} reviews
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <label className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-white/30 bg-slate-900 text-sky-500 focus:ring-sky-500"
                checked={forceRefresh}
                onChange={(event) => onToggleRefresh(event.target.checked)}
              />
              Refresh
            </label>
            <Button onClick={onReanalyze} disabled={isAnalyzing} variant="primary">
              {isAnalyzing ? "Running..." : "Re-run analysis"}
            </Button>
            <Button
              onClick={() => {
                if (!selectedGame) return;
                router.push(`/home?game=${selectedGame.appid}`);
              }}
              variant="secondary"
            >
              View in Home
            </Button>
          </div>
        </div>
        {isAnalyzing && progress ? <div className="mt-5"><ProgressPill progress={progress} /></div> : null}
      </Card>

      <Card variant="glass" className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Filters</h3>
            <p className="mt-1 text-sm text-slate-400">Apply to categories, issues/requests, and review drilldowns</p>
          </div>
          {filtersActive ? (
            <Button variant="secondary" onClick={resetFilters}>
              Reset filters
            </Button>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4 text-xs text-slate-300">
          <label className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Sentiment</span>
            <select
              value={reviewSentimentFilter}
              onChange={(event) => setReviewSentimentFilter(event.target.value as "all" | "positive" | "negative")}
              className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="positive">Recommended</option>
              <option value="negative">Not recommended</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Helpful</span>
            <select
              value={reviewHelpfulFilter}
              onChange={(event) => setReviewHelpfulFilter(Number(event.target.value) as 0 | 10 | 25 | 50)}
              className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value={0}>All</option>
              <option value={10}>10+</option>
              <option value={25}>25+</option>
              <option value={50}>50+</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Date</span>
            <select
              value={reviewDateFilter}
              onChange={(event) => setReviewDateFilter(event.target.value as "all" | "30d" | "90d" | "365d")}
              className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="365d">Last year</option>
            </select>
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Search</span>
            <input
              value={reviewQuery}
              onChange={(event) => setReviewQuery(event.target.value)}
              placeholder="Search review text"
              className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <div className="flex flex-1 justify-end text-[11px] text-slate-500">
            <span>
              {filteredReviewSample.length.toLocaleString()} / {reviewSample.length.toLocaleString()} reviews
            </span>
          </div>
        </div>
      </Card>

      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Category recommendation</h3>
            <p className="mt-1 text-sm text-slate-400">Recommendation rate by main category and tagged subcategories</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {categories.map((category) => {
            const rateText = formatPercentOrDash(category.rate);
            const rateColor = getRecommendationColor(category.rate);
            const isExpanded = expandedCategories.has(category.key);
            const visibleSubcategories = isExpanded ? category.subcategories : category.subcategories.slice(0, 3);
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

                <div className="mt-4 space-y-2">
                  {category.subcategories.length === 0 ? (
                    <p className="text-sm text-slate-500">No tagged subcategories.</p>
                  ) : (
                    visibleSubcategories.map((sub) => (
                      <button
                        key={sub.subcategory}
                        type="button"
                        onClick={() =>
                          setSelectedSubcategory((prev) => (prev === sub.subcategory ? null : sub.subcategory))
                        }
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${
                          selectedSubcategory === sub.subcategory
                            ? "border-sky-400/50 bg-sky-500/10"
                            : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-200">
                            {toSubcategoryLabel(sub.subcategory, sub.sub_category)}
                          </p>
                          <p className="text-xs text-slate-500">{Number(sub.count ?? 0).toLocaleString()} tags</p>
                        </div>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: getRecommendationColor(sub.recommendation_rate) }}
                        >
                          {formatPercentOrDash(sub.recommendation_rate)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
                {category.subcategories.length > 3 ? (
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Showing {Math.min(visibleSubcategories.length, category.subcategories.length)} of{" "}
                      {category.subcategories.length}
                    </span>
                    {isExpanded ? (
                      <button
                        type="button"
                        onClick={() => toggleCategoryExpand(category.key, false)}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80 hover:border-white/20 hover:bg-white/10"
                        aria-label={`Collapse ${category.label} subcategories`}
                      >
                        −
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleCategoryExpand(category.key, true)}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80 hover:border-white/20 hover:bg-white/10"
                        aria-label={`Expand ${category.label} subcategories`}
                      >
                        +
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Issues & feature requests</h3>
            <p className="mt-1 text-sm text-slate-400">Top subcategories by issue and request volume</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">Top issues</h4>
              <span className="text-xs text-slate-500">{issueItems.length} items</span>
            </div>
            {issueItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No issue tags found yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {issueItems.map((entry) => {
                  const subcategoryKey = entry.subcategory || entry.sub_category || "other/general";
                  const label = toSubcategoryLabel(subcategoryKey, entry.sub_category) || "Other";
                  const count = Number(entry.issue_count ?? 0).toLocaleString();
                  const snippet = entry.issue_snippets?.[0] ?? "";
                  return (
                    <button
                      key={subcategoryKey}
                      type="button"
                      onClick={() =>
                        setSelectedSubcategory((prev) => (prev === subcategoryKey ? null : subcategoryKey))
                      }
                      className={`flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left ${
                        selectedSubcategory === subcategoryKey
                          ? "border-sky-400/50 bg-sky-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm text-slate-200">{label}</p>
                        <p className="text-xs text-slate-500">{count} issues</p>
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
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">Top feature requests</h4>
              <span className="text-xs text-slate-500">{requestItems.length} items</span>
            </div>
            {requestItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No feature requests tagged yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {requestItems.map((entry) => {
                  const subcategoryKey = entry.subcategory || entry.sub_category || "other/general";
                  const label = toSubcategoryLabel(subcategoryKey, entry.sub_category) || "Other";
                  const count = Number(entry.request_count ?? 0).toLocaleString();
                  const snippet = entry.request_snippets?.[0] ?? "";
                  return (
                    <button
                      key={subcategoryKey}
                      type="button"
                      onClick={() =>
                        setSelectedSubcategory((prev) => (prev === subcategoryKey ? null : subcategoryKey))
                      }
                      className={`flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left ${
                        selectedSubcategory === subcategoryKey
                          ? "border-sky-400/50 bg-sky-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm text-slate-200">{label}</p>
                        <p className="text-xs text-slate-500">{count} requests</p>
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
          </div>
        </div>
      </Card>

      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Userbase segmentation</h3>
            <p className="mt-1 text-sm text-slate-400">Who is reviewing and what they care about</p>
          </div>
        </div>

        {!playerSegments ? (
          <p className="mt-4 text-sm text-slate-500">Segmentation data is not available for this analysis.</p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
              <h4 className="text-sm font-semibold text-white">Purchase pathways</h4>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                {[
                  { label: "Steam buyers", data: playerSegments.purchase_type?.steam_buyers },
                  { label: "Key users", data: playerSegments.purchase_type?.key_users },
                  { label: "Free users", data: playerSegments.purchase_type?.free_users },
                ].map((row) => {
                  const count = Number(row.data?.count ?? 0).toLocaleString();
                  const rec = formatPercentOrDash(row.data?.recommendation_rate);
                  const req = formatPercentOrDash(row.data?.feature_request_rate);
                  return (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <span>{row.label}</span>
                      <span className="text-xs text-slate-400">
                        {count} reviews · rec {rec} · requests {req}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
              <h4 className="text-sm font-semibold text-white">Experience cohorts</h4>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                {[
                  { label: "Newcomers (<2h)", data: playerSegments.experience_level?.newcomers },
                  { label: "Casual (2-20h)", data: playerSegments.experience_level?.casual },
                  { label: "Experienced (20-100h)", data: playerSegments.experience_level?.experienced },
                  { label: "Veterans (100h+)", data: playerSegments.experience_level?.veterans },
                ].map((row) => {
                  const count = Number(row.data?.count ?? 0).toLocaleString();
                  const issueCount = Number(row.data?.issue_count ?? 0).toLocaleString();
                  const topIssueRaw = row.data?.top_issues?.[0]?.category;
                  const topIssue = topIssueRaw ? toSubcategoryLabel(topIssueRaw) : "";
                  const meta = [`${count} reviews`, `issues ${issueCount}`];
                  if (topIssue) {
                    meta.push(`top ${topIssue}`);
                  }
                  return (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <span>{row.label}</span>
                      <span className="text-xs text-slate-400">{meta.join(" · ")}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
              <h4 className="text-sm font-semibold text-white">Engagement topics</h4>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                {[
                  { label: "Highly engaged", data: playerSegments.engagement_topics?.highly_engaged },
                  { label: "Moderately engaged", data: playerSegments.engagement_topics?.moderately_engaged },
                  { label: "Low engagement", data: playerSegments.engagement_topics?.low_engagement },
                ].map((row) => {
                  const count = Number(row.data?.count ?? 0).toLocaleString();
                  const topics = (row.data?.top_topics ?? [])
                    .slice(0, 3)
                    .map((topic) => formatMainCategoryLabel(topic.topic))
                    .filter(Boolean);
                  const meta = [`${count} reviews`];
                  if (topics.length) {
                    meta.push(`topics ${topics.join(", ")}`);
                  }
                  return (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <span>{row.label}</span>
                      <span className="text-xs text-slate-400">{meta.join(" · ")}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
              <h4 className="text-sm font-semibold text-white">Activity status</h4>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                {[
                  { label: "Currently active", data: playerSegments.activity_status?.currently_active },
                  { label: "Recently stopped", data: playerSegments.activity_status?.recently_stopped },
                  { label: "Inactive", data: playerSegments.activity_status?.inactive },
                ].map((row) => {
                  const count = Number(row.data?.count ?? 0).toLocaleString();
                  const rec = formatPercentOrDash(row.data?.recommendation_rate);
                  const issueCount = Number(row.data?.issue_count ?? 0).toLocaleString();
                  return (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <span>{row.label}</span>
                      <span className="text-xs text-slate-400">
                        {count} reviews · rec {rec} · issues {issueCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {selectedSubcategory ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSubcategory(null)}
        >
          <div
            className="mt-8 w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedSubcategoryLabel}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedMainLabel} · {selectedReviews.length.toLocaleString()} reviews
                  {filtersActive ? " · filters applied" : ""}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setSelectedSubcategory(null)}>
                Close
              </Button>
            </div>
            {selectedReviews.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No reviews found for this subcategory.</p>
            ) : (
              <div className="mt-4 max-h-[32rem] space-y-3 overflow-auto pr-2">
                {selectedReviews.map((review, idx) => {
                  const reviewKey = String(review.review_id ?? idx);
                  const text = review.review ?? "";
                  const createdAt = review.created_at ? new Date(review.created_at) : null;
                  const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
                    ? createdAt.toLocaleDateString()
                    : "Date unknown";
                  const shouldClamp = text.length > 240 || text.split("\n").length > 3;
                  const isExpanded = expandedReviews.has(reviewKey);
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
                            review.voted_up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {review.voted_up ? "Recommended" : "Not recommended"}
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
                            className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80 hover:border-white/20 hover:bg-white/10"
                            aria-label={isExpanded ? "Collapse review" : "Expand review"}
                          >
                            {isExpanded ? "−" : "+"}
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

function normalizeSnippets(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : value == null ? [] : [value];
  const cleaned: string[] = [];
  rawItems.forEach((item) => {
    if (item === null || item === undefined) return;
    const text = String(item).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return;
    const trimmed = text.slice(0, 160);
    if (!cleaned.includes(trimmed)) {
      cleaned.push(trimmed);
    }
  });
  return cleaned;
}

function buildSubcategoryInsights(reviews: ReviewRow[], maxSnippets = 6): SubcategoryInsight[] {
  const results = new Map<
    string,
    SubcategoryInsight & {
      recommended: number;
      not_recommended: number;
      issue_snippets: string[];
      request_snippets: string[];
    }
  >();

  reviews.forEach((review) => {
    const subcats = listifyStrings(review.llm_subcategories);
    if (!subcats.length) return;
    const issueSet = new Set(listifyStrings(review.llm_issue_subcategories));
    const requestSet = new Set(listifyStrings(review.llm_request_subcategories));
    const evidenceRaw = review.llm_subcategory_evidence;
    const evidence =
      evidenceRaw && typeof evidenceRaw === "object" && !Array.isArray(evidenceRaw)
        ? (evidenceRaw as Record<string, unknown>)
        : {};
    const votedUp = review.voted_up;
    const isPositive = votedUp === undefined || votedUp === null ? true : Boolean(votedUp);

    subcats.forEach((subcat) => {
      const key = subcat.trim();
      if (!key) return;
      const entry =
        results.get(key) ??
        ({
          subcategory: key,
          main_category: "",
          sub_category: "",
          count: 0,
          recommended: 0,
          not_recommended: 0,
          issue_count: 0,
          request_count: 0,
          issue_snippets: [],
          request_snippets: [],
        } as SubcategoryInsight & {
          recommended: number;
          not_recommended: number;
          issue_snippets: string[];
          request_snippets: string[];
        });

      entry.count += 1;
      if (isPositive) {
        entry.recommended = (entry.recommended ?? 0) + 1;
      } else {
        entry.not_recommended = (entry.not_recommended ?? 0) + 1;
      }
      if (issueSet.has(key)) {
        entry.issue_count += 1;
      }
      if (requestSet.has(key)) {
        entry.request_count += 1;
      }

      const snippets = normalizeSnippets(evidence[key]);
      if (snippets.length) {
        if (issueSet.has(key)) {
          for (const snippet of snippets) {
            if (entry.issue_snippets.includes(snippet)) continue;
            if (entry.issue_snippets.length >= maxSnippets) break;
            entry.issue_snippets.push(snippet);
          }
        }
        if (requestSet.has(key)) {
          for (const snippet of snippets) {
            if (entry.request_snippets.includes(snippet)) continue;
            if (entry.request_snippets.length >= maxSnippets) break;
            entry.request_snippets.push(snippet);
          }
        }
      }

      results.set(key, entry);
    });
  });

  const insights = Array.from(results.values()).map((entry) => {
    const raw = entry.subcategory ?? "";
    const [mainRaw, subRaw] = raw.includes("/") ? raw.split("/", 2) : ["other", raw || entry.sub_category || "general"];
    const count = Number(entry.count ?? 0);
    const recommended = Number(entry.recommended ?? 0);
    return {
      ...entry,
      main_category: mainRaw || "other",
      sub_category: subRaw || "general",
      recommendation_rate: count ? recommended / count : 0,
      count,
      recommended,
      not_recommended: Number(entry.not_recommended ?? 0),
    };
  });

  insights.sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0));
  return insights;
}

function buildCategoryRates(reviews: ReviewRow[]): Record<string, CategoryRecommendationRate> {
  const buckets = new Map<string, { count: number; recommended: number; not_recommended: number }>();

  reviews.forEach((review) => {
    const subcats = listifyStrings(review.llm_subcategories);
    if (!subcats.length) return;
    const mainSet = new Set<string>();
    subcats.forEach((subcat) => {
      const raw = subcat.trim();
      if (!raw) return;
      const main = raw.includes("/") ? raw.split("/", 1)[0] : "other";
      if (!main) return;
      mainSet.add(main.toLowerCase());
    });
    if (mainSet.size === 0) return;
    const votedUp = review.voted_up;
    const isPositive = votedUp === undefined || votedUp === null ? true : Boolean(votedUp);

    mainSet.forEach((main) => {
      const entry = buckets.get(main) ?? { count: 0, recommended: 0, not_recommended: 0 };
      entry.count += 1;
      if (isPositive) {
        entry.recommended += 1;
      } else {
        entry.not_recommended += 1;
      }
      buckets.set(main, entry);
    });
  });

  const result: Record<string, CategoryRecommendationRate> = {};
  buckets.forEach((entry, main) => {
    result[main] = {
      count: entry.count,
      recommended: entry.recommended,
      not_recommended: entry.not_recommended,
      rate: entry.count ? entry.recommended / entry.count : 0,
    };
  });
  return result;
}

function buildPlayerSegments(reviews: ReviewRow[]): PlayerSegments {
  const emptySegments: PlayerSegments = {
    experience_level: {
      newcomers: { count: 0, top_issues: [], issue_count: 0 },
      casual: { count: 0, top_issues: [], issue_count: 0 },
      experienced: { count: 0, top_issues: [], issue_count: 0 },
      veterans: { count: 0, top_issues: [], issue_count: 0 },
    },
    purchase_type: {
      steam_buyers: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
      key_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
      free_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
    },
    engagement_topics: {
      highly_engaged: { count: 0, top_topics: [] },
      moderately_engaged: { count: 0, top_topics: [] },
      low_engagement: { count: 0, top_topics: [] },
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
    const recommended = segment.reduce((sum, review) => sum + (review.voted_up ? 1 : 0), 0);
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

  const minutesFor = (review: ReviewRow) => Number(review.author_playtime_forever ?? 0);
  const recentMinutesFor = (review: ReviewRow) => Number(review.author_playtime_last_two_weeks ?? 0);

  const newcomers = reviews.filter((review) => minutesFor(review) < 120);
  const casual = reviews.filter((review) => minutesFor(review) >= 120 && minutesFor(review) < 1200);
  const experienced = reviews.filter((review) => minutesFor(review) >= 1200 && minutesFor(review) < 6000);
  const veterans = reviews.filter((review) => minutesFor(review) >= 6000);

  const experience_level = {
    newcomers: {
      count: newcomers.length,
      top_issues: topIssueCategories(newcomers),
      issue_count: countIssueReviews(newcomers),
    },
    casual: {
      count: casual.length,
      top_issues: topIssueCategories(casual),
      issue_count: countIssueReviews(casual),
    },
    experienced: {
      count: experienced.length,
      top_issues: topIssueCategories(experienced),
      issue_count: countIssueReviews(experienced),
    },
    veterans: {
      count: veterans.length,
      top_issues: topIssueCategories(veterans),
      issue_count: countIssueReviews(veterans),
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
      top_topics: topTopics(highly_engaged),
    },
    moderately_engaged: {
      count: moderately_engaged.length,
      top_topics: topTopics(moderately_engaged),
    },
    low_engagement: {
      count: low_engagement.length,
      top_topics: topTopics(low_engagement),
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

  return { experience_level, purchase_type, engagement_topics, activity_status };
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
      if (lower === "p2w") return "P2W";
      if (lower === "ctd") return "CTD";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}
