'use client';

export const REVIEW_COUNT_OPTIONS = [1000, 2000] as const;
export type ReviewCountOption = (typeof REVIEW_COUNT_OPTIONS)[number];

export const DEFAULT_ANALYSIS_REVIEW_COUNT = 1000;
export const MAX_ANALYSIS_REVIEW_COUNT = 2000;

export function formatReviewCount(count: number): string {
  return count.toLocaleString();
}

export function loadDefaultAnalysisReviewCount(): number {
  if (typeof window === 'undefined') return DEFAULT_ANALYSIS_REVIEW_COUNT;
  const stored = localStorage.getItem('sentinext_review_count');
  const parsed = stored ? parseInt(stored, 10) : NaN;
  return (REVIEW_COUNT_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_ANALYSIS_REVIEW_COUNT;
}

export function saveDefaultAnalysisReviewCount(count: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('sentinext_review_count', String(count));
}
