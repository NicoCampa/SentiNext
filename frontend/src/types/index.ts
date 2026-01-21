export interface SearchResult {
  appid: number;
  name: string;
  price?: string | null;
  url: string;
  image_url?: string | null;
}

export interface AnalyzeMetadata {
  app_id: number;
  requested: number;
  retrieved: number;
  language: string;
  fetched_at: string;
  header_image?: string | null;
}

export interface ChatCitation {
  review_id: string;
  subcategory: string;
  snippet: string;
  votes_up?: number | null;
  created_at?: string | null;
  voted_up?: boolean | null;
  review_text?: string | null;
}

export interface ChatResponse {
  answer: string;
  citations: ChatCitation[];
  used_subcategories: string[];
  model: string;
  review_count: number;
  filtered_review_count: number;
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
  issue_count: number;
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
  issue_count: number;
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

export interface SubcategoryInsight {
  subcategory: string;
  main_category: string;
  sub_category: string;
  count: number;
  recommendation_rate?: number;
  recommended?: number;
  not_recommended?: number;
  issue_count: number;
  request_count: number;
  issue_snippets?: string[];
  request_snippets?: string[];
}

export interface SubcategoryCount {
  subcategory: string;
  count: number;
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
  top_issue_subcategories: SubcategoryCount[];
  top_request_subcategories: SubcategoryCount[];
  top_categories: Record<string, number>;
}

export interface InsightsResponse {
  metrics: Record<string, number>;
  llm: LLMMetrics;
  category_breakdown: CategoryBreakdown;
  category_recommendation_rates?: Record<string, CategoryRecommendationRate>;
  category_trend?: Record<string, CategoryTrendPoint[]>;
  version_insights?: Record<string, VersionInsight>;
  subcategory_insights?: SubcategoryInsight[];
  playtime: Record<string, number>;
  helpful: Record<string, number>;
  recommendation: number;
  sentiment_counts: SentimentCount[];
  trend: TrendPoint[];
  segments: InsightSegments;
  audience: AudienceSegments;
  risk: RiskMetrics;
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
  steam_purchase?: boolean;
  received_for_free?: boolean;
  // v7 LLM insights (hierarchical)
  llm_main_category?: string;
  llm_subcategory?: string;
  llm_subcategories?: string[];
  llm_issue_subcategories?: string[];
  llm_request_subcategories?: string[];
  llm_subcategory_evidence?: Record<string, string[]>;
  llm_has_issue?: boolean;
  llm_has_request?: boolean;
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
  issue_rate: number;
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
