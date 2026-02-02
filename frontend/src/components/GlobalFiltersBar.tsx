'use client';

import {
  HelpfulFilter,
  PlaytimeFilter,
  SentimentFilter,
  DateRangeFilter,
  useGlobalFilters,
} from "@/contexts/GlobalFiltersContext";

// Language display names
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All languages" },
  { value: "english", label: "English" },
  { value: "german", label: "German" },
  { value: "french", label: "French" },
  { value: "spanish", label: "Spanish" },
  { value: "italian", label: "Italian" },
  { value: "portuguese", label: "Portuguese" },
  { value: "brazilian", label: "Brazilian PT" },
  { value: "russian", label: "Russian" },
  { value: "polish", label: "Polish" },
  { value: "turkish", label: "Turkish" },
  { value: "japanese", label: "Japanese" },
  { value: "koreana", label: "Korean" },
  { value: "schinese", label: "Simplified CN" },
  { value: "tchinese", label: "Traditional CN" },
];

export function GlobalFiltersBar() {
  const { filters, updateFilters } = useGlobalFilters();

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] uppercase tracking-wider text-slate-500">Filters:</span>

        <select
          value={filters.sentiment}
          onChange={(event) => updateFilters({ sentiment: event.target.value as SentimentFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">All sentiment</option>
          <option value="positive">Recommended</option>
          <option value="negative">Not recommended</option>
        </select>

        <select
          value={filters.dateRange}
          onChange={(event) => updateFilters({ dateRange: event.target.value as DateRangeFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">All time</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="365d">1 year</option>
        </select>

        <select
          value={filters.minHelpful}
          onChange={(event) => updateFilters({ minHelpful: Number(event.target.value) as HelpfulFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value={0}>All helpful</option>
          <option value={10}>10+ votes</option>
          <option value={25}>25+ votes</option>
          <option value={50}>50+ votes</option>
        </select>

        <select
          value={filters.playtime}
          onChange={(event) => updateFilters({ playtime: event.target.value as PlaytimeFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">All playtime</option>
          <option value="lt2h">&lt;2h</option>
          <option value="2to20h">2–20h</option>
          <option value="20hplus">20h+</option>
        </select>

        <select
          value={filters.language || "all"}
          onChange={(event) => updateFilters({ language: event.target.value === "all" ? "" : event.target.value })}
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
