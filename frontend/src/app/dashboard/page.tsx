'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import clsx from "clsx";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  ArcElement,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import { searchGames, fetchStarredGames, fetchFeedback } from "@/lib/api";
import type {
  SearchResult,
  AnalyzeResponse,
  StarredGameDTO,
  ThemeDefinition,
  ProgressStatus,
  ReviewRow,
  FeedbackItem,
} from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { hexToRgba } from "@/utils/colors";
import { useAnalysis } from "@/contexts/AnalysisContext";
import {
  useAnalysisViewModel,
  SummaryView,
  ExperienceView,
  ProductQualityView,
  AudienceView,
  CategoryGroupView,
  SubcategoryView,
} from "@/hooks/useAnalysisViewModel";
import { ReviewFilters, ReviewsTable } from "@/components/review-explorer";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, ArcElement, PointElement, Tooltip, Legend);

const REVIEW_COUNT = 1000;

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

type FeedbackSources = { steam: boolean; reddit: boolean; discord: boolean; steam_forum: boolean };

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
  const [feedbackListState, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSources, setFeedbackSources] = useState<FeedbackSources>({
    steam: true,
    reddit: true,
    discord: true,
    steam_forum: true,
  });

  const currentTask = selectedGame ? getTask(selectedGame.appid) : undefined;
  const isAnalyzing = currentTask?.status === "analyzing";

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
    setFeedbackList([]);
  }

  async function handleAnalyze() {
    if (!selectedGame) return;
    setError(null);
    try {
      await startAnalysis(selectedGame, { refresh: forceRefresh });
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
    setFeedbackList([]);
    setFeedbackError(null);
  }

  const loadFeedback = useCallback(async () => {
    if (!selectedGame) return;
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const items = await fetchFeedback(selectedGame.appid, {
        include_reddit: feedbackSources.reddit,
        include_discord: feedbackSources.discord,
        include_steam_forums: feedbackSources.steam_forum,
        steam_limit: feedbackSources.steam ? 200 : 0,
      });
      setFeedbackList(items);
    } catch (err) {
      setFeedbackError((err as Error).message || "Failed to load feedback");
    } finally {
      setFeedbackLoading(false);
    }
  }, [selectedGame, feedbackSources]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const handleToggleFeedbackSource = (key: keyof FeedbackSources) => {
    setFeedbackSources((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRefreshFeedback = () => {
    loadFeedback();
  };

  const progress = currentTask?.progress ?? null;

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
            <p className="text-xs text-slate-400">Run structured insights on recent Steam reviews</p>
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
                <Button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  variant="primary"
                  size="lg"
                >
                  {searching ? "Searching..." : "Search"}
                </Button>
              </div>

              {error && searchResults.length === 0 && (
                <p className="text-sm text-rose-400">{error}</p>
              )}

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
              />
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedGame.name}</h2>
                  {selectedGame.price && <p className="text-sm text-slate-400">{selectedGame.price}</p>}
                  <p className="mt-3 text-sm text-slate-400">
                    Launch a fresh analysis to classify up to {REVIEW_COUNT.toLocaleString()} recent reviews. Toggle refresh to pull new reviews from Steam.
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
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  variant="primary"
                  size="lg"
                  className="w-full md:w-auto"
                >
                  {isAnalyzing ? "Analyzing..." : `Analyze ${REVIEW_COUNT} Reviews`}
                </Button>
                {isAnalyzing && progress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Processing reviews with AI...</span>
                      <span>
                        {progress.processed} / {progress.total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
                        style={{
                          width: progress.total ? `${Math.min(100, (progress.processed / progress.total) * 100)}%` : "10%",
                        }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      💡 Progress updates in real time. You can navigate away while we finish.
                    </p>
                  </div>
                )}
                {error && <p className="text-sm text-rose-400">{error}</p>}
              </div>
            </div>
          </Card>
        )}

        {selectedGame && !analysis && !isAnalyzing && (
          <EmptyState
            title="No analysis yet"
            description="Kick off an analysis to surface sentiment, issues, and feature requests for this game."
          />
        )}

        {analysis && analysis.insights && (
          <AnalysisResults
            analysis={analysis}
            gameName={selectedGame?.name || ""}
            selectedGame={selectedGame}
            onReanalyze={handleAnalyze}
            forceRefresh={forceRefresh}
            onToggleRefresh={setForceRefresh}
            isAnalyzing={isAnalyzing}
            progress={progress}
            feedbackList={feedbackListState}
            feedbackLoading={feedbackLoading}
            feedbackError={feedbackError}
            feedbackSources={feedbackSources}
            onRefreshFeedback={handleRefreshFeedback}
            onToggleFeedbackSource={handleToggleFeedbackSource}
          />
        )}
      </div>
      </AppLayout>
  );
}

