'use client';

import { useCredits } from "@/contexts/CreditsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import Link from "next/link";

interface CreditBarProps {
  compact?: boolean;
}

export function CreditBar({ compact = false }: CreditBarProps) {
  const { credits, loading } = useCredits();
  const { t } = useLanguage();

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

  const percentUsed = Math.min(credits.percent_used, 110);
  // Show remaining credits (bar goes DOWN as you use more)
  const percentRemaining = Math.max(0, 100 - percentUsed);
  const isWarning = credits.warning;
  const isBlocked = credits.blocked;

  // Format the reset date
  const resetDate = credits.period_end
    ? new Date(credits.period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  // Determine bar color based on remaining credits
  const getBarColor = () => {
    if (isBlocked) return "bg-rose-500";
    if (isWarning) return "bg-amber-500";
    if (percentRemaining < 20) return "bg-amber-400";
    return "bg-[rgb(0,255,255)]";
  };

  // Determine text color based on status
  const getTextColor = () => {
    if (isBlocked) return "text-rose-400";
    if (isWarning) return "text-amber-400";
    return "text-[rgb(0,255,255)]";
  };

  const tierLabel = credits.tier.charAt(0).toUpperCase() + credits.tier.slice(1);

  if (compact) {
    return (
      <Link
        href="/settings"
        className="block p-2 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 hover:border-[rgb(0,255,255)]/30 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] uppercase tracking-[0.15em] text-[rgb(0,255,255)]/50">
            Credits
          </span>
          <span className={`text-xs font-mono ${getTextColor()}`}>
            {Math.max(0, credits.limit - credits.used).toLocaleString()} left
          </span>
        </div>
        <div className="mt-1 h-1 bg-[rgb(0,255,255)]/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${getBarColor()} transition-all duration-300`}
            style={{ width: `${percentRemaining}%` }}
          />
        </div>
      </Link>
    );
  }

  return (
    <div
      className={`p-3 border ${
        isBlocked
          ? "border-rose-500/30 bg-rose-500/5"
          : isWarning
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)]/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isBlocked && (
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
          )}
          {isWarning && !isBlocked && (
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
          )}
          <span className="text-[10px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/50">
            {isBlocked ? "Credits Exceeded" : isWarning ? "Credits Low" : "Credits"}
          </span>
        </div>
        <span className={`text-[10px] uppercase tracking-wider ${getTextColor()}`}>
          {tierLabel}
        </span>
      </div>

      {/* Progress Bar - shows remaining credits */}
      <div className="mb-2">
        <div className="h-2 bg-[rgb(0,255,255)]/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${getBarColor()} transition-all duration-300`}
            style={{ width: `${percentRemaining}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-mono ${getTextColor()}`}>
          {Math.max(0, credits.limit - credits.used).toLocaleString()} left
        </span>
        {resetDate && (
          <span className="text-[9px] text-[rgb(150,150,170)]">
            Resets {resetDate}
          </span>
        )}
      </div>

      {/* Warning/Blocked Message */}
      {isBlocked && (
        <div className="mt-2 pt-2 border-t border-rose-500/20">
          <p className="text-[10px] text-rose-400">
            Upgrade your plan or wait for credits to reset.
          </p>
        </div>
      )}
      {isWarning && !isBlocked && (
        <div className="mt-2 pt-2 border-t border-amber-500/20">
          <p className="text-[10px] text-amber-400">
            You&apos;ve exceeded your monthly limit. Consider upgrading.
          </p>
        </div>
      )}

      {/* Upgrade Link */}
      {(isWarning || credits.tier === "free") && (
        <Link
          href="/settings"
          className={`mt-2 block text-center text-[10px] uppercase tracking-wider py-1.5 border transition-colors ${
            isBlocked
              ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              : isWarning
              ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              : "border-[rgb(0,255,255)]/30 text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/10"
          }`}
        >
          {isBlocked || isWarning ? "Upgrade Now" : "Upgrade Plan"}
        </Link>
      )}
    </div>
  );
}

export default CreditBar;
