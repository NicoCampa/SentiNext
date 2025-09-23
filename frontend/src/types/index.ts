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

export interface ConfidenceTrendPoint {
  period: string;
  avg_confidence: number;
  pain_point_rate: number;
  feature_request_rate: number;
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

export interface TopicsSummary {
  overall: TopicFrequency[];
  positive: TopicFrequency[];
  negative: TopicFrequency[];
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

export interface InsightsResponse {
  metrics: Record<string, number>;
  llm: LLMMetrics;
  playtime: Record<string, number>;
  helpful: Record<string, number>;
  recommendation: number;
  sentiment_counts: SentimentCount[];
  trend: TrendPoint[];
  confidence_trend: ConfidenceTrendPoint[];
  segments: InsightSegments;
  audience: AudienceSegments;
  risk: RiskMetrics;
  topics: TopicsSummary;
  topic_catalog: string[];
  theme?: ThemeDefinition;
}

export interface ReviewRow {
  review_id: string | number | null;
  review: string;
  language: string;
  sentiment_label: string;
  sentiment_compound: number;
  sentiment_positive: number;
  sentiment_neutral: number;
  sentiment_negative: number;
  voted_up: boolean;
  votes_up: number;
  votes_funny: number;
  author_num_games_owned: number;
  author_num_reviews: number;
  author_playtime_forever: number;
  author_playtime_last_two_weeks: number;
  author_playtime_hours?: number;
  author_recent_playtime_hours?: number;
  created_at?: string;
  llm_sentiment?: string;
  llm_topics?: string[];
  llm_pain_point?: boolean;
  llm_feature_request?: boolean;
  llm_confidence?: number;
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
}

export interface TopicFrequency {
  topic: string;
  count: number;
  share?: number;
  share_positive?: number;
  share_negative?: number;
  pain_point_rate?: number;
  feature_request_rate?: number;
  avg_confidence?: number;
}

export interface LLMMetrics {
  pain_point_rate: number;
  feature_request_rate: number;
  avg_confidence: number;
}

export interface ProgressStatus {
  app_id: number;
  total: number;
  processed: number;
  updated_at: string | null;
  active: boolean;
}