function AnalysisResults({
  analysis,
  gameName,
  selectedGame,
  onReanalyze,
  forceRefresh,
  onToggleRefresh,
  isAnalyzing,
  progress,
  feedbackList,
  feedbackLoading,
  feedbackError,
  feedbackSources,
  onRefreshFeedback,
  onToggleFeedbackSource,
}: {
  analysis: AnalyzeResponse;
  gameName: string;
  selectedGame: SearchResult | null;
  onReanalyze: () => void;
  forceRefresh: boolean;
  onToggleRefresh: (value: boolean) => void;
  isAnalyzing: boolean;
  progress: ProgressStatus | null;
  feedbackList: FeedbackItem[];
  feedbackLoading: boolean;
  feedbackError: string | null;
  feedbackSources: FeedbackSources;
  onRefreshFeedback: () => void;
  onToggleFeedbackSource: (key: keyof FeedbackSources) => void;
}) {
  const router = useRouter();
  const view = useAnalysisViewModel(analysis);
  const theme = view.theme ?? DEFAULT_THEME;

  const navItems = [
    { id: "summary", label: "Executive Summary" },
    { id: "experience", label: "Experience" },
    { id: "quality", label: "Product Quality" },
    { id: "audience", label: "Audience Segments" },
    { id: "feedback", label: "Community Feedback" },
    { id: "reviews", label: "Raw Reviews" },
  ];

  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  useEffect(() => {
    if (!view.drilldown.categories.length) {
      setSelectedMainCategory(null);
      setSelectedSubcategory(null);
      return;
    }
    const fallback = view.drilldown.categories[0].category;
    setSelectedMainCategory((prev) => {
      if (prev && view.drilldown.categories.some((item) => item.category === prev)) {
        return prev;
      }
      return fallback;
    });
  }, [view.drilldown.categories]);

  useEffect(() => {
    if (!selectedMainCategory) {
      setSelectedSubcategory(null);
      return;
    }
    const category = view.drilldown.categories.find((item) => item.category === selectedMainCategory);
    if (!category) {
      setSelectedSubcategory(null);
      return;
    }
    const defaultSub = category.subcategories[0]?.key ?? null;
    setSelectedSubcategory((prev) => {
      if (prev && category.subcategories.some((item) => item.key === prev)) {
        return prev;
      }
      return defaultSub;
    });
  }, [selectedMainCategory, view.drilldown.categories]);

  const selectedCategory = selectedMainCategory
    ? view.drilldown.categories.find((item) => item.category === selectedMainCategory)
    : undefined;
  const selectedSubcategoryData = selectedCategory?.subcategories.find((item) => item.key === selectedSubcategory);

  const feedbackSection = (
    <section id="feedback">
      <MultiSourceFeedbackSection
        items={feedbackList}
        loading={feedbackLoading}
        error={feedbackError}
        onRefresh={onRefreshFeedback}
        sources={feedbackSources}
        onToggleSource={onToggleFeedbackSource}
      />
    </section>
  );

  const scrollToSection = (id: string) => {
    if (typeof window === "undefined") return;
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleOpenReviews = (category: string, subcategoryKey?: string | null) => {
    if (!selectedGame) return;
    const filterType = subcategoryKey ? "subcategory" : "main_category";
    const filterValue = subcategoryKey || category;
    const params = new URLSearchParams({
      appId: String(selectedGame.appid),
      filterType,
      filterValue,
    });
    router.push(`/reviews?${params.toString()}`);
  };

  const [showReviews, setShowReviews] = useState(false);
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const [featureFilter, setFeatureFilter] = useState<"all" | "feature" | "no_feature">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredReviews = useMemo(() => {
    return view.reviews.filter((review) => {
      if (sentimentFilter === "positive" && !review.voted_up) return false;
      if (sentimentFilter === "negative" && review.voted_up) return false;
      const hasRequest = review.llm_has_request ?? (Array.isArray(review.llm_request_subcategories) && review.llm_request_subcategories.length > 0);
      if (featureFilter === "feature" && !hasRequest) return false;
      if (featureFilter === "no_feature" && hasRequest) return false;
      if (categoryFilter !== "all" && review.llm_main_category !== categoryFilter) return false;
      return true;
    });
  }, [view.reviews, sentimentFilter, featureFilter, categoryFilter]);

  return (
    <div className="space-y-12">
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)_320px] gap-6">
        <div className="hidden lg:block">
          <nav className="sticky top-24 space-y-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Navigate</p>
            <ul className="space-y-2 text-sm text-slate-300">
              {navItems.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 transition hover:border-sky-500/40 hover:text-white"
                  >
                    {item.label}
                    <span className="text-xs text-slate-500">↯</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="space-y-16">
          <section id="summary">
            <ExecutiveSummary
              summary={view.summary}
              metadata={view.metadata}
              theme={theme}
              gameName={gameName}
              selectedGame={selectedGame}
              onReanalyze={onReanalyze}
              forceRefresh={forceRefresh}
              onToggleRefresh={onToggleRefresh}
              isAnalyzing={isAnalyzing}
              progress={progress}
              onNavigateProductQuality={() => scrollToSection("quality")}
              onNavigateDrilldown={() => scrollToSection("drilldown")}
            />
          </section>

          <section id="experience">
            <ExperienceSection experience={view.experience} theme={theme} />
          </section>

          <section id="quality">
            <ProductQualitySection
              productQuality={view.productQuality}
              theme={theme}
              onViewAudience={() => scrollToSection("audience")}
            />
          </section>

          <section id="audience">
            <AudienceSection audience={view.audience} theme={theme} />
          </section>

          {feedbackSection}

          <section id="reviews">
            <RawReviewsSection
              theme={theme}
              showReviews={showReviews}
              onToggle={() => setShowReviews((prev) => !prev)}
              sentimentFilter={sentimentFilter}
              onSentimentChange={setSentimentFilter}
              featureFilter={featureFilter}
              onFeatureChange={setFeatureFilter}
              categoryFilter={categoryFilter}
              onCategoryChange={setCategoryFilter}
              reviews={filteredReviews}
              totalReviews={view.reviews.length}
            />
          </section>
        </div>

        <aside id="drilldown" className="mt-10 lg:mt-0">
          <DrilldownPanel
            categories={view.drilldown.categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedMainCategory}
            selectedSubcategory={selectedSubcategory}
            onSelectSubcategory={setSelectedSubcategory}
            selectedSubcategoryData={selectedSubcategoryData}
            onOpenReviews={handleOpenReviews}
          />
        </aside>
      </div>
    </div>
  );
}

