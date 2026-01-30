'use client';

import { useMemo } from "react";
import {
  HelpfulFilter,
  PlaytimeFilter,
  SentimentFilter,
  DateRangeFilter,
  useGlobalFilters,
} from "@/contexts/GlobalFiltersContext";

const LANGUAGE_SUGGESTIONS = [
  "english",
  "german",
  "french",
  "spanish",
  "italian",
  "polish",
  "portuguese",
  "brazilian",
  "russian",
  "turkish",
  "japanese",
  "koreana",
  "schinese",
  "tchinese",
];

export function GlobalFiltersBar() {
  const { filters, updateFilters } = useGlobalFilters();

  const languageValue = useMemo(() => {
    return filters.language && filters.language !== "all" ? filters.language : "";
  }, [filters.language]);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Sentiment</p>
          <select
            value={filters.sentiment}
            onChange={(event) => updateFilters({ sentiment: event.target.value as SentimentFilter })}
            className="mt-2 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="positive">Recommended</option>
            <option value="negative">Not recommended</option>
          </select>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Date</p>
          <select
            value={filters.dateRange}
            onChange={(event) => updateFilters({ dateRange: event.target.value as DateRangeFilter })}
            className="mt-2 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
          >
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="365d">Last year</option>
          </select>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Helpful</p>
          <select
            value={filters.minHelpful}
            onChange={(event) => updateFilters({ minHelpful: Number(event.target.value) as HelpfulFilter })}
            className="mt-2 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
          >
            <option value={0}>All</option>
            <option value={10}>10+</option>
            <option value={25}>25+</option>
            <option value={50}>50+</option>
          </select>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Playtime</p>
          <select
            value={filters.playtime}
            onChange={(event) => updateFilters({ playtime: event.target.value as PlaytimeFilter })}
            className="mt-2 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="lt2h">&lt;2h</option>
            <option value="2to20h">2–20h</option>
            <option value="20hplus">20h+</option>
          </select>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Language</p>
          <input
            value={languageValue}
            onChange={(event) => updateFilters({ language: event.target.value })}
            placeholder="All languages"
            list="sentinext-language-suggestions"
            className="mt-2 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
          />
          <datalist id="sentinext-language-suggestions">
            {LANGUAGE_SUGGESTIONS.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
}
