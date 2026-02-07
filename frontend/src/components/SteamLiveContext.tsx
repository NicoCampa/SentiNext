'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchSteamPlayerCount,
  fetchSteamNews,
  summarizeNews,
  SteamNewsItem,
  SteamPlayerCountResponse,
  SummarizeNewsResponse,
} from '@/lib/api';

interface SteamLiveContextProps {
  appId: number;
  showPlayers?: boolean;
  showNews?: boolean;
  newsCount?: number;
  className?: string;
}

function formatPlayerCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

function formatNewsDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CurrentPlayersWidget({ appId, className = '' }: { appId: number; className?: string }) {
  const [playerData, setPlayerData] = useState<SteamPlayerCountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSteamPlayerCount(appId);
      setPlayerData(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch player count');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
        <span className="text-[10px] text-slate-400">Loading...</span>
      </div>
    );
  }

  if (error || !playerData?.player_count) {
    return null; // Silently fail for player count
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 ${className}`}>
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="text-[10px] sm:text-xs font-medium text-emerald-400">
        {formatPlayerCount(playerData.player_count)} playing
      </span>
    </div>
  );
}

export function NewsWidget({
  appId,
  count = 5,
  className = ''
}: {
  appId: number;
  count?: number;
  className?: string;
}) {
  const [news, setNews] = useState<SteamNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSteamNews(appId, count, 300);
      setNews(data.news_items);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch news');
    } finally {
      setLoading(false);
    }
  }, [appId, count]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-500">Recent Updates</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-800/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || news.length === 0) {
    return null;
  }

  const displayedNews = expanded ? news : news.slice(0, 3);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Recent Updates</span>
        {news.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
          >
            {expanded ? 'Show less' : `+${news.length - 3} more`}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {displayedNews.map((item) => (
          <a
            key={item.gid}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 p-2 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:border-slate-600/50 hover:bg-slate-800/50 transition-all group"
          >
            <div className="flex-shrink-0 mt-0.5">
              {item.feed_label.toLowerCase().includes('patch') || item.feed_label.toLowerCase().includes('update') ? (
                <span className="text-amber-400 text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </span>
              ) : (
                <span className="text-sky-400 text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-200 line-clamp-1 group-hover:text-white transition-colors">
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-500">{formatNewsDate(item.date)}</span>
                <span className="text-[10px] text-slate-600">·</span>
                <span className="text-[10px] text-slate-500 truncate">{item.feed_label}</span>
              </div>
            </div>
            <svg className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}

export function NewsWithSummary({
  appId,
  count = 10,
  className = ''
}: {
  appId: number;
  count?: number;
  className?: string;
}) {
  const [news, setNews] = useState<SteamNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<SummarizeNewsResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSteamNews(appId, count, 400);
      setNews(data.news_items);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch news');
    } finally {
      setLoading(false);
    }
  }, [appId, count]);

  useEffect(() => {
    fetchData();
    // Reset summary when app changes
    setSummary(null);
    setShowSummary(false);
  }, [fetchData]);

  const handleSummarize = useCallback(async () => {
    if (summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await summarizeNews({
        app_id: appId,
        news_count: Math.min(news.length, 15),
        include_sentiment: true,
      });
      setSummary(result);
      setShowSummary(true);
    } catch (err) {
      setSummaryError((err as Error).message || 'Failed to generate summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [appId, news.length, summaryLoading]);

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-500">Recent Updates</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-800/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || news.length === 0) {
    return (
      <div className={`text-center py-4 ${className}`}>
        <p className="text-sm text-slate-500">No recent updates available</p>
      </div>
    );
  }

  const displayedNews = expanded ? news : news.slice(0, 4);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header with Summarize Button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Recent Updates ({news.length})
        </span>
        <button
          onClick={handleSummarize}
          disabled={summaryLoading || news.length === 0}
          className="text-[10px] px-2 py-1 rounded border border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {summaryLoading ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Summarizing...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {summary ? 'Refresh Summary' : 'AI Summary'}
            </>
          )}
        </button>
      </div>

      {/* AI Summary Panel */}
      {showSummary && summary && (
        <div className="p-3 rounded-lg bg-gradient-to-br from-sky-500/10 to-purple-500/10 border border-sky-500/20 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[10px] uppercase tracking-wider text-sky-400">AI Summary</span>
            </div>
            <button
              onClick={() => setShowSummary(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed">{summary.summary}</p>

          {summary.key_updates.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Key Updates</p>
              <ul className="space-y-1">
                {summary.key_updates.map((update, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-300">
                    <span className="text-amber-400 mt-0.5">•</span>
                    {update}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.potential_impacts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Potential Impact</p>
              <ul className="space-y-1">
                {summary.potential_impacts.map((impact, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-300">
                    <span className="text-purple-400 mt-0.5">→</span>
                    {impact}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.correlation_insights && (
            <div className="pt-2 border-t border-slate-700/50">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-1">Recommendation Correlation</p>
              <p className="text-xs text-slate-300">{summary.correlation_insights}</p>
            </div>
          )}

          <p className="text-[9px] text-slate-600 text-right">
            Based on {summary.news_count} updates • {summary.credits_charged} credits
          </p>
        </div>
      )}

      {summaryError && (
        <div className="p-2 rounded border border-rose-500/30 bg-rose-500/10">
          <p className="text-xs text-rose-400">{summaryError}</p>
        </div>
      )}

      {/* News List */}
      <div className="space-y-1.5">
        {displayedNews.map((item) => (
          <a
            key={item.gid}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 p-2 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:border-slate-600/50 hover:bg-slate-800/50 transition-all group"
          >
            <div className="flex-shrink-0 mt-0.5">
              {item.feed_label.toLowerCase().includes('patch') || item.feed_label.toLowerCase().includes('update') ? (
                <span className="text-amber-400 text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </span>
              ) : (
                <span className="text-sky-400 text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-200 line-clamp-1 group-hover:text-white transition-colors">
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-500">{formatNewsDate(item.date)}</span>
                <span className="text-[10px] text-slate-600">·</span>
                <span className="text-[10px] text-slate-500 truncate">{item.feed_label}</span>
              </div>
            </div>
            <svg className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ))}
      </div>

      {/* Show More/Less */}
      {news.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center py-1.5 text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${news.length} updates`}
        </button>
      )}
    </div>
  );
}

