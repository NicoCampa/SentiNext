'use client';

import clsx from "clsx";
import { ReviewRow, ThemeDefinition } from "@/types";

export function ReviewFilters({
  sentimentFilter,
  onSentimentChange,
  urgencyFilter,
  onUrgencyChange,
  featureFilter,
  onFeatureChange,
  categoryFilter,
  onCategoryChange,
  theme,
}: {
  sentimentFilter: "all" | "positive" | "neutral" | "negative";
  onSentimentChange: (value: "all" | "positive" | "neutral" | "negative") => void;
  urgencyFilter: "all" | "critical" | "high" | "medium" | "low";
  onUrgencyChange: (value: "all" | "critical" | "high" | "medium" | "low") => void;
  featureFilter: "all" | "feature" | "no_feature";
  onFeatureChange: (value: "all" | "feature" | "no_feature") => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  theme: ThemeDefinition;
}) {
  const sentimentOptions = [
    { value: "all", label: "All" },
    { value: "positive", label: "Positive" },
    { value: "neutral", label: "Neutral" },
    { value: "negative", label: "Negative" },
  ] as const;

  const urgencyOptions = [
    { value: "all", label: "All" },
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ] as const;

  const featureOptions = [
    { value: "all", label: "All" },
    { value: "feature", label: "Feature requests" },
    { value: "no_feature", label: "No feature" },
  ] as const;

  const categoryOptions = [
    { value: "all", label: "All categories" },
    { value: "gameplay", label: "Gameplay" },
    { value: "technical", label: "Technical" },
    { value: "content", label: "Content" },
    { value: "interface", label: "Interface" },
    { value: "social", label: "Social" },
    { value: "monetization", label: "Monetization" },
    { value: "other", label: "Other" },
  ];

  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_18px_35px_rgba(8,15,40,0.35)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: `linear-gradient(150deg, rgba(99, 102, 241, 0.18) 0%, ${theme.palette.surface_alt} 80%)`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
          Review filters
        </h3>
        <button
          className="text-xs text-slate-300 transition hover:text-white"
          onClick={() => {
            onSentimentChange("all");
            onUrgencyChange("all");
            onFeatureChange("all");
            onCategoryChange("all");
          }}
        >
          Reset
        </button>
      </div>

      <div className="mt-4 space-y-4 text-xs uppercase tracking-[0.2em] text-slate-300">
        <FilterGroup
          title="Sentiment"
          options={sentimentOptions}
          active={sentimentFilter}
          onSelect={onSentimentChange}
          activeClass="border-indigo-400 bg-indigo-500/80 text-white shadow-lg shadow-indigo-900/40"
        />
        <FilterGroup
          title="Urgency"
          options={urgencyOptions}
          active={urgencyFilter}
          onSelect={onUrgencyChange}
          activeClass="border-amber-400 bg-amber-400/90 text-slate-900 shadow-lg shadow-amber-900/40"
        />
        <FilterGroup
          title="Feature requests"
          options={featureOptions}
          active={featureFilter}
          onSelect={onFeatureChange}
          activeClass="border-sky-400 bg-sky-500/90 text-white shadow-lg shadow-sky-900/40"
        />
        <div className="space-y-2">
          <p className="text-[0.65rem] text-slate-400">Category</p>
          <select
            value={categoryFilter}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[0.7rem] uppercase tracking-[0.2em] text-slate-200 shadow-inner shadow-black/30 focus:border-sky-500 focus:outline-none"
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  title,
  options,
  active,
  onSelect,
  activeClass,
}: {
  title: string;
  options: readonly { value: T; label: string }[];
  active: T;
  onSelect: (value: T) => void;
  activeClass: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.65rem] text-slate-400">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={clsx(
              "rounded-full border px-3 py-1 text-[0.65rem] transition",
              active === option.value
                ? activeClass
                : "border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/40 hover:text-white",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewsTable({ reviews, helper }: { reviews: ReviewRow[]; helper?: string }) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_22px_48px_rgba(8,15,40,0.4)] backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">Reviews</h3>
        {helper ? <p className="text-xs text-slate-400">{helper}</p> : null}
      </div>
      <div className="mt-4 max-h-[32rem] overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-200">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.2em] text-slate-300">
            <tr>
              <th className="px-4 py-3">Review</th>
              <th className="px-4 py-3">Sentiment</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Urgency</th>
              <th className="px-4 py-3">Feature</th>
              <th className="px-4 py-3">Specific Issues</th>
              <th className="px-4 py-3">Helpful</th>
              <th className="px-4 py-3">Playtime (h)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {reviews.map((review) => (
              <tr key={String(review.review_id ?? Math.random())} className="bg-white/5">
                <td className="px-4 py-3 text-slate-100">
                  <p className="whitespace-pre-line text-sm">{review.review}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {review.created_at ? new Date(review.created_at).toLocaleString() : "Timestamp unknown"}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={review.voted_up ? "text-emerald-400" : "text-rose-400"}>
                    {review.voted_up ? "👍 Positive" : "👎 Negative"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-200">
                  {review.llm_main_category && (
                    <div>
                      <div className="font-semibold capitalize">{review.llm_main_category}</div>
                      {review.llm_subcategory && (
                        <div className="text-slate-400 capitalize">{review.llm_subcategory}</div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className={clsx(
                    "rounded-full px-2 py-1 font-semibold capitalize",
                    review.llm_urgency === "critical" && "bg-red-500/20 text-red-400",
                    review.llm_urgency === "high" && "bg-amber-500/20 text-amber-400",
                    review.llm_urgency === "medium" && "bg-sky-500/20 text-sky-400",
                    review.llm_urgency === "low" && "bg-slate-500/20 text-slate-400",
                  )}>
                    {review.llm_urgency ?? "N/A"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-200">{review.llm_feature_request ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-xs text-slate-300">
                  {review.llm_issues && review.llm_issues.length > 0 ? (
                    <ul className="space-y-1">
                      {review.llm_issues.map((issue, idx) => {
                        const label = issue.example || issue.category;
                        return (
                          <li key={idx} className="flex flex-col">
                            <span className="font-semibold capitalize text-slate-200">{issue.category.replace(/_/g, " ")}</span>
                            {label && (
                              <span className="text-slate-400">
                                {issue.severity ? `[${issue.severity}] ` : ""}
                                {issue.example || ""}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-200">{review.votes_up}</td>
                <td className="px-4 py-3 text-sm text-slate-200">{review.author_playtime_hours ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
