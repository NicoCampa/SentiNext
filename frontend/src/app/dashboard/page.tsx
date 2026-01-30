'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { searchGames, estimateAnalysis } from "@/lib/api";
import type {
  AnalyzeResponse,
  AnalyzeEstimateResponse,
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
import { GlobalFiltersBar } from "@/components/GlobalFiltersBar";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { useGameContext } from "@/contexts/GameContext";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { applyGlobalReviewFilters } from "@/lib/reviewFilters";
import { buildCategoryRates, buildSubcategoryInsights } from "@/lib/derivedInsights";
import { buildLlmRequestConfig } from "@/lib/settings";
import {
  ANALYSIS_REVIEW_COUNT_OPTIONS,
  loadDefaultAnalysisReviewCount,
  parseAnalysisReviewCount,
  saveDefaultAnalysisReviewCount,
} from "@/lib/analysisDefaults";
import { getRecommendationColor } from "@/utils/colors";
import { formatSavedLabel } from "@/utils/format";

const EMPTY_REVIEWS: ReviewRow[] = [];

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
  const viewParam = searchParams.get("view");
  const reviewsParam = searchParams.get("reviews") || searchParams.get("review_count");
  const { startAnalysis, getTask } = useAnalysis();
  const { games, loading: gamesLoading, refreshGames, selectGameById, setTemporaryGame, selectedStarredGame } = useGameContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<SearchResult | null>(null);

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [reviewCount, setReviewCount] = useState<number>(() => loadDefaultAnalysisReviewCount());
  const [language, setLanguage] = useState<string>("english");
  const [fetchFilter, setFetchFilter] = useState<string>("recent");
  const [refreshDays, setRefreshDays] = useState<number>(30);
  const [estimate, setEstimate] = useState<AnalyzeEstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const currentTask = selectedGame ? getTask(selectedGame.appid) : undefined;
  const isAnalyzing = currentTask?.status === "analyzing";
  const progress = currentTask?.progress ?? null;

  useEffect(() => {
    const parsed = parseAnalysisReviewCount(reviewsParam);
    if (parsed === null) return;
    setReviewCount(parsed);
  }, [reviewsParam]);

  useEffect(() => {
    saveDefaultAnalysisReviewCount(reviewCount);
  }, [reviewCount]);

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
      setForceRefresh(false);
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
    setForceRefresh(false);
  }, [selectedStarredGame, selectedGame, analysis]);

  useEffect(() => {
    if (currentTask?.status === "completed" && currentTask.result) {
      setAnalysis(currentTask.result);
      refreshGames().catch(() => null);
      if (selectedGame) {
        selectGameById(selectedGame.appid);
      }
    }
  }, [currentTask, refreshGames, selectGameById, selectedGame]);

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
    setTemporaryGame(game);
    setSearchResults([]);
    setAnalysis(null);
    setError(null);
    setForceRefresh(false);
    setEstimate(null);
    setEstimateError(null);
  }

  useEffect(() => {
    setEstimate(null);
    setEstimateError(null);
  }, [reviewCount, language, fetchFilter, forceRefresh, refreshDays]);

  async function handleEstimate() {
    if (!selectedGame) return;
    setEstimating(true);
    setEstimateError(null);
    try {
      const llmConfig = await buildLlmRequestConfig();
      const result = await estimateAnalysis({
        app_id: selectedGame.appid,
        review_count: reviewCount,
        language,
        filter: fetchFilter,
        persist: true,
        refresh: forceRefresh,
        refresh_days: forceRefresh ? refreshDays : undefined,
        llm_provider: llmConfig.llm_provider,
        llm_model: llmConfig.llm_model,
      });
      setEstimate(result);
    } catch (err) {
      console.error("Estimate failed", err);
      setEstimateError((err as Error).message || "Failed to estimate analysis.");
    } finally {
      setEstimating(false);
    }
  }

  async function handleAnalyze() {
    if (!selectedGame) return;
    setError(null);
    try {
      if (estimate && estimate.llm_reviews >= 200) {
        const ok = confirm(
          `This run is estimated to make ${estimate.llm_reviews} new LLM calls (plus ${estimate.rules_reviews} rules).\n\nContinue?`,
        );
        if (!ok) return;
      }
      await startAnalysis(selectedGame, {
        refresh: forceRefresh,
        review_count: reviewCount,
        language,
        filter: fetchFilter,
        refresh_days: forceRefresh ? refreshDays : undefined,
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
    setForceRefresh(false);
    setTemporaryGame(null);
    setEstimate(null);
    setEstimateError(null);
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
        {selectedGame ? (
          <div className="flex items-center justify-end">
            <Button onClick={handleReset} variant="secondary">
              New Search
            </Button>
          </div>
        ) : null}

        {!selectedGame && (
          <>
            <Card variant="glass" className="p-6">
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Welcome</p>
                <div>
                  <h1 className="text-2xl font-semibold text-white">Welcome to SentiNext</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    Understand what players really think. Start with a new Steam analysis or jump back into a recent report.
                  </p>
                </div>
              </div>
            </Card>

            <div id="new-analysis">
              <Card variant="glass" className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">New game analysis</h2>
                    <p className="text-xs text-slate-400">Search Steam to begin a fresh review classification run.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                      placeholder="Search for a game (e.g., Baldur's Gate 3)"
                      className="flex-1 rounded-xl border border-white/20 bg-slate-900/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      variant="primary"
                      size="lg"
                      className="w-full sm:w-auto"
                    >
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
            </div>

            <Card variant="glass" className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Recent analyses</h2>
                  <p className="text-xs text-slate-400">Open a saved dashboard from your latest runs.</p>
                </div>
                {recentAnalyses.length > 0 ? (
                  <a href="/compare" className="text-xs text-sky-400 hover:text-sky-300">
                    View all
                  </a>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {gamesLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, idx) => (
                      <div key={idx} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-slate-900/40" />
                    ))}
                  </div>
                ) : recentAnalyses.length === 0 ? (
                  <EmptyState
                    title="No analyses yet"
                    description="Search for a game to start your first analysis."
                    icon="▣"
                    variant="info"
                  />
                ) : (
                  recentAnalyses.map((game) => {
                    const sample = game.sample ?? [];
                    const rate = sample.length
                      ? sample.reduce((sum, review) => sum + (review.voted_up ? 1 : 0), 0) / sample.length
                      : null;
                    return (
                      <button
                        key={game.app_id}
                        onClick={() => router.push(`/dashboard?game=${game.app_id}`)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/30 p-3 text-left transition hover:border-sky-500/40 hover:bg-slate-900/50"
                      >
                        <SteamImage
                          appId={game.app_id}
                          variant="header"
                          alt={game.name}
                          className="h-14 w-24 rounded-xl object-cover"
                          imageUrl={game.metadata.header_image}
                        />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-semibold text-white line-clamp-1">{game.name}</p>
                          <p className="text-xs text-slate-400">
                            {sample.length.toLocaleString()} reviews · {formatSavedLabel(game.updated_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold" style={{ color: getRecommendationColor(rate ?? 0) }}>
                            {formatPercentOrDash(rate)}
                          </p>
                          <p className="text-[11px] text-slate-500">recommend</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>
          </>
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
                    Run an analysis to classify up to {reviewCount.toLocaleString()} Steam reviews.
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Reviews</span>
	                    <select
	                      value={reviewCount}
	                      onChange={(event) => setReviewCount(Number(event.target.value))}
	                      className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
	                    >
	                      {ANALYSIS_REVIEW_COUNT_OPTIONS.map((value) => (
	                        <option key={value} value={value}>
	                          {value.toLocaleString()}
	                        </option>
	                      ))}
	                    </select>
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Language</span>
                    <input
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      placeholder="english"
                      list="sentinext-analyze-language"
                      className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    />
                    <datalist id="sentinext-analyze-language">
                      {["english", "german", "french", "spanish", "italian", "polish", "russian", "japanese", "koreana", "schinese", "tchinese"].map(
                        (item) => (
                          <option key={item} value={item} />
                        ),
                      )}
                    </datalist>
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Steam filter</span>
                    <select
                      value={fetchFilter}
                      onChange={(event) => setFetchFilter(event.target.value)}
                      className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="recent">Recent</option>
                      <option value="updated">Recently updated</option>
                      <option value="best">Most helpful</option>
                      <option value="all">All</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Fetch window</span>
                    <select
                      value={refreshDays}
                      onChange={(event) => setRefreshDays(Number(event.target.value))}
                      disabled={!forceRefresh}
                      className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 disabled:opacity-40 focus:border-sky-500 focus:outline-none"
                    >
                      {[7, 30, 90, 365].map((value) => (
                        <option key={value} value={value}>
                          Last {value} days
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={handleEstimate} disabled={estimating || isAnalyzing} variant="secondary">
                    {estimating ? "Estimating..." : "Estimate"}
                  </Button>
                  {estimate ? (
                    <p className="text-xs text-slate-400">
                      LLM calls: <span className="text-slate-200">{estimate.llm_reviews}</span> · cached:{" "}
                      <span className="text-slate-200">{estimate.cached_reviews}</span> · rules:{" "}
                      <span className="text-slate-200">{estimate.rules_reviews}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Estimate shows how many reviews need new LLM calls vs cache/rules.</p>
                  )}
                </div>
                {estimateError ? <p className="text-sm text-rose-400">{estimateError}</p> : null}
                <Button onClick={handleAnalyze} disabled={isAnalyzing} variant="primary" size="lg" className="w-full md:w-auto">
                  {isAnalyzing ? "Analyzing..." : `Analyze ${reviewCount.toLocaleString()} Reviews`}
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
}: {
  analysis: AnalyzeResponse;
  selectedGame: SearchResult | null;
}) {
  const router = useRouter();
  const { filters: globalFilters, filtersActive: globalFiltersActive, resetFilters: resetGlobalFilters } = useGlobalFilters();
  const insights = analysis.insights ?? null;
  const theme = (insights?.theme as ThemeDefinition | undefined) ?? DEFAULT_THEME;
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(() => new Set());
  const [reviewQuery, setReviewQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resetFilters = () => {
    resetGlobalFilters();
    setReviewQuery("");
  };

  const categoryRates = insights?.category_recommendation_rates;
  const subcategoryInsights = insights?.subcategory_insights;

  const reviewSample = analysis.reviews ?? EMPTY_REVIEWS;
  const filtersActive = globalFiltersActive || reviewQuery.trim().length > 0;

  const globallyFilteredReviews = useMemo(() => {
    return applyGlobalReviewFilters(reviewSample, globalFilters);
  }, [reviewSample, globalFilters]);

  const filteredReviewSample = useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();
    if (!query) return globallyFilteredReviews;
    return globallyFilteredReviews.filter((review) => {
      const text = (review.review ?? "").toLowerCase();
      return text.includes(query);
    });
  }, [reviewQuery, globallyFilteredReviews]);

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
  const summaryTotal = filteredReviewSample.length;
  const summaryRecommendationRate =
    summaryTotal > 0
      ? filteredReviewSample.reduce((sum, review) => sum + (review.voted_up ? 1 : 0), 0) / summaryTotal
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
    <div className="space-y-8">
      <Card variant="glass" className="p-6">
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
                <h2 className="text-2xl font-semibold text-white">{selectedGame?.name ?? "Analysis"}</h2>
              </div>
              <p className="text-sm text-slate-400">
                Last run {new Date(analysis.metadata.fetched_at).toLocaleString()} · language{" "}
                {analysis.metadata.language || "unknown"}
              </p>
              <p className="text-xs text-slate-500">
                Retrieved {analysis.metadata.retrieved.toLocaleString()} / {analysis.metadata.requested.toLocaleString()} reviews
              </p>
            </div>
          </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            onClick={() => {
              if (!selectedGame) return;
              router.push(`/reviews?appId=${selectedGame.appid}`);
            }}
            variant="secondary"
          >
            Open reviews
          </Button>
        </div>
      </div>

        <Card variant="glass" className="mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Filters</h3>
              <p className="mt-1 text-sm text-slate-400">
                Global filters and text search apply to every insight below.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filtersActive ? (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-300">
                  Active
                </span>
              ) : null}
              {filtersActive ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => setFiltersOpen((prev) => !prev)}>
                {filtersOpen ? "Hide filters" : "Show filters"}
              </Button>
            </div>
          </div>
          {filtersOpen ? (
            <>
              <div className="mt-4">
                <GlobalFiltersBar />
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-4 text-sm text-slate-200">
                <label className="flex min-w-0 w-full flex-1 flex-col gap-2 sm:min-w-[240px]">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Search reviews</span>
                  <input
                    value={reviewQuery}
                    onChange={(event) => setReviewQuery(event.target.value)}
                    placeholder="Search review text"
                    className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </label>
                <div className="flex flex-1 justify-end text-xs text-slate-400">
                  <span>
                    {filteredReviewSample.length.toLocaleString()} / {reviewSample.length.toLocaleString()} reviews
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </Card>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Recommendation</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatPercentOrDash(summaryRecommendationRate)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Issue rate</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatPercentOrDash(summaryIssueRate)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Request rate</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatPercentOrDash(summaryRequestRate)}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-6">

        <Card variant="glass" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">Category recommendation</h4>
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

        <div className="grid gap-6 xl:grid-cols-2">
          <Card variant="glass" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-white">Top issues</h4>
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
          </Card>

          <Card variant="glass" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-white">Top feature requests</h4>
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
          </Card>
        </div>

        <Card variant="glass" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">Userbase segmentation</h4>
              <p className="mt-1 text-sm text-slate-400">Who is reviewing and what they care about</p>
            </div>
          </div>

          {!playerSegments ? (
            <p className="mt-4 text-sm text-slate-500">Segmentation data is not available for this analysis.</p>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-5">
                <h5 className="text-sm font-semibold text-white">Purchase pathways</h5>
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
                <h5 className="text-sm font-semibold text-white">Experience cohorts</h5>
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
                <h5 className="text-sm font-semibold text-white">Engagement topics</h5>
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
                <h5 className="text-sm font-semibold text-white">Activity status</h5>
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
      </div>

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
