'use client';

import { useEffect, useMemo, useState } from "react";
import { fetchStarredGames, removeStarredGame } from "@/lib/api";
import { StarredGameDTO, SubcategoryInsight } from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { applyGlobalReviewFilters } from "@/lib/reviewFilters";
import { buildCategoryRates, buildSubcategoryInsights } from "@/lib/derivedInsights";
import { formatPercentage } from "@/utils/format";
import { getRecommendationColor } from "@/utils/colors";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
import { Radar, Bar } from "react-chartjs-2";

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
);

const MAX_SELECTION = 4;

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
  const { filters, filtersActive } = useGlobalFilters();
  const [starredGames, setStarredGames] = useState<StarredGameDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const games = await fetchStarredGames();
        setStarredGames(games);
        // Select up to 4 games by default
        const initialSelection = games.slice(0, Math.min(4, games.length)).map(g => g.app_id);
        setSelectedIds(initialSelection);
      } catch (err) {
        console.error("Failed to load starred games:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectedGames = useMemo(() => {
    return starredGames.filter((g) => selectedIds.includes(g.app_id));
  }, [starredGames, selectedIds]);

  function toggleGame(appId: number) {
    setSelectedIds((prev) => {
      if (prev.includes(appId)) {
        return prev.filter((id) => id !== appId);
      }
      if (prev.length >= MAX_SELECTION) {
        return prev;
      }
      return [...prev, appId];
    });
  }

  async function handleRemove(appId: number) {
    if (!confirm("Remove this game from starred?")) return;
    try {
      await removeStarredGame(appId);
      setStarredGames((prev) => prev.filter((g) => g.app_id !== appId));
      setSelectedIds((prev) => prev.filter((id) => id !== appId));
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

  if (starredGames.length === 0) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <EmptyState
            title="No games to compare"
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
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-10 sm:space-y-8">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
              Game Comparison
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Compare up to 4 games side-by-side - {selectedIds.length} selected
            {filtersActive ? " - global filters applied" : ""}
          </p>
        </div>

        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Select Games ({starredGames.length} available)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {starredGames.map((game) => {
              const isSelected = selectedIds.includes(game.app_id);
              const previewSample = applyGlobalReviewFilters(game.sample ?? [], filters);
              const previewRecommendation = previewSample.length
                ? previewSample.reduce((sum, review) => sum + (review.voted_up ? 1 : 0), 0) / previewSample.length
                : 0;
              return (
                <button
                  key={game.app_id}
                  onClick={() => toggleGame(game.app_id)}
                  className={`relative overflow-hidden rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-sky-500 bg-sky-500/10 shadow-lg shadow-sky-900/20"
                      : "border-white/10 bg-slate-900/30 hover:border-slate-600"
                  }`}
                >
                  <div className="aspect-video overflow-hidden rounded-lg">
                    <SteamImage
                      appId={game.app_id}
                      variant="header"
                      alt={game.name}
                      className="h-full w-full object-cover"
                      imageUrl={game.metadata.header_image}
                    />
                  </div>
                  <div className="mt-3">
                    <h3 className="line-clamp-1 text-sm font-semibold text-white">
                      {game.name}
                    </h3>
                    {game.sample?.length ? (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: getRecommendationColor(previewRecommendation) }}
                      >
                        {formatPercentage(previewRecommendation)} recommend{filtersActive ? " (filtered)" : ""}
                      </p>
                    ) : null}
                  </div>
                  {isSelected && (
                    <div className="absolute right-2 top-2 rounded-full bg-sky-500 px-2 py-1 text-xs font-bold text-white">
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
            title="Select at least 2 games"
            description="Pick 2-4 starred games to compare their category performance."
            variant="default"
          />
        ) : (
          <ComparisonDashboard games={selectedGames} onRemove={handleRemove} />
        )}
      </div>
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
  const { filters, filtersActive } = useGlobalFilters();
  const [sortBy, setSortBy] = useState<"difference" | "highest" | "lowest" | "reviews">("difference");
  const [showOnlySignificant, setShowOnlySignificant] = useState(false);

  const gameData = useMemo(() => {
    return games.map((game) => {
      const sample = game.sample ?? [];
      const filteredSample = applyGlobalReviewFilters(sample, filters);
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
      };
    });
  }, [games, filters]);

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

    // Apply filtering
    if (showOnlySignificant) {
      cats = cats.filter(cat => cat.rateDiff > 0.10); // >10% difference
    }

    // Apply sorting
    cats.sort((a, b) => {
      if (sortBy === "difference") {
        return b.rateDiff - a.rateDiff; // Highest difference first
      } else if (sortBy === "highest") {
        const maxA = Math.max(...a.perGame.map(g => g.rate ?? 0));
        const maxB = Math.max(...b.perGame.map(g => g.rate ?? 0));
        return maxB - maxA;
      } else if (sortBy === "lowest") {
        const minA = Math.min(...a.perGame.map(g => g.rate ?? 1).filter(r => r > 0));
        const minB = Math.min(...b.perGame.map(g => g.rate ?? 1).filter(r => r > 0));
        return minA - minB;
      } else if (sortBy === "reviews") {
        return b.totalTagged - a.totalTagged;
      }
      return 0;
    });

    return cats;
  }, [gameData, sortBy, showOnlySignificant]);

  const gridCols =
    games.length === 4 ? "grid-cols-4" :
    games.length === 3 ? "grid-cols-3" :
    games.length === 2 ? "grid-cols-2" : "grid-cols-1";

  // Radar chart data
  const radarChartData = useMemo(() => {
    const labels = CATEGORY_KEYS.map(key => MAIN_CATEGORY_LABELS[key] ?? key);
    const datasets = gameData.map((game, idx) => {
      const data = CATEGORY_KEYS.map(key => {
        const rate = game.categoryRates?.[key]?.rate ?? 0;
        return rate * 100; // Convert to percentage
      });

      const colors = [
        'rgba(96, 165, 250, 0.6)',   // blue
        'rgba(134, 239, 172, 0.6)',  // green
        'rgba(251, 146, 60, 0.6)',   // orange
        'rgba(244, 114, 182, 0.6)',  // pink
      ];

      return {
        label: game.name,
        data,
        backgroundColor: colors[idx % colors.length],
        borderColor: colors[idx % colors.length].replace('0.6', '1'),
        borderWidth: 2,
      };
    });

    return {
      labels,
      datasets,
    };
  }, [gameData]);

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: {
          stepSize: 20,
          color: '#cbd5f5',
          backdropColor: 'transparent',
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
        pointLabels: {
          color: '#cbd5f5',
          font: {
            size: 11,
          },
        },
      },
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#cbd5f5',
          padding: 15,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(148, 163, 184, 0.3)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.r.toFixed(1)}%`;
          }
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      <Card variant="glass" className="p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {gameData.map((game) => (
            <div
              key={game.appId}
              className="flex gap-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4"
            >
              <SteamImage
                appId={game.appId}
                variant="header"
                alt={game.name}
                className="h-20 w-32 rounded-xl object-cover"
                imageUrl={game.metadata.header_image}
              />
              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white line-clamp-1">{game.name}</h2>
                  <button
                    onClick={() => onRemove(game.appId)}
                    className="text-xs text-slate-400 hover:text-white"
                    title="Remove from starred"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  {filtersActive
                    ? `${game.filteredCount.toLocaleString()} / ${game.sampleCount.toLocaleString()} reviews match filters`
                    : `${game.sampleCount.toLocaleString()} reviews`}
                </p>
                <p
                  className="text-2xl font-semibold"
                  style={{ color: getRecommendationColor(game.recommendation) }}
                >
                  {formatPercentOrDash(game.recommendation)} recommend
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Radar Chart Overview */}
      <Card variant="glass" className="p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Category Overview</h3>
        <p className="text-sm text-slate-400 mb-4">Visual comparison across all categories</p>
        <div className="h-96">
          <Radar data={radarChartData} options={radarOptions} />
        </div>
      </Card>

      <Card variant="glass" className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Category recommendation</h3>
              <p className="mt-1 text-sm text-slate-400">Side-by-side rates and coverage per category</p>
            </div>
          </div>

          {/* Sort and Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-1.5 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                <option value="difference">Biggest Difference</option>
                <option value="highest">Highest Rating</option>
                <option value="lowest">Lowest Rating</option>
                <option value="reviews">Most Reviews</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlySignificant}
                onChange={(e) => setShowOnlySignificant(e.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-slate-950/40 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-xs text-slate-400">Only show significant differences (&gt;10%)</span>
            </label>

            {(showOnlySignificant || sortBy !== "difference") && (
              <button
                onClick={() => {
                  setSortBy("difference");
                  setShowOnlySignificant(false);
                }}
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            // Highlight if difference is >15%
            const isBigDifference = category.rateDiff > 0.15;

            return (
            <div
              key={category.key}
              className={`rounded-2xl border p-5 ${
                isBigDifference
                  ? "border-amber-500/50 bg-amber-900/10"
                  : "border-white/10 bg-slate-900/30"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      {category.label}
                    </p>
                    {isBigDifference && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        {(category.rateDiff * 100).toFixed(0)}% diff
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatCount(category.totalTagged)} tagged reviews
                  </p>
                </div>
                <div className={`grid gap-4 text-right ${gridCols}`}>
                  {category.perGame.map((game, idx) => {
                    const isWinner = category.winnerIndices.includes(idx) && category.winnerIndices.length < games.length;

                    return (
                    <div key={game.name} className="space-y-1 relative">
                      {isWinner && (
                        <div className="absolute -top-2 -right-2 text-xs">
                          🏆
                        </div>
                      )}
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 truncate">
                        {game.name.length > 12 ? game.name.substring(0, 12) + '...' : game.name}
                      </p>
                      <p
                        className="text-xl font-semibold"
                        style={{ color: getRecommendationColor(game.rate) }}
                      >
                        {formatPercentOrDash(game.rate)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatCount(game.count)} reviews
                      </p>
                    </div>
                  )})}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {category.subcategoryRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No tagged subcategories.</p>
                ) : (
                  category.subcategoryRows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                      <p className="text-sm text-slate-200">{row.label}</p>
                      <div className={`grid gap-4 text-right ${gridCols}`}>
                        {row.perGameMetrics.map((metric, idx) => {
                          const isSubWinner = row.winnerIndices.includes(idx) && row.winnerIndices.length < games.length;

                          return (
                          <div key={`${row.key}-${idx}`} className="relative">
                            {isSubWinner && (
                              <div className="absolute -top-1 -right-1 text-[10px]">
                                ⭐
                              </div>
                            )}
                            <p
                              className="text-sm font-semibold"
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
                    </div>
                  ))
                )}
              </div>
            </div>
          )})}
        </div>
      </Card>
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
