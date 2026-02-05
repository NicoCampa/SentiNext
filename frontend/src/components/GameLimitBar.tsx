'use client';

import { useCredits } from "@/contexts/CreditsContext";
import Link from "next/link";

export function GameLimitBar() {
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
  const tierLabelMap: Record<string, string> = {
    free: "Free",
    indie: "Indie",
    pro: "Pro",
    max: "Enterprise",
  };
  const tierLabel = tierLabelMap[tier] ?? tier;

  // Game-based limits - all tiers have limits now
  const gamesUsed = credits.games_used ?? 0;
  // Fallback limits if backend hasn't been updated yet
  const defaultLimits: Record<string, number | null> = { free: 3, indie: 10, pro: 25, max: null };
  const rawLimit = credits.games_limit ?? defaultLimits[tier] ?? null;
  const isUnlimited = rawLimit === null;
  const gamesLimit = isUnlimited ? 0 : rawLimit;
  const gamesRemaining = isUnlimited ? null : Math.max(0, gamesLimit - gamesUsed);
  const isAtGameLimit = isUnlimited ? false : (credits.at_game_limit ?? (gamesUsed >= gamesLimit));

  // Calculate percentage for progress bar
  const percentUsed = isUnlimited ? 100 : (gamesLimit > 0 ? (gamesUsed / gamesLimit) * 100 : 0);

  const getBarColor = () => {
    if (isAtGameLimit) return "bg-rose-500";
    if (gamesUsed >= gamesLimit - 1) return "bg-amber-400";
    if (tier === "max") return "bg-purple-500";
    if (tier === "pro") return "bg-sky-400";
    if (tier === "indie") return "bg-emerald-500";
    return "bg-[rgb(0,255,255)]";
  };

  const getTextColor = () => {
    if (isAtGameLimit) return "text-rose-400";
    if (gamesUsed >= gamesLimit - 1) return "text-amber-400";
    if (tier === "max") return "text-purple-400";
    if (tier === "pro") return "text-sky-400";
    if (tier === "indie") return "text-emerald-400";
    return "text-[rgb(0,255,255)]";
  };

  const getTierColor = () => {
    if (tier === "max") return "text-purple-400";
    if (tier === "pro") return "text-sky-400";
    if (tier === "indie") return "text-emerald-400";
    return "text-[rgb(0,255,255)]";
  };

  const getBorderClass = () => {
    if (isAtGameLimit) return "border-rose-500/30 bg-rose-500/5";
    if (tier === "max") return "border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40";
    if (tier === "pro") return "border-sky-500/20 bg-sky-500/5 hover:border-sky-500/40";
    if (tier === "indie") return "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40";
    return "border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)]/50";
  };

  const getUpgradeMessage = () => {
    if (tier === "free") return "Upgrade to Indie to analyze more games";
    if (tier === "indie") return "Upgrade to Pro for more games";
    if (tier === "pro") return "Upgrade to Enterprise for unlimited games";
    return "You're on the Enterprise plan";
  };

  const getButtonText = () => {
    if (isAtGameLimit) return "Upgrade Now";
    if (tier === "free") return "Upgrade to Indie";
    if (tier === "indie") return "Upgrade to Pro";
    if (tier === "pro") return "Contact Sales";
    return "Manage Plan";
  };

  const getButtonClass = () => {
    if (isAtGameLimit) return "border-rose-500/30 text-rose-400 hover:bg-rose-500/10";
    if (tier === "max") return "border-purple-500/30 text-purple-400 hover:bg-purple-500/10";
    if (tier === "pro") return "border-sky-500/30 text-sky-400 hover:bg-sky-500/10";
    if (tier === "indie") return "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10";
    return "border-[rgb(0,255,255)]/30 text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/10";
  };

  const actionHref = tier === "pro" || tier === "max" ? "/support" : "/settings";

  return (
    <div className={`p-3 border ${getBorderClass()}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isAtGameLimit && (
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
          )}
          <span className="text-[10px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/50">
            {isAtGameLimit ? "Limit Reached" : "Games Analyzed"}
          </span>
        </div>
        <span className={`text-[10px] uppercase tracking-wider ${getTierColor()}`}>
          {tierLabel}
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
          {gamesUsed} / {isUnlimited ? "Unlimited" : gamesLimit} games
        </span>
        {gamesRemaining !== null && gamesRemaining > 0 && (
          <span className="text-[9px] text-[rgb(150,150,170)]">
            {gamesRemaining} remaining
          </span>
        )}
      </div>

      {/* Warning Message */}
      {isAtGameLimit && (
        <div className="mt-2 pt-2 border-t border-rose-500/20">
          <p className="text-[10px] text-rose-400">
            {getUpgradeMessage()}
          </p>
        </div>
      )}

      {/* Action Link */}
      <Link
        href={actionHref}
        className={`mt-2 block text-center text-[10px] uppercase tracking-wider py-1.5 border transition-colors ${getButtonClass()}`}
      >
        {getButtonText()}
      </Link>
    </div>
  );
}

export default GameLimitBar;
