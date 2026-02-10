"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import type { HealthOverviewData } from "@/types";

interface HealthOverviewCardProps {
  overview: HealthOverviewData | null | undefined;
  onRefresh: () => void;
  refreshing: boolean;
  gameName?: string;
  reviewCount?: number;
  startDate?: string | null;
  endDate?: string | null;
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-rose-400";
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return "border-emerald-500/30 bg-emerald-500/10";
  if (score >= 5) return "border-amber-500/30 bg-amber-500/10";
  return "border-rose-500/30 bg-rose-500/10";
}

function getTrendIcon(trend: string) {
  if (trend === "improving") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
        Improving
      </span>
    );
  }
  if (trend === "declining") {
    return (
      <span className="inline-flex items-center gap-1 text-rose-400 text-xs font-medium">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
        Declining
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-400 text-xs font-medium">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
      Stable
    </span>
  );
}

export default function HealthOverviewCard({
  overview,
  onRefresh,
  refreshing,
  reviewCount,
  startDate,
  endDate,
}: HealthOverviewCardProps) {
  if (!overview) {
    return (
      <Card variant="glass" className="p-4 sm:p-6 border-sky-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-sm font-medium text-slate-400">Overview</h3>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {refreshing ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              "Generate"
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Run analysis to generate an overview, or click Generate to create one now.</p>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="p-4 sm:p-6 border-sky-500/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="text-sm font-medium text-white">Overview</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="text-xs px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-sky-400 hover:border-sky-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title="Refresh overview"
        >
          {refreshing ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-4 sm:gap-6">
        {/* Left: Health Score + Trend */}
        <div className="flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2 sm:min-w-[80px]">
          <div className={`flex items-center justify-center w-16 h-16 rounded-xl border ${getScoreBgColor(overview.health_score)}`}>
            <span className={`text-2xl font-bold ${getScoreColor(overview.health_score)}`}>
              {overview.health_score}
            </span>
          </div>
          {getTrendIcon(overview.sentiment_trend)}
        </div>

        {/* Right: Summary + Columns */}
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-sm text-slate-200 leading-relaxed">{overview.summary}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            {/* Strengths */}
            {overview.top_strengths.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Strengths
                </h4>
                <ul className="space-y-1">
                  {overview.top_strengths.map((item, idx) => (
                    <li key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <span className="text-emerald-400 mt-0.5 flex-shrink-0">+</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Points */}
            {overview.key_points.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-white/70 mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
                  Key Facts
                </h4>
                <ul className="space-y-1">
                  {overview.key_points.map((item, idx) => (
                    <li key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <span className="text-sky-300 mt-0.5 flex-shrink-0">&#8226;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            {overview.actions.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-sky-400 mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  Actions
                </h4>
                <ul className="space-y-1">
                  {overview.actions.map((item, idx) => (
                    <li key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <span className="text-sky-400 mt-0.5 flex-shrink-0">&rarr;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
        <p className="text-[10px] text-slate-500">
          Based on {reviewCount ?? "N/A"} reviews
          {startDate && endDate ? ` \u00b7 ${startDate} \u2192 ${endDate}` : ""}
        </p>
      </div>
    </Card>
  );
}
