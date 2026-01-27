import type { ReviewRow } from "@/types";
import type { GlobalFilters, PlaytimeFilter } from "@/contexts/GlobalFiltersContext";
import { maxDaysFromDateRange } from "@/contexts/GlobalFiltersContext";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function matchesPlaytime(minutes: number, filter: PlaytimeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "lt2h") return minutes < 120;
  if (filter === "2to20h") return minutes >= 120 && minutes < 1200;
  if (filter === "20hplus") return minutes >= 1200;
  return true;
}

export function applyGlobalReviewFilters(reviews: ReviewRow[], filters: GlobalFilters): ReviewRow[] {
  if (!reviews.length) return [];

  const now = new Date();
  const maxDays = maxDaysFromDateRange(filters.dateRange);
  const lang = (filters.language || "all").trim().toLowerCase();

  return reviews.filter((review) => {
    if (filters.sentiment !== "all") {
      const isPositive = Boolean(review.voted_up);
      if (filters.sentiment === "positive" && !isPositive) return false;
      if (filters.sentiment === "negative" && isPositive) return false;
    }

    if (filters.minHelpful > 0) {
      const helpful = Number(review.votes_up ?? 0);
      if (!Number.isFinite(helpful) || helpful < filters.minHelpful) return false;
    }

    if (maxDays !== null) {
      const created = parseDate((review as unknown as { created_at?: unknown }).created_at);
      if (!created) return false;
      const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > maxDays) return false;
    }

    if (filters.playtime !== "all") {
      const minutes = Number(review.author_playtime_forever ?? 0);
      if (!Number.isFinite(minutes)) return false;
      if (!matchesPlaytime(minutes, filters.playtime)) return false;
    }

    if (lang && lang !== "all") {
      const reviewLang = String((review as unknown as { language?: unknown }).language ?? "")
        .trim()
        .toLowerCase();
      if (!reviewLang) return false;
      if (reviewLang !== lang) return false;
    }

    return true;
  });
}

