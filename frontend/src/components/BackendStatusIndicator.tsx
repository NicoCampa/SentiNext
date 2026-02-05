'use client';

import { Button } from "@/components/ui/button";
import { useBackendHealth } from "@/hooks/useBackendHealth";

export function BackendStatusIndicator() {
  const { health, refresh } = useBackendHealth();

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
        </>
      ) : null}
    </div>
  );
}
