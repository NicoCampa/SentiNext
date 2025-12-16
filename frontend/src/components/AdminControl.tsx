'use client';

import { useEffect, useMemo, useState } from "react";

import {
  fetchBackendAdminStatus,
  type BackendAdminStatus,
  getAdminToken,
  setAdminToken,
  verifyAdminToken,
} from "@/lib/api";

export function AdminControl() {
  const [backendStatus, setBackendStatus] = useState<BackendAdminStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUnlock = Boolean(backendStatus?.destructive_enabled && backendStatus?.token_configured);

  const hint = useMemo(() => {
    if (!backendStatus) return null;
    if (backendStatus.destructive_enabled && backendStatus.token_configured) return null;
    if (!backendStatus.destructive_enabled) {
      return "Set SENTINEXT_ENABLE_DESTRUCTIVE=1 on the backend to enable admin actions.";
    }
    return "Set SENTINEXT_ADMIN_TOKEN on the backend to enable admin actions.";
  }, [backendStatus]);

  async function refresh() {
    setError(null);
    try {
      const backend = await fetchBackendAdminStatus();
      setBackendStatus(backend);
      const stored = getAdminToken();
      if (!stored) {
        setUnlocked(false);
        return;
      }

      // If admin features are currently available, validate the stored token.
      if (backend.destructive_enabled && backend.token_configured) {
        try {
          await verifyAdminToken(stored);
          setUnlocked(true);
        } catch {
          setAdminToken(null);
          setUnlocked(false);
        }
        return;
      }

      // Admin features disabled: keep UI locked (token not useful anyway).
      setUnlocked(false);
    } catch (err) {
      setError((err as Error).message || "Failed to load admin status");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleUnlock() {
    setBusy(true);
    setError(null);
    try {
      const value = token.trim();
      await verifyAdminToken(value);
      setAdminToken(value);
      setToken("");
      await refresh();
    } catch (err) {
      setError((err as Error).message || "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    setError(null);
    try {
      setAdminToken(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message || "Lock failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.5em] text-slate-400">Admin</p>
          <p className="text-xs text-slate-300">
            Status:{" "}
            <span className={unlocked ? "text-emerald-300" : "text-amber-300"}>
              {unlocked ? "unlocked" : "locked"}
            </span>
          </p>
        </div>

        {unlocked ? (
          <button
            onClick={handleLock}
            disabled={busy}
            className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            {busy ? "..." : "Lock"}
          </button>
        ) : (
          <button
            onClick={handleUnlock}
            disabled={busy || !canUnlock || token.trim().length < 1}
            className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50"
          >
            {busy ? "..." : "Unlock"}
          </button>
        )}
      </div>

      {!unlocked && (
        <div className="space-y-2">
          <input
            type="password"
            value={token}
            placeholder="Admin token"
            onChange={(event) => setToken(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
          {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
        </div>
      )}

      {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
    </div>
  );
}
