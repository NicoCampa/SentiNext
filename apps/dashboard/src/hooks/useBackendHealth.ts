'use client';

import { useCallback, useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

export type BackendHealthState =
  | { state: "checking" }
  | { state: "online"; timestamp?: string }
  | { state: "offline"; error?: string };

export function useBackendHealth(pollMs: number = 5000) {
  const [health, setHealth] = useState<BackendHealthState>({ state: "checking" });

  const check = useCallback(async () => {
    try {
      const result = await fetchHealth();
      setHealth({ state: "online", timestamp: result.timestamp });
    } catch (err) {
      setHealth({ state: "offline", error: (err as Error)?.message || "offline" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      setHealth({ state: "checking" });
      await check();
    })();

    const interval = setInterval(() => {
      check();
    }, pollMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [check, pollMs]);

  return { health, refresh: check };
}