export function NewsTimelineMarkers({
  appId,
  trendStartDate,
  trendEndDate,
  onNewsClick,
}: {
  appId: number;
  trendStartDate: Date;
  trendEndDate: Date;
  onNewsClick?: (news: SteamNewsItem) => void;
}) {
  const [news, setNews] = useState<SteamNewsItem[]>([]);

  useEffect(() => {
    async function loadNews() {
      try {
        const data = await fetchSteamNews(appId, 50, 200);
        // Filter to news within the trend date range
        const filtered = data.news_items.filter((item) => {
          const newsDate = new Date(item.date * 1000);
          return newsDate >= trendStartDate && newsDate <= trendEndDate;
        });
        setNews(filtered);
      } catch {
        // Silently fail
      }
    }
    loadNews();
  }, [appId, trendStartDate, trendEndDate]);

  if (news.length === 0) return null;

  const timeRange = trendEndDate.getTime() - trendStartDate.getTime();

  return (
    <div className="absolute inset-x-0 top-0 h-full pointer-events-none">
      {news.map((item) => {
        const newsDate = new Date(item.date * 1000);
        const position = ((newsDate.getTime() - trendStartDate.getTime()) / timeRange) * 100;
        const isPatch = item.feed_label.toLowerCase().includes('patch') || item.feed_label.toLowerCase().includes('update');

        return (
          <div
            key={item.gid}
            className="absolute top-0 bottom-0 w-px group pointer-events-auto cursor-pointer"
            style={{ left: `${position}%` }}
            onClick={() => onNewsClick?.(item)}
          >
            <div className={`absolute top-0 bottom-0 w-px ${isPatch ? 'bg-amber-500/30' : 'bg-sky-500/30'}`} />
            <div
              className={`absolute top-0 w-2 h-2 -translate-x-1/2 rounded-full ${isPatch ? 'bg-amber-500' : 'bg-sky-500'} opacity-60 group-hover:opacity-100 transition-opacity`}
              title={item.title}
            />
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-700 rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap max-w-[200px]">
              <p className="text-[10px] text-slate-200 truncate">{item.title}</p>
              <p className="text-[9px] text-slate-500">{formatNewsDate(item.date)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SteamLiveContext({
  appId,
  showPlayers = true,
  showNews = true,
  newsCount = 5,
  className = '',
}: SteamLiveContextProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {showPlayers && <CurrentPlayersWidget appId={appId} />}
      {showNews && <NewsWidget appId={appId} count={newsCount} />}
    </div>
  );
}
