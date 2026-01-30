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

async function getAuthHeaders(): Promise<HeadersInit> {
  if (typeof window === "undefined") return {};
  const clerk = (window as Window & {
    Clerk?: { session?: { getToken: () => Promise<string | null> } };
  }).Clerk;
  if (!clerk?.session) return {};
  try {
    const token = await clerk.session.getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
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
  filter: string;
  day_range?: number | null;
  persist?: boolean;
  refresh?: boolean;
  refresh_days?: number | null;
  llm_provider?: string | null;
  llm_model?: string | null;
  openai_api_key?: string | null;
  ollama_host?: string | null;
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
  llm_provider?: string | null;
  llm_model?: string | null;
  openai_api_key?: string | null;
  ollama_host?: string | null;
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
    headers: requireAdminHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to remove starred game (status ${response.status})`);
  }
}

export async function deleteGame(appId: number): Promise<void> {
  const response = await authFetch(apiUrl(`/games/${appId}`), {
    method: "DELETE",
    headers: requireAdminHeaders(),
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

export interface DatabaseReviewsParams {
  limit?: number;
  offset?: number;
  app_id?: number | null;
  language?: string | null;
  query?: string | null;
}

export async function fetchDatabaseReviews(params: DatabaseReviewsParams = {}): Promise<DatabaseReviewsResponse> {
  const url = new URL(apiUrl("/database/reviews"), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.app_id) url.searchParams.set("app_id", String(params.app_id));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.query) url.searchParams.set("query", params.query);
  const response = await authFetch(url.toString(), { cache: "no-store" });
  return handleResponse<DatabaseReviewsResponse>(response);
}

export async function fetchDatabaseGames(): Promise<DatabaseGameOption[]> {
  const response = await authFetch(apiUrl("/database/games"), { cache: "no-store" });
  return handleResponse<DatabaseGameOption[]>(response);
}

export async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const response = await authFetch(apiUrl("/database/stats"), {
    cache: "no-store",
  });
  return handleResponse<DatabaseStats>(response);
}

export interface BackendAdminStatus {
  destructive_enabled: boolean;
  token_configured: boolean;
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
    headers: requireAdminHeaders(),
  });
  return handleResponse<{ deleted: number; scope: string }>(response);
}

export async function clearEntireDatabase(): Promise<{ deleted: Record<string, number>; scope: string }> {
  const response = await authFetch(apiUrl("/database/clear"), {
    method: "DELETE",
    headers: requireAdminHeaders(),
  });
  return handleResponse<{ deleted: Record<string, number>; scope: string }>(response);
}
