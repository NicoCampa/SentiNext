'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  fetchAdminDashboardSummary,
  type AdminDashboardSummary,
} from '@/lib/api';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  indie: 'Indie',
  max: 'Enterprise',
};

interface DashboardTabProps {
  isAdmin: boolean;
}

export function DashboardTab({ isAdmin }: DashboardTabProps) {
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  async function loadDashboard(d: number = days) {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchAdminDashboardSummary({ days: d });
      setDashboard(summary);
    } catch (err) {
      console.error('Failed to load admin dashboard', err);
      setError('Failed to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard(days);
  }, [isAdmin, days]);

  return (
    <div className="space-y-6">
      <Card variant="glass" className="p-6">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">Usage Overview</p>
          <p className="mt-1 text-sm text-slate-400">
            Metrics for the last {dashboard?.days ?? days} days
          </p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Overview</span>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2 py-1 text-xs uppercase tracking-[0.2em] border ${
                  days === d
                    ? 'border-amber-400 text-amber-300'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                {d}d
              </button>
            ))}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => loadDashboard(days)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-10 bg-white/5 rounded" />
            <div className="h-3 bg-white/5 rounded w-2/3" />
            <div className="h-10 bg-white/5 rounded" />
          </div>
        ) : dashboard ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Users</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.users.total.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">New Users</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.users.new.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active Users</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.users.active.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Paid Users</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.users.paid.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">MRR (Est.)</p>
                <p className="font-mono text-xs text-amber-300">${dashboard.users.mrr_estimate.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Credits Used</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.credits.used.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LLM Cost</p>
                <p className="font-mono text-xs text-amber-300">${dashboard.llm.cost_total_usd.toFixed(4)}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LLM Calls</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.llm.calls.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-950/40 border border-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LLM Tokens</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.llm.total_tokens.toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Top Credit Operations</p>
              <div className="space-y-2">
                {dashboard.credits.by_operation.slice(0, 5).map((item, idx) => (
                  <div key={`${item.operation ?? 'unknown'}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{item.operation ?? 'unknown'}</span>
                    <span className="font-mono text-amber-300">{item.credits_used.toLocaleString()} credits</span>
                  </div>
                ))}
                {dashboard.credits.by_operation.length === 0 && (
                  <p className="text-xs text-slate-500">No usage recorded yet.</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Tier Breakdown</p>
              <div className="space-y-2">
                {dashboard.users.tier_counts.map((item, idx) => (
                  <div key={`${item.tier ?? 'unknown'}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {item.tier ? (TIER_LABELS[item.tier] ?? item.tier) : 'unknown'}
                    </span>
                    <span className="font-mono text-amber-300">{item.count.toLocaleString()}</span>
                  </div>
                ))}
                {dashboard.users.tier_counts.length === 0 && (
                  <p className="text-xs text-slate-500">No tier data available.</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Top Users by Credits</p>
              <div className="space-y-2">
                {dashboard.credits.top_users.slice(0, 5).map((item, idx) => (
                  <div key={`${item.user_id}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{item.user_id}</span>
                    <span className="font-mono text-amber-300">{item.credits_used.toLocaleString()}</span>
                  </div>
                ))}
                {dashboard.credits.top_users.length === 0 && (
                  <p className="text-xs text-slate-500">No user data available.</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Top Apps by Credits</p>
              <div className="space-y-2">
                {dashboard.credits.top_apps.slice(0, 5).map((item, idx) => (
                  <div key={`${item.app_id}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">App {item.app_id}</span>
                    <span className="font-mono text-amber-300">{item.credits_used.toLocaleString()}</span>
                  </div>
                ))}
                {dashboard.credits.top_apps.length === 0 && (
                  <p className="text-xs text-slate-500">No app data available.</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">LLM Costs by Operation</p>
              <div className="space-y-2">
                {dashboard.llm.by_operation.slice(0, 5).map((item, idx) => (
                  <div key={`${item.key}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{item.key}</span>
                    <span className="font-mono text-amber-300">${item.cost_total_usd.toFixed(4)}</span>
                  </div>
                ))}
                {dashboard.llm.by_operation.length === 0 && (
                  <p className="text-xs text-slate-500">No LLM usage recorded yet.</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">LLM Costs by Model</p>
              <div className="space-y-2">
                {dashboard.llm.by_model.map((item, idx) => (
                  <div key={`${item.key}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 truncate mr-2">{item.key}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-mono text-amber-300">${item.cost_total_usd.toFixed(4)}</span>
                      <span className="font-mono text-slate-500">{item.calls.toLocaleString()} calls</span>
                    </div>
                  </div>
                ))}
                {dashboard.llm.by_model.length === 0 && (
                  <p className="text-xs text-slate-500">No model data available.</p>
                )}
              </div>
            </div>

            {dashboard.cost_per_user && dashboard.cost_per_user.length > 0 && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">
                  Expected LLM Cost Per User
                </p>
                <p className="text-[10px] text-slate-600 mb-3">
                  Estimated provider cost per user if all credits are consumed
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-1.5 text-slate-500 font-medium">Tier</th>
                        <th className="text-right py-1.5 text-slate-500 font-medium">Credits</th>
                        <th className="text-right py-1.5 text-green-400/70 font-medium">Light</th>
                        <th className="text-right py-1.5 text-amber-400/70 font-medium">Typical</th>
                        <th className="text-right py-1.5 text-red-400/70 font-medium">Heavy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.cost_per_user.map((est) => (
                        <tr key={est.tier} className="border-b border-white/5">
                          <td className="py-1.5 text-slate-300">
                            {TIER_LABELS[est.tier] ?? est.tier}
                          </td>
                          <td className="py-1.5 text-right font-mono text-slate-400">
                            {est.credits.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right font-mono text-green-400">
                            ${est.light_usd.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-amber-300">
                            ${est.typical_usd.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-red-400">
                            ${est.heavy_usd.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-600 mt-2">
                  Light = all classify &middot; Typical = 55% classify + 20% chat + 15% summary + 10% other &middot; Heavy = all chat agent
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-rose-400">{error ?? 'No dashboard data available.'}</p>
        )}
      </Card>
    </div>
  );
}
