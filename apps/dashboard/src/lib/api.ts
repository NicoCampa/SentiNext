import {
  AnalyzeResponse,
  AnalyzeEstimateResponse,
  ProgressStatus,
  SearchResult,
  StarredGameDTO,
  StarredGamePayload,
  AnalysisResultResponse,
  FeedbackItem,
  ChatResponse,
  LogTailResponse,
  StoragePaths,
  DatabaseReviewsResponse,
  DatabaseGameOption,
  ComparisonSummarizeRequest,
  ComparisonSummary,
} from "@/types";

declare global {
  interface Window {
    __SENTINEXT_API_BASE__?: string;
    __SENTINEXT_BACKEND_LOG_FILE__?: string;
    __SENTINEXT_BACKEND_BOOT_ERROR__?: string | null;
  }
}

function normalizeBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function getApiBase(): string {
  if (typeof window !== "undefined" && window.__SENTINEXT_API_BASE__) {
    return normalizeBase(window.__SENTINEXT_API_BASE__);
  }
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return normalizeBase(process.env.NEXT_PUBLIC_API_BASE_URL);
  }
  // Dev mode fallback: when running on port 3000 (Next.js dev), use backend on 8000
  if (typeof window !== "undefined" && window.location.port === "3000") {
    return "http://localhost:8000";
  }
  // Local app default: UI served by backend, API mounted under /api.
  return "/api";
}

