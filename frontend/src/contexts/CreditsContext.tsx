'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { fetchCreditStatus, CreditStatus } from "@/lib/api";

interface CreditsContextType {
  credits: CreditStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextType | null>(null);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const refresh = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    // Only fetch once on initial mount
    if (!hasFetched) {
      setHasFetched(true);
      refresh();
    }
  }, [hasFetched, refresh]);

  return (
    <CreditsContext.Provider value={{ credits, loading, error, refresh }}>
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
    };
  }
  return context;
}