function ExecutiveSummary({
  summary,
  metadata,
  theme,
  gameName,
  selectedGame,
  onReanalyze,
  forceRefresh,
  onToggleRefresh,
  isAnalyzing,
  progress,
  onNavigateProductQuality,
  onNavigateDrilldown,
}: {
  summary: SummaryView;
  metadata: AnalyzeResponse["metadata"];
  theme: ThemeDefinition;
  gameName: string;
  selectedGame: SearchResult | null;
  onReanalyze: () => void;
  forceRefresh: boolean;
  onToggleRefresh: (value: boolean) => void;
  isAnalyzing: boolean;
  progress: ProgressStatus | null;
  onNavigateProductQuality: () => void;
  onNavigateDrilldown: () => void;
}) {
  const sparklineLabels = summary.sparkline.map((point) => point.label);
  const sparklineValues = summary.sparkline.map((point) => point.value);
  const metrics = [
    { label: "Recommendation Rate", value: formatPercent(summary.recommendationRate) },
    { label: "Issue Rate", value: formatPercent(summary.issueRate) },
    { label: "Request Rate", value: formatPercent(summary.requestRate) },
  ];

  const sparklineData = {
    labels: sparklineLabels,
    datasets: [
      {
        label: "Recommendation",
        data: sparklineValues,
        borderColor: theme.palette.accent,
        backgroundColor: hexToRgba(theme.palette.accent, 0.25),
        tension: 0.4,
        fill: true,
        pointRadius: 0,
      },
    ],
  };

  const sparklineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { display: false },
      y: { display: false },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y.toFixed(1)}% recommended`,
        },
      },
    },
  } as const;

  return (
    <Card variant="glass" className="overflow-hidden p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              {new Date(metadata.fetched_at).toLocaleString()} · {metadata.retrieved.toLocaleString()} / {metadata.requested.toLocaleString()} reviews processed
            </p>
            <h2 className="text-2xl font-semibold text-white">{summary.headline}</h2>
            {summary.callout && (
              <p className="text-sm text-amber-300">⚠️ {summary.callout}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{metric.label}</p>
                <p className="mt-2 text-xl font-bold text-white">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-white/30 bg-slate-900 text-sky-500 focus:ring-sky-500"
                checked={forceRefresh}
                onChange={(event) => onToggleRefresh(event.target.checked)}
              />
              Refresh from Steam on re-run
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={onReanalyze}
                disabled={isAnalyzing}
                variant="primary"
              >
                {isAnalyzing ? "Analyzing..." : "Re-run Analysis"}
              </Button>
              <Button variant="secondary" onClick={onNavigateProductQuality}>
                Explore Product Quality →
              </Button>
              <Button variant="secondary" onClick={onNavigateDrilldown}>
                Jump to Drilldown →
              </Button>
            </div>
          </div>

          {isAnalyzing && progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Processing reviews...</span>
                <span>
                  {progress.processed} / {progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
                  style={{
                    width: progress.total ? `${Math.min(100, (progress.processed / progress.total) * 100)}%` : "15%",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="relative rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Trend</p>
          <div className="mt-2 h-40">
            {summary.sparkline.length > 1 ? (
              <Line data={sparklineData} options={sparklineOptions} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Not enough data for trend yet
              </div>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-400">
            {selectedGame && (
              <a
                href={selectedGame.url}
                target="_blank"
                rel="noreferrer"
                className="text-sky-300 hover:text-sky-200"
              >
                View on Steam →
              </a>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ExperienceSection({ experience, theme }: { experience: ExperienceView; theme: ThemeDefinition }) {
  const trendData = {
    labels: experience.trend.map((point) => point.label),
    datasets: [
      {
        label: "Recommendation Rate",
        data: experience.trend.map((point) => point.value),
        borderColor: theme.palette.accent,
        backgroundColor: hexToRgba(theme.palette.accent, 0.15),
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const sentimentData = {
    labels: experience.sentimentCounts.map((item) => item.sentiment),
    datasets: [
      {
        label: "Reviews",
        data: experience.sentimentCounts.map((item) => item.count),
        backgroundColor: [theme.palette.positive, theme.palette.negative, theme.palette.neutral],
      },
    ],
  };

  const playtimeMetrics = [
    { label: "Median Playtime", value: `${Math.round((experience.playtime.median_playtime_hours ?? 0))}h` },
    { label: "Average Playtime", value: `${Math.round((experience.playtime.mean_playtime_hours ?? 0))}h` },
    { label: "Recent Median", value: `${Math.round((experience.playtime.median_recent_playtime_hours ?? 0))}h` },
  ];

  const helpfulMetrics = [
    { label: "Helpful votes", value: (experience.helpful.average_votes_up ?? 0).toFixed(1) },
    { label: "Funny votes", value: (experience.helpful.average_votes_funny ?? 0).toFixed(1) },
    { label: "Average compound", value: (experience.metrics.average_compound ?? 0).toFixed(2) },
  ];

  return (
    <Card variant="glass" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Experience</h2>
          <p className="text-sm text-slate-400">Sentiment and engagement trends for recent players</p>
        </div>
        <a href="#summary" className="text-xs text-slate-400 hover:text-slate-200">
          Back to summary
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-white">Recommendation Rate Over Time</h3>
          <div className="mt-3 h-48">
            {experience.trend.length > 1 ? (
              <Line
                data={trendData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
                    x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
                  },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx: any) => `${ctx.parsed.y.toFixed(1)}% recommended`,
                      },
                    },
                  },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Not enough data for a trend line yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-white">Sentiment Split</h3>
          <div className="mt-3 h-48">
            {experience.sentimentCounts.length ? (
              <Doughnut
                data={sentimentData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: "bottom", labels: { color: "#cbd5f5" } } },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Awaiting sentiment data.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {playtimeMetrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{metric.value}</p>
          </div>
        ))}
        {helpfulMetrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{metric.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProductQualitySection({
  productQuality,
  theme,
  onViewAudience,
}: {
  productQuality: ProductQualityView;
  theme: ThemeDefinition;
  onViewAudience: () => void;
}) {
  const barData = {
    labels: productQuality.categoryBreakdown.map((item) => toTitleCase(item.category)),
    datasets: [
      {
        label: "Reports",
        data: productQuality.categoryBreakdown.map((item) => item.total),
        backgroundColor: hexToRgba(theme.palette.accent, 0.45),
      },
    ],
  };

  const barOptions = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
    },
    plugins: { legend: { display: false } },
  };

  return (
    <Card variant="glass" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Product Quality</h2>
          <p className="text-sm text-slate-400">Where players struggle and what they ask for next</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <a href="#summary" className="text-slate-400 hover:text-slate-200">
            Back to summary
          </a>
          <button onClick={onViewAudience} className="text-sky-300 hover:text-sky-200">
            Related cohorts →
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-white">Top Issue Subcategories</h3>
          <p className="text-xs text-slate-500">Most frequent issue-tagged subcategories</p>
          <div className="mt-3 space-y-3">
            {productQuality.topIssueSubcategories.length ? (
              productQuality.topIssueSubcategories.slice(0, 5).map((issue) => (
                <div key={issue.subcategory} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{toTitleCase(issue.sub_category || issue.subcategory)}</p>
                      {issue.issue_snippets?.[0] && (
                        <p className="mt-1 text-xs text-slate-400">“{issue.issue_snippets[0]}”</p>
                      )}
                      <div className="mt-2 text-[11px] text-slate-400">
                        {issue.issue_count} issue-tagged · {issue.count} total tags
                      </div>
                    </div>
                    <span className="text-lg font-bold text-sky-400">{issue.issue_count}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No issue subcategories tagged yet.</p>
            )}
          </div>
        </Card>

        <Card className="bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-white">Top Request Subcategories</h3>
          <p className="text-xs text-slate-500">What players are asking to see next</p>
          <div className="mt-3 space-y-3">
            {productQuality.topRequestSubcategories.length ? (
              productQuality.topRequestSubcategories.slice(0, 5).map((request) => (
                <div key={request.subcategory} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{toTitleCase(request.sub_category || request.subcategory)}</p>
                      {request.request_snippets?.[0] && (
                        <p className="mt-1 text-xs text-slate-400">“{request.request_snippets[0]}”</p>
                      )}
                      <div className="mt-2 text-[11px] text-slate-400">
                        {request.request_count} request-tagged · {request.count} total tags
                      </div>
                    </div>
                    <span className="text-lg font-bold text-sky-300">{request.request_count}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No request subcategories tagged yet.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-white">Tagged Reviews by Category</h3>
          <div className="mt-3 h-56">
            {productQuality.categoryBreakdown.length ? (
              <Bar data={barData} options={barOptions} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No tagged subcategories yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-white">Version Signals</h3>
          <div className="mt-3 space-y-3 text-sm text-slate-200">
            {Object.entries(productQuality.versionInsights ?? {}).length ? (
              Object.entries(productQuality.versionInsights ?? {}).map(([version, insight]) => (
                <div key={version} className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{toTitleCase(version)}</p>
                  <p className="mt-1 text-sm text-white">
                    {Math.round((insight.recommendation_rate ?? 0) * 100)}% recommend · {insight.total_reviews ?? 0} reviews
                  </p>
                  {insight.top_issue_subcategories?.length ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Top issue: {toTitleCase(insight.top_issue_subcategories[0].subcategory)}
                    </p>
                  ) : null}
                  {insight.top_request_subcategories?.length ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Top request: {toTitleCase(insight.top_request_subcategories[0].subcategory)}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No version-specific insights yet.</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AudienceSection({ audience, theme }: { audience: AudienceView; theme: ThemeDefinition }) {
  const riskMetrics = [
    { label: "Refund risk", value: formatPercent(audience.risk.refund_risk ?? 0) },
    { label: "Core fan disappointment", value: formatPercent(audience.risk.core_fan_disappointment ?? 0) },
    { label: "Churn within 7 days", value: formatPercent(audience.risk.churn_rate ?? 0) },
  ];

  const purchaseSegments = [
    { label: "Steam buyers", data: audience.purchaseType.steam_buyers },
    { label: "Key users", data: audience.purchaseType.key_users },
    { label: "Free users", data: audience.purchaseType.free_users },
  ];

  const experienceSegments = [
    { label: "Newcomers", data: audience.experienceLevel.newcomers },
    { label: "Casual", data: audience.experienceLevel.casual },
    { label: "Experienced", data: audience.experienceLevel.experienced },
    { label: "Veterans", data: audience.experienceLevel.veterans },
  ];

  return (
    <Card variant="glass" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Audience Segments</h2>
          <p className="text-sm text-slate-400">Risk hotspots and behaviour across player cohorts</p>
        </div>
        <a href="#summary" className="text-xs text-slate-400 hover:text-slate-200">
          Back to summary
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {riskMetrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-white">Purchase pathways</h3>
          <div className="mt-3 space-y-3 text-sm text-slate-200">
            {purchaseSegments.map((segment) => (
              <div key={segment.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="font-medium text-white">{segment.label}</p>
                <p className="text-xs text-slate-400">
                  {segment.data.count} reviews · {formatPercent(segment.data.recommendation_rate ?? 0)} recommend
                </p>
                <p className="text-xs text-slate-400">
                  Feature request rate {formatPercent(segment.data.feature_request_rate ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-white">Experience cohorts</h3>
          <div className="mt-3 space-y-3 text-sm text-slate-200">
            {experienceSegments.map((segment) => (
              <div key={segment.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="font-medium text-white">{segment.label}</p>
                <p className="text-xs text-slate-400">
                  {segment.data.count} reviews · {segment.data.issue_count} issue-tagged
                </p>
                {segment.data.top_issues?.length ? (
                  <p className="text-xs text-slate-400">
                    Top issue: {toTitleCase(segment.data.top_issues[0].category)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-white">Highly engaged topics</h3>
          <AudienceTopicList label="100h+ players" topics={audience.engagementTopics.highly_engaged.top_topics} />
        </Card>
        <Card className="bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-white">Moderately engaged</h3>
          <AudienceTopicList label="10-100h players" topics={audience.engagementTopics.moderately_engaged.top_topics} />
        </Card>
        <Card className="bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-white">Low engagement</h3>
          <AudienceTopicList label="<10h players" topics={audience.engagementTopics.low_engagement.top_topics} />
        </Card>
      </div>
    </Card>
  );
}

function DrilldownPanel({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  selectedSubcategoryData,
  onOpenReviews,
}: {
  categories: CategoryGroupView[];
  selectedCategory: CategoryGroupView | undefined;
  onSelectCategory: (value: string | null) => void;
  selectedSubcategory: string | null;
  onSelectSubcategory: (value: string | null) => void;
  selectedSubcategoryData: SubcategoryView | undefined;
  onOpenReviews: (category: string, subcategoryKey?: string | null) => void;
}) {
  const issueTotal = selectedCategory?.subcategories.reduce((sum, item) => sum + item.issueCount, 0) ?? 0;
  const requestTotal = selectedCategory?.subcategories.reduce((sum, item) => sum + item.requestCount, 0) ?? 0;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">Category Navigator</h3>
        <p className="text-xs text-slate-400">Browse tagged categories extracted from player reviews</p>
        <ul className="mt-3 space-y-2">
          {categories.map((category) => {
            const isActive = category.category === selectedCategory?.category;
            return (
              <li key={category.category}>
                <button
                  onClick={() => onSelectCategory(category.category)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                    isActive
                      ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
                      : "border-white/10 bg-white/5 text-slate-200 hover:border-sky-500/30"
                  }`}
                >
                  <span>{toTitleCase(category.category)}</span>
                  <span className="text-xs text-slate-400">{category.total}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="bg-slate-900/50 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400">
            <a href="#summary" className="hover:text-slate-200">Overview</a> → {" "}
            <a href="#quality" className="hover:text-slate-200">Product Quality</a>
            {selectedCategory ? ` → ${toTitleCase(selectedCategory.category)}` : null}
            {selectedSubcategoryData ? ` → ${toTitleCase(selectedSubcategoryData.name)}` : null}
          </div>
          {selectedCategory && (
            <button
              onClick={() => onOpenReviews(selectedCategory.category, selectedSubcategory)}
              className="text-xs text-sky-300 hover:text-sky-200"
            >
              View in reviews →
            </button>
          )}
        </div>

        {selectedCategory ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{toTitleCase(selectedCategory.category)}</p>
                  <p className="mt-1 text-xs text-slate-400">Total tagged reviews across this category.</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-sky-400">{selectedCategory.total}</p>
                  <p className="text-xs text-slate-500">mentions</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
                {issueTotal > 0 && (
                  <span className="rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-rose-200">
                    {issueTotal} issues
                  </span>
                )}
                {requestTotal > 0 && (
                  <span className="rounded-full border border-sky-500/40 bg-sky-500/20 px-2 py-0.5 text-sky-200">
                    {requestTotal} requests
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Subcategories
              </p>
              <div className="mt-2 space-y-2">
                {selectedCategory.subcategories.map((subcategory) => {
                  const isActive = subcategory.key === selectedSubcategory;
                  return (
                    <button
                      key={subcategory.key}
                      onClick={() => onSelectSubcategory(subcategory.key)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
                        isActive
                          ? "border-indigo-400/60 bg-indigo-500/20 text-white"
                          : "border-white/10 bg-white/5 text-slate-300 hover:border-sky-500/40"
                      }`}
                    >
                      <span>{toTitleCase(subcategory.name)}</span>
                      <span>{subcategory.total}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedSubcategoryData && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Sample reviews</p>
                {(selectedSubcategoryData.issueSnippets.length > 0 || selectedSubcategoryData.requestSnippets.length > 0) && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] text-slate-300">
                    {selectedSubcategoryData.issueSnippets[0] && (
                      <p className="text-rose-200">Issue: “{selectedSubcategoryData.issueSnippets[0]}”</p>
                    )}
                    {selectedSubcategoryData.requestSnippets[0] && (
                      <p className="mt-2 text-sky-200">Request: “{selectedSubcategoryData.requestSnippets[0]}”</p>
                    )}
                  </div>
                )}
                {selectedSubcategoryData.reviews.slice(0, 4).map((review, idx) => (
                  <div key={String(review.review_id ?? idx)} className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
                    <div className="flex items-center justify-between">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        review.voted_up ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                      }`}>
                        {review.voted_up ? "Recommended" : "Not recommended"}
                      </span>
                      <span className="text-[10px] text-slate-400">{new Date(review.created_at ?? Date.now()).toLocaleDateString()}</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-200">
                      {truncate(review.review, 280)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">Select a category to explore related feedback.</p>
        )}
      </Card>
    </div>
  );
}

function RawReviewsSection({
  theme,
  showReviews,
  onToggle,
  sentimentFilter,
  onSentimentChange,
  featureFilter,
  onFeatureChange,
  categoryFilter,
  onCategoryChange,
  reviews,
  totalReviews,
}: {
  theme: ThemeDefinition;
  showReviews: boolean;
  onToggle: () => void;
  sentimentFilter: "all" | "positive" | "neutral" | "negative";
  onSentimentChange: (value: "all" | "positive" | "neutral" | "negative") => void;
  featureFilter: "all" | "feature" | "no_feature";
  onFeatureChange: (value: "all" | "feature" | "no_feature") => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  reviews: ReviewRow[];
  totalReviews: number;
}) {
  return (
    <Card variant="glass" className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Raw Reviews ({totalReviews})</h2>
          <p className="text-sm text-slate-400">Inspect classified reviews with quick filters</p>
        </div>
        <Button variant="secondary" onClick={onToggle}>
          {showReviews ? "Hide" : "Show"} Reviews
        </Button>
      </div>

      {showReviews && (
        <div className="space-y-4">
          <ReviewFilters
            sentimentFilter={sentimentFilter}
            onSentimentChange={onSentimentChange}
            featureFilter={featureFilter}
            onFeatureChange={onFeatureChange}
            categoryFilter={categoryFilter}
            onCategoryChange={onCategoryChange}
            theme={theme}
          />
          <ReviewsTable
            reviews={reviews.slice(0, 150)}
            helper={reviews.length ? `${reviews.length} reviews match the active filters` : "No reviews match the active filters"}
          />
        </div>
      )}
    </Card>
  );
}

function MultiSourceFeedbackSection({
  items,
  loading,
  error,
  onRefresh,
  sources,
  onToggleSource,
}: {
  items: FeedbackItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  sources: { steam: boolean; reddit: boolean; discord: boolean; steam_forum: boolean };
  onToggleSource: (key: keyof typeof sources) => void;
}) {
  const sourceLabels: Record<string, string> = {
    steam_review: "Steam Reviews",
    reddit: "Reddit",
    discord: "Discord",
    steam_forum: "Steam Forums",
  };

  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {});

  const sorted = [...items].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const chipClass = "rounded-full border px-3 py-1 text-xs transition";

  return (
    <Card variant="glass" className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Multi-Source Feedback</h2>
          <p className="text-sm text-slate-400">Steam reviews + community signals (deduped)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["steam", "Steam"],
          ["reddit", "Reddit"],
          ["discord", "Discord"],
          ["steam_forum", "Forums"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onToggleSource(key)}
            className={clsx(
              chipClass,
              sources[key] ? "border-sky-400/40 bg-sky-400/10 text-sky-100" : "border-slate-700 bg-slate-800 text-slate-400"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {loading && <p className="text-sm text-slate-300">Loading feedback…</p>}

      {!loading && !sorted.length && <p className="text-sm text-slate-500">No feedback available for the selected sources.</p>}

      {!loading && sorted.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            {Object.entries(counts).map(([source, count]) => (
              <span key={source} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {sourceLabels[source] ?? source}: {count}
              </span>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {sorted.slice(0, 12).map((item) => (
              <div key={item.feedback_id} className="space-y-2 rounded-xl border border-white/10 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-white">
                    {sourceLabels[item.source] ?? item.source}
                  </span>
                  {item.created_at && <span>{new Date(item.created_at).toLocaleDateString()}</span>}
                </div>
                <p className="text-sm text-slate-100">{truncate(item.text, 240)}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{item.author || "Unknown"}</span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300">
                      Open →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function AudienceTopicList({ label, topics }: { label: string; topics: { topic: string; count: number }[] }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <p className="text-xs text-slate-400">{label}</p>
      {topics && topics.length ? (
        topics.map((topic) => (
          <div key={topic.topic} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <span>{toTitleCase(topic.topic)}</span>
            <span className="text-slate-400">{topic.count}</span>
          </div>
        ))
      ) : (
        <p className="text-xs text-slate-500">No standout topics yet.</p>
      )}
    </div>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace("/", " / ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function truncate(value: string | undefined, length: number): string {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