function apiUrl(pathname: string): string {
  const base = getApiBase();
  if (!pathname.startsWith("/")) {
    throw new Error(`API path must start with '/': ${pathname}`);
  }
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return new URL(pathname, base).toString();
  }
  return `${base}${pathname}`;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, init);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 429) {
    throw new Error("You're making requests too quickly. Please wait a moment and try again.");
  }
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = await response.json();
      const d = body?.detail;
      detail = typeof d === "string" ? d : d?.message || JSON.stringify(d);
    } catch {
      try {
        detail = await response.text();
      } catch { /* ignore */ }
    }
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchGames(query: string): Promise<SearchResult[]> {
  const url = new URL(apiUrl("/search"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("query", query);
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<SearchResult[]>(response);
}

export interface AnalyzePayload {
  app_id: number;
  review_count: number;
  language: string;
  languages?: string[];
  filter: string;
  day_range?: number | null;
  persist?: boolean;
  refresh?: boolean;
  refresh_days?: number | null;
}

export interface LanguagesResponse {
  languages: string[];
  default: string;
  popular: string[];
}

export async function fetchLanguages(): Promise<LanguagesResponse> {
  const response = await apiFetch(apiUrl("/languages"), {
    cache: "force-cache",
  });
  return handleResponse<LanguagesResponse>(response);
}

export async function analyzeGame(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  const response = await apiFetch(apiUrl("/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AnalyzeResponse>(response);
}

export async function fetchProgress(appId: number): Promise<ProgressStatus> {
  const response = await apiFetch(apiUrl(`/progress/${appId}`), {
    cache: "no-store",
  });
  return handleResponse<ProgressStatus>(response);
}

export async function cancelAnalysis(appId: number): Promise<{ cancelled: boolean; app_id: number }> {
  const response = await apiFetch(apiUrl(`/progress/${appId}/cancel`), {
    method: "POST",
  });
  return handleResponse<{ cancelled: boolean; app_id: number }>(response);
}

export interface ProgressStreamEvent {
  type: "progress" | "completed" | "error" | "timeout";
  processed?: number;
  total?: number;
  active?: boolean;
  status?: string;
  error?: string;
  phase?: "fetching" | "classifying" | "building_insights" | "idle";
  fetched_count?: number;
}

export interface ProgressStreamCallbacks {
  onProgress?: (processed: number, total: number, active: boolean, phase?: "fetching" | "classifying" | "building_insights" | "idle", fetchedCount?: number) => void;
  onCompleted?: () => void;
  onError?: (error: string) => void;
  onTimeout?: () => void;
}

/**
 * Subscribe to real-time progress updates via Server-Sent Events.
 * Returns a cleanup function to close the connection.
 */
export function subscribeToProgress(
  appId: number,
  callbacks: ProgressStreamCallbacks
): () => void {
  if (typeof EventSource === "undefined") {
    throw new Error("EventSource is not supported in this environment");
  }

  const base =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(apiUrl(`/progress/${appId}/stream`), base);

  let eventSource: EventSource | null = null;
  let aborted = false;

  const start = () => {
    try {
      if (aborted) return;
      eventSource = new EventSource(url.toString());

      eventSource.addEventListener("progress", (event) => {
        try {
          const data = JSON.parse(event.data) as ProgressStreamEvent;
          callbacks.onProgress?.(
            data.processed ?? 0,
            data.total ?? 0,
            data.active ?? false,
            data.phase,
            data.fetched_count
          );
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener("completed", () => {
        callbacks.onCompleted?.();
        eventSource?.close();
      });

      eventSource.addEventListener("error", (event) => {
        if (event instanceof MessageEvent && event.data) {
          try {
            const data = JSON.parse(event.data) as ProgressStreamEvent;
            callbacks.onError?.(data.error ?? "Unknown error");
          } catch {
            callbacks.onError?.("Connection error");
          }
        } else {
          callbacks.onError?.("Connection lost");
        }
        eventSource?.close();
      });

      eventSource.addEventListener("timeout", () => {
        callbacks.onTimeout?.();
        eventSource?.close();
      });

      eventSource.onerror = () => {
        if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
          callbacks.onError?.("Connection failed");
          eventSource.close();
        }
      };
    } catch (error) {
      callbacks.onError?.(
        error instanceof Error ? error.message : "Failed to start progress stream"
      );
    }
  };

  void start();

  return () => {
    aborted = true;
    eventSource?.close();
  };
}

export async function fetchStarredGames(): Promise<StarredGameDTO[]> {
  const response = await apiFetch(apiUrl("/starred"), {
    cache: "no-store",
  });
  return handleResponse<StarredGameDTO[]>(response);
}

export async function fetchAnalysisResult(appId: number): Promise<AnalysisResultResponse> {
  const response = await apiFetch(apiUrl(`/analysis/${appId}`), {
    cache: "no-store",
  });
  return handleResponse<AnalysisResultResponse>(response);
}

export async function rebuildInsights(appId: number): Promise<{ status: string; message: string; app_id: number }> {
  const response = await apiFetch(apiUrl(`/analysis/${appId}/rebuild-insights`), {
    method: "POST",
    cache: "no-store",
  });
  return handleResponse<{ status: string; message: string; app_id: number }>(response);
}

export async function rebuildTrends(appId: number): Promise<{ status: string; message: string; app_id: number }> {
  const response = await apiFetch(apiUrl(`/analysis/${appId}/rebuild-trends`), {
    method: "POST",
    cache: "no-store",
  });
  return handleResponse<{ status: string; message: string; app_id: number }>(response);
}

export async function fetchHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await apiFetch(apiUrl("/health"), { cache: "no-store" });
  return handleResponse<{ status: string; timestamp: string }>(response);
}

export async function fetchStoragePaths(): Promise<StoragePaths> {
  const response = await apiFetch(apiUrl("/settings/storage"), {
    cache: "no-store",
  });
  return handleResponse<StoragePaths>(response);
}

export async function fetchLogTail(bytes: number = 20000): Promise<LogTailResponse> {
  const url = new URL(apiUrl("/logs/tail"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("bytes", String(bytes));
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<LogTailResponse>(response);
}

export async function estimateAnalysis(payload: AnalyzePayload): Promise<AnalyzeEstimateResponse> {
  const response = await apiFetch(apiUrl("/analyze/estimate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AnalyzeEstimateResponse>(response);
}

export interface FeedbackOptions {
  include_reddit?: boolean;
  include_discord?: boolean;
  include_steam_forums?: boolean;
  steam_limit?: number;
  reddit_limit?: number;
  discord_limit?: number;
  forum_limit?: number;
}

export interface ChatRequestPayload {
  app_id: number;
  question: string;
  sentiment?: "all" | "positive" | "negative";
  min_helpful?: number;
  max_days?: number | null;
  playtime_bucket?: string;
  language?: string;
  max_reviews?: number;
  max_snippets?: number;
}

export async function chatWithInsights(payload: ChatRequestPayload): Promise<ChatResponse> {
  const response = await apiFetch(apiUrl("/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<ChatResponse>(response);
}

export async function fetchFeedback(appId: number, options: FeedbackOptions = {}): Promise<FeedbackItem[]> {
  const url = new URL(apiUrl(`/feedback/${appId}`), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (options.include_reddit === false) url.searchParams.set("include_reddit", "false");
  if (options.include_discord === false) url.searchParams.set("include_discord", "false");
  if (options.include_steam_forums === false) url.searchParams.set("include_steam_forums", "false");
  if (options.steam_limit) url.searchParams.set("steam_limit", String(options.steam_limit));
  if (options.reddit_limit) url.searchParams.set("reddit_limit", String(options.reddit_limit));
  if (options.discord_limit) url.searchParams.set("discord_limit", String(options.discord_limit));
  if (options.forum_limit) url.searchParams.set("forum_limit", String(options.forum_limit));

  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<FeedbackItem[]>(response);
}

export async function saveStarredGame(payload: StarredGamePayload): Promise<void> {
  const response = await apiFetch(apiUrl("/starred"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await handleResponse<void>(response);
}


export async function removeStarredGame(appId: number): Promise<void> {
  const response = await apiFetch(apiUrl(`/starred/${appId}`), {
    method: "DELETE",
  });
  await handleResponse<void>(response);
}

export async function toggleFavorite(appId: number, isFavorite: boolean): Promise<{ app_id: number; is_favorite: boolean }> {
  const response = await apiFetch(apiUrl(`/starred/${appId}/favorite`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_favorite: isFavorite }),
  });
  return handleResponse<{ app_id: number; is_favorite: boolean }>(response);
}

export async function fetchFavoriteGames(): Promise<StarredGameDTO[]> {
  const response = await apiFetch(apiUrl("/starred/favorites"), {
    cache: "no-store",
  });
  return handleResponse<StarredGameDTO[]>(response);
}

export async function generateComparisonSummary(
  request: ComparisonSummarizeRequest
): Promise<ComparisonSummary> {
  const response = await apiFetch(apiUrl('/compare/summarize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ComparisonSummary>(response);
}

export async function deleteGame(appId: number): Promise<void> {
  const response = await apiFetch(apiUrl(`/games/${appId}`), {
    method: "DELETE",
  });
  await handleResponse<void>(response);
}

export interface DatabaseStats {
  games: number;
  reviews: number;
  labels: number;
  labels_new_schema: number;
  labels_old_schema: number;
  starred_games: number;
}

export interface DatabaseReviewsParams {
  limit?: number;
  offset?: number;
  app_id?: number | null;
  language?: string | null;
  query?: string | null;
}

export async function fetchDatabaseReviews(params: DatabaseReviewsParams = {}): Promise<DatabaseReviewsResponse> {
  const url = new URL(apiUrl("/database/reviews"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));
  if (params.offset != null) url.searchParams.set("offset", String(params.offset));
  if (params.app_id) url.searchParams.set("app_id", String(params.app_id));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.query) url.searchParams.set("query", params.query);
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<DatabaseReviewsResponse>(response);
}

export async function fetchDatabaseGames(): Promise<DatabaseGameOption[]> {
  const url = new URL(apiUrl("/database/games"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<DatabaseGameOption[]>(response);
}

export async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const url = new URL(apiUrl("/database/stats"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const response = await apiFetch(url.toString(), {
    cache: "no-store",
  });
  return handleResponse<DatabaseStats>(response);
}

export type DatabaseExportFormat = "csv" | "jsonl";

export interface DatabaseExportParams {
  format: DatabaseExportFormat;
  app_id?: number | null;
  language?: string | null;
  query?: string | null;
  max_rows?: number | null;
}

function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) return null;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const match = value.match(/filename="?([^\";]+)"?/i);
  return match?.[1] ?? null;
}

export interface DatabaseExportCount {
  total: number;
  games: number;
  top_games: Array<{ app_id: number; name: string; count: number }>;
}

export async function fetchDatabaseExportCount(params: {
  app_id?: number | null;
  language?: string | null;
  query?: string | null;
}): Promise<DatabaseExportCount> {
  const url = new URL(apiUrl("/database/reviews/count"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params.app_id) url.searchParams.set("app_id", String(params.app_id));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.query) url.searchParams.set("query", params.query);

  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<DatabaseExportCount>(response);
}

export async function downloadDatabaseExport(params: DatabaseExportParams): Promise<void> {
  if (typeof window === "undefined") return;
  const url = new URL(apiUrl("/database/export"), window.location.origin);
  url.searchParams.set("format", params.format);
  if (params.app_id) url.searchParams.set("app_id", String(params.app_id));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.query) url.searchParams.set("query", params.query);
  if (params.max_rows) url.searchParams.set("max_rows", String(params.max_rows));

  const response = await apiFetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Export failed (status ${response.status})`);
  }

  const blob = await response.blob();
  const fallback = `sentinext-dataset.${params.format}`;
  const filename = parseContentDispositionFilename(response.headers.get("content-disposition")) || fallback;

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export async function clearLabels(oldSchemaOnly: boolean = false): Promise<{ deleted: number; scope: string }> {
  const url = oldSchemaOnly
    ? apiUrl("/database/labels") + "?old_schema_only=true"
    : apiUrl("/database/labels");
  const response = await apiFetch(url, {
    method: "DELETE",
  });
  return handleResponse<{ deleted: number; scope: string }>(response);
}

export async function clearEntireDatabase(): Promise<{ deleted: Record<string, number>; scope: string }> {
  const response = await apiFetch(apiUrl("/database/clear"), {
    method: "DELETE",
  });
  return handleResponse<{ deleted: Record<string, number>; scope: string }>(response);
}

// ============================================================================
// Enhanced Chat (Chat with Your Data)
// ============================================================================

export interface EnhancedChatPayload {
  message: string;
  session_id?: string;
  /** App IDs for game context (max 2) */
  app_ids?: number[];
  /** Date filter: "30d", "90d", "365d", or "all" */
  date_filter?: string;
  /** Max reviews per game (default 50) */
  max_reviews_per_game?: number;
  /** Preferred language for chatbot responses: "en", "it", "fr", "de" */
  language?: string;
}

export interface ChatCitationItem {
  review_id: string;
  app_id: number;
  game_name: string;
  snippet: string;
  votes_up: number;
  voted_up?: boolean;
  playtime_hours: number;
}

export interface EnhancedChatResponse {
  response: string;
  session_id: string;
  citations: ChatCitationItem[];
  source_reviews: ChatCitationItem[];
  games_used: Array<{ app_id: number; name: string }>;
  reviews_searched: number;
  has_game_context: boolean;
  /** Suggested follow-up questions */
  suggested_questions?: string[];
  /** True if the agent needs clarification from user */
  needs_clarification?: boolean;
  /** Clarification options to present to user */
  clarification_options?: string[];
  /** Number of tool calls made by agent (for debugging) */
  tool_calls_made?: number;
  /** True if the agent suggests searching for a game (not found in starred) */
  suggest_search_game?: boolean;
  /** The game name that wasn't found */
  search_game_name?: string;
}

export async function sendEnhancedChat(
  payload: EnhancedChatPayload
): Promise<EnhancedChatResponse> {
  const response = await apiFetch(apiUrl("/chat/simple"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<EnhancedChatResponse>(response);
}

export interface ChatStatusEvent {
  type: "status" | "done" | "error" | "timeout";
  message?: string;
  timestamp?: string;
  status?: string;
  error?: string;
}

export interface ChatStreamCallbacks {
  onStatus?: (message: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
  onTimeout?: () => void;
}

/**
 * Subscribe to real-time chat status updates via Server-Sent Events.
 * Returns a cleanup function to close the connection.
 */
export function subscribeToChatStream(
  sessionId: string,
  callbacks: ChatStreamCallbacks
): () => void {
  if (typeof EventSource === "undefined") {
    throw new Error("EventSource is not supported in this environment");
  }

  const base =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(apiUrl(`/chat/stream/${sessionId}`), base);

  let eventSource: EventSource | null = null;
  let aborted = false;

  const start = () => {
    try {
      if (aborted) return;
      eventSource = new EventSource(url.toString());

      eventSource.addEventListener("status", (event) => {
        try {
          const data = JSON.parse(event.data) as ChatStatusEvent;
          callbacks.onStatus?.(data.message ?? "");
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener("done", () => {
        callbacks.onDone?.();
        eventSource?.close();
      });

      eventSource.addEventListener("error", (event) => {
        if (event instanceof MessageEvent && event.data) {
          try {
            const data = JSON.parse(event.data) as ChatStatusEvent;
            callbacks.onError?.(data.error ?? "Unknown error");
          } catch {
            callbacks.onError?.("Connection error");
          }
        } else {
          callbacks.onError?.("Connection lost");
        }
        eventSource?.close();
      });

      eventSource.addEventListener("timeout", () => {
        callbacks.onTimeout?.();
        eventSource?.close();
      });

      eventSource.onerror = () => {
        if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
          // Don't report errors for SSE - it's optional
          eventSource.close();
        }
      };
    } catch (error) {
      // SSE is optional, don't report errors
    }
  };

  void start();

  return () => {
    aborted = true;
    eventSource?.close();
  };
}

// ============================================================================
// Translation API
// ============================================================================

export interface TranslatePayload {
  text: string;
  target_language: string;
}

export interface TranslateResponse {
  translated_text: string;
  model_id: string;
}

export async function translateText(
  payload: TranslatePayload
): Promise<TranslateResponse> {
  const response = await apiFetch(apiUrl("/translate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<TranslateResponse>(response);
}


// ============================================================================
// Subcategory Summary API
// ============================================================================

export interface SubcategorySummaryPayload {
  app_id: number;
  subcategory: string;
  summary_type?: 'issue' | 'request' | 'general';
  summary_context?: string;
  reviews: Array<{
    review_id?: string;
    review?: string;
    voted_up?: boolean;
    votes_up?: number;
    language?: string;
    created_at?: string;
    llm_subcategories?: string[];
    llm_issue_subcategories?: string[];
    llm_request_subcategories?: string[];
    llm_subcategory_evidence?: Record<string, string[]>;
  }>;
}

export interface SubcategorySummaryResponse {
  summary: string;
  pros: string[];
  cons: string[];
}

/**
 * Generate a summary with pros/cons for reviews in a specific subcategory.
 */
export async function summarizeSubcategory(
  payload: SubcategorySummaryPayload
): Promise<SubcategorySummaryResponse> {
  const response = await apiFetch(apiUrl("/summarize/subcategory"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<SubcategorySummaryResponse>(response);
}

// ============================================================================
// Widget Summary API
// ============================================================================

export interface WidgetSummaryPayload {
  app_id: number;
  widget_kind: 'trend_week' | 'segment' | 'top_issues' | 'top_requests';
  widget_label: string;
  context?: Record<string, unknown>;
  reviews: Array<{
    review_id?: string;
    review?: string;
    voted_up?: boolean;
    votes_up?: number;
    votes_funny?: number;
    comment_count?: number;
    language?: string;
    created_at?: string;
    llm_subcategories?: string[];
    llm_issue_subcategories?: string[];
    llm_request_subcategories?: string[];
    llm_subcategory_evidence?: Record<string, string[]>;
  }>;
}

export interface WidgetSummaryResponse {
  summary: string;
  key_points: string[];
  actions: string[];
}

export async function summarizeWidget(
  payload: WidgetSummaryPayload
): Promise<WidgetSummaryResponse> {
  const response = await apiFetch(apiUrl("/summarize/widget"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<WidgetSummaryResponse>(response);
}

// ============================================================================
// Recent Reviews Summary API
// ============================================================================

export interface RecentReviewsSummaryPayload {
  app_id: number;
  count?: number;
  filter_context?: string;
}

export interface RecentReviewsSummaryResponse {
  summary: string;
  key_points: string[];
  actions: string[];
  health_score?: number | null;
  sentiment_trend?: "improving" | "stable" | "declining" | null;
  top_strengths?: string[];
  review_count: number;
  start_date?: string | null;
  end_date?: string | null;
}

export async function summarizeRecentReviews(
  payload: RecentReviewsSummaryPayload
): Promise<RecentReviewsSummaryResponse> {
  const response = await apiFetch(apiUrl("/summarize/recent-reviews"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<RecentReviewsSummaryResponse>(response);
}

// ============================================================================
// Citation Feedback API
// ============================================================================

export interface CitationFeedbackPayload {
  review_id: string;
  session_id: string;
  helpful: boolean;
}

/**
 * Submit feedback on whether a citation was helpful.
 */
export async function submitCitationFeedback(
  payload: CitationFeedbackPayload
): Promise<{ status: string }> {
  const response = await apiFetch(apiUrl("/chat/citation-feedback"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ status: string }>(response);
}

// ============================================================================
// Chat Export API
// ============================================================================

export type ChatExportFormat = "markdown" | "json";

/**
 * Export a chat session as markdown or JSON.
 * Returns the content as a string.
 */
export async function exportChatSession(
  sessionId: string,
  format: ChatExportFormat = "markdown"
): Promise<string> {
  const url = new URL(
    apiUrl(`/chat/export/${sessionId}`),
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  url.searchParams.set("format", format);
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Export failed (status ${response.status})`);
  }
  return response.text();
}

/**
 * Download a chat session as a file.
 */
export async function downloadChatSession(
  sessionId: string,
  format: ChatExportFormat = "markdown"
): Promise<void> {
  if (typeof window === "undefined") return;

  const content = await exportChatSession(sessionId, format);
  const extension = format === "markdown" ? "md" : "json";
  const mimeType = format === "markdown" ? "text/markdown" : "application/json";
  const filename = `chat-${sessionId.slice(0, 8)}.${extension}`;

  const blob = new Blob([content], { type: mimeType });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

/**
 * Report month data returned by the backend.
 */
export interface ReportMonth {
  year: number;
  month: number;
  label: string;
  review_count: number;
}

export interface ReportMonthsResponse {
  months: ReportMonth[];
}

/**
 * Fetch available months with review data for a game.
 */
export async function fetchReportMonths(appId: number): Promise<ReportMonthsResponse> {
  const response = await apiFetch(apiUrl(`/reports/available-months/${appId}`), {
    cache: "no-store",
  });
  return handleResponse<ReportMonthsResponse>(response);
}

/**
 * Download executive summary PDF for a game in a specific month.
 */
export async function downloadExecutiveSummary(
  appId: number,
  year: number,
  month: number
): Promise<void> {
  if (typeof window === "undefined") return;

  const url = new URL(apiUrl(`/reports/executive-summary/${appId}`), window.location.origin);
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));
  url.searchParams.set("format", "pdf");

  const response = await apiFetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Failed to generate report (status ${response.status})`);
  }

  const blob = await response.blob();
  const fallback = `ExecutiveSummary.pdf`;
  const filename = parseContentDispositionFilename(
    response.headers.get("content-disposition")
  ) || fallback;

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

// ============================================================================
// Steam Extended Data API (News, Players, Achievements)
// ============================================================================

export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  author: string;
  contents: string;
  feed_label: string;
  date: number;
  feed_name: string;
  feed_type: number;
}

export interface SteamNewsResponse {
  app_id: number;
  news_items: SteamNewsItem[];
}

/**
 * Fetch news and announcements for a Steam game.
 * Useful for correlating sentiment changes with patches/updates.
 */
export async function fetchSteamNews(
  appId: number,
  count: number = 20,
  maxLength: number = 500
): Promise<SteamNewsResponse> {
  const url = new URL(
    apiUrl(`/steam/news/${appId}`),
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  url.searchParams.set("count", String(count));
  url.searchParams.set("max_length", String(maxLength));
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<SteamNewsResponse>(response);
}

export interface SteamPlayerCountResponse {
  app_id: number;
  player_count: number | null;
  timestamp: number;
}

/**
 * Fetch current player count for a Steam game.
 */
export async function fetchSteamPlayerCount(
  appId: number
): Promise<SteamPlayerCountResponse> {
  const response = await apiFetch(apiUrl(`/steam/players/${appId}`), {
    cache: "no-store",
  });
  return handleResponse<SteamPlayerCountResponse>(response);
}

export interface SteamPriceResponse {
  app_id: number;
  is_free: boolean;
  price_initial: number | null;  // Original price (e.g., 29.99)
  price_final: number | null;    // Current price after discount
  price_initial_formatted: string | null;  // e.g., "$29.99"
  price_final_formatted: string | null;    // e.g., "$19.99" or "Free"
  price_discount: number;        // Discount percentage (0-100)
  price_currency: string | null; // e.g., "USD"
  timestamp: number;
}

/**
 * Fetch current price for a Steam game.
 * Returns live pricing data including discounts.
 */
export async function fetchSteamPrice(
  appId: number,
  cc: string = "us"  // Country code for regional pricing
): Promise<SteamPriceResponse> {
  const url = new URL(
    apiUrl(`/steam/price/${appId}`),
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  url.searchParams.set("cc", cc);
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<SteamPriceResponse>(response);
}

export interface SteamGameDetailsResponse {
  app_id: number;
  name: string;
  release_date: string | null;
  coming_soon: boolean;
  developers: string[];
  publishers: string[];
  genres: string[];
  categories: string[];
  is_free: boolean;
  price_initial: number | null;
  price_final: number | null;
  price_discount: number;
  price_currency: string | null;
  timestamp: number;
}

/**
 * Fetch detailed information for a Steam game.
 * Returns release date, developers, publishers, genres, categories, and pricing.
 */
export async function fetchSteamGameDetails(
  appId: number
): Promise<SteamGameDetailsResponse> {
  const response = await apiFetch(apiUrl(`/steam/details/${appId}`), { cache: "no-store" });
  return handleResponse<SteamGameDetailsResponse>(response);
}

export interface SteamAchievement {
  name: string;
  display_name: string;
  description: string;
  percent: number;
  icon: string;
  icon_gray: string;
  hidden: boolean;
}

export interface SteamAchievementsResponse {
  app_id: number;
  achievements: SteamAchievement[];
  total_count: number;
  completion_rate: number | null;
}

/**
 * Fetch global achievement statistics for a Steam game.
 * Useful for understanding player retention and engagement.
 */
export async function fetchSteamAchievements(
  appId: number,
  limit: number = 50
): Promise<SteamAchievementsResponse> {
  const url = new URL(
    apiUrl(`/steam/achievements/${appId}`),
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  url.searchParams.set("limit", String(limit));
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<SteamAchievementsResponse>(response);
}

export interface SteamGameContext {
  app_id: number;
  name: string | null;
  short_description: string | null;
  genres: string[];
  categories: string[];
  header_image: string | null;
  current_players: number | null;
  recent_news: SteamNewsItem[];
}

/**
 * Fetch comprehensive game context including details, current players, and recent news.
 * Combines multiple Steam API calls into a single response.
 */
export async function fetchSteamGameContext(
  appId: number,
  newsCount: number = 5
): Promise<SteamGameContext> {
  const url = new URL(
    apiUrl(`/steam/context/${appId}`),
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  url.searchParams.set("news_count", String(newsCount));
  const response = await apiFetch(url.toString(), { cache: "no-store" });
  return handleResponse<SteamGameContext>(response);
}

// ============================================================================
// News Summary API
// ============================================================================

export interface SummarizeNewsPayload {
  app_id: number;
  news_count?: number;
  include_sentiment?: boolean;
}

export interface SummarizeNewsResponse {
  summary: string;
  key_updates: string[];
  potential_impacts: string[];
  correlation_insights: string | null;
  news_count: number;
}

/**
 * Generate AI summary of recent game news/patches with optional sentiment correlation.
 */
export async function summarizeNews(
  payload: SummarizeNewsPayload
): Promise<SummarizeNewsResponse> {
  const response = await apiFetch(apiUrl("/summarize/news"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<SummarizeNewsResponse>(response);
}

// ============================================================================
// LLM Settings API
// ============================================================================

export interface LlmProvider {
  name: string;
  available: boolean;
  suggested_models: string[];
}

export interface LlmProvidersResponse {
  providers: LlmProvider[];
}

export interface LlmSettings {
  provider: string;
  model: string;
}

interface RawLlmProvider {
  name: string;
  models?: string[];
  suggested_models?: string[];
  has_key?: boolean;
  available?: boolean;
}

interface RawLlmProvidersResponse {
  providers: RawLlmProvider[];
}

function normalizeLlmProvider(raw: RawLlmProvider): LlmProvider {
  const suggestedModels = Array.isArray(raw.suggested_models)
    ? raw.suggested_models
    : Array.isArray(raw.models)
    ? raw.models
    : [];

  return {
    name: raw.name,
    available: Boolean(raw.available ?? raw.has_key),
    suggested_models: suggestedModels,
  };
}

export async function getProviders(): Promise<LlmProvidersResponse> {
  const response = await apiFetch(apiUrl("/settings/providers"), { cache: "no-store" });
  const payload = await handleResponse<RawLlmProvidersResponse | RawLlmProvider[]>(response);
  const providers = Array.isArray(payload) ? payload : payload.providers;
  return {
    providers: providers
      .filter((provider) => typeof provider?.name === "string" && provider.name.length > 0)
      .map(normalizeLlmProvider),
  };
}

export async function getLlmSettings(): Promise<LlmSettings> {
  const response = await apiFetch(apiUrl("/settings/llm"), { cache: "no-store" });
  return handleResponse<LlmSettings>(response);
}

export async function updateLlmSettings(provider: string, model: string): Promise<LlmSettings> {
  const trimmedModel = model.trim();
  if (!trimmedModel) {
    throw new Error("Model cannot be empty.");
  }
  const response = await apiFetch(apiUrl("/settings/llm"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model: trimmedModel }),
  });
  return handleResponse<LlmSettings>(response);
}

// ============================================================================
// API Key Management
// ============================================================================

export interface ApiKeyStatus {
  keys: Record<string, boolean>;
}

export async function getApiKeyStatus(): Promise<ApiKeyStatus> {
  const response = await apiFetch(apiUrl("/settings/api-keys"), { cache: "no-store" });
  return handleResponse<ApiKeyStatus>(response);
}

export async function updateApiKey(provider: string, apiKey: string): Promise<ApiKeyStatus> {
  const response = await apiFetch(apiUrl("/settings/api-keys"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
  return handleResponse<ApiKeyStatus>(response);
}
