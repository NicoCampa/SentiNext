import { useMemo } from "react";
import type { AnalyzeResponse, ReviewRow, StandardizedIssue, FeatureRequest, IssueCluster, RiskMetrics } from "@/types";

type SparklinePoint = { label: string; value: number };

export interface SummaryView {
  headline: string;
  recommendationRate: number;
  featureRequestRate: number;
  criticalIssues: number;
  requested: number;
  retrieved: number;
  fetchedAt: string;
  sparkline: SparklinePoint[];
  callout: string | null;
  topIssue?: StandardizedIssue;
}

export interface ExperienceView {
  trend: SparklinePoint[];
  sentimentCounts: { sentiment: string; count: number }[];
  metrics: Record<string, number>;
  playtime: Record<string, number>;
  helpful: Record<string, number>;
}

export interface ProductQualityView {
  topIssues: StandardizedIssue[];
  featureRequests: FeatureRequest[];
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

export interface IssueSubcategoryView {
  name: string;
  total: number;
  severity: Record<string, number>;
  reviews: ReviewRow[];
}

export interface IssueCategoryView {
  category: string;
  total: number;
  severity: Record<string, number>;
  example?: string;
  subcategories: IssueSubcategoryView[];
}

export interface DrilldownView {
  issueCategories: IssueCategoryView[];
  clusters: IssueCluster[];
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

function buildIssueDrilldown(issues: StandardizedIssue[] | undefined, reviews: ReviewRow[]): IssueCategoryView[] {
  const categoryMap = new Map<string, IssueCategoryView & { subMap: Map<string, IssueSubcategoryView> }>();

  issues?.forEach((item) => {
    if (!categoryMap.has(item.category)) {
      categoryMap.set(item.category, {
        category: item.category,
        total: item.count,
        severity: {
          critical: item.critical_count ?? 0,
          high: item.high_count ?? 0,
          medium: item.medium_count ?? 0,
          low: item.low_count ?? 0,
        },
        example: item.example,
        subcategories: [],
        subMap: new Map(),
      });
    } else {
      const node = categoryMap.get(item.category)!;
      node.total += item.count;
      node.severity.critical += item.critical_count ?? 0;
      node.severity.high += item.high_count ?? 0;
      node.severity.medium += item.medium_count ?? 0;
      node.severity.low += item.low_count ?? 0;
      if (!node.example && item.example) {
        node.example = item.example;
      }
    }
  });

  reviews.forEach((review) => {
    const issuesList = Array.isArray(review.llm_issues) ? review.llm_issues : [];
    if (issuesList.length === 0) return;

    issuesList.forEach((issue) => {
      const category = issue.category || "uncategorized";
      let categoryNode = categoryMap.get(category);
      if (!categoryNode) {
        categoryNode = {
          category,
          total: 0,
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
          example: issue.example || "",
          subcategories: [],
          subMap: new Map(),
        };
        categoryMap.set(category, categoryNode);
      }

      const severityKey = (issue.severity || "medium").toLowerCase();
      if (categoryNode.severity[severityKey] !== undefined) {
        categoryNode.severity[severityKey] += 1;
      } else {
        categoryNode.severity[severityKey] = 1;
      }
      categoryNode.total += 1;

      const subcategoryName = review.llm_subcategory || "general";
      let subcategoryNode = categoryNode.subMap.get(subcategoryName);
      if (!subcategoryNode) {
        subcategoryNode = {
          name: subcategoryName,
          total: 0,
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
          reviews: [],
        };
        categoryNode.subMap.set(subcategoryName, subcategoryNode);
      }

      subcategoryNode.total += 1;
      if (subcategoryNode.severity[severityKey] !== undefined) {
        subcategoryNode.severity[severityKey] += 1;
      } else {
        subcategoryNode.severity[severityKey] = 1;
      }
      if (subcategoryNode.reviews.length < 8) {
        subcategoryNode.reviews.push(review);
      }
    });
  });

  const categoryList = Array.from(categoryMap.values()).map((node) => {
    const subcategories = Array.from(node.subMap.values()).sort((a, b) => b.total - a.total);
    return {
      category: node.category,
      total: node.total,
      severity: node.severity,
      example: node.example,
      subcategories,
    };
  });

  categoryList.sort((a, b) => b.total - a.total);
  return categoryList;
}

export function useAnalysisViewModel(analysis: AnalyzeResponse | null): AnalysisViewModel {
  return useMemo(() => {
    if (!analysis || !analysis.insights) {
      return {
        summary: {
          headline: "No analysis available",
          recommendationRate: 0,
          featureRequestRate: 0,
          criticalIssues: 0,
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
          topIssues: [],
          featureRequests: [],
          categoryBreakdown: [],
          versionInsights: {},
        },
        audience: {
          risk: { refund_risk: 0, core_fan_disappointment: 0, churn_window_default: 0, churn_rate: 0 },
          experienceLevel: {
            newcomers: { count: 0, critical_count: 0, top_issues: [] },
            casual: { count: 0, critical_count: 0, top_issues: [] },
            experienced: { count: 0, critical_count: 0, top_issues: [] },
            veterans: { count: 0, critical_count: 0, top_issues: [] },
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
            currently_active: { count: 0, critical_issues: 0, recommendation_rate: 0 },
            recently_stopped: { count: 0, critical_issues: 0, recommendation_rate: 0 },
            inactive: { count: 0, critical_issues: 0, recommendation_rate: 0 },
          },
          reviewerInfluence: [],
          veteranBenchmarking: [],
          marketQuality: [],
        },
        drilldown: { issueCategories: [], clusters: [] },
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
    const featureRequestRate = Number((insights.llm?.feature_request_rate ?? 0).toFixed(3));
    const criticalIssues = insights.llm?.critical_issues ?? 0;
    const topIssue = insights.standardized_issues?.[0];

    const headline = (() => {
      if (recommendationRate >= 0.75) {
        return topIssue
          ? `Players are upbeat (${Math.round(recommendationRate * 100)}% recommend) but ${topIssue.category.replace(/_/g, " ")} demands attention`
          : `Players are upbeat (${Math.round(recommendationRate * 100)}% recommend)`;
      }
      if (recommendationRate >= 0.55) {
        return topIssue
          ? `Sentiment is mixed; watch ${topIssue.category.replace(/_/g, " ")}`
          : `Sentiment is mixed across recent reviews`;
      }
      return `Players are signalling risk (${Math.round(recommendationRate * 100)}% recommend)`;
    })();

    const callout = topIssue
      ? `${topIssue.count} mentions related to ${topIssue.category.replace(/_/g, " ")}, ${topIssue.critical_count} flagged critical`
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
      featureRequestRate,
      criticalIssues,
      requested: analysis.metadata.requested,
      retrieved: analysis.metadata.retrieved,
      fetchedAt: analysis.metadata.fetched_at,
      sparkline: trendSparkline,
      callout,
      topIssue,
    };

    const experience: ExperienceView = {
      trend: trendSparkline,
      sentimentCounts: insights.sentiment_counts ?? [],
      metrics: insights.metrics ?? {},
      playtime: insights.playtime ?? {},
      helpful: insights.helpful ?? {},
    };

    const productQuality: ProductQualityView = {
      topIssues: insights.standardized_issues ?? [],
      featureRequests: insights.feature_requests ?? [],
      categoryBreakdown,
      versionInsights: insights.version_insights ?? {},
    };

    const audience: AudienceView = {
      risk: insights.risk ?? { refund_risk: 0, core_fan_disappointment: 0, churn_window_default: 0, churn_rate: 0 },
      experienceLevel: insights.player_segments?.experience_level ?? {
        newcomers: { count: 0, critical_count: 0, top_issues: [] },
        casual: { count: 0, critical_count: 0, top_issues: [] },
        experienced: { count: 0, critical_count: 0, top_issues: [] },
        veterans: { count: 0, critical_count: 0, top_issues: [] },
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
        currently_active: { count: 0, critical_issues: 0, recommendation_rate: 0 },
        recently_stopped: { count: 0, critical_issues: 0, recommendation_rate: 0 },
        inactive: { count: 0, critical_issues: 0, recommendation_rate: 0 },
      },
      reviewerInfluence: insights.audience?.reviewer_influence ?? [],
      veteranBenchmarking: insights.audience?.veteran_benchmarking ?? [],
      marketQuality: insights.audience?.market_quality ?? [],
    };

    const drilldown: DrilldownView = {
      issueCategories: buildIssueDrilldown(insights.standardized_issues, analysis.reviews),
      clusters: insights.clustered_issues ?? [],
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
