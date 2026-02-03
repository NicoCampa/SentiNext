'use client';

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SteamImage } from "@/components/SteamImage";
import { useGameContext } from "@/contexts/GameContext";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { applyGlobalReviewFilters } from "@/lib/reviewFilters";
import { languageLabelFor } from "@/lib/languageOptions";

function labelForSentiment(value: string, t: (key: string) => string) {
  if (value === "positive") return t("common.recommended");
  if (value === "negative") return t("common.notRecommended");
  return t("filters.allSentiment");
}

function labelForDate(value: string, t: (key: string) => string) {
  if (value === "30d") return t("filters.last30Days");
  if (value === "90d") return t("filters.last90Days");
  if (value === "365d") return t("filters.last12Months");
  return t("filters.allTime");
}

function labelForPlaytime(value: string, t: (key: string) => string) {
  if (value === "lt2h") return t("filters.playtimeLt2h");
  if (value === "2to20h") return t("filters.playtime2to20h");
  if (value === "20hplus") return t("filters.playtime20hplus");
  return t("filters.allPlaytime");
}

export function GameContextBar({ showFilters = true }: { showFilters?: boolean }) {
  const { games, selectedGame, selectedStarredGame, selectedGameId, selectGameById } = useGameContext();
  const { filters, updateFilters, resetFilters, filtersActive } = useGlobalFilters();
  const { t } = useLanguage();

  const filteredCount = useMemo(() => {
    if (!selectedStarredGame?.sample) return null;
    return applyGlobalReviewFilters(selectedStarredGame.sample, filters).length;
  }, [filters, selectedStarredGame]);

  const totalCount = selectedStarredGame?.sample?.length ?? null;
  const hasStarredSelection = selectedGameId !== null && games.some((game) => game.app_id === selectedGameId);

  const activeChips = [
    { key: "sentiment", value: filters.sentiment, label: labelForSentiment(filters.sentiment, t) },
    { key: "dateRange", value: filters.dateRange, label: labelForDate(filters.dateRange, t) },
    {
      key: "minHelpful",
      value: filters.minHelpful,
      label: filters.minHelpful ? t("filters.helpfulVotes").replace("{count}", String(filters.minHelpful)) : "",
    },
    { key: "playtime", value: filters.playtime, label: labelForPlaytime(filters.playtime, t) },
    {
      key: "language",
      value: filters.language,
      label:
        filters.language && filters.language !== "all"
          ? t("filters.languageChip").replace("{lang}", languageLabelFor(filters.language))
          : "",
    },
  ].filter((chip) => chip.label);

  return (
    <Card variant="glass" className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-4 sm:min-w-[260px] sm:flex-1 sm:flex-row sm:items-center">
          {selectedGame?.appId ? (
            <SteamImage
              appId={selectedGame.appId}
              variant="header"
              alt={selectedGame.name}
              imageUrl={selectedGame.headerImage}
              className="h-12 w-24 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-12 w-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-slate-500">
              {t("gameContext.noGame")}
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t("gameContext.currentGame")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                value={selectedGameId ?? ""}
                onChange={(event) => selectGameById(event.target.value ? Number(event.target.value) : null)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none sm:min-w-[220px]"
              >
                {!hasStarredSelection && selectedGame ? (
                  <option value={selectedGame.appId}>
                    {selectedGame.name} (current)
                  </option>
                ) : null}
                {games.length === 0 ? (
                  <option value="">{t("gameContext.noSavedGames")}</option>
                ) : null}
                {games.map((game) => (
                  <option key={game.app_id} value={game.app_id}>
                    {game.name}
                  </option>
                ))}
              </select>
              <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-200">
                {t("gameContext.analyzeNew")}
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {showFilters
                ? filteredCount !== null && totalCount !== null
                  ? t("gameContext.filteredReviews")
                      .replace("{filtered}", filteredCount.toLocaleString())
                      .replace("{total}", totalCount.toLocaleString())
                  : t("gameContext.filtersApply")
                : totalCount !== null
                ? t("gameContext.sampledReviews").replace("{total}", totalCount.toLocaleString())
                : t("gameContext.filtersApply")}
            </p>
          </div>
        </div>

        {showFilters ? (
          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:flex-1 sm:justify-end">
            {activeChips.length ? (
              <>
                <span className="text-xs text-slate-500">{t("gameContext.activeFilters")}</span>
                {activeChips.map((chip) => (
                  <button
                    key={chip.key}
                    onClick={() => {
                      if (chip.key === "sentiment") updateFilters({ sentiment: "all" });
                      if (chip.key === "dateRange") updateFilters({ dateRange: "all" });
                      if (chip.key === "minHelpful") updateFilters({ minHelpful: 0 });
                      if (chip.key === "playtime") updateFilters({ playtime: "all" });
                      if (chip.key === "language") updateFilters({ language: "all" });
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-white"
                    type="button"
                  >
                    {chip.label} ×
                  </button>
                ))}
              </>
            ) : (
              <span className="text-xs text-slate-500">{t("gameContext.noFiltersActive")}</span>
            )}
            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                {t("common.clearFilters")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
