'use client';

import { useEffect, useMemo, useState } from "react";
import { fetchStarredGames, removeStarredGame, generateComparisonSummary } from "@/lib/api";
import { StarredGameDTO, SubcategoryInsight, GameComparisonData } from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { buildCategoryRates, buildSubcategoryInsights } from "@/lib/derivedInsights";
import { formatPercentage } from "@/utils/format";
import { getRecommendationColor } from "@/utils/colors";
import { useLanguage } from "@/contexts/LanguageContext";
import { OverviewComparisonCard } from "@/components/compare/OverviewComparisonCard";
import { ComparisonSummaryDisplay } from "@/components/compare/ComparisonSummaryDisplay";
import { BackButton } from "@/components/BackButton";
import { PageTransition } from "@/components/PageTransition";

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

export default function ComparePage() {
  const { t } = useLanguage();
  const [analyzedGames, setAnalyzedGames] = useState<StarredGameDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapCandidateId, setSwapCandidateId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const games = await fetchStarredGames();
        setAnalyzedGames(games);
        // Select 2 games by default
        const initialSelection = games.slice(0, Math.min(2, games.length)).map(g => g.app_id);
        setSelectedIds(initialSelection);
      } catch (err) {
        console.error("Failed to load analyzed games:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
      setAnalyzedGames((prev) => prev.filter((g) => g.app_id !== appId));
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
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-sky-500" />
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
          <BackButton />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h1 className="text-3xl font-bold">
                <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
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
                    {isSelected && (
                      <div className="absolute inset-0 bg-sky-500/20 flex items-center justify-center">
                        <div className="bg-sky-500 text-white rounded-full p-2">
                          <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
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

  const gameData = useMemo(() => {
    return games.map((game) => {
      const sample = game.sample ?? [];
      const filteredSample = sample;
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
        sample: sample,
      };
    });
  }, [games]);

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

  // Radar chart data
  return (
    <div className="space-y-8">
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
                      className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 transition-colors text-left"
                    >
                      <p className="text-xs text-slate-300 truncate">{row.label}</p>
                      <div className={`grid gap-2 ${gridCols} shrink-0`}>
                        {row.perGameMetrics.map((metric, idx) => {
                          const rates = row.perGameMetrics.map(m => m.rate ?? 0).filter(r => r > 0);
                          const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
                          const isHighest = (metric.rate ?? 0) === maxRate && maxRate > 0;

                          return (
                          <div key={`${row.key}-${idx}`} className={`px-1.5 py-0.5 rounded ${isHighest ? 'ring-1 ring-blue-400/50 bg-blue-500/10' : ''}`}>
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

      {/* Sample Reviews Modal */}
      {reviewsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => {
            setReviewsModal(null);
            setSubcategorySummary(null);
            setSummaryError(null);
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
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
                        const subcatReviews = filteredSample.filter((review: any) => {
                          const subcats = review.llm_subcategories || [];
                          return subcats.some((s: string) => normalizeSubcategoryKey({ subcategory: s } as any) === reviewsModal.subcategory);
                        }).slice(0, 15);

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
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all"
                >
                  {summaryLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base">✨</span>
                      <span>AI Comparison</span>
                      <span className="text-xs opacity-80">(2 credits)</span>
                    </>
                  )}
                </button>
              )}

              {summaryError && (
                <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg text-sm text-red-400">
                  ⚠️ {summaryError}
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

            <div className="space-y-4">
              {gameData.map((game) => {
                const filteredSample = game.sample ?? [];
                const exampleReviews = filteredSample
                  .filter((review: any) => {
                    const subcats = review.llm_subcategories || [];
                    return subcats.some((s: string) => normalizeSubcategoryKey({ subcategory: s } as any) === reviewsModal.subcategory);
                  })
                  .slice(0, 3); // Show up to 3 examples per game

                if (exampleReviews.length === 0) return null;

                return (
                  <div key={game.appId} className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
                    <h4 className="text-sm font-semibold text-sky-300 mb-3">{game.name}</h4>
                    <div className="space-y-3">
                      {exampleReviews.map((review: any, idx: number) => (
                        <div key={idx} className="rounded-lg bg-white/5 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs font-semibold ${review.voted_up ? 'text-green-400' : 'text-red-400'}`}>
                              {review.voted_up ? '👍 Positive' : '👎 Negative'}
                            </span>
                            <span className="text-xs text-slate-500">
                              • {review.author?.playtime_forever ? `${Math.floor((review.author.playtime_forever || 0) / 60)}h played` : 'No playtime data'}
                            </span>
                            {review.votes_up > 0 && (
                              <span className="text-xs text-slate-500">
                                • {review.votes_up} helpful
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-200 line-clamp-4">
                            {review.review || 'No review text'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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
