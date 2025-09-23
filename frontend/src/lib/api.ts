import { AnalyzeResponse, SearchResult } from "@/types";

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
