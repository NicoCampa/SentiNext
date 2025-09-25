'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Bar, Line, Pie, Doughnut, Scatter } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import clsx from "clsx";

import {
  analyzeGame,
  fetchProgress,
  fetchStarredGames,
  removeStarredGame,
  saveStarredGame,
  searchGames,
} from "@/lib/api";
import {
  AnalyzeResponse,
  InsightsResponse,
  ProgressStatus,
  ReviewRow,
  SearchResult,
  StarredGame,
  StarredGamePayload,
  ThemeDefinition,
  TopicFrequency,
} from "@/types";

type AnalysisSummary = Omit<AnalyzeResponse, "reviews">;

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
);

const LANGUAGES = ["english", "all"];
const FETCH_LIMIT = 2000;
const FILTERS = [
  { value: "recent", label: "Newest first" },
  { value: "updated", label: "Most helpful" },
  { value: "all", label: "All (mixed)" },
];

const TABLE_HELPERS: Record<string, string> = {
  "Early access vs release":
    "Compares LLM-labelled sentiment and recommendation rates for reviews posted during Early Access versus after full launch.",
  "Steam purchase vs external":
    "Shows how sentiment shifts between verified Steam purchasers, external key activations, and reviewers who received the game for free.",
  "Playtime segments":
    "Buckets reviewers by lifetime playtime so you can contrast first-hour impressions, mid-term players, and long-term fans.",
  "Reviewer influence":
    "Contrasts sentiment between prolific reviewers (top decile by total Steam reviews written) and the broader audience.",
  "Veteran benchmarking":
    "Highlights how high-library owners react compared with smaller-library players, signalling franchise veteran sentiment.",
  "Market quality":
    "Maps sentiment for Steam purchasers versus those using external keys to surface perceived value and potential grey-market impact.",
};

const SAMPLE_LIMIT = 200;

const DEFAULT_THEME: ThemeDefinition = {
  name: "Midnight",
  gradient: ["#6366f1", "#0ea5e9", "#0b1120"],
  palette: {
    accent: "#6366f1",
    secondary: "#0ea5e9",
    positive: "#6366f1",
    neutral: "#cbd5f5",
    negative: "#fa8072",
    surface: "#0f172a",
    surface_alt: "#111c2e",
    border: "rgba(129,140,248,0.25)",
  },
};

interface FlashMessage {
  type: "success" | "error";
  message: string;
}

const DEFAULT_INSIGHTS: InsightsResponse | null = null;

function formatPercentage(value: number, fractionDigits = 0) {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith("rgba")) {
    return hex;
  }
  const cleanHex = hex.replace("#", "");
  const bigint = parseInt(cleanHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[0.65rem] uppercase tracking-[0.38em] text-slate-400">{title}</p>
      {subtitle ? <p className="text-xs text-slate-400/80">{subtitle}</p> : null}
    </div>
  );
}

function InfoIcon({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label="Toggle explanation"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] text-slate-200 transition hover:border-white/40 hover:text-white"
      >
        ⓘ
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-72 max-w-[18rem] rounded-lg border border-white/10 bg-slate-900/90 p-3 text-left text-xs leading-relaxed text-slate-200 shadow-[0_14px_30px_rgba(8,15,40,0.45)]">
          {text}
        </div>
      )}
    </div>
  );
}

function MetricsGrid({ insights, theme }: { insights: InsightsResponse; theme: ThemeDefinition }) {
  const llmMetrics = insights.llm ?? {
    pain_point_rate: 0,
    feature_request_rate: 0,
    avg_confidence: 0,
  };
  const cards = [
    {
      title: "% recommended",
      value: formatPercentage(insights.recommendation, 1),
      helper: "Percent of Steam reviewers who clicked the in-client 'Recommended' toggle.",
      accent: theme.palette.secondary,
    },
    {
      title: "% positive (LLM)",
      value: formatPercentage(insights.metrics.share_positive, 1),
      helper: "Share of reviews the local LLM classified as positive in tone.",
      accent: theme.palette.positive,
    },
    {
      title: "% negative (LLM)",
      value: formatPercentage(insights.metrics.share_negative, 1),
      helper: "Share of reviews the LLM tagged as negative, indicating friction or dissatisfaction.",
      accent: theme.palette.negative,
    },
    {
      title: "Avg. LLM score",
      value: insights.metrics.average_compound.toFixed(2),
      helper: "Mean sentiment score using the LLM label mapping (positive = +1, neutral = 0, negative = -1).",
      accent: theme.palette.accent,
    },
    {
      title: "Pain-point rate",
      value: formatPercentage(llmMetrics.pain_point_rate, 1),
      helper: "Portion of reviews where the LLM detected a concrete problem such as a bug, crash, or broken feature.",
      accent: theme.palette.negative,
    },
    {
      title: "Feature-request rate",
      value: formatPercentage(llmMetrics.feature_request_rate, 1),
      helper: "Percentage of reviews explicitly requesting a new feature or change.",
      accent: theme.palette.secondary,
    },
    {
      title: "LLM confidence",
      value: `${(llmMetrics.avg_confidence * 100).toFixed(0)}%`,
      helper: "Average confidence returned by the local LLM across the analysed reviews.",
      accent: theme.palette.accent,
    },
    {
      title: "Median playtime",
      value: `${insights.playtime.median_playtime_hours.toFixed(1)} h`,
      helper: "Median lifetime hours played (at review time) for the contributing reviewers.",
      accent: theme.palette.positive,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.title}
          title={card.title}
          value={card.value}
          helper={card.helper}
          theme={theme}
          accent={card.accent}
        />
      ))}
    </div>
  );
}

function ClipPath({ theme }: { theme: ThemeDefinition }) {
  const gradientId = `gradient-${theme.name.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          {theme.gradient.map((stop, index) => (
            <stop
              key={stop}
              offset={`${(index / Math.max(theme.gradient.length - 1, 1)) * 100}%`}
              stopColor={stop}
              stopOpacity={index === theme.gradient.length - 1 ? 0.35 : 0.55}
            />
          ))}
        </linearGradient>
      </defs>
      <path
        d="M-12 -12 L220 -18 Q300 130 120 230 L-30 250 Z"
        fill={`url(#${gradientId})`}
        opacity="0.55"
      />
      <path
        d="M310 -50 C440 10 360 150 260 190 C180 220 120 320 10 330"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.22"
        fill="none"
      />
      <circle cx="80" cy="300" r="95" fill={hexToRgba(theme.palette.secondary, 0.22)} />
      <circle cx="420" cy="90" r="140" fill={hexToRgba(theme.palette.accent, 0.2)} />
    </svg>
  );
}

