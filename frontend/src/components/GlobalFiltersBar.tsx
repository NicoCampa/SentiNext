'use client';

import {
  HelpfulFilter,
  PlaytimeFilter,
  SentimentFilter,
  DateRangeFilter,
  useGlobalFilters,
} from "@/contexts/GlobalFiltersContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_OPTIONS } from "@/lib/languageOptions";

export function GlobalFiltersBar() {
  const { filters, updateFilters } = useGlobalFilters();
  const { t } = useLanguage();

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">{t("common.filters")}:</span>

        <select
          value={filters.sentiment}
          onChange={(event) => updateFilters({ sentiment: event.target.value as SentimentFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">{t("filters.allSentiment")}</option>
          <option value="positive">{t("common.recommended")}</option>
          <option value="negative">{t("common.notRecommended")}</option>
        </select>

        <select
          value={filters.dateRange}
          onChange={(event) => updateFilters({ dateRange: event.target.value as DateRangeFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">{t("filters.allTime")}</option>
          <option value="30d">{t("filters.last30Days")}</option>
          <option value="90d">{t("filters.last90Days")}</option>
          <option value="365d">{t("filters.last12Months")}</option>
        </select>

        <select
          value={filters.minHelpful}
          onChange={(event) => updateFilters({ minHelpful: Number(event.target.value) as HelpfulFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value={0}>{t("filters.allHelpful")}</option>
          <option value={10}>{t("filters.helpfulVotes10")}</option>
          <option value={25}>{t("filters.helpfulVotes25")}</option>
          <option value={50}>{t("filters.helpfulVotes50")}</option>
        </select>

        <select
          value={filters.playtime}
          onChange={(event) => updateFilters({ playtime: event.target.value as PlaytimeFilter })}
          className="rounded border border-white/10 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">{t("filters.allPlaytime")}</option>
          <option value="lt2h">{t("filters.playtimeLt2h")}</option>
          <option value="2to20h">{t("filters.playtime2to20h")}</option>
          <option value="20hplus">{t("filters.playtime20hplus")}</option>
        </select>

        <select
          value={filters.language || "all"}
          onChange={(event) => updateFilters({ language: event.target.value })}
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
