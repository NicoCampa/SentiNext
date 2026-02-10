/**
 * Formatting utilities for displaying data
 */

export function formatPercentage(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatSavedLabel(timestamp?: string | null): string {
  if (!timestamp) return "just now";
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleString();
}

export function formatEta(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(clamped / 60);
  const secs = clamped % 60;
  if (minutes && secs) {
    return `${minutes}m ${secs}s`;
  }
  if (minutes) {
    return `${minutes}m`;
  }
  return `${secs}s`;
}

export function formatPlaytime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  if (hours < 1) {
    return `${minutes}m`;
  }
  return `${hours.toFixed(1)}h`;
}