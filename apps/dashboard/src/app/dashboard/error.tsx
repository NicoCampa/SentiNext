"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 max-w-lg">
        <h2 className="text-xl font-semibold text-red-400 mb-2">
          Dashboard Error
        </h2>
        <p className="text-sm text-slate-400 mb-2">
          Failed to load the dashboard. This could be a temporary issue.
        </p>
        <p className="text-xs text-slate-500 mb-6 font-mono break-all">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
