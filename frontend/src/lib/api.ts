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

function mergeHeaders(base: HeadersInit | undefined, extra: HeadersInit): Headers {
  const headers = new Headers(base || {});
  const extraHeaders = new Headers(extra);
  extraHeaders.forEach((value, key) => {
    headers.set(key, value);
  });
  return headers;
}

type AuthTokenFetcher = () => Promise<string | null>;

let authTokenFetcher: AuthTokenFetcher | null = null;

export function setAuthTokenFetcher(fetcher: AuthTokenFetcher | null) {
  authTokenFetcher = fetcher;
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  if (!authTokenFetcher) return {};
  try {
    const token = await authTokenFetcher();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const auth = await getAuthHeaders();
  const headers = mergeHeaders(init.headers, auth);
  return fetch(input, { ...init, headers });
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchGames(query: string): Promise<SearchResult[]> {
  const url = new URL(apiUrl("/search"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("query", query);
  const response = await authFetch(url.toString(), { cache: "no-store" });
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
  const response = await authFetch(apiUrl("/languages"), {
    cache: "force-cache",
  });
  return handleResponse<LanguagesResponse>(response);
}

export async function analyzeGame(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  const response = await authFetch(apiUrl("/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AnalyzeResponse>(response);
}

export async function fetchProgress(appId: number): Promise<ProgressStatus> {
  const response = await authFetch(apiUrl(`/progress/${appId}`), {
    cache: "no-store",
  });
  return handleResponse<ProgressStatus>(response);
}

export interface ProgressStreamEvent {
  type: "progress" | "completed" | "error" | "timeout";
  processed?: number;
  total?: number;
  active?: boolean;
  status?: string;
  error?: string;
}

export interface ProgressStreamCallbacks {
  onProgress?: (processed: number, total: number, active: boolean) => void;
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

  const start = async () => {
    try {
      const authHeaders = await getAuthHeaders();
      const headerMap = new Headers(authHeaders);
      const rawAuth =
        headerMap.get("Authorization") ?? headerMap.get("authorization");
      const rawToken =
        typeof rawAuth === "string"
          ? rawAuth.replace(/^Bearer\s+/i, "").trim()
          : "";
      if (rawToken) {
        url.searchParams.set("token", rawToken);
      }

      if (aborted) return;
      eventSource = new EventSource(url.toString());

      eventSource.addEventListener("progress", (event) => {
        try {
          const data = JSON.parse(event.data) as ProgressStreamEvent;
          callbacks.onProgress?.(
            data.processed ?? 0,
            data.total ?? 0,
            data.active ?? false
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
  const response = await authFetch(apiUrl("/starred"), {
    cache: "no-store",
  });
  return handleResponse<StarredGameDTO[]>(response);
}

export async function fetchAnalysisResult(appId: number): Promise<AnalysisResultResponse> {
  const response = await authFetch(apiUrl(`/analysis/${appId}`), {
    cache: "no-store",
  });
  return handleResponse<AnalysisResultResponse>(response);
}

export async function fetchHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await authFetch(apiUrl("/health"), { cache: "no-store" });
  return handleResponse<{ status: string; timestamp: string }>(response);
}

export async function fetchStoragePaths(): Promise<StoragePaths> {
  const response = await authFetch(apiUrl("/settings/storage"), {
    cache: "no-store",
  });
  return handleResponse<StoragePaths>(response);
}

export async function fetchLogTail(bytes: number = 20000): Promise<LogTailResponse> {
  const url = new URL(apiUrl("/logs/tail"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("bytes", String(bytes));
  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<LogTailResponse>(response);
}

export async function estimateAnalysis(payload: AnalyzePayload): Promise<AnalyzeEstimateResponse> {
  const response = await authFetch(apiUrl("/analyze/estimate"), {
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
  const response = await authFetch(apiUrl("/chat"), {
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

  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<FeedbackItem[]>(response);
}

export async function saveStarredGame(payload: StarredGamePayload): Promise<void> {
  const response = await authFetch(apiUrl("/starred"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to save starred game (status ${response.status})`);
  }
}

const ADMIN_TOKEN_STORAGE_KEY = "sentinext_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function setAdminToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

export async function verifyAdminToken(token: string): Promise<void> {
  const response = await authFetch(apiUrl("/admin/verify"), {
    method: "POST",
    headers: { "x-admin-token": token },
    cache: "no-store",
  });
  await handleResponse<{ ok: boolean }>(response);
}

function requireAdminHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) {
    throw new Error("Admin is locked. Unlock to proceed.");
  }
  return { "x-admin-token": token };
}

export async function removeStarredGame(appId: number): Promise<void> {
  const response = await authFetch(apiUrl(`/starred/${appId}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to remove starred game (status ${response.status})`);
  }
}

export async function toggleFavorite(appId: number, isFavorite: boolean): Promise<{ app_id: number; is_favorite: boolean }> {
  const response = await authFetch(apiUrl(`/starred/${appId}/favorite`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_favorite: isFavorite }),
  });
  return handleResponse<{ app_id: number; is_favorite: boolean }>(response);
}

export async function fetchFavoriteGames(): Promise<StarredGameDTO[]> {
  const response = await authFetch(apiUrl("/starred/favorites"), {
    cache: "no-store",
  });
  return handleResponse<StarredGameDTO[]>(response);
}

export interface AutoRefreshLogEntry {
  id: number;
  app_id: number;
  status: string;
  reviews_fetched: number;
  credits_used: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function fetchAutoRefreshHistory(limit: number = 50): Promise<AutoRefreshLogEntry[]> {
  const url = new URL(apiUrl("/auto-refresh/history"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("limit", String(limit));
  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<AutoRefreshLogEntry[]>(response);
}

export async function generateComparisonSummary(
  request: ComparisonSummarizeRequest
): Promise<ComparisonSummary> {
  const response = await authFetch(apiUrl('/compare/summarize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    if (response.status === 402) {
      const error = await response.json();
      throw new Error(error.detail?.message || 'Insufficient credits');
    }

    // Get detailed error message
    let errorMessage = `Failed to generate comparison (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = typeof errorData.detail === 'string'
          ? errorData.detail
          : errorData.detail.message || JSON.stringify(errorData.detail);
      }
    } catch {
      const errorText = await response.text();
      if (errorText) errorMessage = errorText;
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

function optionalAdminHeaders(): HeadersInit {
  const token = getAdminToken();
  return token ? { "x-admin-token": token } : {};
}

export async function deleteGame(appId: number): Promise<void> {
  const response = await authFetch(apiUrl(`/games/${appId}`), {
    method: "DELETE",
    headers: optionalAdminHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to delete game data (status ${response.status})`);
  }
}

export interface DatabaseStats {
  games: number;
  reviews: number;
  labels: number;
  labels_new_schema: number;
  labels_old_schema: number;
  starred_games: number;
}

export type DatabaseScope = "me" | "all";

export interface DatabaseReviewsParams {
  limit?: number;
  offset?: number;
  app_id?: number | null;
  language?: string | null;
  query?: string | null;
  scope?: DatabaseScope;
}

export async function fetchDatabaseReviews(params: DatabaseReviewsParams = {}): Promise<DatabaseReviewsResponse> {
  const url = new URL(apiUrl("/database/reviews"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.app_id) url.searchParams.set("app_id", String(params.app_id));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.query) url.searchParams.set("query", params.query);
  if (params.scope === "all") url.searchParams.set("scope", "all");
  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<DatabaseReviewsResponse>(response);
}

export async function fetchDatabaseGames(scope: DatabaseScope = "me"): Promise<DatabaseGameOption[]> {
  const url = new URL(apiUrl("/database/games"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (scope === "all") url.searchParams.set("scope", "all");
  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<DatabaseGameOption[]>(response);
}

export async function fetchDatabaseStats(scope: DatabaseScope = "me"): Promise<DatabaseStats> {
  const url = new URL(apiUrl("/database/stats"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (scope === "all") url.searchParams.set("scope", "all");
  const response = await authFetch(url.toString(), {
    cache: "no-store",
  });
  return handleResponse<DatabaseStats>(response);
}

export type DatabaseExportFormat = "csv" | "jsonl";

export interface DatabaseExportParams {
  format: DatabaseExportFormat;
  scope?: DatabaseScope;
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
  scope?: DatabaseScope;
  app_id?: number | null;
  language?: string | null;
  query?: string | null;
}): Promise<DatabaseExportCount> {
  const url = new URL(apiUrl("/database/reviews/count"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params.scope === "all") url.searchParams.set("scope", "all");
  if (params.app_id) url.searchParams.set("app_id", String(params.app_id));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.query) url.searchParams.set("query", params.query);

  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<DatabaseExportCount>(response);
}

export async function downloadDatabaseExport(params: DatabaseExportParams): Promise<void> {
  if (typeof window === "undefined") return;
  const url = new URL(apiUrl("/database/export"), window.location.origin);
  url.searchParams.set("format", params.format);
  if (params.scope === "all") url.searchParams.set("scope", "all");
  if (params.app_id) url.searchParams.set("app_id", String(params.app_id));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.query) url.searchParams.set("query", params.query);
  if (params.max_rows) url.searchParams.set("max_rows", String(params.max_rows));

  const response = await authFetch(url.toString(), { cache: "no-store" });
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

export interface BackendAdminStatus {
  destructive_enabled: boolean;
  token_configured: boolean;
  admin_user_ids_configured?: boolean;
}

export async function fetchBackendAdminStatus(): Promise<BackendAdminStatus> {
  const response = await authFetch(apiUrl("/admin/status"), {
    cache: "no-store",
  });
  return handleResponse<BackendAdminStatus>(response);
}

export async function clearLabels(oldSchemaOnly: boolean = false): Promise<{ deleted: number; scope: string }> {
  const url = oldSchemaOnly
    ? apiUrl("/database/labels") + "?old_schema_only=true"
    : apiUrl("/database/labels");
  const response = await authFetch(url, {
    method: "DELETE",
    headers: optionalAdminHeaders(),
  });
  return handleResponse<{ deleted: number; scope: string }>(response);
}

export async function clearEntireDatabase(): Promise<{ deleted: Record<string, number>; scope: string }> {
  const response = await authFetch(apiUrl("/database/clear"), {
    method: "DELETE",
    headers: optionalAdminHeaders(),
  });
  return handleResponse<{ deleted: Record<string, number>; scope: string }>(response);
}

export interface AuthStatus {
  user_id: string;
  is_admin: boolean;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await authFetch(apiUrl("/auth/status"), { cache: "no-store" });
  return handleResponse<AuthStatus>(response);
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
  /** True if the agent is suggesting games to select */
  suggest_game_selection?: boolean;
  /** Games suggested for selection */
  suggested_games?: Array<{ app_id: number; name: string }>;
  /** True if the agent suggests searching for a game (not found in starred) */
  suggest_search_game?: boolean;
  /** The game name that wasn't found */
  search_game_name?: string;
}

export async function sendEnhancedChat(
  payload: EnhancedChatPayload
): Promise<EnhancedChatResponse> {
  const response = await authFetch(apiUrl("/chat/simple"), {
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

  const start = async () => {
    try {
      const authHeaders = await getAuthHeaders();
      const headerMap = new Headers(authHeaders);
      const rawAuth =
        headerMap.get("Authorization") ?? headerMap.get("authorization");
      const rawToken =
        typeof rawAuth === "string"
          ? rawAuth.replace(/^Bearer\s+/i, "").trim()
          : "";
      if (rawToken) {
        url.searchParams.set("token", rawToken);
      }

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
// Admin Chat API
// ============================================================================

export interface AdminChatSession {
  session_id: string;
  user_id: string;
  title: string | null;
  app_ids: number[];
  first_user_message: string | null;
  created_at: string | null;
  updated_at: string | null;
  message_count: number;
  positive_feedback: number;
  negative_feedback: number;
}

export interface AdminChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export async function fetchAdminChatSessions(
  limit: number = 100
): Promise<AdminChatSession[]> {
  const response = await authFetch(apiUrl(`/admin/chat-sessions?limit=${limit}`), {
    headers: optionalAdminHeaders(),
    cache: "no-store",
  });
  return handleResponse<AdminChatSession[]>(response);
}

export async function fetchAdminChatHistory(
  sessionId: string
): Promise<AdminChatMessage[]> {
  const response = await authFetch(apiUrl(`/admin/chat-history/${sessionId}`), {
    headers: optionalAdminHeaders(),
    cache: "no-store",
  });
  return handleResponse<AdminChatMessage[]>(response);
}

export interface GrantCreditsPayload {
  user_id: string;
  amount: number;
  reason: string;
}

export interface GrantCreditsResponse {
  user_id: string;
  amount_granted: number;
  new_balance: number;
  reason: string;
}

export async function grantCredits(
  payload: GrantCreditsPayload
): Promise<GrantCreditsResponse> {
  const response = await authFetch(apiUrl("/admin/credits/grant"), {
    method: "POST",
    headers: {
      ...optionalAdminHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<GrantCreditsResponse>(response);
}

// ============================================================================
// Credit System API
// ============================================================================

export type SubscriptionTier = "free" | "pro" | "max";

export interface CreditStatus {
  balance: number;
  limit: number;
  used: number;
  tier: SubscriptionTier;
  period_end: string | null;
  percent_used: number;
  warning: boolean;
  blocked: boolean;
  stripe_customer_id: string | null;
}

export interface CreditEstimate {
  review_count: number;
  credits_needed: number;
  current_balance: number;
  can_afford: boolean;
  would_exceed_soft_limit: boolean;
  would_exceed_hard_limit: boolean;
}

export interface CheckoutResponse {
  checkout_url: string;
}

export interface BillingPortalResponse {
  portal_url: string;
}

/**
 * Fetch current credit status for the authenticated user.
 */
export async function fetchCreditStatus(): Promise<CreditStatus> {
  const response = await authFetch(apiUrl("/credits"), { cache: "no-store" });
  return handleResponse<CreditStatus>(response);
}

/**
 * Estimate credits needed for an analysis operation.
 */
export async function fetchCreditEstimate(
  reviewCount: number,
  newReviews?: number,
  cachedReviews?: number
): Promise<CreditEstimate> {
  const url = new URL(apiUrl("/credits/estimate"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("review_count", String(reviewCount));
  if (newReviews !== undefined) {
    url.searchParams.set("new_reviews", String(newReviews));
  }
  if (cachedReviews !== undefined) {
    url.searchParams.set("cached_reviews", String(cachedReviews));
  }
  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<CreditEstimate>(response);
}

/**
 * Create a Stripe checkout session for subscription upgrade.
 */
export async function createCheckoutSession(
  tier: "pro" | "max",
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutResponse> {
  const response = await authFetch(apiUrl("/credits/checkout"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tier,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });
  return handleResponse<CheckoutResponse>(response);
}

/**
 * Get Stripe customer portal URL for subscription management.
 */
export async function getBillingPortalUrl(returnUrl: string): Promise<BillingPortalResponse> {
  const url = new URL(apiUrl("/credits/portal"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("return_url", returnUrl);
  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<BillingPortalResponse>(response);
}

/**
 * Sync subscription status from Stripe (for debugging).
 */
export async function syncCreditStatus(): Promise<{ synced: boolean; tier?: string; message?: string }> {
  const response = await authFetch(apiUrl("/credits/sync"), {
    method: "POST",
  });
  return handleResponse<{ synced: boolean; tier?: string; message?: string }>(response);
}

// ============================================================================
// Subcategory Summary API
// ============================================================================

export interface SubcategorySummaryPayload {
  app_id: number;
  subcategory: string;
  reviews: Array<{
    review_id?: string;
    review?: string;
    voted_up?: boolean;
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
  const response = await authFetch(apiUrl("/summarize/subcategory"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<SubcategorySummaryResponse>(response);
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
  const response = await authFetch(apiUrl("/chat/citation-feedback"), {
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
  const response = await authFetch(url.toString(), { cache: "no-store" });
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
  const response = await authFetch(apiUrl(`/reports/available-months/${appId}`), {
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

  const response = await authFetch(url.toString(), { cache: "no-store" });
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
