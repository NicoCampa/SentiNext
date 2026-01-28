'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { isTauriApp } from "@/lib/settings";

export function BackendStatusIndicator() {
  const { health, refresh } = useBackendHealth();
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const bootError =
    typeof window !== "undefined" ? (window as Window & { __SENTINEXT_BACKEND_BOOT_ERROR__?: string | null }).__SENTINEXT_BACKEND_BOOT_ERROR__ : null;

  async function handleRestart() {
    if (!isTauriApp()) return;
    setRestartError(null);
    setRestarting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      const apiBase = await invoke<string>("restart_backend");
      window.__SENTINEXT_API_BASE__ = apiBase;
      (window as Window & { __SENTINEXT_BACKEND_BOOT_ERROR__?: string | null }).__SENTINEXT_BACKEND_BOOT_ERROR__ = null;
      await refresh();
    } catch (err) {
      console.error("Failed to restart backend", err);
      setRestartError((err as Error)?.message || "Failed to restart backend.");
    } finally {
      setRestarting(false);
    }
  }

  const label =
    health.state === "online" ? "Backend online" : health.state === "offline" ? "Backend offline" : "Checking backend...";
  const dotClass =
    health.state === "online"
      ? "bg-emerald-400"
      : health.state === "offline"
        ? "bg-rose-400"
        : "bg-slate-500";

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className="text-xs text-slate-400">{label}</span>
      {health.state === "offline" ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => refresh()}>
            Retry
          </Button>
          {isTauriApp() ? (
            <Button variant="ghost" size="sm" onClick={handleRestart} disabled={restarting}>
              {restarting ? "Restarting..." : "Restart"}
            </Button>
          ) : null}
        </>
      ) : null}
      {bootError ? <span className="text-xs text-rose-300/80">Startup issue</span> : null}
      {restartError ? <span className="text-xs text-rose-300/80">{restartError}</span> : null}
    </div>
  );
}
