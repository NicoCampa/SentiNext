'use client';

import { useState, useEffect } from "react";
import { Chart } from "react-chartjs-2";
import '@/lib/chatChartUtils';
import { buildChartOptions } from "@/lib/chatChartUtils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchAdminApiUsage,
  fetchAdminAnalytics,
  ApiUsageSummary,
  EventsSummary,
} from "@/lib/api";

interface AnalyticsTabProps {
  isAdmin: boolean;
}

export function AnalyticsTab({ isAdmin }: AnalyticsTabProps) {
  // API usage state
  const [apiUsage, setApiUsage] = useState<ApiUsageSummary | null>(null);
  const [apiUsageLoading, setApiUsageLoading] = useState(false);
  const [adminDashboardDays, setAdminDashboardDays] = useState(30);

  // User analytics state
  const [analytics, setAnalytics] = useState<EventsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsHours, setAnalyticsHours] = useState(24);

  async function loadApiUsage(days: number = adminDashboardDays) {
    if (!isAdmin) return;
    setApiUsageLoading(true);
    try {
      const usage = await fetchAdminApiUsage({ days });
      setApiUsage(usage);
    } catch (err) {
      console.error("Failed to load API usage", err);
    } finally {
      setApiUsageLoading(false);
    }
  }

  async function loadAnalytics(hours: number = analyticsHours) {
    if (!isAdmin) return;
    setAnalyticsLoading(true);
    try {
      const data = await fetchAdminAnalytics(hours);
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load analytics", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadApiUsage(adminDashboardDays);
      loadAnalytics(analyticsHours);
    }
  }, [isAdmin]);

  return (
    <div className="space-y-6">
      {/* ─── API Activity Section ─── */}
      <Card variant="glass" className="p-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">
              API Activity
            </p>
          </div>
          <p className="text-sm text-slate-400">Request metrics for the last {apiUsage?.period_days ?? adminDashboardDays} days</p>
        </div>

        {apiUsageLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-10 bg-white/5 rounded" />
            <div className="h-3 bg-white/5 rounded w-2/3" />
            <div className="h-10 bg-white/5 rounded" />
          </div>
        ) : apiUsage ? (
          <>
            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Requests</p>
                <p className="font-mono text-xs text-cyan-300">{apiUsage.total_requests.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Unique Users</p>
                <p className="font-mono text-xs text-cyan-300">{apiUsage.unique_users.toLocaleString()}</p>
              </div>
            </div>

            {/* Daily Activity Chart */}
            {apiUsage.daily.length > 0 && (
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">
                  Daily Activity
                </p>
                <div className="h-48">
                  <Chart
                    type="line"
                    data={{
                      labels: apiUsage.daily.map((d) => d.date),
                      datasets: [
                        {
                          label: "Requests",
                          data: apiUsage.daily.map((d) => d.count),
                          borderColor: "rgba(103, 232, 249, 1)",
                          backgroundColor: "rgba(103, 232, 249, 0.15)",
                          borderWidth: 2,
                          tension: 0.3,
                          pointRadius: 2,
                          pointHoverRadius: 5,
                          pointBackgroundColor: "rgba(103, 232, 249, 1)",
                          fill: true,
                        },
                      ],
                    }}
                    options={buildChartOptions({
                      type: "line",
                      data: { datasets: [] },
                    }) as any}
                  />
                </div>
              </div>
            )}

            {/* Top Endpoints Bar Chart */}
            {apiUsage.by_endpoint.length > 0 && (
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">
                  Top Endpoints
                </p>
                <div className="h-64 mb-4">
                  <Chart
                    type="bar"
                    data={{
                      labels: apiUsage.by_endpoint.slice(0, 10).map((e) => e.path),
                      datasets: [
                        {
                          label: "Requests",
                          data: apiUsage.by_endpoint.slice(0, 10).map((e) => e.count),
                          backgroundColor: "rgba(103, 232, 249, 0.6)",
                          borderColor: "rgba(103, 232, 249, 1)",
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={buildChartOptions({
                      type: "bar",
                      data: { datasets: [] },
                      options: { indexAxis: "y" as const },
                    }) as any}
                  />
                </div>
                <div className="space-y-2">
                  {apiUsage.by_endpoint.map((ep, idx) => (
                    <div key={`${ep.path}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 truncate mr-4">{ep.path}</span>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="font-mono text-cyan-300">{ep.count.toLocaleString()}</span>
                        <span className="font-mono text-slate-500">{ep.avg_ms}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User Activity */}
            {apiUsage.by_user.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  User Activity
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {apiUsage.by_user.map((u, idx) => (
                    <div key={`${u.user_id}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 truncate mr-4">{u.user_id}</span>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="font-mono text-cyan-300">{u.count.toLocaleString()}</span>
                        <span className="text-slate-500">
                          {u.first_seen ? new Date(u.first_seen).toLocaleDateString() : "\u2014"}
                          {" - "}
                          {u.last_seen ? new Date(u.last_seen).toLocaleDateString() : "\u2014"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500">No API usage data available.</p>
        )}
      </Card>

      {/* ─── User Analytics Section ─── */}
      <Card variant="glass" className="p-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs uppercase tracking-[0.25em] text-emerald-300/70">
              User Analytics
            </p>
          </div>
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 6, 24, 72, 168].map((h) => (
            <button
              key={h}
              onClick={() => { setAnalyticsHours(h); loadAnalytics(h); }}
              className={`px-2 py-1 text-xs uppercase tracking-[0.2em] border ${
                analyticsHours === h
                  ? "border-emerald-400 text-emerald-300"
                  : "border-white/10 text-slate-400 hover:border-white/20"
              }`}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => loadAnalytics(analyticsHours)}
            disabled={analyticsLoading}
          >
            {analyticsLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {analyticsLoading && !analytics ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-20 bg-white/5 rounded" />
            <div className="h-48 bg-white/5 rounded" />
            <div className="h-32 bg-white/5 rounded" />
          </div>
        ) : analytics ? (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Events</p>
                <p className="font-mono text-lg text-emerald-300">{analytics.total_events.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Unique Users</p>
                <p className="font-mono text-lg text-emerald-300">{analytics.unique_users.toLocaleString()}</p>
              </div>
            </div>

            {/* Events Over Time Chart */}
            {analytics.events_over_time.length > 0 && (
              <div className="p-4 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Events Over Time</p>
                <div className="h-48">
                  <Chart
                    type="line"
                    data={{
                      labels: analytics.events_over_time.map((d) => {
                        const date = new Date(d.hour);
                        return analyticsHours <= 24
                          ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit" });
                      }),
                      datasets: [
                        {
                          label: "Events",
                          data: analytics.events_over_time.map((d) => d.count),
                          borderColor: "rgba(52, 211, 153, 1)",
                          backgroundColor: "rgba(52, 211, 153, 0.15)",
                          borderWidth: 2,
                          tension: 0.3,
                          pointRadius: 2,
                          pointHoverRadius: 5,
                          pointBackgroundColor: "rgba(52, 211, 153, 1)",
                          fill: true,
                        },
                      ],
                    }}
                    options={buildChartOptions({
                      type: "line",
                      data: { datasets: [] },
                    }) as any}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Events */}
              <div className="p-4 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Top Events</p>
                {analytics.top_events.length === 0 ? (
                  <p className="text-xs text-slate-500">No events recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {analytics.top_events.map((ev, idx) => (
                      <div key={`${ev.event_name}-${idx}`} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-300 truncate">{ev.event_name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px] flex-shrink-0">
                            {ev.event_category}
                          </span>
                        </div>
                        <span className="font-mono text-emerald-300 flex-shrink-0 ml-2">{ev.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Pages */}
              <div className="p-4 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Top Pages</p>
                {analytics.top_pages.length === 0 ? (
                  <p className="text-xs text-slate-500">No page views recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {analytics.top_pages.map((pg, idx) => (
                      <div key={`${pg.page}-${idx}`} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 truncate">{pg.page}</span>
                        <span className="font-mono text-emerald-300 flex-shrink-0 ml-2">{pg.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Active Users */}
            <div className="p-4 bg-slate-950/40 border border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Active Users</p>
              {analytics.active_users.length === 0 ? (
                <p className="text-xs text-slate-500">No active users in this period.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {analytics.active_users.map((u, idx) => (
                    <div key={`${u.user_id}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate mr-4">{u.user_id}</span>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="font-mono text-emerald-300">{u.event_count} events</span>
                        <span className="text-slate-500">
                          {new Date(u.last_active).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Events Feed */}
            <div className="p-4 bg-slate-950/40 border border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Recent Events</p>
              {analytics.recent_events.length === 0 ? (
                <p className="text-xs text-slate-500">No recent events.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {analytics.recent_events.map((ev, idx) => (
                    <div
                      key={`${ev.created_at}-${idx}`}
                      className="p-2 bg-slate-950/40 border border-white/5 rounded text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-300 font-medium">{ev.event_name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">
                            {ev.event_category}
                          </span>
                        </div>
                        <span className="text-slate-500 text-[10px]">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-slate-500">
                        <span className="truncate">{ev.user_id}</span>
                        {ev.page && <span>on {ev.page}</span>}
                        {ev.target && <span className="text-slate-400">&rarr; {ev.target}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No analytics data available.</p>
        )}
      </Card>
    </div>
  );
}
