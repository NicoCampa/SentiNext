'use client';

export const DEFAULT_ANALYSIS_REVIEW_COUNT = 200;
export const MAX_ANALYSIS_REVIEW_COUNT = 5000;
// 0 represents "All" reviews (backend will use its max limit)
export const ALL_REVIEWS_VALUE = 0;
export const ANALYSIS_REVIEW_COUNT_OPTIONS = [200, 1000, ALL_REVIEWS_VALUE] as const;

const STORAGE_KEY = "sentinext_default_review_count_v2";

export function sanitizeAnalysisReviewCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    // 0 is valid (means "all")
    if (value === 0) return 0;
    return Math.min(MAX_ANALYSIS_REVIEW_COUNT, Math.max(1, Math.round(value)));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      // 0 is valid (means "all")
      if (parsed === 0) return 0;
      return Math.min(MAX_ANALYSIS_REVIEW_COUNT, Math.max(1, parsed));
    }
  }
  return DEFAULT_ANALYSIS_REVIEW_COUNT;
}

export function parseAnalysisReviewCount(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value === "" || value === "0") return 0; // "0" means "all"
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(MAX_ANALYSIS_REVIEW_COUNT, Math.max(1, parsed));
}

export function formatReviewCount(count: number): string {
  if (count === ALL_REVIEWS_VALUE) return "All";
  return count.toLocaleString();
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

