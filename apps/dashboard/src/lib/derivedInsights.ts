import type { CategoryRecommendationRate, ReviewRow, SubcategoryInsight } from "@/types";

function listifyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeSnippets(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : value == null ? [] : [value];
  const cleaned: string[] = [];
  rawItems.forEach((item) => {
    if (item === null || item === undefined) return;
    const text = String(item).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return;
    const trimmed = text.slice(0, 160);
    if (!cleaned.includes(trimmed)) {
      cleaned.push(trimmed);
    }
  });
  return cleaned;
}

function coerceVotedUp(value: unknown, defaultValue = true): boolean {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      ["true", "1", "yes", "positive", "recommended", "recommend", "thumbs_up", "thumbsup", "up"].includes(normalized)
    ) {
      return true;
    }
    if (
      ["false", "0", "no", "negative", "not recommended", "not_recommended", "thumbs_down", "thumbsdown", "down"].includes(
        normalized,
      )
    ) {
      return false;
    }
  }
  return defaultValue;
}

export function buildSubcategoryInsights(reviews: ReviewRow[], maxSnippets = 6): SubcategoryInsight[] {
  const results = new Map<
    string,
    SubcategoryInsight & {
      recommended: number;
      not_recommended: number;
      issue_snippets: string[];
      request_snippets: string[];
    }
  >();

  reviews.forEach((review) => {
    const subcats = listifyStrings(review.llm_subcategories);
    if (!subcats.length) return;
    const issueSet = new Set(listifyStrings(review.llm_issue_subcategories));
    const requestSet = new Set(listifyStrings(review.llm_request_subcategories));
    const evidenceRaw = review.llm_subcategory_evidence;
    const evidence =
      evidenceRaw && typeof evidenceRaw === "object" && !Array.isArray(evidenceRaw)
        ? (evidenceRaw as Record<string, unknown>)
        : {};
    const isPositive = coerceVotedUp(review.voted_up, true);

    subcats.forEach((subcat) => {
      const key = subcat.trim();
      if (!key) return;
      const entry =
        results.get(key) ??
        ({
          subcategory: key,
          main_category: "",
          sub_category: "",
          count: 0,
          recommended: 0,
          not_recommended: 0,
          issue_count: 0,
          request_count: 0,
          issue_snippets: [],
          request_snippets: [],
        } as SubcategoryInsight & {
          recommended: number;
          not_recommended: number;
          issue_snippets: string[];
          request_snippets: string[];
        });

      entry.count += 1;
      if (isPositive) {
        entry.recommended = (entry.recommended ?? 0) + 1;
      } else {
        entry.not_recommended = (entry.not_recommended ?? 0) + 1;
      }
      if (issueSet.has(key)) {
        entry.issue_count += 1;
      }
      if (requestSet.has(key)) {
        entry.request_count += 1;
      }

      const snippets = normalizeSnippets(evidence[key]);
      if (snippets.length) {
        if (issueSet.has(key)) {
          for (const snippet of snippets) {
            if (entry.issue_snippets.includes(snippet)) continue;
            if (entry.issue_snippets.length >= maxSnippets) break;
            entry.issue_snippets.push(snippet);
          }
        }
        if (requestSet.has(key)) {
          for (const snippet of snippets) {
            if (entry.request_snippets.includes(snippet)) continue;
            if (entry.request_snippets.length >= maxSnippets) break;
            entry.request_snippets.push(snippet);
          }
        }
      }

      results.set(key, entry);
    });
  });

  const insights = Array.from(results.values()).map((entry) => {
    const raw = entry.subcategory ?? "";
    const [mainRaw, subRaw] = raw.includes("/") ? raw.split("/", 2) : ["other", raw || entry.sub_category || "general"];
    const count = Number(entry.count ?? 0);
    const recommended = Number(entry.recommended ?? 0);
    return {
      ...entry,
      main_category: mainRaw || "other",
      sub_category: subRaw || "general",
      recommendation_rate: count ? recommended / count : 0,
      count,
      recommended,
      not_recommended: Number(entry.not_recommended ?? 0),
    };
  });

  insights.sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0));
  return insights;
}

export function buildCategoryRates(reviews: ReviewRow[]): Record<string, CategoryRecommendationRate> {
  const buckets = new Map<string, { count: number; recommended: number; not_recommended: number }>();

  reviews.forEach((review) => {
    const subcats = listifyStrings(review.llm_subcategories);
    if (!subcats.length) return;
    const mainSet = new Set<string>();
    subcats.forEach((subcat) => {
      const raw = subcat.trim();
      if (!raw) return;
      const main = raw.includes("/") ? raw.split("/", 1)[0] : "other";
      if (!main) return;
      mainSet.add(main.toLowerCase());
    });
    if (mainSet.size === 0) return;
    const isPositive = coerceVotedUp(review.voted_up, true);

    mainSet.forEach((main) => {
      const entry = buckets.get(main) ?? { count: 0, recommended: 0, not_recommended: 0 };
      entry.count += 1;
      if (isPositive) {
        entry.recommended += 1;
      } else {
        entry.not_recommended += 1;
      }
      buckets.set(main, entry);
    });
  });

  const result: Record<string, CategoryRecommendationRate> = {};
  buckets.forEach((entry, main) => {
    result[main] = {
      count: entry.count,
      recommended: entry.recommended,
      not_recommended: entry.not_recommended,
      rate: entry.count ? entry.recommended / entry.count : 0,
    };
  });
  return result;
}
