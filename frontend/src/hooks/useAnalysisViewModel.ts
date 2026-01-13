import { useMemo } from "react";
import type { AnalyzeResponse, ReviewRow, SubcategoryInsight, RiskMetrics } from "@/types";

type SparklinePoint = { label: string; value: number };

export interface SummaryView {
  headline: string;
  recommendationRate: number;
  issueRate: number;
  requestRate: number;
  requested: number;
  retrieved: number;
  fetchedAt: string;
  sparkline: SparklinePoint[];
  callout: string | null;
  topIssue?: SubcategoryInsight;
  topRequest?: SubcategoryInsight;
}

export interface ExperienceView {
  trend: SparklinePoint[];
  sentimentCounts: { sentiment: string; count: number }[];
  metrics: Record<string, number>;
  playtime: Record<string, number>;
  helpful: Record<string, number>;
}

export interface ProductQualityView {
  topIssueSubcategories: SubcategoryInsight[];
  topRequestSubcategories: SubcategoryInsight[];
  subcategoryInsights: SubcategoryInsight[];
  categoryBreakdown: Array<{ category: string; total: number }>;
  versionInsights: NonNullable<AnalyzeResponse["insights"]>["version_insights"];
}

export interface AudienceView {
  risk: RiskMetrics;
  experienceLevel: NonNullable<NonNullable<AnalyzeResponse["insights"]>["player_segments"]>["experience_level"];
  purchaseType: NonNullable<NonNullable<AnalyzeResponse["insights"]>["player_segments"]>["purchase_type"];
  engagementTopics: NonNullable<NonNullable<AnalyzeResponse["insights"]>["player_segments"]>["engagement_topics"];
  activityStatus: NonNullable<NonNullable<AnalyzeResponse["insights"]>["player_segments"]>["activity_status"];
  reviewerInfluence: NonNullable<AnalyzeResponse["insights"]>["audience"]["reviewer_influence"];
  veteranBenchmarking: NonNullable<AnalyzeResponse["insights"]>["audience"]["veteran_benchmarking"];
  marketQuality: NonNullable<AnalyzeResponse["insights"]>["audience"]["market_quality"];
}

export interface SubcategoryView {
  key: string;
  name: string;
  total: number;
  issueCount: number;
  requestCount: number;
  issueSnippets: string[];
  requestSnippets: string[];
  reviews: ReviewRow[];
}

export interface CategoryGroupView {
  category: string;
  total: number;
  subcategories: SubcategoryView[];
}

export interface DrilldownView {
  categories: CategoryGroupView[];
}

export interface AnalysisViewModel {
  summary: SummaryView;
  experience: ExperienceView;
  productQuality: ProductQualityView;
  audience: AudienceView;
  drilldown: DrilldownView;
  metadata: AnalyzeResponse["metadata"];
  reviews: ReviewRow[];
  theme: NonNullable<AnalyzeResponse["insights"]>["theme"] | undefined;
  hasInsights: boolean;
}

function formatSparkline(trend: NonNullable<AnalyzeResponse["insights"]>["trend"]): SparklinePoint[] {
  if (!trend || trend.length === 0) {
    return [];
  }
  return trend.map((point) => ({
    label: new Date(point.period).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: Number((point.recommendation_rate * 100).toFixed(1)),
  }));
}

function formatSubcategoryLabel(raw: string | undefined): string {
  if (!raw) return "uncategorized";
  return raw.replace("/", " / ").replace(/_/g, " ").trim();
}

function subcategoryTitle(entry: SubcategoryInsight | undefined): string {
  if (!entry) return "";
  return formatSubcategoryLabel(entry.sub_category || entry.subcategory);
}

