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

  const creditsRemaining = Math.max(0, credits.limit - credits.used);
  const creditPercentRemaining = Math.max(0, 100 - Math.min(credits.percent_used, 110));
  const isWarning = credits.warning;
  const isBlocked = credits.blocked;

  const getCreditBarColor = () => {
    if (isBlocked) return "bg-rose-500";
    if (isWarning) return "bg-amber-500";
    if (creditPercentRemaining < 20) return "bg-amber-400";
    return "bg-[rgb(0,255,255)]";
  };

  const getCreditTextColor = () => {
    if (isBlocked) return "text-rose-400";
    if (isWarning) return "text-amber-400";
    return "text-[rgb(0,255,255)]";
  };

  // Only show for free tier
  if (tier !== 'free') {
    return (
      <Link
        href="/settings"
        className="block p-3 border border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)]/50 hover:border-[rgb(0,255,255)]/30 transition-colors"
      >
        {/* Header with Plan */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/50">
            Plan
          </span>
          <span className={`text-[10px] uppercase tracking-wider ${
            tier === "max" ? "text-purple-400" : "text-[rgb(0,255,255)]"
          }`}>
            {tierLabel}
          </span>
        </div>

        {/* Credits Progress Bar */}
        <div className="mb-2">
          <div className="h-1.5 bg-[rgb(0,255,255)]/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${getCreditBarColor()} transition-all duration-300`}
              style={{ width: `${creditPercentRemaining}%` }}
            />
          </div>
        </div>

        {/* Credits Stats */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-mono ${getCreditTextColor()}`}>
            {creditsRemaining.toLocaleString()} credits
          </span>
          <span className="text-[9px] text-[rgb(150,150,170)]">
            / {credits.limit.toLocaleString()}
          </span>
        </div>
      </Link>
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

      {/* Credits Section */}
      <div className="mt-3 pt-3 border-t border-[rgb(0,255,255)]/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] uppercase tracking-[0.15em] text-[rgb(0,255,255)]/40">
            Credits
          </span>
          <span className={`text-xs font-mono ${getCreditTextColor()}`}>
            {creditsRemaining.toLocaleString()} left
          </span>
        </div>
        <div className="h-1 bg-[rgb(0,255,255)]/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${getCreditBarColor()} transition-all duration-300`}
            style={{ width: `${creditPercentRemaining}%` }}
          />
        </div>
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
