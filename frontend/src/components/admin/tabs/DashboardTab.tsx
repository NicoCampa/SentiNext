'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  fetchAdminDashboardSummary,
  type AdminDashboardSummary,
} from '@/lib/api';

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
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active Users</p>
                <p className="font-mono text-xs text-amber-300">{dashboard.users.active.toLocaleString()}</p>
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

          </>
        ) : (
          <p className="text-xs text-rose-400">{error ?? 'No dashboard data available.'}</p>
        )}
      </Card>
    </div>
  );
}
