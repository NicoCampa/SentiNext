'use client';

import { useCallback, useEffect, useState } from "react";
import { fetchCreditStatus, CreditStatus } from "@/lib/api";

export interface UseCreditsResult {
  credits: CreditStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage credit status for the authenticated user.
 * Automatically refreshes on mount and provides a manual refresh function.
 */
export function useCredits(pollMs?: number): UseCreditsResult {
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await fetchCreditStatus();
      setCredits(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load credit status";
      setError(message);
      // Don't clear credits on error - keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) return;
      await refresh();
    };

    load();

    // Optional polling
    let interval: NodeJS.Timeout | null = null;
    if (pollMs && pollMs > 0) {
      interval = setInterval(() => {
        if (active) refresh();
      }, pollMs);
    }

    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [refresh, pollMs]);

  return { credits, loading, error, refresh };
}

export default useCredits;
