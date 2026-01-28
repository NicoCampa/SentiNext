'use client';

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type SentimentFilter = "all" | "positive" | "negative";
export type DateRangeFilter = "all" | "30d" | "90d" | "365d";
export type HelpfulFilter = 0 | 10 | 25 | 50;
export type PlaytimeFilter = "all" | "lt2h" | "2to20h" | "20hplus";

export interface GlobalFilters {
  sentiment: SentimentFilter;
  dateRange: DateRangeFilter;
  minHelpful: HelpfulFilter;
  playtime: PlaytimeFilter;
  language: string;
}

interface GlobalFiltersContextValue {
  filters: GlobalFilters;
  setFilters: (next: GlobalFilters) => void;
  updateFilters: (patch: Partial<GlobalFilters>) => void;
  resetFilters: () => void;
  filtersActive: boolean;
}

const STORAGE_KEY = "sentinext_global_filters_v1";

const DEFAULT_FILTERS: GlobalFilters = {
  sentiment: "all",
  dateRange: "all",
  minHelpful: 0,
  playtime: "all",
  language: "all",
};

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function sanitizeSentiment(value: unknown): SentimentFilter {
  return value === "positive" || value === "negative" ? value : "all";
}

function sanitizeDateRange(value: unknown): DateRangeFilter {
  return value === "30d" || value === "90d" || value === "365d" ? value : "all";
}

function sanitizeHelpful(value: unknown): HelpfulFilter {
  const num = Number(value);
  if (num === 10 || num === 25 || num === 50) return num;
  return 0;
}

function sanitizePlaytime(value: unknown): PlaytimeFilter {
  return value === "lt2h" || value === "2to20h" || value === "20hplus" ? value : "all";
}

function sanitizeFilters(raw: Partial<GlobalFilters> | null): GlobalFilters {
  const language = normalizeString(raw?.language).toLowerCase();
  return {
    sentiment: sanitizeSentiment(raw?.sentiment),
    dateRange: sanitizeDateRange(raw?.dateRange),
    minHelpful: sanitizeHelpful(raw?.minHelpful),
    playtime: sanitizePlaytime(raw?.playtime),
    language: language && language !== "all" ? language : "all",
  };
}

function loadStoredFilters(): GlobalFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_FILTERS;
    const parsed = JSON.parse(stored) as Partial<GlobalFilters>;
    return sanitizeFilters(parsed);
  } catch (err) {
    console.warn("Failed to load global filters.", err);
    return DEFAULT_FILTERS;
  }
}

function saveStoredFilters(filters: GlobalFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (err) {
    console.warn("Failed to persist global filters.", err);
  }
}


const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null);

export function GlobalFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(() => loadStoredFilters());
  useEffect(() => {
    saveStoredFilters(filters);
  }, [filters]);

  const updateFilters = (patch: Partial<GlobalFilters>) => {
    setFilters((prev) => sanitizeFilters({ ...prev, ...patch }));
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const filtersActive = useMemo(() => {
    return (
      filters.sentiment !== "all" ||
      filters.dateRange !== "all" ||
      filters.minHelpful > 0 ||
      filters.playtime !== "all" ||
      (!!filters.language && filters.language !== "all")
    );
  }, [filters]);

  const value = useMemo<GlobalFiltersContextValue>(
    () => ({
      filters,
      setFilters: (next) => setFilters(sanitizeFilters(next)),
      updateFilters,
      resetFilters,
      filtersActive,
    }),
    [filters, filtersActive],
  );

  return <GlobalFiltersContext.Provider value={value}>{children}</GlobalFiltersContext.Provider>;
}

export function useGlobalFilters(): GlobalFiltersContextValue {
  const ctx = useContext(GlobalFiltersContext);
  if (!ctx) {
    throw new Error("useGlobalFilters must be used within GlobalFiltersProvider");
  }
  return ctx;
}

export function maxDaysFromDateRange(range: DateRangeFilter): number | null {
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  if (range === "365d") return 365;
  return null;
}
