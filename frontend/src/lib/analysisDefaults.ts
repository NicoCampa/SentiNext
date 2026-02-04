'use client';

// Fixed review count - always analyze up to 1000 most recent reviews per game
export const FIXED_REVIEW_COUNT = 1000;

// Legacy exports for backwards compatibility (all map to 1000)
export const DEFAULT_ANALYSIS_REVIEW_COUNT = FIXED_REVIEW_COUNT;
export const MAX_ANALYSIS_REVIEW_COUNT = FIXED_REVIEW_COUNT;
export const ALL_REVIEWS_VALUE = FIXED_REVIEW_COUNT;
export const ANALYSIS_REVIEW_COUNT_OPTIONS = [FIXED_REVIEW_COUNT] as const;

export function sanitizeAnalysisReviewCount(_value: unknown): number {
  // Always return fixed count - no user configuration
  return FIXED_REVIEW_COUNT;
}

export function parseAnalysisReviewCount(_value: string | null | undefined): number {
  // Always return fixed count
  return FIXED_REVIEW_COUNT;
}

export function formatReviewCount(count: number): string {
  return count.toLocaleString();
}

export function loadDefaultAnalysisReviewCount(): number {
  // Always return fixed count - no stored preference
  return FIXED_REVIEW_COUNT;
}

export function saveDefaultAnalysisReviewCount(_count: number): void {
  // No-op - review count is fixed, nothing to save
}