function buildSubcategoryGroups(
  subcategoryInsights: SubcategoryInsight[] | undefined,
  reviews: ReviewRow[],
): CategoryGroupView[] {
  const groupMap = new Map<string, CategoryGroupView & { subMap: Map<string, SubcategoryView> }>();
  const reviewBuckets = new Map<string, ReviewRow[]>();

  reviews.forEach((review) => {
    const subcats = Array.isArray(review.llm_subcategories) ? review.llm_subcategories : [];
    subcats.forEach((key) => {
      if (!reviewBuckets.has(key)) {
        reviewBuckets.set(key, []);
      }
      const bucket = reviewBuckets.get(key)!;
      if (bucket.length < 6) {
        bucket.push(review);
      }
    });
  });

  (subcategoryInsights ?? []).forEach((entry) => {
    const rawKey = entry.subcategory || "";
    const [main, sub] = rawKey.includes("/") ? rawKey.split("/", 2) : ["other", rawKey || entry.sub_category || "general"];
    const mainKey = (entry.main_category || main || "other").toLowerCase();
    const subKey = rawKey || `${mainKey}/${sub}`;

    let group = groupMap.get(mainKey);
    if (!group) {
      group = { category: mainKey, total: 0, subcategories: [], subMap: new Map() };
      groupMap.set(mainKey, group);
    }
    group.total += Number(entry.count ?? 0);

    if (!group.subMap.has(subKey)) {
      group.subMap.set(subKey, {
        key: subKey,
        name: entry.sub_category || sub || subKey,
        total: Number(entry.count ?? 0),
        issueCount: Number(entry.issue_count ?? 0),
        requestCount: Number(entry.request_count ?? 0),
        issueSnippets: entry.issue_snippets ?? [],
        requestSnippets: entry.request_snippets ?? [],
        reviews: reviewBuckets.get(subKey) ?? [],
      });
    }
  });

  return Array.from(groupMap.values())
    .map((group) => ({
      category: group.category,
      total: group.total,
      subcategories: Array.from(group.subMap.values()).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

export function useAnalysisViewModel(analysis: AnalyzeResponse | null): AnalysisViewModel {
  return useMemo(() => {
    if (!analysis || !analysis.insights) {
      return {
        summary: {
          headline: "No analysis available",
          recommendationRate: 0,
          issueRate: 0,
          requestRate: 0,
          requested: analysis?.metadata.requested ?? 0,
          retrieved: analysis?.metadata.retrieved ?? 0,
          fetchedAt: analysis?.metadata.fetched_at ?? "",
          sparkline: [],
          callout: null,
        },
        experience: {
          trend: [],
          sentimentCounts: [],
          metrics: {},
          playtime: {},
          helpful: {},
        },
        productQuality: {
          topIssueSubcategories: [],
          topRequestSubcategories: [],
          subcategoryInsights: [],
          categoryBreakdown: [],
          versionInsights: {},
        },
        audience: {
          risk: { refund_risk: 0, core_fan_disappointment: 0, churn_window_default: 0, churn_rate: 0 },
          experienceLevel: {
            newcomers: { count: 0, issue_count: 0, top_issues: [] },
            casual: { count: 0, issue_count: 0, top_issues: [] },
            experienced: { count: 0, issue_count: 0, top_issues: [] },
            veterans: { count: 0, issue_count: 0, top_issues: [] },
          },
          purchaseType: {
            steam_buyers: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
            key_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
            free_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
          },
          engagementTopics: {
            highly_engaged: { count: 0, top_topics: [] },
            moderately_engaged: { count: 0, top_topics: [] },
            low_engagement: { count: 0, top_topics: [] },
          },
          activityStatus: {
            currently_active: { count: 0, issue_count: 0, recommendation_rate: 0 },
            recently_stopped: { count: 0, issue_count: 0, recommendation_rate: 0 },
            inactive: { count: 0, issue_count: 0, recommendation_rate: 0 },
          },
          reviewerInfluence: [],
          veteranBenchmarking: [],
          marketQuality: [],
        },
        drilldown: { categories: [] },
        metadata: analysis?.metadata ?? {
          app_id: 0,
          fetched_at: "",
          language: "",
          requested: 0,
          retrieved: 0,
        },
        reviews: analysis?.reviews ?? [],
        theme: undefined,
        hasInsights: false,
      };
    }

    const insights = analysis.insights;
    const trendSparkline = formatSparkline(insights.trend);
    const recommendationRate = Number((insights.recommendation ?? 0).toFixed(3));
    const issueRate = Number((insights.llm?.issue_rate ?? 0).toFixed(3));
    const requestRate = Number((insights.llm?.feature_request_rate ?? 0).toFixed(3));
    const subcategoryInsights = insights.subcategory_insights ?? [];
    const topIssueSubcategories = [...subcategoryInsights]
      .filter((item) => Number(item.issue_count ?? 0) > 0)
      .sort((a, b) => Number(b.issue_count ?? 0) - Number(a.issue_count ?? 0));
    const topRequestSubcategories = [...subcategoryInsights]
      .filter((item) => Number(item.request_count ?? 0) > 0)
      .sort((a, b) => Number(b.request_count ?? 0) - Number(a.request_count ?? 0));
    const topIssue = topIssueSubcategories[0];
    const topRequest = topRequestSubcategories[0];

    const topIssueLabel = subcategoryTitle(topIssue);
    const headline = (() => {
      if (recommendationRate >= 0.75) {
        return topIssue
          ? `Players are upbeat (${Math.round(recommendationRate * 100)}% recommend) but ${topIssueLabel} keeps resurfacing`
          : `Players are upbeat (${Math.round(recommendationRate * 100)}% recommend)`;
      }
      if (recommendationRate >= 0.55) {
        return topIssue
          ? `Sentiment is mixed; watch ${topIssueLabel}`
          : `Sentiment is mixed across recent reviews`;
      }
      return `Players are signalling risk (${Math.round(recommendationRate * 100)}% recommend)`;
    })();

    const callout = topIssue
      ? `${topIssue.issue_count ?? topIssue.count} issue-tagged reviews mention ${topIssueLabel}`
      : null;

    const categoryBreakdown = insights.category_breakdown
      ? Object.entries(insights.category_breakdown).map(([category, subcats]) => ({
          category,
          total: Object.values(subcats ?? {}).reduce((acc, value) => acc + Number(value ?? 0), 0),
        })).sort((a, b) => b.total - a.total)
      : [];

    const summary: SummaryView = {
      headline,
      recommendationRate,
      issueRate,
      requestRate,
      requested: analysis.metadata.requested,
      retrieved: analysis.metadata.retrieved,
      fetchedAt: analysis.metadata.fetched_at,
      sparkline: trendSparkline,
      callout,
      topIssue,
      topRequest,
    };

    const experience: ExperienceView = {
      trend: trendSparkline,
      sentimentCounts: insights.sentiment_counts ?? [],
      metrics: insights.metrics ?? {},
      playtime: insights.playtime ?? {},
      helpful: insights.helpful ?? {},
    };

    const productQuality: ProductQualityView = {
      topIssueSubcategories: topIssueSubcategories,
      topRequestSubcategories: topRequestSubcategories,
      subcategoryInsights,
      categoryBreakdown,
      versionInsights: insights.version_insights ?? {},
    };

    const audience: AudienceView = {
      risk: insights.risk ?? { refund_risk: 0, core_fan_disappointment: 0, churn_window_default: 0, churn_rate: 0 },
      experienceLevel: insights.player_segments?.experience_level ?? {
        newcomers: { count: 0, issue_count: 0, top_issues: [] },
        casual: { count: 0, issue_count: 0, top_issues: [] },
        experienced: { count: 0, issue_count: 0, top_issues: [] },
        veterans: { count: 0, issue_count: 0, top_issues: [] },
      },
      purchaseType: insights.player_segments?.purchase_type ?? {
        steam_buyers: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
        key_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
        free_users: { count: 0, feature_request_rate: 0, recommendation_rate: 0 },
      },
      engagementTopics: insights.player_segments?.engagement_topics ?? {
        highly_engaged: { count: 0, top_topics: [] },
        moderately_engaged: { count: 0, top_topics: [] },
        low_engagement: { count: 0, top_topics: [] },
      },
      activityStatus: insights.player_segments?.activity_status ?? {
        currently_active: { count: 0, issue_count: 0, recommendation_rate: 0 },
        recently_stopped: { count: 0, issue_count: 0, recommendation_rate: 0 },
        inactive: { count: 0, issue_count: 0, recommendation_rate: 0 },
      },
      reviewerInfluence: insights.audience?.reviewer_influence ?? [],
      veteranBenchmarking: insights.audience?.veteran_benchmarking ?? [],
      marketQuality: insights.audience?.market_quality ?? [],
    };

    const drilldown: DrilldownView = {
      categories: buildSubcategoryGroups(subcategoryInsights, analysis.reviews),
    };

    return {
      summary,
      experience,
      productQuality,
      audience,
      drilldown,
      metadata: analysis.metadata,
      reviews: analysis.reviews,
      theme: insights.theme,
      hasInsights: true,
    };
  }, [analysis]);
}
