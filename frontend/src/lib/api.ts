import {
  AnalyzeResponse,
  ProgressStatus,
  SearchResult,
  StarredGameDTO,
  StarredGamePayload,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchGames(query: string): Promise<SearchResult[]> {
  const url = new URL("/search", API_BASE);
  url.searchParams.set("query", query);
  const response = await fetch(url.toString(), { cache: "no-store" });
  return handleResponse<SearchResult[]>(response);
}

export interface AnalyzePayload {
  app_id: number;
  review_count: number;
  language: string;
  filter: string;
  day_range?: number | null;
}

export async function analyzeGame(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AnalyzeResponse>(response);
}

export async function fetchProgress(appId: number): Promise<ProgressStatus> {
  const response = await fetch(`${API_BASE}/progress/${appId}`, {
    cache: "no-store",
  });
  return handleResponse<ProgressStatus>(response);
}

export async function fetchStarredGames(): Promise<StarredGameDTO[]> {
  const response = await fetch(`${API_BASE}/starred`, {
    cache: "no-store",
  });
  return handleResponse<StarredGameDTO[]>(response);
}

export async function saveStarredGame(payload: StarredGamePayload): Promise<void> {
  await fetch(`${API_BASE}/starred`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to save starred game (status ${response.status})`);
    }
  });
}

export async function removeStarredGame(appId: number): Promise<void> {
  await fetch(`${API_BASE}/starred/${appId}`, {
    method: "DELETE",
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to remove starred game (status ${response.status})`);
    }
  });
}
