'use client';

import { useGameContext } from "@/contexts/GameContext";
import { useCredits } from "@/contexts/CreditsContext";
import Link from "next/link";

export function GameLimitBar() {
  const { games } = useGameContext();
  const { credits, loading } = useCredits();

  if (loading && !credits) {
    return (
      <div className="p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 animate-pulse">
        <div className="h-4 bg-[rgb(0,255,255)]/10 rounded w-20 mb-2" />
        <div className="h-2 bg-[rgb(0,255,255)]/10 rounded w-full" />
      </div>
    );
  }

  if (!credits) {
    return null;
  }

  const tier = credits.tier;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  // Only show for free tier
  if (tier !== 'free') {
    return (
      <div className="p-3 border border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)]/50">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/50">
            Plan
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[rgb(0,255,255)]">
            {tierLabel}
          </span>
        </div>
      </div>
    );
  }

  const gamesAnalyzed = games.length;
  const gamesLimit = 2;
  const percentUsed = (gamesAnalyzed / gamesLimit) * 100;
  const isAtLimit = gamesAnalyzed >= gamesLimit;

  const getBarColor = () => {
    if (isAtLimit) return "bg-rose-500";
    if (gamesAnalyzed === 1) return "bg-amber-400";
    return "bg-[rgb(0,255,255)]";
  };

  const getTextColor = () => {
    if (isAtLimit) return "text-rose-400";
    if (gamesAnalyzed === 1) return "text-amber-400";
    return "text-[rgb(0,255,255)]";
  };

  return (
    <div
      className={`p-3 border ${
        isAtLimit
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)]/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isAtLimit && (
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
          )}
          <span className="text-[10px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/50">
            {isAtLimit ? "Limit Reached" : "Games Analyzed"}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[rgb(0,255,255)]">
          Free
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="h-2 bg-[rgb(0,255,255)]/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${getBarColor()} transition-all duration-300`}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-mono ${getTextColor()}`}>
          {gamesAnalyzed} / {gamesLimit} games
        </span>
      </div>

      {/* Warning Message */}
      {isAtLimit && (
        <div className="mt-2 pt-2 border-t border-rose-500/20">
          <p className="text-[10px] text-rose-400">
            Upgrade to Pro to analyze unlimited games
          </p>
        </div>
      )}

      {/* Upgrade Link */}
      <Link
        href="/settings"
        className={`mt-2 block text-center text-[10px] uppercase tracking-wider py-1.5 border transition-colors ${
          isAtLimit
            ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
            : "border-[rgb(0,255,255)]/30 text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/10"
        }`}
      >
        {isAtLimit ? "Upgrade Now" : "Upgrade Plan"}
      </Link>
    </div>
  );
}

export default GameLimitBar;
