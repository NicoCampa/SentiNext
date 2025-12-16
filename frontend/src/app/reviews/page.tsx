'use client';

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { fetchStarredGames } from "@/lib/api";
import { StarredGameDTO } from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

  // All hooks must be called at the top level
  const [game, setGame] = useState<StarredGameDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const appId = parseInt(searchParams.get("appId") || "0");
  const filterType = searchParams.get("filterType") || "";
  const filterValue = searchParams.get("filterValue") || "";

  useEffect(() => {
    async function loadGame() {
      if (!appId) {
        router.push("/dashboard");
        return;
      }

      try {
        const starred = await fetchStarredGames();
        const found = starred.find((g) => g.app_id === appId);

        if (found) {
          setGame(found);
        } else {
          router.push("/dashboard");
        }
      } catch (error) {
        console.error("Failed to load game:", error);
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadGame();
  }, [appId, router]);

  if (loading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Card variant="glass" className="p-8">
            <div className="flex items-center justify-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-sky-500" />
              <p className="text-lg text-slate-300">Loading reviews...</p>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!game) {
    return null;
  }

  // Filter reviews
  const filteredReviews = (game.sample || []).filter((review: any) => {
    if (filterType === "standardized_issue") {
      const issues = Array.isArray(review.llm_issues) ? review.llm_issues : [];
      const hasIssue = issues.some((issue: any) => issue?.category === filterValue);
      if (!hasIssue) return false;
    }

    if (filterType === "urgency") {
      if (review.llm_urgency !== filterValue) return false;
    }

    if (filterType === "main_category") {
      if (review.llm_main_category !== filterValue) return false;
    }

    if (filterType === "voted_up") {
      if (filterValue === "positive" && !review.voted_up) return false;
      if (filterValue === "negative" && review.voted_up) return false;
    }

    if (filterType === "feature_request") {
      if (filterValue === "yes" && !review.llm_feature_request) return false;
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

  // Pagination
  const reviewsPerPage = 20;
  const totalPages = Math.ceil(filteredReviews.length / reviewsPerPage);
  const paginatedReviews = filteredReviews.slice(
    (currentPage - 1) * reviewsPerPage,
    currentPage * reviewsPerPage
  );

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{game.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              Filtered Reviews: {filteredReviews.length} matching
            </p>
            {filterType === "standardized_issue" && (
              <p className="mt-1 text-sm text-sky-400">
                Issue category: &quot;{filterValue}&quot;
              </p>
            )}
          </div>
          <Button onClick={() => router.back()} variant="secondary">
            ← Back to Analysis
          </Button>
        </div>

        {/* Reviews List */}
        <Card variant="glass" className="p-6">
          <div className="space-y-4">
            {paginatedReviews.map((review: any, idx: number) => (
              <div
                key={idx}
                className="rounded-lg border border-white/10 bg-slate-900/30 p-4"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${
                      review.voted_up
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {review.voted_up ? 'Recommended' : 'Not Recommended'}
                    </span>
                    {review.llm_urgency && review.llm_urgency !== 'low' && (
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${
                        review.llm_urgency === 'critical' ? 'bg-rose-500/30 text-rose-300' :
                        review.llm_urgency === 'high' ? 'bg-amber-500/30 text-amber-300' :
                        'bg-sky-500/30 text-sky-300'
                      }`}>
                        {review.llm_urgency.toUpperCase()}
                      </span>
                    )}
                    {review.llm_main_category && (
                      <span className="rounded bg-purple-500/20 px-2 py-1 text-xs font-semibold text-purple-300">
                        {review.llm_main_category}
                      </span>
                    )}
                    {review.llm_feature_request && (
                      <span className="rounded bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-300">
                        Feature Request
                      </span>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    {((review.author_playtime_forever || 0) / 60).toFixed(1)}h played
                  </div>
                </div>

                {/* Review Text */}
                <p className="mb-3 text-sm text-slate-200 leading-relaxed">{review.review}</p>

                {/* Standardized Issues */}
                {Array.isArray(review.llm_issues) && review.llm_issues.length > 0 && (
                  <div className="mb-2 space-y-1">
                    <p className="text-xs font-semibold text-slate-400">Issues:</p>
                    {review.llm_issues.map((issue: any, issueIdx: number) => {
                      const isHighlighted = filterType === "standardized_issue" && issue?.category === filterValue;
                      return (
                        <div key={issueIdx} className="flex flex-col gap-1 rounded px-2 py-1 bg-slate-800/40">
                          <span className={`text-xs font-semibold capitalize ${isHighlighted ? 'text-yellow-300' : 'text-slate-200'}`}>
                            {issue.category?.replace(/_/g, " ") ?? "unspecified"}
                          </span>
                          <span className="text-xs text-slate-400">
                            {issue.severity ? `[${issue.severity}] ` : ""}
                            {issue.example || "No example provided"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div>
                    {review.votes_up > 0 && <span>{review.votes_up} helpful</span>}
                    {review.votes_funny > 0 && <span className="ml-3">{review.votes_funny} funny</span>}
                  </div>
                  <div>
                    {review.created_at && new Date(review.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                ← Previous
              </Button>
              <span className="text-sm text-slate-400">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Next →
              </Button>
            </div>
          )}

        {filteredReviews.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-lg text-slate-400">No reviews match the current filters</p>
          </div>
        )}
      </Card>
      </div>
    </AppLayout>
  );
}
