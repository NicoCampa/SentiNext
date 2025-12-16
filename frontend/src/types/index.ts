export interface SearchResult {
  appid: number;
  name: string;
  price?: string | null;
  url: string;
}

export interface AnalyzeMetadata {
  app_id: number;
  requested: number;
  retrieved: number;
  language: string;
  fetched_at: string;
}

export interface TrendPoint {
  period: string;
  recommendation_rate: number;
  avg_compound: number;
  reviews: number;
}


export interface SentimentCount {
  sentiment: string;
  count: number;
}

export interface InsightSegments {
  early_access_vs_release: Record<string, unknown>[];
  free_vs_paid: Record<string, unknown>[];
  playtime_buckets: Record<string, unknown>[];
}

export interface AudienceSegments {
  reviewer_influence: Record<string, unknown>[];
  veteran_benchmarking: Record<string, unknown>[];
  market_quality: Record<string, unknown>[];
}

export interface RiskMetrics {
  refund_risk: number;
  core_fan_disappointment: number;
  churn_window_default: number;
  churn_rate: number;
}


export interface ThemeDefinition {
  name: string;
  gradient: string[];
  palette: {
    accent: string;
    secondary: string;
    positive: string;
    neutral: string;
    negative: string;
    surface: string;
    surface_alt: string;
    border: string;
  };
}

export interface IssueCategory {
  category: string;
  count: number;
}

export interface ExperienceLevelSegment {
  count: number;
  top_issues: IssueCategory[];
  critical_count: number;
}

export interface ExperienceLevelIssues {
  newcomers: ExperienceLevelSegment;
  casual: ExperienceLevelSegment;
  experienced: ExperienceLevelSegment;
  veterans: ExperienceLevelSegment;
}

export interface PurchaseTypeSegment {
  count: number;
  feature_request_rate: number;
  recommendation_rate: number;
}

export interface PurchaseTypeInsights {
  steam_buyers: PurchaseTypeSegment;
  key_users: PurchaseTypeSegment;
  free_users: PurchaseTypeSegment;
}

export interface TopicWithCount {
  topic: string;
  count: number;
}

export interface EngagementSegment {
  count: number;
  top_topics: TopicWithCount[];
}

export interface EngagementBasedTopics {
  highly_engaged: EngagementSegment;
  moderately_engaged: EngagementSegment;
  low_engagement: EngagementSegment;
}

export interface ActivitySegment {
  count: number;
  recommendation_rate: number;
  critical_issues: number;
}

export interface ActivityBasedFeedback {
  currently_active: ActivitySegment;
  recently_stopped: ActivitySegment;
  inactive: ActivitySegment;
}

export interface PlayerSegments {
  experience_level: ExperienceLevelIssues;
  purchase_type: PurchaseTypeInsights;
  engagement_topics: EngagementBasedTopics;
  activity_status: ActivityBasedFeedback;
}

export interface StandardizedIssue {
  category: string;             // v8: standardized issue category
  count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  example: string;              // Example from reviews
}

export interface IssueCluster {
  issue: string;
  count: number;
  critical_count?: number;
  high_count?: number;
  examples?: string[];
  review_ids?: Array<string | number | null>;
  variations?: string[];
  llm_main_category?: string;
  llm_subcategory?: string;
}

export interface FeatureRequest {
  category: string;             // v8: standardized feature request category
  count: number;
  high_demand_count: number;
  medium_demand_count: number;
  low_demand_count: number;
  example: string;              // Example from reviews
}

export interface CategoryBreakdown {
  [mainCategory: string]: {
    [subcategory: string]: number;
  };
}

export interface CategoryRecommendationRate {
  rate: number;
  count: number;
  recommended: number;
  not_recommended: number;
}

export interface CategoryTrendPoint {
  period: string;
  count: number;
}

export interface VersionInsight {
  total_reviews: number;
  recommendation_rate: number;
  top_issues: StandardizedIssue[];
  top_feature_requests: FeatureRequest[];
  top_categories: Record<string, number>;
}

export interface InsightsResponse {
  metrics: Record<string, number>;
  llm: LLMMetrics;
  category_breakdown: CategoryBreakdown;
  category_recommendation_rates?: Record<string, CategoryRecommendationRate>;
  category_trend?: Record<string, CategoryTrendPoint[]>;
  version_insights?: Record<string, VersionInsight>;
  playtime: Record<string, number>;
  helpful: Record<string, number>;
  recommendation: number;
  sentiment_counts: SentimentCount[];
  trend: TrendPoint[];
  segments: InsightSegments;
  audience: AudienceSegments;
  risk: RiskMetrics;
  standardized_issues?: StandardizedIssue[];
  feature_requests?: FeatureRequest[];
  clustered_issues?: IssueCluster[];
  player_segments?: PlayerSegments;
  theme?: ThemeDefinition;
}

export interface ReviewRow {
  review_id: string | number | null;
  review: string;
  language: string;
  voted_up: boolean;  // Steam's official thumbs up/down (the only sentiment indicator)
  votes_up: number;
  votes_funny: number;
  author_num_games_owned: number;
  author_num_reviews: number;
  author_playtime_forever: number;
  author_playtime_last_two_weeks: number;
  author_playtime_hours?: number;
  author_recent_playtime_hours?: number;
  created_at?: string;
  // v7 LLM insights (hierarchical)
  llm_main_category?: "gameplay" | "technical" | "content" | "interface" | "social" | "monetization" | "other";
  llm_subcategory?: string;
  llm_feature_request?: boolean;
  llm_urgency?: "critical" | "high" | "medium" | "low";
  // v8 LLM insights (standardized)
  llm_issues?: Array<{ category: string; severity: string; example: string }>;
  llm_feature_requests?: Array<{ category: string; demand: string; example: string }>;
}

export interface AnalyzeResponse {
  metadata: AnalyzeMetadata;
  insights: InsightsResponse | null;
  reviews: ReviewRow[];
}

export interface StarredGame {
  metadata: AnalyzeMetadata;
  insights: InsightsResponse | null;
  sample: ReviewRow[];
  name: string;
  genres?: string[];
  categories?: string[];
  updated_at?: string;
}

export interface FeedbackItem {
  feedback_id: string;
  app_id: number;
  source: string;
  text: string;
  created_at?: string | null;
  author?: string | null;
  language?: string | null;
  engagement?: Record<string, unknown>;
  url?: string | null;
  context?: Record<string, unknown>;
}

export type AnalysisJobStatus = "pending" | "running" | "completed" | "failed" | "unknown";

export interface AnalysisResultResponse {
  status: AnalysisJobStatus;
  metadata?: AnalyzeMetadata | null;
  insights: InsightsResponse | null;
  reviews: ReviewRow[];
  error?: string | null;
  run_id?: string | null;
  snapshot_hash?: string | null;
  stale?: boolean;
  stale_reason?: string | null;
}


export interface LLMMetrics {
  feature_request_rate: number;
  critical_issues: number;  // Count of critical urgency
  high_priority: number;    // Count of high urgency
  coverage_rate?: number;   // Share of reviews with structured labels
}


export interface ProgressStatus {
  app_id: number;
  total: number;
  processed: number;
  updated_at: string | null;
  active: boolean;
}

export interface StarredGamePayload {
  app_id: number;
  name: string;
  metadata: AnalyzeMetadata;
  insights: InsightsResponse | null;
  sample: ReviewRow[];
}

export interface StarredGameDTO {
  app_id: number;
  name: string;
  metadata: AnalyzeMetadata;
  insights: InsightsResponse | null;
  sample: ReviewRow[];
  genres?: string[];
  categories?: string[];
  updated_at: string;
}
