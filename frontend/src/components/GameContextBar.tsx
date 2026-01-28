'use client';

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SteamImage } from "@/components/SteamImage";
import { useGameContext } from "@/contexts/GameContext";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { applyGlobalReviewFilters } from "@/lib/reviewFilters";

function labelForSentiment(value: string) {
  if (value === "positive") return "Recommended";
  if (value === "negative") return "Not recommended";
  return "All sentiment";
}

function labelForDate(value: string) {
  if (value === "30d") return "Last 30 days";
  if (value === "90d") return "Last 90 days";
  if (value === "365d") return "Last 12 months";
  return "All time";
}

function labelForPlaytime(value: string) {
  if (value === "lt2h") return "<2h playtime";
  if (value === "2to20h") return "2–20h playtime";
  if (value === "20hplus") return "20h+ playtime";
  return "All playtime";
}

export function GameContextBar() {
  const { games, selectedGame, selectedStarredGame, selectedGameId, selectGameById } = useGameContext();
  const { filters, updateFilters, resetFilters, filtersActive } = useGlobalFilters();

  const filteredCount = useMemo(() => {
    if (!selectedStarredGame?.sample) return null;
    return applyGlobalReviewFilters(selectedStarredGame.sample, filters).length;
  }, [filters, selectedStarredGame]);

  const totalCount = selectedStarredGame?.sample?.length ?? null;
  const hasStarredSelection = selectedGameId !== null && games.some((game) => game.app_id === selectedGameId);

  const activeChips = [
    { key: "sentiment", value: filters.sentiment, label: labelForSentiment(filters.sentiment) },
    { key: "dateRange", value: filters.dateRange, label: labelForDate(filters.dateRange) },
    { key: "minHelpful", value: filters.minHelpful, label: filters.minHelpful ? `${filters.minHelpful}+ helpful` : "" },
    { key: "playtime", value: filters.playtime, label: labelForPlaytime(filters.playtime) },
    { key: "language", value: filters.language, label: filters.language && filters.language !== "all" ? `Lang: ${filters.language}` : "" },
  ].filter((chip) => chip.label);

  return (
    <Card variant="glass" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-[260px] flex-1 items-center gap-4">
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
              No game
            </div>
          )}
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Current game</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                value={selectedGameId ?? ""}
                onChange={(event) => selectGameById(event.target.value ? Number(event.target.value) : null)}
                className="min-w-[220px] rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                {!hasStarredSelection && selectedGame ? (
                  <option value={selectedGame.appId}>
                    {selectedGame.name} (current)
                  </option>
                ) : null}
                {games.length === 0 ? (
                  <option value="">No saved games</option>
                ) : null}
                {games.map((game) => (
                  <option key={game.app_id} value={game.app_id}>
                    {game.name}
                  </option>
                ))}
              </select>
              <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-200">
                Analyze new game →
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {filteredCount !== null && totalCount !== null
                ? `Filtered reviews: ${filteredCount} / ${totalCount}`
                : "Filters apply to your current game reviews."}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {activeChips.length ? (
            <>
              <span className="text-xs text-slate-500">Active filters:</span>
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
                  {chip.label} ✕
                </button>
              ))}
            </>
          ) : (
            <span className="text-xs text-slate-500">No global filters active</span>
          )}
          {filtersActive ? (
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              Clear all
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

