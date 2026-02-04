'use client';

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageTransition } from "@/components/PageTransition";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGameContext } from "@/contexts/GameContext";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

const MAIN_CATEGORY_LABELS: Record<string, string> = {
  gameplay: "Gameplay",
  technical: "Technical",
  content_design: "Content & Design",
  ui_ux_accessibility: "UI/UX & Accessibility",
  onboarding: "Onboarding",
  presentation: "Presentation",
  online_community: "Online & Community",
  developer_updates: "Developer & Updates",
  monetization_value: "Monetization & Value",
  other: "Other / Meta",
};

function titleize(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ui") return "UI";
      if (lower === "ux") return "UX";
      if (lower === "ugc") return "UGC";
      if (lower === "ai") return "AI";
      if (lower === "dlc") return "DLC";
      if (lower === "fomo") return "FOMO";
      if (lower === "p2w") return "P2W";
      if (lower === "ctd") return "CTD";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function formatTaxonomyLabel(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  const direct = MAIN_CATEGORY_LABELS[normalized];
  if (direct) return direct;
  if (trimmed.includes("/")) {
    const [mainRaw, subRaw] = trimmed.split("/", 2);
    const main = MAIN_CATEGORY_LABELS[mainRaw.toLowerCase()] ?? titleize(mainRaw);
    return `${main} / ${titleize(subRaw)}`;
  }
  return titleize(trimmed);
}

function hasIssue(review: any): boolean {
  return (
    review.llm_has_issue === true ||
    (Array.isArray(review.llm_issue_subcategories) && review.llm_issue_subcategories.length > 0)
  );
}

function hasRequest(review: any): boolean {
  return (
    review.llm_has_request === true ||
    (Array.isArray(review.llm_request_subcategories) && review.llm_request_subcategories.length > 0)
  );
}

function formatReviewDate(value?: string | null): string {
  if (!value) return "Date unknown";
  const parsed = Number(value);
  const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return date.toLocaleDateString();
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading reviews...</div>}>
      <ReviewsContent />
    </Suspense>
  );
}

function ReviewsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { games, loading: gamesLoading, selectGameById } = useGameContext();
  const { density } = useUiPreferences();

  const [quickSentiment, setQuickSentiment] = useState<"all" | "positive" | "negative">("all");
  const [quickType, setQuickType] = useState<"all" | "issue" | "request">("all");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);

  const appId = parseInt(searchParams.get("appId") || "0");
  const filterType = searchParams.get("filterType") || "";
  const filterValue = searchParams.get("filterValue") || "";
  const hasActiveFilters =
    quickSentiment !== "all" || quickType !== "all" || !!filterType || !!filterValue;

  const clearAllFilters = () => {
    setQuickSentiment("all");
    setQuickType("all");
    if (filterType || filterValue) {
      const next = appId ? `/reviews?appId=${appId}` : "/reviews";
      router.replace(next);
    }
  };

  const game = useMemo(() => {
    if (!appId) return null;
    return games.find((entry) => entry.app_id === appId) || null;
  }, [appId, games]);

  useEffect(() => {
    if (!appId) {
      router.push("/dashboard");
      return;
    }
    selectGameById(appId);
  }, [appId, router, selectGameById]);

  useEffect(() => {
    if (gamesLoading) return;
    if (!appId) return;
    if (!game) {
      router.push("/dashboard");
    }
  }, [appId, game, gamesLoading, router]);

  const compact = density === "compact";

  const sample = game?.sample ?? [];
  const baseReviews = useMemo(() => sample, [sample]);
  const scopedReviews = useMemo(() => {
    return baseReviews.filter((review: any) => {
      if (filterType === "subcategory") {
        const subcats = Array.isArray(review.llm_subcategories) ? review.llm_subcategories : [];
        if (!subcats.includes(filterValue)) return false;
      }

      if (filterType === "main_category") {
        if (review.llm_main_category !== filterValue) return false;
      }

      if (filterType === "voted_up") {
        if (filterValue === "positive" && !review.voted_up) return false;
        if (filterValue === "negative" && review.voted_up) return false;
      }

      if (filterType === "feature_request" || filterType === "request") {
        const hasRequestFlag = review.llm_has_request ?? (Array.isArray(review.llm_request_subcategories) && review.llm_request_subcategories.length > 0);
        if (filterValue === "yes" && !hasRequestFlag) return false;
      }

      if (filterType === "risk_refund") {
        if (review.voted_up || (review.author_playtime_forever || 0) >= 120) return false;
      }

      if (filterType === "risk_core_fan") {
        if (review.voted_up || (review.author_playtime_forever || 0) < 3000) return false;
      }

      if (filterType === "risk_churn") {
        if (review.voted_up || (review.author_playtime_last_two_weeks || 0) > 0) return false;
      }

      return true;
    });
  }, [baseReviews, filterType, filterValue]);

  const quickFilteredReviews = useMemo(() => {
    return scopedReviews.filter((review: any) => {
      if (quickSentiment === "positive" && !review.voted_up) return false;
      if (quickSentiment === "negative" && review.voted_up) return false;
      if (quickType === "issue" && !hasIssue(review)) return false;
      if (quickType === "request" && !hasRequest(review)) return false;
      return true;
    });
  }, [quickSentiment, quickType, scopedReviews]);

  useEffect(() => {
    if (quickFilteredReviews.length === 0) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return prev < quickFilteredReviews.length ? prev : 0;
    });
  }, [quickFilteredReviews]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.isContentEditable) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!quickFilteredReviews.length) return;

      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, quickFilteredReviews.length - 1);
        });
      }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickFilteredReviews]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const item = document.getElementById(`review-item-${selectedIndex}`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const selectedReview = selectedIndex !== null ? quickFilteredReviews[selectedIndex] : null;

  if (gamesLoading) {
    return (
      <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Card variant="glass" className="p-8">
            <div className="flex items-center justify-center gap-4">
              <div className="h-8 w-8 animate-spin spinner-blue" />
              <p className="text-lg text-slate-300">Loading reviews...</p>
            </div>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
    );
  }

  if (!game) {
    return null;
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-7xl space-y-8 sm:space-y-6 px-4 py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">
                <span className="text-white">
                  {game.name}
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {hasActiveFilters
                  ? `Filtered reviews: ${scopedReviews.length} / ${(game.sample || []).length}`
                  : `${(game.sample || []).length} reviews`}{" "}
                - Showing: {quickFilteredReviews.length}
              </p>
              {filterType === "subcategory" && (
                <p className="mt-1 text-sm text-sky-400">
                  Subcategory: &quot;{filterValue.replace(/_/g, " ").replace("/", " / ")}&quot;
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button onClick={clearAllFilters} variant="secondary" size="sm">
                  Clear filters
                </Button>
              ) : null}
              <Button onClick={() => router.back()} variant="secondary">
                ← Back to Analysis
              </Button>
            </div>
          </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card variant="glass" className="flex flex-col p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Reviews</h2>
                <p className="text-xs text-slate-400">Use ↑/↓ or J/K to move</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="text-xs uppercase tracking-[0.25em] text-slate-500">Quick filters</span>
                <div className="flex flex-wrap gap-2">
                  {(["all", "positive", "negative"] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setQuickSentiment(value)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        quickSentiment === value
                          ? "border-sky-400 bg-sky-500/20 text-white"
                          : "border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/40 hover:text-white"
                      }`}
                      type="button"
                    >
                      {value === "all" ? "All sentiment" : value === "positive" ? "Recommended" : "Not recommended"}
                    </button>
                  ))}
                  {(["all", "issue", "request"] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setQuickType(value)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        quickType === value
                          ? "border-purple-400 bg-purple-500/20 text-white"
                          : "border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/40 hover:text-white"
                      }`}
                      type="button"
                    >
                      {value === "all" ? "All types" : value === "issue" ? "Issues" : "Requests"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex-1 overflow-auto pr-1">
              {quickFilteredReviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                  No reviews match these filters. Try clearing filters above.
                </div>
              ) : (
                <div className="space-y-3">
                  {quickFilteredReviews.map((review: any, idx: number) => {
                    const isActive = idx === selectedIndex;
                    const playtime = review.author_playtime_hours ?? (review.author_playtime_forever || 0) / 60;
                    return (
                      <button
                        key={`${review.review_id}-${idx}`}
                        id={`review-item-${idx}`}
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className={`w-full rounded-2xl border text-left transition ${
                          isActive
                            ? "border-sky-400/60 bg-sky-500/10"
                            : "border-white/10 bg-slate-900/30 hover:border-sky-500/40"
                        } ${compact ? "p-3" : "p-4"}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] ${
                                review.voted_up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                              }`}
                            >
                              {review.voted_up ? "Recommended" : "Not recommended"}
                            </span>
                            {review.llm_main_category ? (
                              <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-[11px] text-indigo-200">
                                {formatTaxonomyLabel(review.llm_main_category)}
                              </span>
                            ) : null}
                            {hasIssue(review) ? (
                              <span className="rounded-full bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">
                                Issue
                              </span>
                            ) : null}
                            {hasRequest(review) ? (
                              <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-200">
                                Request
                              </span>
                            ) : null}
                          </div>
                          <span>{playtime.toFixed(1)}h</span>
                        </div>
                        <p className={`mt-2 line-clamp-3 text-sm text-slate-100 ${compact ? "leading-snug" : "leading-relaxed"}`}>
                          {review.review}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{formatReviewDate(review.created_at)}</span>
                          {review.votes_up ? <span>{review.votes_up} helpful</span> : <span>—</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card variant="glass" className="flex flex-col p-6">
            {selectedReview ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Review details</h2>
                    <p className="text-xs text-slate-400">
                      {formatReviewDate(selectedReview.created_at)} -{selectedReview.votes_up || 0} helpful
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        selectedReview.voted_up ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
                      }`}
                    >
                      {selectedReview.voted_up ? "Recommended" : "Not recommended"}
                    </span>
                    {selectedReview.llm_main_category ? (
                      <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs text-indigo-200">
                        {formatTaxonomyLabel(selectedReview.llm_main_category)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
                  <p className="whitespace-pre-line">{selectedReview.review}</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Labels</p>
                    {selectedReview.llm_subcategories?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedReview.llm_subcategories.map((value: string, idx: number) => (
                          <span key={`${value}-${idx}`} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                            {formatTaxonomyLabel(value)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No subcategories tagged.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Issues & Requests</p>
                    <div className="space-y-3 text-xs text-slate-300">
                      {selectedReview.llm_issue_subcategories?.length ? (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">Issues</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedReview.llm_issue_subcategories.map((value: string, idx: number) => (
                              <span key={`${value}-${idx}`} className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-200">
                                {formatTaxonomyLabel(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No issues tagged.</p>
                      )}
                      {selectedReview.llm_request_subcategories?.length ? (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Requests</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedReview.llm_request_subcategories.map((value: string, idx: number) => (
                              <span key={`${value}-${idx}`} className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs text-cyan-200">
                                {formatTaxonomyLabel(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Evidence</p>
                  {selectedReview.llm_subcategory_evidence && Object.keys(selectedReview.llm_subcategory_evidence).length ? (
                    <div className="mt-3 space-y-3 text-sm text-slate-200">
                      {Object.entries(selectedReview.llm_subcategory_evidence).map(([subcategory, snippets]) => (
                        <div key={subcategory} className="rounded-xl border border-white/5 bg-white/5 p-3">
                          <p className="text-xs font-semibold text-slate-300">{formatTaxonomyLabel(subcategory)}</p>
                          <div className="mt-2 space-y-2 text-xs text-slate-200">
                            {snippets.map((snippet, idx) => (
                              <p key={`${subcategory}-${idx}`} className="rounded-lg bg-slate-950/40 px-3 py-2">
                                {snippet}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No evidence snippets saved for this review.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-400">
                <p>Select a review to see labels and evidence.</p>
                <p className="text-xs text-slate-500">Tip: use ↑/↓ or J/K to move quickly.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageTransition>
    </AppLayout>
  );
}
