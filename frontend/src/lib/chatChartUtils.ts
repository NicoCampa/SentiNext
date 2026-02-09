import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  BarController,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  RadarController,
  RadialLinearScale,
  BubbleController,
  ScatterController,
  DoughnutController,
  PieController,
  PolarAreaController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

// Register Chart.js components
ChartJS.register(
  ArcElement,
  BarElement,
  BarController,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  RadarController,
  RadialLinearScale,
  BubbleController,
  ScatterController,
  DoughnutController,
  PieController,
  PolarAreaController,
  Title,
  Tooltip,
  Legend,
  Filler
);

export type ChartSpec = {
  type: string;
  data: {
    labels?: Array<string | number>;
    datasets: Array<Record<string, unknown>>;
  };
  options?: Record<string, unknown>;
  title?: string;
  description?: string;
};

export type ChatPart =
  | { type: "text"; value: string }
  | { type: "chart"; spec: ChartSpec; raw: string };

const CHART_BLOCK_RE = /```(?:chart|chartjs|chart-json)\n([\s\S]*?)```/gi;

export const CHART_COLORS = [
  'rgba(96, 165, 250, 0.8)',
  'rgba(134, 239, 172, 0.8)',
  'rgba(251, 146, 60, 0.8)',
  'rgba(244, 114, 182, 0.8)',
  'rgba(167, 139, 250, 0.8)',
  'rgba(253, 224, 71, 0.8)',
  'rgba(248, 113, 113, 0.8)',
  'rgba(103, 232, 249, 0.8)',
  'rgba(196, 181, 253, 0.8)',
  'rgba(134, 239, 212, 0.8)',
];

export const CHART_BORDER_COLORS = [
  'rgba(96, 165, 250, 1)',
  'rgba(134, 239, 172, 1)',
  'rgba(251, 146, 60, 1)',
  'rgba(244, 114, 182, 1)',
  'rgba(167, 139, 250, 1)',
  'rgba(253, 224, 71, 1)',
  'rgba(248, 113, 113, 1)',
  'rgba(103, 232, 249, 1)',
  'rgba(196, 181, 253, 1)',
  'rgba(134, 239, 212, 1)',
];

export function splitChatContent(content: string): ChatPart[] {
  const parts: ChatPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CHART_BLOCK_RE.lastIndex = 0;
  while ((match = CHART_BLOCK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    const raw = match[1].trim();
    try {
      const spec = JSON.parse(raw) as ChartSpec;
      if (spec && spec.type && spec.data) {
        parts.push({ type: "chart", spec, raw });
      } else {
        parts.push({ type: "text", value: match[0] });
      }
    } catch {
      parts.push({ type: "text", value: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}

export function normalizeChartData(spec: ChartSpec): ChartSpec["data"] {
  if (Array.isArray(spec.data)) {
    const simplified = spec.data as Array<{label: string; value: number}>;
    return {
      labels: simplified.map(d => d.label),
      datasets: [{ data: simplified.map(d => d.value) }],
    };
  }
  if (spec.data && Array.isArray((spec.data as any).data)) {
    const simplified = (spec.data as any).data as Array<{label: string; value: number}>;
    return {
      labels: simplified.map(d => d.label),
      datasets: [{ data: simplified.map(d => d.value) }],
    };
  }
  return spec.data;
}

export function enhanceChartData(spec: ChartSpec): any {
  const normalizedData = normalizeChartData(spec);
  const data = { ...normalizedData };

  if (!data.datasets || !Array.isArray(data.datasets)) {
    data.datasets = [{ data: [] }];
  }

  if (data.datasets.length > 0) {
    data.datasets = data.datasets.map((dataset: any, idx: number) => {
      const colorIdx = idx % CHART_COLORS.length;
      const enhanced = { ...dataset };

      if (spec.type === 'pie' || spec.type === 'doughnut' || spec.type === 'polarArea') {
        if (!enhanced.backgroundColor) {
          const dataLength = Array.isArray(enhanced.data) ? enhanced.data.length : 0;
          enhanced.backgroundColor = Array.from({ length: dataLength }, (_, i) =>
            CHART_COLORS[i % CHART_COLORS.length]
          );
          enhanced.borderColor = Array.from({ length: dataLength }, (_, i) =>
            CHART_BORDER_COLORS[i % CHART_BORDER_COLORS.length]
          );
          enhanced.borderWidth = 2;
        }
      } else {
        if (!enhanced.backgroundColor) {
          enhanced.backgroundColor = CHART_COLORS[colorIdx];
        }
        if (!enhanced.borderColor) {
          enhanced.borderColor = CHART_BORDER_COLORS[colorIdx];
        }
        if (!enhanced.borderWidth) {
          enhanced.borderWidth = 2;
        }

        if (spec.type === 'line') {
          enhanced.tension = enhanced.tension ?? 0.3;
          enhanced.pointRadius = enhanced.pointRadius ?? 4;
          enhanced.pointHoverRadius = enhanced.pointHoverRadius ?? 6;
          enhanced.pointBackgroundColor = enhanced.pointBackgroundColor ?? CHART_BORDER_COLORS[colorIdx];
        }
      }

      return enhanced;
    });
  }

  return data;
}

export function buildChartOptions(spec: ChartSpec) {
  const isHorizontalBar = spec.type === 'bar' && spec.options?.indexAxis === 'y';

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    color: "#e2e8f0",
    ...(isHorizontalBar && {
      layout: {
        padding: { left: 20, right: 20 },
      },
    }),
    plugins: {
      legend: {
        display: true,
        labels: {
          color: "#cbd5f5",
          font: { size: 12, weight: '500' as const },
          padding: 12,
        },
      },
      title: spec.title
        ? {
            display: true,
            text: spec.title,
            color: "#e2e8f0",
            font: { size: 14, weight: '600' as const },
            padding: { bottom: 16 },
          }
        : { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleColor: "#e2e8f0",
        bodyColor: "#e2e8f0",
        borderColor: "rgba(148, 163, 184, 0.3)",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 0,
      },
    },
    scales: {
      x: {
        ticks: { color: "#cbd5f5", font: { size: 11 } },
        grid: { color: "rgba(148, 163, 184, 0.1)", drawBorder: false },
      },
      y: {
        ticks: { color: "#cbd5f5", font: { size: 11 } },
        grid: { color: "rgba(148, 163, 184, 0.1)", drawBorder: false },
      },
    },
  } as Record<string, unknown>;

  return {
    ...base,
    ...(spec.options ?? {}),
    plugins: {
      ...(base.plugins as Record<string, unknown>),
      ...(spec.options?.plugins ?? {}),
    },
    scales: {
      ...(base.scales as Record<string, unknown>),
      ...(spec.options?.scales ?? {}),
    },
  };
}
