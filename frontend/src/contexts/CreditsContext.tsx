'use client';

import { createContext, useCallback, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { fetchCreditStatus, CreditStatus } from "@/lib/api";

// Polling interval for credit updates (30 seconds)
const CREDIT_POLL_INTERVAL = 30000;

interface CreditsContextType {
  credits: CreditStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Silently refresh without setting loading state - useful for background updates */
  silentRefresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextType | null>(null);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const refreshingRef = useRef(false);

  const silentRefresh = useCallback(async () => {
    // Prevent concurrent refreshes
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const status = await fetchCreditStatus();
      setCredits(status);
      setError(null);
    } catch (err) {
      // Silent refresh doesn't update error state to avoid UI flicker
      console.error("Silent credit refresh failed:", err);
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    // Prevent concurrent refreshes
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      setLoading(true);
      setError(null);
      const status = await fetchCreditStatus();
      setCredits(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load credit status";
      setError(message);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!hasFetched) {
      setHasFetched(true);
      refresh();
    }
  }, [hasFetched, refresh]);

  // Periodic polling for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      silentRefresh();
    }, CREDIT_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [silentRefresh]);

  // Refresh on window focus (user coming back to tab)
  useEffect(() => {
    const handleFocus = () => {
      silentRefresh();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [silentRefresh]);

  return (
    <CreditsContext.Provider value={{ credits, loading, error, refresh, silentRefresh }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextType {
  const context = useContext(CreditsContext);
  if (!context) {
    // Fallback for components outside provider - shouldn't happen in normal use
    return {
      credits: null,
      loading: true,
      error: null,
      refresh: async () => {},
      silentRefresh: async () => {},
    };
  }
  return context;
}
