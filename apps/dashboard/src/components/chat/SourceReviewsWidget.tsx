'use client';

import { useState } from 'react';
import { ChatCitationItem } from '@/lib/api';

interface SourceReviewsWidgetProps {
  reviews: ChatCitationItem[];
}

export function SourceReviewsWidget({ reviews }: SourceReviewsWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCount, setShowCount] = useState(10);

  if (reviews.length === 0) return null;

  const displayedReviews = isExpanded ? reviews.slice(0, showCount) : [];

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-[10px] text-slate-400 hover:text-slate-300 transition-colors uppercase tracking-wider"
      >
        <span>
          Source Reviews ({reviews.length} used in context)
        </span>
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Reviews */}
      {isExpanded && (
        <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
          {displayedReviews.map((review, idx) => (
            <div
              key={idx}
              className="bg-slate-800/50 rounded-lg p-3 text-[11px] border border-white/5 hover:border-white/10 transition-colors"
            >
              {/* Review Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      review.voted_up
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {review.voted_up ? '👍 Positive' : '👎 Negative'}
                  </span>
                  <span className="text-slate-500">
                    {review.votes_up} helpful
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  {review.playtime_hours > 0 && (
                    <span>
                      {Math.round(review.playtime_hours)}h played
                    </span>
                  )}
                </div>
              </div>

              {/* Review Text */}
              <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                &quot;{review.snippet}&quot;
              </p>

              {/* Game Name */}
              {review.game_name && (
                <p className="text-[10px] text-slate-500 mt-2">
                  {review.game_name}
                </p>
              )}
            </div>
          ))}

          {/* Load More Button */}
          {isExpanded && showCount < reviews.length && (
            <button
              onClick={() => setShowCount(showCount + 10)}
              className="w-full py-2 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
            >
              Load {Math.min(10, reviews.length - showCount)} more...
            </button>
          )}

          {/* Showing X of Y */}
          <p className="text-[10px] text-slate-500 text-center pt-2">
            Showing {Math.min(showCount, reviews.length)} of {reviews.length} reviews
          </p>
        </div>
      )}
    </div>
  );
}
