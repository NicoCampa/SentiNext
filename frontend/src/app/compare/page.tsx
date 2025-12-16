'use client';

import { useEffect, useState, useMemo } from "react";
import { Bar, Line, Radar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  RadialLinearScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import { fetchStarredGames, removeStarredGame } from "@/lib/api";
import { StarredGameDTO, TrendPoint, VersionInsight } from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { formatPercentage } from "@/utils/format";
import { hexToRgba } from "@/utils/colors";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, RadialLinearScale, PointElement, Tooltip, Legend);

const COLORS = [
  "#6366f1", // Indigo
  "#0ea5e9", // Sky
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Violet
];

export default function ComparePage() {
  const [starredGames, setStarredGames] = useState<StarredGameDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const games = await fetchStarredGames();
        setStarredGames(games);
        // Auto-select first 2 games
        if (games.length >= 2) {
          setSelectedIds([games[0].app_id, games[1].app_id]);
        } else if (games.length === 1) {
          setSelectedIds([games[0].app_id]);
        }
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
      if (prev.length >= 6) {
        return prev; // Max 6 games
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

  function downloadSummary() {
    const summary = selectedGames.map((g) => ({
      app_id: g.app_id,
      name: g.name,
      recommendation_rate: g.insights?.recommendation ?? 0,
      feature_request_rate: g.insights?.llm?.feature_request_rate ?? 0,
      critical_issues: g.insights?.llm?.critical_issues ?? 0,
      risk: g.insights?.risk ?? {},
      version_insights: g.insights?.version_insights ?? {},
    }));
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comparison-summary.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const trendOverlayData = useMemo(() => {
    const labelsSet = new Set<string>();
    selectedGames.forEach((game) => {
      (game.insights?.trend ?? []).forEach((t) => labelsSet.add(t.period));
    });
    const labels = Array.from(labelsSet).sort();
    const datasets = selectedGames.map((game, idx) => ({
      label: game.name,
      data: labels.map((period) => {
        const found = (game.insights?.trend ?? []).find((t) => t.period === period);
        return found ? Number((found.recommendation_rate * 100).toFixed(1)) : null;
      }),
      borderColor: COLORS[idx % COLORS.length],
      backgroundColor: hexToRgba(COLORS[idx % COLORS.length], 0.15),
      spanGaps: true,
    }));
    return { labels, datasets };
  }, [selectedGames]);

  const cohortSplits = useMemo(() => {
    return selectedGames.map((game) => {
      const vi = game.insights?.version_insights as Record<string, VersionInsight> | undefined;
      return {
        name: game.name,
        early_access: vi?.early_access?.recommendation_rate ?? 0,
        release: vi?.release?.recommendation_rate ?? 0,
      };
    });
  }, [selectedGames]);

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
            icon="⚖️"
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
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Game Comparison</h1>
          <p className="mt-1 text-sm text-slate-400">
            Compare up to 6 games side-by-side • {selectedIds.length} selected
          </p>
          {selectedGames.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                Print-friendly view
              </Button>
              <Button variant="secondary" onClick={downloadSummary}>
                Download JSON summary
              </Button>
            </div>
          )}
        </div>

        {/* Game Selection Grid */}
        <Card variant="glass" className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Select Games ({starredGames.length} available)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {starredGames.map((game) => {
              const isSelected = selectedIds.includes(game.app_id);
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
                    />
                  </div>
                  <div className="mt-3">
                    <h3 className="line-clamp-1 text-sm font-semibold text-white">
                      {game.name}
                    </h3>
                    {game.insights && (
                      <p className="mt-1 text-xs text-slate-400">
                        {formatPercentage(game.insights.recommendation)} recommend
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="absolute right-2 top-2 rounded-full bg-sky-500 px-2 py-1 text-xs font-bold text-white">
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Trend overlay */}
        {selectedGames.length > 0 && (
          <Card variant="glass" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Recommendation Trend Overlay</h2>
                <p className="text-sm text-slate-400">Weekly recommendation rates across selected games</p>
              </div>
            </div>
            <div className="mt-4">
              <Line
                data={{
                  labels: trendOverlayData.labels,
                  datasets: trendOverlayData.datasets,
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: "bottom", labels: { color: "#cbd5f5" } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue || "–"}%` } },
                  },
                  scales: {
                    x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
                    y: { ticks: { color: "#94a3b8", callback: (v) => `${v}%` }, grid: { color: "#1e293b" } },
                  },
                }}
              />
            </div>
          </Card>
        )}

        {/* Cohort split */}
        {selectedGames.length > 0 && (
          <Card variant="glass" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Early Access vs Release</h2>
                <p className="text-sm text-slate-400">Recommendation rates by build stage</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {cohortSplits.map((cohort, idx) => (
                <div key={cohort.name} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{cohort.name}</p>
                    <span className="text-[11px] text-slate-400">#{idx + 1}</span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div className="flex items-center justify-between">
                      <span>Early Access</span>
                      <span className="text-sky-300">{Math.round(cohort.early_access * 100)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Release</span>
                      <span className="text-emerald-300">{Math.round(cohort.release * 100)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Comparison */}
        {selectedGames.length === 0 ? (
          <EmptyState
            title="No games selected"
            description="Click on games above to add them to the comparison."
            icon="👆"
            variant="default"
          />
        ) : (
          <ComparisonView games={selectedGames} onRemove={handleRemove} />
        )}
      </div>
    </AppLayout>
  );
}

function ComparisonView({
  games,
  onRemove,
}: {
  games: StarredGameDTO[];
  onRemove: (appId: number) => void;
}) {
  // Prepare comparison data
  const metrics = useMemo(() => {
    return games.map((game, idx) => ({
      name: game.name,
      appId: game.app_id,
      color: COLORS[idx % COLORS.length],
      recommendation: game.insights?.recommendation || 0,
      positive: game.insights?.metrics.share_positive || 0,
      negative: game.insights?.metrics.share_negative || 0,
      featureRequests: game.insights?.llm?.feature_request_rate || 0,
      criticalIssues: game.insights?.llm?.critical_issues || 0,
      highPriority: game.insights?.llm?.high_priority || 0,
      refundRisk: game.insights?.risk?.refund_risk || 0,
      reviews: game.metadata.retrieved,
    }));
  }, [games]);

  return (
    <div className="space-y-8">
      {/* Quick Comparison Table */}
      <Card variant="glass" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Metric
                </th>
                {metrics.map((game) => (
                  <th
                    key={game.appId}
                    className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-400"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-12 w-20 overflow-hidden rounded">
                        <SteamImage
                          appId={game.appId}
                          variant="capsule"
                          alt={game.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="line-clamp-1">{game.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <MetricRow
                label="% Recommend"
                values={metrics.map((m) => formatPercentage(m.recommendation))}
                colors={metrics.map((m) => m.color)}
              />
              <MetricRow
                label="Critical Issues"
                values={metrics.map((m) => m.criticalIssues.toString())}
                colors={metrics.map((m) => m.color)}
                highlight="critical"
              />
              <MetricRow
                label="High Priority"
                values={metrics.map((m) => m.highPriority.toString())}
                colors={metrics.map((m) => m.color)}
                highlight="high"
              />
              <MetricRow
                label="Feature Requests"
                values={metrics.map((m) => formatPercentage(m.featureRequests))}
                colors={metrics.map((m) => m.color)}
              />
              <MetricRow
                label="Reviews Analyzed"
                values={metrics.map((m) => m.reviews.toString())}
                colors={metrics.map((m) => m.color)}
              />
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recommendation Comparison */}
        <Card variant="glass" className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Recommendation Rate</h3>
          <Bar
            data={{
              labels: metrics.map((m) => m.name),
              datasets: [
                {
                  label: "% Recommended",
                  data: metrics.map((m) => m.recommendation * 100),
                  backgroundColor: metrics.map((m) => hexToRgba(m.color, 0.8)),
                  borderColor: metrics.map((m) => m.color),
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: { color: "#e2e8f0" },
                  grid: { color: "rgba(148, 163, 184, 0.1)" },
                },
                x: { ticks: { color: "#e2e8f0" } },
              },
            }}
          />
        </Card>

        {/* Urgency Breakdown */}
        <Card variant="glass" className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Issue Urgency</h3>
          <Bar
            data={{
              labels: metrics.map((m) => m.name),
              datasets: [
                {
                  label: "Critical",
                  data: metrics.map((m) => m.criticalIssues),
                  backgroundColor: "#ef4444",
                },
                {
                  label: "High Priority",
                  data: metrics.map((m) => m.highPriority),
                  backgroundColor: "#f59e0b",
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: "#e2e8f0" } },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { color: "#e2e8f0" },
                  grid: { color: "rgba(148, 163, 184, 0.1)" },
                },
                x: { ticks: { color: "#e2e8f0" } },
              },
            }}
          />
        </Card>


        {/* Feature Requests */}
        <Card variant="glass" className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Feature Request Rate</h3>
          <Bar
            data={{
              labels: metrics.map((m) => m.name),
              datasets: [
                {
                  label: "% Reviews with Feature Requests",
                  data: metrics.map((m) => m.featureRequests * 100),
                  backgroundColor: metrics.map((m) => hexToRgba(m.color, 0.8)),
                  borderColor: metrics.map((m) => m.color),
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: { color: "#e2e8f0" },
                  grid: { color: "rgba(148, 163, 184, 0.1)" },
                },
                x: { ticks: { color: "#e2e8f0" } },
              },
            }}
          />
        </Card>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  values,
  colors,
  highlight,
}: {
  label: string;
  values: string[];
  colors: string[];
  highlight?: 'critical' | 'high';
}) {
  const getHighlightColor = () => {
    if (highlight === 'critical') return '#ef4444';
    if (highlight === 'high') return '#f59e0b';
    return undefined;
  };

  const highlightColor = getHighlightColor();

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-300">{label}</td>
      {values.map((value, idx) => (
        <td
          key={idx}
          className="px-4 py-3 text-center font-semibold text-white"
          style={{ color: highlightColor || colors[idx] }}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}