function MetricCard({
  title,
  value,
  theme,
  helper,
  accent,
}: {
  title: string;
  value: string;
  theme: ThemeDefinition;
  helper?: string;
  accent?: string;
}) {
  const accentColor = accent ?? theme.palette.accent;
  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_24px_45px_rgba(8,15,40,0.45)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: `linear-gradient(160deg, ${hexToRgba(
          accentColor,
          0.35,
        )} 0%, ${hexToRgba(theme.palette.surface_alt, 0.85)} 85%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-300/70">{title}</p>
        {helper ? <InfoIcon text={helper} /> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function RiskPanel({ insights, theme }: { insights: InsightsResponse; theme: ThemeDefinition }) {
  const risk = insights.risk;

  const items = [
    {
      title: "Refund risk",
      value: formatPercentage(risk.refund_risk),
      helper: "Percent of negative reviews from players with under two hours played—potential Steam refund candidates.",
      tone:
        risk.refund_risk >= 0.4
          ? "#fa8072"
          : risk.refund_risk >= 0.2
          ? "#fbbf24"
          : "#6366f1",
      note:
        risk.refund_risk >= 0.4
          ? "High short-playtime dissatisfaction. Investigate onboarding."
          : risk.refund_risk >= 0.2
          ? "Moderate refund signals. Review early progression."
          : "Low refund pressure right now.",
    },
    {
      title: "Core fan disappointment",
      value: formatPercentage(risk.core_fan_disappointment),
      helper: "Negative-review share among players who have invested 50+ hours in the game.",
      tone:
        risk.core_fan_disappointment >= 0.25
          ? "#fa8072"
          : risk.core_fan_disappointment >= 0.1
          ? "#fbbf24"
          : "#6366f1",
      note:
        risk.core_fan_disappointment >= 0.25
          ? "Veterans are frustrated. Prioritise endgame/content fixes."
          : risk.core_fan_disappointment >= 0.1
          ? "Watch veteran sentiment trends."
          : "Long-term players remain satisfied.",
    },
    {
      title: "Churn risk",
      value: formatPercentage(risk.churn_rate),
      helper: "Share of negative reviews where the author last played within the default 7-day churn window.",
      tone:
        risk.churn_rate >= 0.35
          ? "#fa8072"
          : risk.churn_rate >= 0.2
          ? "#fbbf24"
          : "#6366f1",
      note:
        risk.churn_rate >= 0.35
          ? "Leaving players are unhappy. Consider re-engagement actions."
          : risk.churn_rate >= 0.2
          ? "Monitor post-update reactions closely."
          : "Low churn sentiment detected.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-2xl border p-4 shadow-[0_18px_35px_rgba(8,15,40,0.35)] backdrop-blur"
          style={{
            borderColor: hexToRgba(item.tone, 0.4),
            background: `linear-gradient(140deg, ${hexToRgba(item.tone, 0.25)} 0%, ${hexToRgba(
              theme.palette.surface_alt,
              0.9,
            )} 85%)`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-200/80">{item.title}</p>
            <InfoIcon text={item.helper} />
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          <p className="mt-3 text-sm text-slate-200/80">{item.note}</p>
        </div>
      ))}
    </div>
  );
}

function CohortDonuts({ insights, theme }: { insights: InsightsResponse; theme: ThemeDefinition }) {
  const segments = insights.segments;

  const charts = [
    {
      title: "Release stage",
      rows: segments.early_access_vs_release,
      helper: "Distribution of sentiment metrics for reviews written in Early Access compared to post-release updates.",
    },
    {
      title: "Purchase source",
      rows: segments.free_vs_paid,
      helper: "Breakdown of sentiment by purchase source: Steam store, external keys, or freebies.",
    },
  ];

  const palette = [
    theme.palette.accent,
    theme.palette.secondary,
    theme.palette.positive,
    theme.palette.neutral,
    theme.palette.negative,
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {charts.map((chart) => {
        const total = chart.rows.reduce((sum, row) => sum + Number(row.reviews ?? 0), 0);
        if (!total) {
          return (
            <div
              key={chart.title}
              className="rounded-2xl border p-5 text-sm text-slate-300 backdrop-blur"
              style={{
                borderColor: theme.palette.border,
                background: hexToRgba(theme.palette.surface_alt, 0.7),
              }}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-base font-semibold text-white">{chart.title}</h4>
                <InfoIcon text={chart.helper} />
              </div>
              <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
            </div>
          );
        }

        const labels = chart.rows.map((row) => String(row.segment ?? "Unknown"));
        const data = chart.rows.map((row) => Number(row.reviews ?? 0));
        const colors = labels.map((_, index) => hexToRgba(palette[index % palette.length], 0.85));

        return (
            <div
              key={chart.title}
              className="rounded-2xl border p-5 shadow-[0_20px_45px_rgba(8,15,40,0.45)] backdrop-blur"
              style={{
                borderColor: theme.palette.border,
                background: hexToRgba(theme.palette.surface_alt, 0.72),
              }}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-base font-semibold text-white">{chart.title}</h4>
                <InfoIcon text={chart.helper} />
              </div>
            <div className="mt-3 flex flex-col items-center gap-4 md:flex-row">
              <div className="h-40 w-40">
                <Doughnut
                  data={{
                    labels,
                    datasets: [
                      {
                        data,
                        backgroundColor: colors,
                        borderColor: colors.map((color) => hexToRgba(color, 0.9)),
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={{
                    plugins: {
                      legend: { display: false },
                    },
                  }}
                />
              </div>
              <div className="flex-1 space-y-2">
                {labels.map((label, index) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: colors[index] }}
                      />
                      <span className="text-slate-200">{label}</span>
                    </div>
                    <span className="text-slate-300/80">
                      {formatPercentage(data[index] / total)} ({data[index]})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlaytimeSentimentScatter({
  reviews,
  theme,
}: {
  reviews: ReviewRow[];
  theme: ThemeDefinition;
}) {
  if (!reviews.length) {
    return null;
  }

  const datasets = [
    {
      label: "Positive",
      color: theme.palette.positive,
      filter: (review: ReviewRow) => review.sentiment_label === "positive",
    },
    {
      label: "Neutral",
      color: theme.palette.neutral,
      filter: (review: ReviewRow) => review.sentiment_label === "neutral",
    },
    {
      label: "Negative",
      color: theme.palette.negative,
      filter: (review: ReviewRow) => review.sentiment_label === "negative",
    },
  ].map((group) => ({
    label: group.label,
    data: reviews
      .filter(group.filter)
      .map((review) => ({
        x: (review.author_playtime_forever ?? 0) / 60,
        y: review.sentiment_compound,
      })),
    backgroundColor: hexToRgba(group.color, 0.85),
  }));

  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_20px_45px_rgba(8,15,40,0.45)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.7),
      }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-white">Playtime vs sentiment</h4>
        <InfoIcon text="Each dot is a review: X-axis is lifetime hours played when posted, Y-axis is the LLM sentiment score (-1 to 1)." />
      </div>
      <div className="mt-4 h-64">
        <Scatter
          data={{ datasets }}
          options={{
            responsive: true,
            plugins: {
              legend: { position: "top", labels: { color: "#e2e8f0" } },
            },
            scales: {
              x: {
                title: { display: true, text: "Playtime (hours)", color: "#e2e8f0" },
                ticks: { color: "#e2e8f0" },
                grid: { color: "rgba(148, 163, 184, 0.15)" },
              },
              y: {
                min: -1,
                max: 1,
                title: { display: true, text: "Sentiment (compound)", color: "#e2e8f0" },
                ticks: { color: "#e2e8f0" },
                grid: { color: "rgba(148, 163, 184, 0.15)" },
              },
            },
          }}
        />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Use the quadrants to identify unhappy newcomers (low playtime, negative sentiment) versus frustrated veterans.
      </p>
    </div>
  );
}

function HelpfulHeatmap({ reviews, theme }: { reviews: ReviewRow[]; theme: ThemeDefinition }) {
  if (!reviews.length) {
    return null;
  }

  const helpfulBuckets = [
    { label: "0-2 votes", predicate: (v: number) => v <= 2 },
    { label: "3-10 votes", predicate: (v: number) => v > 2 && v <= 10 },
    { label: "10+ votes", predicate: (v: number) => v > 10 },
  ];

  const sentiments = ["positive", "neutral", "negative"];
  const matrix = helpfulBuckets.map((bucket) =>
    sentiments.map((sentiment) =>
      reviews.filter((review) =>
        bucket.predicate(review.votes_up ?? 0) && review.sentiment_label === sentiment,
      ).length,
    ),
  );

  const flat = matrix.flat();
  const maxValue = Math.max(...flat);

  const gradientColor = (value: number) => {
    if (maxValue === 0) return "rgba(148, 163, 184, 0.2)";
    const intensity = value / maxValue;
    return hexToRgba(theme.palette.accent, 0.2 + intensity * 0.6);
  };

  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_20px_45px_rgba(8,15,40,0.45)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.72),
      }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-white">Helpful votes vs sentiment</h4>
        <InfoIcon text="Shows how the LLM sentiment mix changes as helpful votes increase; darker cells indicate more reviews in that bucket." />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-300/80">
            <tr>
              <th className="px-3 py-2 font-medium">Helpful votes</th>
              {sentiments.map((sentiment) => (
                <th key={sentiment} className="px-3 py-2 font-medium capitalize">
                  {sentiment}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-100/90">
            {matrix.map((row, rowIndex) => (
              <tr key={helpfulBuckets[rowIndex].label} className="border-t border-white/5">
                <td className="px-3 py-2 text-slate-300/80">{helpfulBuckets[rowIndex].label}</td>
                {row.map((value, colIndex) => (
                  <td
                    key={sentiments[colIndex]}
                    className="px-3 py-2 text-center"
                    style={{
                      background: gradientColor(value),
                      borderRadius: "12px",
                    }}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonTrendOverlay({
  games,
  theme,
}: {
  games: [number, StarredGame][];
  theme: ThemeDefinition;
}) {
  const rawDatasets = games
    .map(([appid, game]) => {
      if (!game.insights?.trend?.length) {
        return null;
      }
      const colors = [theme.palette.accent, theme.palette.secondary, theme.palette.positive, theme.palette.negative];
      const color = colors[appid % colors.length];
      return {
        label: `${game.name}`,
        data: game.insights.trend.map((point) => ({
          x: point.period,
          y: point.recommendation_rate * 100,
        })),
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.25),
        tension: 0.3,
      };
    })
    .filter(Boolean) as { label: string; data: { x: string; y: number }[]; borderColor: string; backgroundColor: string; tension: number }[];

  if (!rawDatasets.length) {
    return null;
  }

  const allPeriods = Array.from(
    new Set(rawDatasets.flatMap((dataset) => dataset.data.map((point) => point.x))),
  ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const labels = allPeriods.map((period) => new Date(period).toLocaleDateString());
  const datasets = rawDatasets.map((dataset) => {
    const lookup = new Map(dataset.data.map((point) => [point.x, point.y]));
    return {
      ...dataset,
      data: allPeriods.map((period) => lookup.get(period) ?? null),
    };
  });

  return (
    <div
      className="rounded-3xl border p-6 shadow-[0_30px_60px_rgba(8,15,40,0.35)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.7),
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Trend overlay</h3>
        <InfoIcon text="Compare % recommended trajectories for selected games." />
      </div>
      <div className="mt-4 h-72">
        <Line
          data={{ labels, datasets }}
          options={{
            responsive: true,
            plugins: { legend: { position: "bottom", labels: { color: "#e2e8f0" } } },
            scales: {
              x: {
                ticks: { color: "#e2e8f0" },
                grid: { color: "rgba(148, 163, 184, 0.1)" },
              },
              y: {
                ticks: {
                  color: "#e2e8f0",
                  callback: (value: number) => `${value.toFixed(0)}%`,
                },
                grid: { color: "rgba(148, 163, 184, 0.1)" },
              },
            },
          }}
        />
      </div>
    </div>
  );
}


function TrendSection({
  insights,
  theme,
}: {
  insights: InsightsResponse;
  theme: ThemeDefinition;
}) {
  if (!insights.trend.length) {
    return (
      <div
        className="rounded-2xl border p-6"
        style={{
          borderColor: theme.palette.border,
          background: hexToRgba(theme.palette.surface_alt, 0.7),
        }}
      >
        <h3 className="text-lg font-semibold text-slate-100">Trend</h3>
        <p className="mt-2 text-sm text-slate-400">Not enough timestamped reviews to render the trend.</p>
      </div>
    );
  }

  const labels = insights.trend.map((point) => new Date(point.period).toLocaleDateString());

  const chartData = {
    labels,
    datasets: [
      {
        label: "% recommended",
        data: insights.trend.map((point) => point.recommendation_rate * 100),
        borderColor: theme.palette.accent,
        backgroundColor: hexToRgba(theme.palette.accent, 0.25),
        tension: 0.32,
        yAxisID: "y",
      },
      {
        label: "Avg. compound",
        data: insights.trend.map((point) => point.avg_compound),
        borderColor: theme.palette.secondary,
        backgroundColor: hexToRgba(theme.palette.secondary, 0.25),
        tension: 0.32,
        yAxisID: "y1",
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        position: "left" as const,
        ticks: {
          callback: (value: number) => `${value.toFixed(0)}%`,
          color: "#cbd5f5",
        },
        grid: { color: hexToRgba(theme.palette.accent, 0.1) },
      },
      y1: {
        position: "right" as const,
        ticks: {
          callback: (value: number) => value.toFixed(2),
          color: "#a5b4fc",
        },
        grid: { drawOnChartArea: false },
      },
      x: {
        ticks: { color: "#cbd5f5" },
        grid: { color: hexToRgba(theme.palette.accent, 0.08) },
      },
    },
    plugins: {
      legend: {
        labels: { color: "#e2e8f0" },
      },
    },
  };

  const sentimentCounts = insights.sentiment_counts;

  const pieData = {
    labels: sentimentCounts.map((item) => item.sentiment),
    datasets: [
      {
        data: sentimentCounts.map((item) => item.count),
        backgroundColor: [
          theme.palette.positive,
          theme.palette.neutral,
          theme.palette.negative,
        ],
      },
    ],
  };

  const confidenceTrend = insights.confidence_trend ?? [];
  const showConfidenceTrend = confidenceTrend.length > 0;

  const confidenceData = showConfidenceTrend
    ? {
        labels: confidenceTrend.map((point) => new Date(point.period).toLocaleDateString()),
        datasets: [
          {
            label: "Pain-point rate",
            data: confidenceTrend.map((point) => point.pain_point_rate * 100),
            borderColor: theme.palette.negative,
            backgroundColor: hexToRgba(theme.palette.negative, 0.25),
            tension: 0.3,
            yAxisID: "y",
          },
          {
            label: "Feature-request rate",
            data: confidenceTrend.map((point) => point.feature_request_rate * 100),
            borderColor: theme.palette.secondary,
            backgroundColor: hexToRgba(theme.palette.secondary, 0.25),
            tension: 0.3,
            yAxisID: "y",
          },
          {
            label: "LLM confidence",
            data: confidenceTrend.map((point) => point.avg_confidence * 100),
            borderColor: theme.palette.accent,
            backgroundColor: hexToRgba(theme.palette.accent, 0.2),
            tension: 0.3,
            yAxisID: "y1",
          },
        ],
      }
    : null;

  const confidenceOptions = showConfidenceTrend
    ? {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            position: "left" as const,
            ticks: {
              color: "#cbd5f5",
              callback: (value: number) => `${value.toFixed(0)}%`,
            },
            grid: { color: hexToRgba(theme.palette.accent, 0.08) },
          },
          y1: {
            position: "right" as const,
            ticks: {
              color: "#a5b4fc",
              callback: (value: number) => `${value.toFixed(0)}%`,
            },
            grid: { drawOnChartArea: false },
          },
          x: {
            ticks: { color: "#cbd5f5" },
            grid: { color: hexToRgba(theme.palette.accent, 0.06) },
          },
        },
        plugins: {
          legend: {
            labels: { color: "#e2e8f0" },
          },
        },
      }
    : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div
        className="h-80 rounded-2xl border p-6 shadow-[0_30px_60px_rgba(8,15,40,0.38)] backdrop-blur"
        style={{
          borderColor: theme.palette.border,
          background: hexToRgba(theme.palette.surface_alt, 0.7),
        }}
      >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Trend</h3>
        <InfoIcon text="Tracks % Recommended (Steam toggle) and the LLM sentiment score over time using 7-day buckets." />
      </div>
        <div className="mt-4 h-64">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
      <div
        className="rounded-2xl border p-6 shadow-[0_30px_60px_rgba(8,15,40,0.38)] backdrop-blur"
        style={{
          borderColor: theme.palette.border,
          background: hexToRgba(theme.palette.surface_alt, 0.7),
        }}
      >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Sentiment mix</h3>
        <InfoIcon text="Pie chart of positive, neutral, and negative labels assigned by the on-device LLM." />
      </div>
        <div className="mt-4">
          <Pie data={pieData} />
        </div>
      </div>
      {showConfidenceTrend && confidenceData && confidenceOptions ? (
        <div
          className="rounded-2xl border p-6 shadow-[0_30px_60px_rgba(8,15,40,0.38)] backdrop-blur"
          style={{
            borderColor: theme.palette.border,
            background: hexToRgba(theme.palette.surface_alt, 0.7),
          }}
        >
          <h3 className="text-lg font-semibold text-slate-100">LLM confidence & issue rate</h3>
          <div className="mt-4 h-64">
            <Line data={confidenceData} options={confidenceOptions} />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Confidence traces the LLM self-reported certainty (right axis); pain-point and feature-request lines show the % of reviews per 7-day window (left axis).
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Table({
  title,
  rows,
  theme,
  helper,
}: {
  title: string;
  rows: Record<string, unknown>[];
  theme: ThemeDefinition;
  helper?: string;
}) {
  if (!rows.length) {
    return null;
  }

  const headers = Object.keys(rows[0]);

  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_20px_45px_rgba(8,15,40,0.45)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.7),
      }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-white">{title}</h4>
        {helper ? (
          <InfoIcon text={helper} />
        ) : null}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-xs md:text-sm">
          <thead className="text-slate-300/80">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-100/90">
            {rows.map((row, idx) => (
              <tr key={idx} className="border-t border-white/5">
                {headers.map((header) => (
                  <td key={header} className="px-3 py-2">
                    {formatValue(row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "number") {
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value ?? "-");
}

function TopicsSection({
  insights,
  theme,
  activeTopic,
  onSelectTopic,
}: {
  insights: InsightsResponse;
  theme: ThemeDefinition;
  activeTopic: string;
  onSelectTopic: (topic: string) => void;
}) {
  const overall = insights.topics.overall ?? [];
  const positiveRows = insights.topics.positive.map((row) => ({
    Topic: row.topic,
    Mentions: row.count,
    "Positive share": formatPercentage(row.share_positive ?? 0, 1),
    "Pain-point rate": formatPercentage(row.pain_point_rate ?? 0, 1),
    "Feature requests": formatPercentage(row.feature_request_rate ?? 0, 1),
  }));

  const negativeRows = insights.topics.negative.map((row) => ({
    Topic: row.topic,
    Mentions: row.count,
    "Negative share": formatPercentage(row.share_negative ?? 0, 1),
    "Pain-point rate": formatPercentage(row.pain_point_rate ?? 0, 1),
    "Feature requests": formatPercentage(row.feature_request_rate ?? 0, 1),
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <TopicFrequencyChart
        topics={overall}
        theme={theme}
        activeTopic={activeTopic}
        onSelectTopic={onSelectTopic}
      />
      <div className="space-y-6">
      <TopicTable
        title="Most positive topics"
        rows={positiveRows}
        theme={theme}
        topicKey="Topic"
        activeTopic={activeTopic}
        onSelectTopic={onSelectTopic}
        helper="Topics where the LLM sees the highest proportion of positive reviews, along with pain-point and feature-request rates."
      />
      <TopicTable
        title="Most negative topics"
        rows={negativeRows}
        theme={theme}
        topicKey="Topic"
        activeTopic={activeTopic}
        onSelectTopic={onSelectTopic}
        helper="Topics most frequently tied to negative LLM sentiment—useful for spotting friction clusters."
      />
      </div>
    </div>
  );
}

function TopicFrequencyChart({
  topics,
  theme,
  activeTopic,
  onSelectTopic,
}: {
  topics: TopicFrequency[];
  theme: ThemeDefinition;
  activeTopic: string;
  onSelectTopic: (topic: string) => void;
}) {
  if (!topics.length) {
    return (
      <div
        className="rounded-2xl border p-5"
        style={{
          borderColor: theme.palette.border,
          background: hexToRgba(theme.palette.surface_alt, 0.7),
        }}
      >
        <h4 className="text-base font-semibold text-white">LLM topic hotspots</h4>
        <p className="mt-2 text-sm text-slate-400">No LLM topic data yet.</p>
      </div>
    );
  }

  const labels = topics.map((row) => row.topic);
  const counts = topics.map((row) => row.count);
  const backgrounds = topics.map((row) =>
    hexToRgba(
      theme.palette.accent,
      row.topic === activeTopic || activeTopic === "all" ? 0.9 : 0.55,
    ),
  );
  const borders = topics.map((row) =>
    row.topic === activeTopic ? theme.palette.accent : hexToRgba(theme.palette.accent, 0.5),
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Mentions",
        data: counts,
        backgroundColor: backgrounds,
        borderColor: borders,
        borderWidth: 1.5,
        hoverBackgroundColor: hexToRgba(theme.palette.accent, 1),
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          afterBody: (items: { dataIndex: number }[]) => {
            const index = items[0]?.dataIndex ?? 0;
            const topic = topics[index];
            const share = formatPercentage(topic.share ?? 0, 1);
            const pain = formatPercentage(topic.pain_point_rate ?? 0, 1);
            const feature = formatPercentage(topic.feature_request_rate ?? 0, 1);
            return [`Share: ${share}`, `Pain points: ${pain}`, `Feature reqs: ${feature}`];
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#e2e8f0" },
        grid: { display: false },
      },
      y: {
        ticks: { color: "#e2e8f0" },
        grid: { color: "rgba(148,163,184,0.15)" },
      },
    },
    onClick: (_: unknown, elements: any[]) => {
      if (!elements.length) return;
      const index = elements[0].index;
      const topic = topics[index].topic;
      onSelectTopic(topic === activeTopic ? "all" : topic);
    },
  } as const;

  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_24px_45px_rgba(8,15,40,0.45)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.72),
      }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-white">LLM topic hotspots</h4>
        <InfoIcon text="Most-mentioned topics detected by the LLM; click a bar to focus filters and tables on that topic." />
      </div>
      <div className="mt-4 h-72">
        <Bar data={data} options={options} />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Click a bar to focus on that topic in the review list and tables.
      </p>
    </div>
  );
}

function TopicTable({
  title,
  rows,
  theme,
  helper,
  topicKey = "Topic",
  activeTopic,
  onSelectTopic,
}: {
  title: string;
  rows: Array<Record<string, string | number>>;
  theme: ThemeDefinition;
  helper?: string;
  topicKey?: string;
  activeTopic?: string;
  onSelectTopic?: (topic: string) => void;
}) {
  if (!rows.length) {
    return (
      <div
        className="rounded-2xl border p-5"
        style={{
          borderColor: theme.palette.border,
          background: hexToRgba(theme.palette.surface_alt, 0.7),
        }}
      >
        <h4 className="text-base font-semibold text-white">{title}</h4>
        <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
      </div>
    );
  }

  const headers = Object.keys(rows[0]);

  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_20px_45px_rgba(8,15,40,0.45)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.7),
      }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-white">{title}</h4>
        {helper ? (
          <InfoIcon text={helper} />
        ) : null}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs md:text-sm">
          <thead className="text-slate-300/80">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-100/90">
            {rows.map((row, index) => {
              const topicValue = topicKey ? String(row[topicKey] ?? "") : "";
              const isActive = topicValue && activeTopic && topicValue === activeTopic;
              const clickable = Boolean(onSelectTopic && topicValue);
              return (
                <tr
                  key={`${topicValue}-${index}`}
                  className={clsx(
                    "border-t border-white/5 transition",
                    clickable && "cursor-pointer",
                    isActive ? "bg-white/10" : "hover:bg-white/5",
                  )}
                  onClick={() => {
                    if (!clickable) return;
                    onSelectTopic?.(isActive ? "all" : topicValue);
                  }}
                >
                  {headers.map((header) => (
                    <td key={header} className="px-3 py-2">
                      {formatValue(row[header])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewFilters({
  sentimentFilter,
  onSentimentChange,
  painFilter,
  onPainChange,
  featureFilter,
  onFeatureChange,
  topicFilter,
  onTopicChange,
  topics,
  theme,
}: {
  sentimentFilter: "all" | "positive" | "neutral" | "negative";
  onSentimentChange: (value: "all" | "positive" | "neutral" | "negative") => void;
  painFilter: "all" | "pain" | "no_pain";
  onPainChange: (value: "all" | "pain" | "no_pain") => void;
  featureFilter: "all" | "feature" | "no_feature";
  onFeatureChange: (value: "all" | "feature" | "no_feature") => void;
  topicFilter: string;
  onTopicChange: (value: string) => void;
  topics: string[];
  theme: ThemeDefinition;
}) {
  const sentimentOptions = [
    { value: "all", label: "All" },
    { value: "positive", label: "Positive" },
    { value: "neutral", label: "Neutral" },
    { value: "negative", label: "Negative" },
  ] as const;

  const painOptions = [
    { value: "all", label: "All" },
    { value: "pain", label: "Pain points" },
    { value: "no_pain", label: "No pain" },
  ] as const;

  const featureOptions = [
    { value: "all", label: "All" },
    { value: "feature", label: "Feature requests" },
    { value: "no_feature", label: "No feature" },
  ] as const;

  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_18px_35px_rgba(8,15,40,0.35)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.65),
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
          Review filters
        </h3>
        <button
          className="text-xs text-slate-300 transition hover:text-white"
          onClick={() => {
            onSentimentChange("all");
            onPainChange("all");
            onFeatureChange("all");
            onTopicChange("all");
          }}
        >
          Reset
        </button>
      </div>

      <div className="mt-4 space-y-4 text-xs uppercase tracking-[0.2em] text-slate-300">
        <div className="space-y-2">
          <p className="text-[0.65rem] text-slate-400">Sentiment</p>
          <div className="flex flex-wrap gap-2">
            {sentimentOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onSentimentChange(option.value)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[0.65rem] transition",
                  sentimentFilter === option.value
                    ? "border-indigo-400 bg-indigo-500/80 text-white shadow-lg shadow-indigo-900/40"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-indigo-400/50 hover:text-white",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[0.65rem] text-slate-400">Pain points</p>
          <div className="flex flex-wrap gap-2">
            {painOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onPainChange(option.value)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[0.65rem] transition",
                  painFilter === option.value
                    ? "border-amber-400 bg-amber-400/90 text-slate-900 shadow-lg shadow-amber-900/40"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-amber-400/40 hover:text-white",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[0.65rem] text-slate-400">Feature requests</p>
          <div className="flex flex-wrap gap-2">
            {featureOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onFeatureChange(option.value)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[0.65rem] transition",
                  featureFilter === option.value
                    ? "border-sky-400 bg-sky-500/90 text-white shadow-lg shadow-sky-900/40"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/50 hover:text-white",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[0.65rem] text-slate-400">Topic focus</p>
          <select
            value={topicFilter}
            onChange={(event) => onTopicChange(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[0.7rem] text-white shadow-inner shadow-black/30 focus:border-indigo-400 focus:outline-none"
          >
            <option value="all">All topics</option>
            {topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function ReviewsTable({ reviews, helper }: { reviews: ReviewRow[]; helper?: string }) {
  if (!reviews.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/5 p-5 text-sm text-slate-300 backdrop-blur">
        <h3 className="text-lg font-semibold text-white">Raw review sample</h3>
        <p className="mt-2 text-sm text-slate-400">
          No reviews match the current filters. Adjust the filters or fetch more data to see rows here.
        </p>
      </div>
    );
  }

  const columns = [
    "llm_sentiment",
    "llm_confidence",
    "llm_pain_point",
    "llm_feature_request",
    "llm_topics",
    "votes_up",
    "author_playtime_hours",
    "author_recent_playtime_hours",
    "review",
  ];

  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-5 shadow-[0_18px_35px_rgba(8,15,40,0.35)] backdrop-blur">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Raw review sample</h3>
        {helper ? (
          <InfoIcon text={helper} />
        ) : null}
      </div>
      <div className="mt-4 max-h-96 overflow-y-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-900 text-slate-300/80">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 font-medium capitalize">
                  {column.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-100/90">
            {reviews.map((review) => (
              <tr
                key={String(review.review_id ?? Math.random())}
                className="border-t border-white/5 align-top"
              >
                {columns.map((column) => (
                  <td key={column} className="px-3 py-2">
                    {formatValue((review as Record<string, unknown>)[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonView({
  games,
  theme,
}: {
  games: [number, StarredGame][];
  theme: ThemeDefinition;
}) {
  if (!games.length) {
    return null;
  }

  const comparisonRows = games.map(([appid, game]) => ({
    appid,
    name: game.name,
    avg_compound: game.insights?.metrics.average_compound ?? 0,
    positive: game.insights?.metrics.share_positive ?? 0,
    negative: game.insights?.metrics.share_negative ?? 0,
    recommended: game.insights?.recommendation ?? 0,
    median_playtime: game.insights?.playtime.median_playtime_hours ?? 0,
    refund_risk: game.insights?.risk.refund_risk ?? 0,
    core_fan: game.insights?.risk.core_fan_disappointment ?? 0,
  }));

  const tableHeaders = [
    "Game",
    "Avg compound",
    "% positive",
    "% negative",
    "% recommended",
    "Median playtime (h)",
    "Refund risk %",
    "Core-fan disappointment %",
  ];

  const barData = {
    labels: comparisonRows.map((row) => row.name),
    datasets: [
      {
        label: "% recommended",
        data: comparisonRows.map((row) => row.recommended * 100),
        backgroundColor: hexToRgba(theme.palette.accent, 0.85),
      },
    ],
  };

  const scatterData = {
    datasets: [
      {
        label: "Playtime vs % recommended",
        data: comparisonRows.map((row) => ({
          x: row.median_playtime,
          y: row.recommended * 100,
          appid: row.appid,
          name: row.name,
        })),
        backgroundColor: hexToRgba(theme.palette.secondary, 0.85),
        pointRadius: 6,
        showLine: false,
      },
    ],
  };

  return (
    <div
      className="space-y-6 rounded-3xl border p-6 shadow-[0_30px_60px_rgba(8,15,40,0.35)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.72),
      }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xl font-semibold text-white">Comparison</h3>
        <span className="text-xs uppercase tracking-[0.3em] text-slate-300/75">
          {games.length} games selected
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-300/75">
            <tr>
              {tableHeaders.map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-100/90">
            {comparisonRows.map((row) => (
              <tr key={row.appid} className="border-t border-white/5">
                <td className="px-3 py-2 font-medium text-white">{row.name}</td>
                <td className="px-3 py-2">{row.avg_compound.toFixed(2)}</td>
                <td className="px-3 py-2">{formatPercentage(row.positive)}</td>
                <td className="px-3 py-2">{formatPercentage(row.negative)}</td>
                <td className="px-3 py-2">{formatPercentage(row.recommended)}</td>
                <td className="px-3 py-2">{row.median_playtime.toFixed(1)}</td>
                <td className="px-3 py-2">{formatPercentage(row.refund_risk)}</td>
                <td className="px-3 py-2">{formatPercentage(row.core_fan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div
          className="rounded-2xl border p-4 shadow-[0_25px_45px_rgba(8,15,40,0.35)] backdrop-blur"
          style={{
            borderColor: theme.palette.border,
            background: hexToRgba(theme.palette.surface_alt, 0.68),
          }}
        >
          <Bar
            data={barData}
            options={{
              responsive: true,
              plugins: { legend: { labels: { color: "#e2e8f0" } } },
              scales: {
                x: { ticks: { color: "#e2e8f0" } },
                y: {
                  ticks: {
                    color: "#e2e8f0",
                    callback: (value: number) => `${value.toFixed(0)}%`,
                  },
                  grid: { color: "rgba(148, 163, 184, 0.15)" },
                },
              },
            }}
          />
        </div>
        <div
          className="rounded-2xl border p-4 shadow-[0_25px_45px_rgba(8,15,40,0.35)] backdrop-blur"
          style={{
            borderColor: theme.palette.border,
            background: hexToRgba(theme.palette.surface_alt, 0.68),
          }}
        >
          <Line
            data={scatterData}
            options={{
              responsive: true,
              showLine: false,
              scales: {
                x: {
                  title: { display: true, text: "Median playtime (h)", color: "#e2e8f0" },
                  ticks: { color: "#e2e8f0" },
                  grid: { color: "rgba(148, 163, 184, 0.15)" },
                },
                y: {
                  title: { display: true, text: "% recommended", color: "#e2e8f0" },
                  ticks: {
                    color: "#e2e8f0",
                    callback: (value: number) => `${value.toFixed(0)}%`,
                  },
                },
              },
              plugins: { legend: { labels: { color: "#e2e8f0" } } },
            }}
          />
        </div>
      </div>
    </div>
  );
}

function RiskSummary({
  insights,
  theme,
}: {
  insights: InsightsResponse;
  theme: ThemeDefinition;
}) {
  const risk = insights.risk;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <MetricCard title="Refund risk" value={formatPercentage(risk.refund_risk)} theme={theme} />
      <MetricCard
        title="Core fan disappointment"
        value={formatPercentage(risk.core_fan_disappointment)}
        theme={theme}
      />
      <MetricCard title="Churn risk" value={formatPercentage(risk.churn_rate)} theme={theme} />
    </div>
  );
}

function InsightsView({
  analysis,
  gameName,
  theme,
  sampleReviews,
  filteredReviews,
  sentimentFilter,
  onSentimentChange,
  painFilter,
  onPainChange,
  featureFilter,
  onFeatureChange,
  topicFilter,
  onTopicChange,
}: {
  analysis: AnalysisSummary;
  gameName: string;
  theme: ThemeDefinition;
  sampleReviews: ReviewRow[];
  filteredReviews: ReviewRow[];
  sentimentFilter: "all" | "positive" | "neutral" | "negative";
  onSentimentChange: (value: "all" | "positive" | "neutral" | "negative") => void;
  painFilter: "all" | "pain" | "no_pain";
  onPainChange: (value: "all" | "pain" | "no_pain") => void;
  featureFilter: "all" | "feature" | "no_feature";
  onFeatureChange: (value: "all" | "feature" | "no_feature") => void;
  topicFilter: string;
  onTopicChange: (value: string) => void;
}) {
  if (!analysis.insights) {
    return (
      <div
        className="rounded-3xl border p-8 text-sm text-slate-200 backdrop-blur"
        style={{
          borderColor: theme.palette.border,
          background: hexToRgba(theme.palette.surface_alt, 0.72),
        }}
      >
        No reviews returned. Try increasing the review count or switching languages.
      </div>
    );
  }

  const insights = analysis.insights;
  const topicOptions = insights.topic_catalog ?? [];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-300/80">Snapshot</p>
          <h2 className="mt-1 text-3xl font-semibold text-white">{gameName}</h2>
          <p className="text-sm text-slate-300/80">
            {analysis.metadata.retrieved} reviews • Language {analysis.metadata.language} • fetched {" "}
            {new Date(analysis.metadata.fetched_at).toLocaleString()}
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-200/80 backdrop-blur">
          AppID {analysis.metadata.app_id}
        </div>
      </div>

      <section className="space-y-6">
        <SectionTitle
          title="Sentiment pulse"
          subtitle="LLM-powered KPIs summarising the current state of player sentiment."
        />
        <MetricsGrid insights={insights} theme={theme} />
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="Risk signals"
          subtitle="Identify where dissatisfaction could translate into refunds or churn."
        />
        <RiskPanel insights={insights} theme={theme} />
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="Audience cohorts"
          subtitle="Understand how sentiment varies across release phase and purchase source."
        />
        <CohortDonuts insights={insights} theme={theme} />
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="Review diagnostics"
          subtitle="Visualise playtime sentiment distribution and helpful vote patterns."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <PlaytimeSentimentScatter reviews={sampleReviews} theme={theme} />
          <HelpfulHeatmap reviews={sampleReviews} theme={theme} />
        </div>
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="Momentum & mix"
          subtitle="Track trends in recommendation rate, LLM sentiment, and confidence over time."
        />
        <TrendSection insights={insights} theme={theme} />
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="Segments & sources"
          subtitle="Break down sentiment by lifecycle stage, playtime cohort, and reviewer influence."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <Table
            title="Early access vs release"
            rows={insights.segments.early_access_vs_release}
            theme={theme}
            helper={TABLE_HELPERS["Early access vs release"]}
          />
          <Table
            title="Steam purchase vs external"
            rows={insights.segments.free_vs_paid}
            theme={theme}
            helper={TABLE_HELPERS["Steam purchase vs external"]}
          />
        </div>
        <Table
          title="Playtime segments"
          rows={insights.segments.playtime_buckets}
          theme={theme}
          helper={TABLE_HELPERS["Playtime segments"]}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <Table
            title="Reviewer influence"
            rows={insights.audience.reviewer_influence}
            theme={theme}
            helper={TABLE_HELPERS["Reviewer influence"]}
          />
          <Table
            title="Veteran benchmarking"
            rows={insights.audience.veteran_benchmarking}
            theme={theme}
            helper={TABLE_HELPERS["Veteran benchmarking"]}
          />
        </div>
        <Table
          title="Market quality"
          rows={insights.audience.market_quality}
          theme={theme}
          helper={TABLE_HELPERS["Market quality"]}
        />
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="LLM topic intelligence"
          subtitle="Drill into themes the classifier detected and see which ones carry praise or pain."
        />
        <TopicsSection
          insights={insights}
          theme={theme}
          activeTopic={topicFilter}
          onSelectTopic={onTopicChange}
        />
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="LLM filters"
          subtitle="Refine the review sample by sentiment, pain points, feature requests, or topic focus."
        />
        <ReviewFilters
          sentimentFilter={sentimentFilter}
          onSentimentChange={onSentimentChange}
          painFilter={painFilter}
          onPainChange={onPainChange}
          featureFilter={featureFilter}
          onFeatureChange={onFeatureChange}
          topicFilter={topicFilter}
          onTopicChange={onTopicChange}
          topics={topicOptions}
          theme={theme}
        />
      </section>

      <section className="space-y-6">
        <SectionTitle
          title="Review sample"
          subtitle="Preview a filtered slice of the latest reviews with the LLM annotations applied."
        />
        <ReviewsTable
          reviews={filteredReviews.slice(0, 200)}
          helper={`Showing ${Math.min(filteredReviews.length, 200)} of ${filteredReviews.length} filtered reviews (out of ${sampleReviews.length}). Export the CSV for the full dataset.`}
        />
      </section>
    </div>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedApp, setSelectedApp] = useState<SearchResult | null>(null);
  const [language, setLanguage] = useState("english");
  const [reviewCount, setReviewCount] = useState<number>(FETCH_LIMIT);
  const [filter, setFilter] = useState("recent");
  const [dayRange, setDayRange] = useState<number | "">("");
  const [persist, setPersist] = useState(true);
  const [refresh, setRefresh] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [sampleReviews, setSampleReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [starred, setStarred] = useState<Record<number, StarredGame>>({});
  const [activeStarId, setActiveStarId] = useState<number | null>(null);
  const [comparisonSelection, setComparisonSelection] = useState<number[]>([]);
  const [progressStatus, setProgressStatus] = useState<ProgressStatus | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<
    "all" | "positive" | "neutral" | "negative"
  >("all");
  const [painFilter, setPainFilter] = useState<"all" | "pain" | "no_pain">("all");
  const [featureFilter, setFeatureFilter] = useState<
    "all" | "feature" | "no_feature"
  >("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");

function downloadBlob(data: string, filename: string, mime: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function handleExportReviews() {
  const appId = analysis?.metadata.app_id;
  if (!appId) {
    setFlash({ type: "error", message: "Run an analysis first to export reviews." });
    return;
  }
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    const url = new URL(`/reviews/${appId}`, base);
    const response = await fetch(url.toString());
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Export failed (${response.status})`);
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `senti-next-reviews-${appId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
    setFlash({ type: "success", message: "Reviews exported to CSV." });
  } catch (err) {
    console.error(err);
    setFlash({
      type: "error",
      message:
        (err as Error).message ||
        "Couldn't export reviews. Ensure persistence is enabled and try again.",
    });
  }
}

  function handleExportInsights() {
    if (!analysis?.insights) {
      setFlash({ type: "error", message: "Nothing to export yet. Run an analysis." });
      return;
    }
    downloadBlob(
      JSON.stringify(analysis.insights, null, 2),
      `senti-next-insights-${analysis.metadata.app_id}.json`,
      "application/json;charset=utf-8",
    );
    setFlash({ type: "success", message: "Insights exported as JSON." });
  }

  useEffect(() => {
    async function loadStarred() {
      try {
        const remote = await fetchStarredGames();
        if (!remote.length) {
          setStarred({});
          setActiveStarId(null);
          setComparisonSelection([]);
          return;
        }
        const mapping = remote.reduce<Record<number, StarredGame>>((acc, entry) => {
          acc[entry.app_id] = {
            metadata: entry.metadata,
            insights: (entry.insights ?? DEFAULT_INSIGHTS) as InsightsResponse | null,
            sample: (entry.sample ?? []) as ReviewRow[],
            name: entry.name,
            updated_at: entry.updated_at,
          };
          return acc;
        }, {});
        setStarred(mapping);
        setComparisonSelection((prev) => prev.filter((id) => mapping[id]));
        setActiveStarId((prev) => prev ?? remote[0].app_id);
      } catch (err) {
        console.warn("Failed to fetch starred games", err);
      }
    }
    loadStarred();
  }, []);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current !== null) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);


  async function handleSearch() {
    if (query.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }
    setError(null);
    try {
      setLoading(true);
      const results = await searchGames(query.trim());
      setSearchResults(results);
      if (results.length) {
        setSelectedApp(results[0]);
      }
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    if (!selectedApp) {
      setError("Please choose a game from the results first.");
      return;
    }
    setError(null);
    try {
      setLoading(true);
      setProgressStatus(null);
      const desiredCount = Math.max(0, Math.min(FETCH_LIMIT, Number(reviewCount) || 0));

      if (progressTimerRef.current !== null) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      const analyzePromise = analyzeGame({
        app_id: selectedApp.appid,
        language,
        review_count: desiredCount,
        filter,
        day_range: dayRange === "" ? undefined : Number(dayRange),
        persist,
        refresh,
      });

      if (desiredCount > 0) {
        const poll = async () => {
          try {
            const status = await fetchProgress(selectedApp.appid);
            setProgressStatus(status);
          } catch (err) {
            // Silently ignore polling errors while analysis is running.
          }
        };
        progressTimerRef.current = window.setInterval(poll, 500);
        poll().catch(() => undefined);
      }

      const response = await analyzePromise;
      const allReviews = response.reviews ?? [];
      setSampleReviews(allReviews.slice(0, SAMPLE_LIMIT));
      setAnalysis({ metadata: response.metadata, insights: response.insights });
      setActiveStarId(null);
      setFlash(null);
      setSentimentFilter("all");
      setPainFilter("all");
      setFeatureFilter("all");
      setTopicFilter("all");
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Analysis failed");
    } finally {
      setLoading(false);
      if (progressTimerRef.current !== null) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setProgressStatus(null);
    }
  }

  async function handleStarCurrent() {
    if (!analysis || !selectedApp) {
      setFlash({ type: "error", message: "Analyze a game before starring it." });
      return;
    }
    const payload: StarredGamePayload = {
      app_id: analysis.metadata.app_id,
      name: selectedApp.name,
      metadata: analysis.metadata,
      insights: analysis.insights,
      sample: sampleReviews.slice(0, SAMPLE_LIMIT),
    };

    try {
      await saveStarredGame(payload);
      setStarred((prev) => ({
        ...prev,
        [payload.app_id]: {
          metadata: payload.metadata,
          insights: payload.insights ?? DEFAULT_INSIGHTS,
          sample: payload.sample,
          name: payload.name,
          updated_at: new Date().toISOString(),
        },
      }));
      setActiveStarId(payload.app_id);
      setComparisonSelection((prev) => {
        if (prev.includes(payload.app_id)) {
          return prev;
        }
        const combined = [...prev, payload.app_id];
        return combined.slice(-3);
      });
      setFlash({ type: "success", message: `${payload.name} saved to the starred workspace.` });
    } catch (err) {
      console.error(err);
      setFlash({ type: "error", message: "Could not save this game to the starred workspace." });
    }
  }

  async function handleRemoveStar(appid: number) {
    try {
      await removeStarredGame(appid);
      setStarred((prev) => {
        const next = { ...prev };
        delete next[appid];
        return next;
      });
      if (activeStarId === appid) {
        setActiveStarId(null);
      }
      setComparisonSelection((prev) => prev.filter((id) => id !== appid));
      setFlash({ type: "success", message: "Removed from the starred workspace." });
    } catch (err) {
      console.error(err);
      setFlash({ type: "error", message: "Failed to remove the starred game." });
    }
  }

  function handleToggleComparison(appid: number) {
    setComparisonSelection((prev) => {
      if (prev.includes(appid)) {
        return prev.filter((id) => id !== appid);
      }
      return [...prev, appid];
    });
  }

  const focusedAnalysis = useMemo(() => {
    if (activeStarId && starred[activeStarId]) {
      const game = starred[activeStarId];
      return {
        summary: {
          metadata: game.metadata,
          insights: game.insights,
        },
        sample: game.sample,
        name: game.name,
      };
    }
    if (analysis && selectedApp) {
      return {
        summary: {
          metadata: analysis.metadata,
          insights: analysis.insights,
        },
        sample: sampleReviews,
        name: selectedApp.name,
      };
    }
    return null;
  }, [activeStarId, starred, analysis, selectedApp, sampleReviews]);

  const currentSample = useMemo<ReviewRow[]>(
    () => (focusedAnalysis?.sample ? [...focusedAnalysis.sample] : []),
    [focusedAnalysis],
  );

  const filteredReviews = useMemo(() => {
    return currentSample.filter((review) => {
      const rawSentiment = review.llm_sentiment ?? review.sentiment_label ?? "neutral";
      const sentiment = typeof rawSentiment === "string"
        ? rawSentiment.toLowerCase()
        : String(rawSentiment).toLowerCase();
      if (sentimentFilter !== "all" && sentiment !== sentimentFilter) {
        return false;
      }

      const isPain = Boolean(review.llm_pain_point);
      if (painFilter === "pain" && !isPain) {
        return false;
      }
      if (painFilter === "no_pain" && isPain) {
        return false;
      }

      const isFeature = Boolean(review.llm_feature_request);
      if (featureFilter === "feature" && !isFeature) {
        return false;
      }
      if (featureFilter === "no_feature" && isFeature) {
        return false;
      }

      if (topicFilter !== "all") {
        const rawTopics = review.llm_topics;
        const topics = Array.isArray(rawTopics)
          ? rawTopics
          : typeof rawTopics === "string" && rawTopics.length
          ? rawTopics.split(/[;,]/).map((topic) => topic.trim()).filter(Boolean)
          : [];
        if (!topics.includes(topicFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [currentSample, sentimentFilter, painFilter, featureFilter, topicFilter]);

  const starredEntries = useMemo(
    () =>
      Object.entries(starred).sort(([, a], [, b]) => {
        const aDate = Date.parse(a.updated_at ?? a.metadata?.fetched_at ?? "") || 0;
        const bDate = Date.parse(b.updated_at ?? b.metadata?.fetched_at ?? "") || 0;
        return bDate - aDate;
      }),
    [starred],
  );

  const activeTheme = (
    focusedAnalysis?.summary.insights?.theme || DEFAULT_THEME
  ) as ThemeDefinition;

  return (
    <div className="flex min-h-screen text-slate-100">
      <aside className="hidden w-80 flex-shrink-0 border-r border-white/5 bg-slate-900/40 px-7 py-10 backdrop-blur lg:block">
        <div className="space-y-8 text-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Display</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-center text-xs font-medium text-slate-200">
                Dark
              </span>
              <span className="rounded-full border border-white/10 bg-transparent px-3 py-1 text-center text-xs font-medium text-slate-500">
                Light
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Review filters</p>
            <div>
              <label className="text-xs text-slate-300/80">Language</label>
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner shadow-black/30 focus:border-sky-500 focus:outline-none"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300/80">Reviews fetched</label>
              <div className="mt-2 space-y-2">
                <input
                  type="range"
                  min={0}
                  max={FETCH_LIMIT}
                  step={100}
                  value={reviewCount}
                  onChange={(event) => setReviewCount(Number(event.target.value))}
                  className="w-full accent-indigo-400"
                />
                <div className="flex items-center justify-between text-xs text-slate-300/80">
                  <span>0</span>
                  <span>{reviewCount.toLocaleString()} reviews</span>
                  <span>{FETCH_LIMIT.toLocaleString()}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={FETCH_LIMIT}
                  value={reviewCount}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isNaN(value)) {
                      setReviewCount(0);
                    } else {
                      setReviewCount(Math.max(0, Math.min(FETCH_LIMIT, value)));
                    }
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner shadow-black/30 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Steam returns batches of 100 reviews per page. Use the slider to cap the pull at up to
                {" "}
                {FETCH_LIMIT.toLocaleString()} reviews.
              </p>
            </div>

            <div>
              <label className="text-xs text-slate-300/80">Order</label>
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner shadow-black/30 focus:border-sky-500 focus:outline-none"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Steam returns reviews sorted by this filter; choose &quot;Newest&quot; to prioritise recency.
              </p>
            </div>

            <div>
              <label className="text-xs text-slate-300/80">Day range (optional)</label>
              <input
                type="number"
                min={1}
                max={365}
                placeholder="All time"
                value={dayRange}
                onChange={(event) => {
                  const value = event.target.value;
                  setDayRange(value === "" ? "" : Math.max(1, Math.min(365, Number(value))));
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner shadow-black/30 focus:border-sky-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Limit fetch to reviews from the last N days. Leave blank to include all available data.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-300/80">Storage</label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={persist}
                  onChange={(event) => setPersist(event.target.checked)}
                  className="accent-sky-500"
                />
                Persist reviews locally
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={refresh}
                  onChange={(event) => setRefresh(event.target.checked)}
                  className="accent-sky-500"
                  disabled={!persist}
                />
                Fetch latest before analysing
              </label>
              <p className="text-[11px] text-slate-500">
                Stored reviews accumulate over time. Disable refresh to analyse the existing cache instantly.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">⭐ Starred workspace</p>
            {!starredEntries.length ? (
              <p className="text-xs text-slate-500">
                Star a game after analysing it to pin the dataset here for quick recall and comparisons.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {starredEntries.map(([appidKey, game]) => {
                  const appId = Number(appidKey);
                  const isActive = activeStarId === appId;
                  const inComparison = comparisonSelection.includes(appId);
                  const insights = game.insights;
                  const metrics = insights?.metrics ?? {};
                  const recommendation = insights
                    ? formatPercentage(insights.recommendation ?? 0, 1)
                    : null;
                  const positiveShare = insights
                    ? formatPercentage(metrics.share_positive ?? 0, 1)
                    : null;
                  const savedAt = game.updated_at ?? game.metadata?.fetched_at ?? null;
                  const savedLabel = (() => {
                    if (!savedAt) return "Saved just now";
                    const parsed = new Date(savedAt);
                    return Number.isNaN(parsed.getTime())
                      ? savedAt
                      : parsed.toLocaleString();
                  })();

                  const handleFocus = () => {
                    setActiveStarId(appId);
                    setFlash(null);
                  };

                  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleFocus();
                    }
                  };

                  return (
                    <div
                      key={appId}
                      role="button"
                      tabIndex={0}
                      onClick={handleFocus}
                      onKeyDown={handleKeyDown}
                      className={clsx(
                        "rounded-2xl border px-4 py-3 transition backdrop-blur",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-400/70",
                        isActive
                          ? "border-indigo-400/80 bg-white/12 shadow-[0_14px_30px_rgba(99,102,241,0.35)]"
                          : "border-white/10 bg-white/5 hover:border-indigo-300/60 hover:bg-white/8",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{game.name}</p>
                          <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
                            AppID {game.metadata.app_id}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isActive && (
                            <span className="rounded-full bg-indigo-500/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Active
                            </span>
                          )}
                          {inComparison && (
                            <span className="rounded-full border border-indigo-400/70 px-2 py-0.5 text-[10px] text-indigo-100">
                              In compare
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300/80">
                        {recommendation && <span>Rec {recommendation}</span>}
                        {positiveShare && <span>Pos {positiveShare}</span>}
                        <span>{game.metadata.retrieved.toLocaleString()} reviews</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span>Saved {savedLabel}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleComparison(appId);
                            }}
                            className={clsx(
                              "rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] transition",
                              inComparison
                                ? "border-indigo-400 bg-indigo-500/90 text-white"
                                : "border-white/15 bg-white/10 text-slate-200 hover:border-indigo-300/50 hover:text-white",
                            )}
                          >
                            {inComparison ? "In compare" : "Add to compare"}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRemoveStar(appId);
                            }}
                            className="rounded-full border border-white/15 bg-transparent px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-rose-400/60 hover:text-rose-200"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/5 bg-white/5 px-6 py-4 shadow-[0_24px_40px_rgba(8,15,40,0.4)] backdrop-blur">
            <div>
              <h1 className="text-xl font-semibold text-white">SentiNext</h1>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/80">
                Steam sentiment command center
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-300/80">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Backend: localhost:8000
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Frontend: localhost:3000
              </span>
            </div>
          </header>

          <section
            className="rounded-3xl border p-5 shadow-[0_26px_50px_rgba(8,15,40,0.45)] backdrop-blur"
            style={{
              borderColor: activeTheme.palette.border,
              background: `linear-gradient(135deg, ${activeTheme.gradient[0]} 0%, ${activeTheme.gradient[1]} 55%, ${activeTheme.gradient[2]} 100%)`,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-100/80">
                  Steam intelligence
                </span>
                <h2 className="mt-3 bg-gradient-to-r from-indigo-300 via-sky-200 to-cyan-300 bg-clip-text text-3xl font-semibold text-transparent md:text-[34px]">
                  Understand your community&rsquo;s pulse in seconds
                </h2>
                <p className="mt-2 text-[11px] text-slate-200/75">
                  Track sentiment momentum, patch impact, cohort behaviour, and churn risks across Steam reviews in one place.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200/80 backdrop-blur">
                <span>Realtime</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.65)]" />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="text-[11px] uppercase tracking-[0.32em] text-slate-400">
                  Game name or store URL
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white shadow-inner shadow-black/30 focus:border-sky-500 focus:outline-none"
                    placeholder="e.g. Baldur's Gate 3 or https://store.steampowered.com/app/1086940"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleSearch();
                      }
                    }}
                  />
                  <button
                    onClick={handleSearch}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/50 bg-sky-500/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-lg shadow-sky-900/40 transition hover:bg-sky-400"
                  >
                    Search
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:flex-none">
                <button
                  disabled={!selectedApp || loading}
                  onClick={handleAnalyze}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition",
                    selectedApp
                      ? "border border-indigo-400/50 bg-indigo-500/90 text-white shadow-lg shadow-indigo-900/50 hover:bg-indigo-400"
                      : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-400",
                  )}
                >
                  {loading && (
                    <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                  )}
                  {loading ? "Fetching…" : "Analyze"}
                </button>
                <button
                  onClick={() => void handleStarCurrent()}
                  disabled={!analysis}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition",
                    analysis
                      ? "border border-amber-400/60 bg-amber-400 text-slate-900 shadow-lg shadow-amber-900/40 hover:bg-amber-300"
                      : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-400",
                  )}
                >
                  ⭐ Star
                </button>
                <button
                  onClick={handleExportReviews}
                  disabled={!persist}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-sky-400/60 hover:text-white disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  ⬇ CSV
                </button>
                <button
                  onClick={handleExportInsights}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-sky-400/60 hover:text-white"
                >
                  ⬇ JSON
                </button>
              </div>
            </div>

            {loading && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-200/70">
                <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                Fetching {Math.max(0, Math.min(FETCH_LIMIT, reviewCount)).toLocaleString()} reviews from Steam…
              </div>
            )}

            {loading && progressStatus && progressStatus.total > 0 && (
              <div className="mt-2 w-full space-y-1 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-slate-200/80">
                <div className="flex items-center justify-between">
                  <span>LLM processing</span>
                  <span>
                    {Math.min(progressStatus.processed, progressStatus.total).toLocaleString()} /
                    {" "}
                    {progressStatus.total.toLocaleString()} reviews
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-400 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        progressStatus.total
                          ? (progressStatus.processed / progressStatus.total) * 100
                          : 0,
                      ).toFixed(1)}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  {progressStatus.active
                    ? 'Streaming reviews through the local LLM classifier…'
                    : 'Finalising classification results…'}
                </p>
              </div>
            )}

            <div className="mt-4 gap-3 lg:grid lg:grid-cols-[1.5fr_0.9fr]">
              <p className="text-[11px] text-slate-400">
                Currently set to {Math.max(0, Math.min(FETCH_LIMIT, reviewCount)).toLocaleString()} reviews • Steam returns data in 100-review pages • Use the sidebar to change order, limit by day range, or work from the cached corpus.
              </p>
              {!!searchResults.length && (
                <div
                  className="max-h-40 overflow-y-auto rounded-3xl border p-3 shadow-[0_20px_36px_rgba(8,15,40,0.4)] backdrop-blur"
                  style={{
                    borderColor: activeTheme.palette.border,
                    background: hexToRgba(activeTheme.palette.surface_alt, 0.58),
                  }}
                >
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-200/80">
                    Results
                  </h3>
                  <div className="mt-2 space-y-2">
                    {searchResults.map((result) => (
                      <button
                        key={result.appid}
                        onClick={() => setSelectedApp(result)}
                        className={clsx(
                          "w-full rounded-xl border border-white/10 px-3 py-1.5 text-left text-sm text-slate-200 transition hover:border-sky-400/60 hover:bg-white/8",
                          selectedApp?.appid === result.appid &&
                            "border-sky-400/80 bg-white/10 shadow-[0_12px_30px_rgba(8,15,40,0.4)]",
                        )}
                      >
                        <div className="font-semibold text-white">{result.name}</div>
                        <div className="text-[10px] text-slate-300">AppID {result.appid}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {(error || flash) && (
              <div className="mt-3 space-y-1 text-sm">
                {error && <p className="text-rose-300">{error}</p>}
                {flash && (
                  <p
                    className={clsx(
                      flash.type === "success" ? "text-emerald-300" : "text-rose-300",
                    )}
                  >
                    {flash.message}
                  </p>
                )}
              </div>
            )}
          </section>

          {focusedAnalysis ? (
            <InsightsView
              analysis={focusedAnalysis.summary}
              gameName={focusedAnalysis.name}
              theme={activeTheme}
              sampleReviews={currentSample}
              filteredReviews={filteredReviews}
              sentimentFilter={sentimentFilter}
              onSentimentChange={setSentimentFilter}
              painFilter={painFilter}
              onPainChange={setPainFilter}
              featureFilter={featureFilter}
              onFeatureChange={setFeatureFilter}
              topicFilter={topicFilter}
              onTopicChange={setTopicFilter}
            />
          ) : (
            <div
              className="rounded-3xl border p-8 text-sm text-slate-200 backdrop-blur"
              style={{
                borderColor: activeTheme.palette.border,
                background: hexToRgba(activeTheme.palette.surface_alt, 0.72),
              }}
            >
              Run an analysis or pick a starred game to begin exploring sentiment insights.
            </div>
          )}

          {comparisonSelection.length >= 2 && (
            <>
              <ComparisonView
                games={comparisonSelection
                  .filter((appid) => starred[appid])
                  .map((appid) => [appid, starred[appid]] as [number, StarredGame])}
                theme={activeTheme}
              />
              <ComparisonTrendOverlay
                games={comparisonSelection
                  .filter((appid) => starred[appid])
                  .map((appid) => [appid, starred[appid]] as [number, StarredGame])}
                theme={activeTheme}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
