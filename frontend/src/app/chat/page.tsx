'use client';

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { chatWithInsights, fetchStarredGames } from "@/lib/api";
import { buildLlmRequestConfig } from "@/lib/settings";
import { maxDaysFromDateRange, useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import type { ChatCitation, ChatResponse, StarredGameDTO } from "@/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  usedSubcategories?: string[];
  reviewCount?: number;
  filteredReviewCount?: number;
  model?: string;
};

function highlightSnippet(text: string, snippet: string | null | undefined) {
  const rawSnippet = (snippet || "").trim();
  if (!rawSnippet) return text;
  const haystack = text.toLowerCase();
  const needle = rawSnippet.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index === -1) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + rawSnippet.length);
  const after = text.slice(index + rawSnippet.length);
  return (
    <>
      {before}
      <mark className="rounded bg-sky-500/20 px-1 text-sky-100">{match}</mark>
      {after}
    </>
  );
}

const DEFAULT_QUESTIONS = [
  "What are customers talking about in the AI category?",
  "What are the top issues players mention recently?",
  "Which subcategories are driving negative recommendations?",
];

export default function ChatPage() {
  const { filters } = useGlobalFilters();
  const [starredGames, setStarredGames] = useState<StarredGameDTO[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<ChatCitation | null>(null);

  const selectedGame = useMemo(
    () => starredGames.find((game) => game.app_id === selectedGameId) || null,
    [selectedGameId, starredGames],
  );

  useEffect(() => {
    async function loadStarred() {
      try {
        const games = await fetchStarredGames();
        setStarredGames(games);
        setSelectedGameId((previous) => {
          if (previous !== null) return previous;
          if (!games.length) return previous;
          return games[0].app_id;
        });
      } catch (err) {
        console.error("Failed to load starred games", err);
        setError("Failed to load starred games. Is the backend running?");
      }
    }

    loadStarred();
  }, []);

  async function handleAsk(customQuestion?: string) {
    const prompt = (customQuestion ?? question).trim();
    if (!prompt || !selectedGame) return;

    setError(null);
    setLoading(true);
    setQuestion("");

    setMessages((prev) => [...prev, { role: "user", content: prompt }]);

    try {
      const llmConfig = await buildLlmRequestConfig();
      const response: ChatResponse = await chatWithInsights({
        app_id: selectedGame.app_id,
        question: prompt,
        sentiment: filters.sentiment,
        min_helpful: filters.minHelpful,
        max_days: maxDaysFromDateRange(filters.dateRange),
        playtime_bucket: filters.playtime,
        language: filters.language,
        ...llmConfig,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.answer,
          citations: response.citations,
          usedSubcategories: response.used_subcategories,
          reviewCount: response.review_count,
          filteredReviewCount: response.filtered_review_count,
          model: response.model,
        },
      ]);
    } catch (err) {
      console.error("Chat failed", err);
      setError((err as Error).message || "Chat failed.");
    } finally {
      setLoading(false);
    }
  }

  function formatSubcategory(value: string) {
    if (!value) return "";
    const label = value.includes("/") ? value.split("/", 2)[1] : value;
    return label.replace(/_/g, " ");
  }

  function formatTimestamp(value?: string | null) {
    if (!value) return "Date unknown";
    const parsed = Number(value);
    const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unknown";
    return date.toLocaleDateString();
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-6">
        <div>
          <h1 className="text-xl font-bold text-white">Chat with Insights</h1>
          <p className="text-xs text-slate-400">Ask questions grounded in your tagged reviews and evidence snippets.</p>
        </div>

        <Card variant="glass" className="p-6">
          <div className="flex flex-wrap items-start gap-6">
            <div className="min-w-[220px] flex-1">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Game</p>
              <div className="mt-2 flex items-center gap-4">
                {selectedGame ? (
                  <SteamImage
                    appId={selectedGame.app_id}
                    variant="header"
                    alt={selectedGame.name}
                    className="h-16 w-28 rounded-xl object-cover"
                    imageUrl={selectedGame.metadata.header_image}
                  />
                ) : null}
                <select
                  value={selectedGameId ?? ""}
                  onChange={(event) => setSelectedGameId(Number(event.target.value))}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                >
                  {starredGames.map((game) => (
                    <option key={game.app_id} value={game.app_id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="min-w-[260px] flex-1">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Scope</p>
              <p className="mt-2 text-sm text-slate-300">
                Chat respects the global filters above.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Sentiment: {filters.sentiment === "positive" ? "Recommended" : filters.sentiment === "negative" ? "Not recommended" : "All"} ·{" "}
                Date: {filters.dateRange === "30d" ? "Last 30 days" : filters.dateRange === "90d" ? "Last 90 days" : filters.dateRange === "365d" ? "Last year" : "All time"} ·{" "}
                Helpful: {filters.minHelpful ? `${filters.minHelpful}+` : "All"} ·{" "}
                Playtime: {filters.playtime === "lt2h" ? "<2h" : filters.playtime === "2to20h" ? "2–20h" : filters.playtime === "20hplus" ? "20h+" : "All"} ·{" "}
                Language: {filters.language && filters.language !== "all" ? filters.language : "All"}
              </p>
            </div>

            <div className="min-w-[200px] flex-1">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Ideas</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEFAULT_QUESTIONS.map((item) => (
                  <button
                    key={item}
                    onClick={() => handleAsk(item)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:border-sky-500/40 hover:text-white"
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-6">
          {starredGames.length === 0 ? (
            <EmptyState
              title="No analyses available"
              description="Run an analysis first so chat has insights to reference."
              icon="?"
              variant="info"
            />
          ) : (
            <div className="space-y-4">
              <div className="max-h-[32rem] space-y-4 overflow-auto pr-2">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Ask a question about your insights. Responses will cite evidence snippets when available.
                  </p>
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-2xl rounded-2xl border px-4 py-3 text-sm ${
                          message.role === "user"
                            ? "border-sky-500/40 bg-sky-500/10 text-white"
                            : "border-white/10 bg-slate-900/40 text-slate-100"
                        }`}
                      >
                        <p className="whitespace-pre-line">{message.content}</p>
                        {message.role === "assistant" && message.usedSubcategories?.length ? (
                          <p className="mt-2 text-xs text-slate-400">
                            Focused on: {message.usedSubcategories.map(formatSubcategory).join(", ")}
                          </p>
                        ) : null}
                        {message.role === "assistant" && message.reviewCount !== undefined ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Coverage: {message.filteredReviewCount ?? 0} / {message.reviewCount} reviews
                          </p>
                        ) : null}
                        {message.role === "assistant" && message.citations && message.citations.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {message.citations.slice(0, 6).map((citation) => (
                              <button
                                key={`${citation.review_id}-${citation.subcategory}-${citation.snippet}`}
                                type="button"
                                onClick={() => setSelectedCitation(citation)}
                                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-sky-400/40 hover:bg-sky-500/10"
                              >
                                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                                  {formatSubcategory(citation.subcategory)} · review {citation.review_id}
                                </p>
                                <p className="mt-1 text-slate-200">&quot;{citation.snippet}&quot;</p>
                                <p className="mt-1 text-[11px] text-slate-500">Click to view full review</p>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {error ? <p className="text-sm text-rose-400">{error}</p> : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about subcategories, issues, or sentiment..."
                  rows={2}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <Button
                  variant="primary"
                  onClick={() => handleAsk()}
                  disabled={loading || !question.trim() || !selectedGame}
                >
                  {loading ? "Thinking..." : "Ask"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
      {selectedCitation ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedCitation(null)}
        >
          <div
            className="mt-8 w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Full Review</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {formatSubcategory(selectedCitation.subcategory)} · review {selectedCitation.review_id}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setSelectedCitation(null)}>
                Close
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>{formatTimestamp(selectedCitation.created_at)}</span>
              {selectedCitation.votes_up !== undefined && selectedCitation.votes_up !== null ? (
                <span>{selectedCitation.votes_up} helpful</span>
              ) : null}
              {selectedCitation.voted_up !== undefined && selectedCitation.voted_up !== null ? (
                <span
                  className={`rounded-full px-2 py-1 ${
                    selectedCitation.voted_up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {selectedCitation.voted_up ? "Recommended" : "Not recommended"}
                </span>
              ) : null}
            </div>
            <div className="mt-4 whitespace-pre-line text-sm text-slate-100">
              {selectedCitation.review_text
                ? highlightSnippet(selectedCitation.review_text, selectedCitation.snippet)
                : "Review text unavailable."}
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
