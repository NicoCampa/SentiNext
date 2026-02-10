'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchSteamAchievements,
  SteamAchievement,
  SteamAchievementsResponse,
} from '@/lib/api';

interface AchievementsWidgetProps {
  appId: number;
  limit?: number;
  className?: string;
}

function formatPercent(value: number): string {
  if (value >= 10) return `${Math.round(value)}%`;
  if (value >= 1) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

function getAchievementColor(percent: number): string {
  if (percent >= 50) return 'bg-emerald-500';
  if (percent >= 20) return 'bg-sky-500';
  if (percent >= 5) return 'bg-amber-500';
  return 'bg-rose-500';
}

function getAchievementTextColor(percent: number): string {
  if (percent >= 50) return 'text-emerald-400';
  if (percent >= 20) return 'text-sky-400';
  if (percent >= 5) return 'text-amber-400';
  return 'text-rose-400';
}

export function AchievementsWidget({
  appId,
  limit = 20,
  className = '',
}: AchievementsWidgetProps) {
  const [data, setData] = useState<SteamAchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchSteamAchievements(appId, limit);
      setData(response);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch achievements');
    } finally {
      setLoading(false);
    }
  }, [appId, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Player Progression</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-slate-800/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || data.achievements.length === 0) {
    return null; // Silently fail
  }

  const displayedAchievements = showAll ? data.achievements : data.achievements.slice(0, 8);

  // Determine key achievements
  const startedAchievement = data.achievements.find(a =>
    a.display_name.toLowerCase().includes('start') ||
    a.display_name.toLowerCase().includes('first') ||
    a.display_name.toLowerCase().includes('begin') ||
    a.percent >= 80
  );
  const completedAchievement = data.achievements.find(a =>
    a.display_name.toLowerCase().includes('complete') ||
    a.display_name.toLowerCase().includes('finish') ||
    a.display_name.toLowerCase().includes('end') ||
    a.display_name.toLowerCase().includes('beat')
  );

  // Find the rarest achievement
  const rarestAchievement = data.achievements.reduce((min, a) =>
    a.percent < min.percent ? a : min
  , data.achievements[0]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Player Progression</span>
        {data.completion_rate !== null && (
          <span className="text-[10px] text-slate-400">
            Avg completion: {formatPercent(data.completion_rate)}
          </span>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total</p>
          <p className="text-lg font-semibold text-white">{data.total_count}</p>
          <p className="text-[10px] text-slate-500">achievements</p>
        </div>
        {startedAchievement && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Started</p>
            <p className="text-lg font-semibold text-emerald-400">{formatPercent(startedAchievement.percent)}</p>
            <p className="text-[10px] text-slate-500 truncate" title={startedAchievement.display_name}>
              {startedAchievement.display_name}
            </p>
          </div>
        )}
        {completedAchievement && (
          <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <p className="text-[10px] text-sky-400/70 uppercase tracking-wider">Finished</p>
            <p className="text-lg font-semibold text-sky-400">{formatPercent(completedAchievement.percent)}</p>
            <p className="text-[10px] text-slate-500 truncate" title={completedAchievement.display_name}>
              {completedAchievement.display_name}
            </p>
          </div>
        )}
        {!completedAchievement && rarestAchievement && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-[10px] text-amber-400/70 uppercase tracking-wider">Rarest</p>
            <p className="text-lg font-semibold text-amber-400">{formatPercent(rarestAchievement.percent)}</p>
            <p className="text-[10px] text-slate-500 truncate" title={rarestAchievement.display_name}>
              {rarestAchievement.display_name}
            </p>
          </div>
        )}
      </div>

      {/* Achievement List */}
      <div className="space-y-1.5">
        {displayedAchievements.map((achievement) => (
          <div
            key={achievement.name}
            className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/20 border border-slate-700/20 hover:bg-slate-800/40 transition-colors group"
          >
            {achievement.icon ? (
              <img
                src={achievement.icon}
                alt=""
                className="w-8 h-8 rounded flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-8 h-8 rounded bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-200 truncate group-hover:text-white transition-colors">
                  {achievement.display_name}
                </p>
                <span className={`text-xs font-medium ${getAchievementTextColor(achievement.percent)} flex-shrink-0`}>
                  {formatPercent(achievement.percent)}
                </span>
              </div>
              <div className="mt-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getAchievementColor(achievement.percent)} transition-all`}
                  style={{ width: `${Math.min(achievement.percent, 100)}%` }}
                />
              </div>
              {achievement.description && (
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                  {achievement.hidden ? '[Hidden]' : achievement.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Show More Button */}
      {data.achievements.length > 8 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2 text-xs text-sky-400 hover:text-sky-300 transition-colors"
        >
          {showAll ? 'Show less' : `Show all ${data.achievements.length} achievements`}
        </button>
      )}
    </div>
  );
}
