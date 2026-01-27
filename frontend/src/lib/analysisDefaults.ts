'use client';

export const DEFAULT_ANALYSIS_REVIEW_COUNT = 100;
export const MAX_ANALYSIS_REVIEW_COUNT = 2000;
export const ANALYSIS_REVIEW_COUNT_OPTIONS = [100, 200, 500, 1000, 2000] as const;

const STORAGE_KEY = "sentinext_default_review_count_v1";

export function sanitizeAnalysisReviewCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_ANALYSIS_REVIEW_COUNT, Math.max(1, Math.round(value)));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_ANALYSIS_REVIEW_COUNT, Math.max(1, parsed));
    }
  }
  return DEFAULT_ANALYSIS_REVIEW_COUNT;
}

export function parseAnalysisReviewCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(MAX_ANALYSIS_REVIEW_COUNT, Math.max(1, parsed));
}

export function loadDefaultAnalysisReviewCount(): number {
  if (typeof window === "undefined") return DEFAULT_ANALYSIS_REVIEW_COUNT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ANALYSIS_REVIEW_COUNT;
    return sanitizeAnalysisReviewCount(raw);
  } catch {
    return DEFAULT_ANALYSIS_REVIEW_COUNT;
  }
}

export function saveDefaultAnalysisReviewCount(count: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(sanitizeAnalysisReviewCount(count)));
  } catch {
    // Ignore storage failures (private mode, quota, etc).
  }
}

