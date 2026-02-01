'use client';

import { useState, useRef, useEffect, type ComponentPropsWithoutRef } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  BubbleController,
  ScatterController,
  DoughnutController,
  PieController,
  PolarAreaController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  authFetch,
  sendEnhancedChat,
  subscribeToChatStream,
  fetchStarredGames,
  ChatCitationItem,
} from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-lg font-semibold mt-3 mb-2" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-base font-semibold mt-3 mb-2" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-sm font-semibold mt-3 mb-2" {...props} />
  ),
  h4: (props: ComponentPropsWithoutRef<"h4">) => (
    <h4 className="text-sm font-semibold mt-3 mb-1" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="text-sm leading-relaxed whitespace-pre-wrap" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-inside mt-2 space-y-1" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-inside mt-2 space-y-1" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="text-sm leading-relaxed" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="border-l-2 border-white/20 pl-3 text-slate-300 my-2" {...props} />
  ),
  code: ({ inline, ...props }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) =>
    inline ? (
      <code className="rounded bg-slate-900/60 px-1 py-0.5 text-[12px] text-slate-200" {...props} />
    ) : (
      <code className="text-[12px] text-slate-200" {...props} />
    ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900/70 p-3 text-[12px]" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-[rgb(0,255,255)] underline decoration-white/30 underline-offset-2" {...props} />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-3 border-white/10" {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-left text-xs" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="border-b border-white/10 px-2 py-1 font-semibold" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b border-white/5 px-2 py-1 align-top" {...props} />
  ),
};

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  BubbleController,
  ScatterController,
  DoughnutController,
  PieController,
  PolarAreaController,
  Title,
  Tooltip,
  Legend,
  Filler
);

type ChartSpec = {
  type: string;
  data: {
    labels?: Array<string | number>;
    datasets: Array<Record<string, unknown>>;
  };
  options?: Record<string, unknown>;
  title?: string;
  description?: string;
};

type ChatPart =
  | { type: "text"; value: string }
  | { type: "chart"; spec: ChartSpec; raw: string };

const CHART_BLOCK_RE = /```(?:chart|chartjs|chart-json)\n([\s\S]*?)```/gi;

function splitChatContent(content: string): ChatPart[] {
  const parts: ChatPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CHART_BLOCK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    const raw = match[1].trim();
    try {
      const spec = JSON.parse(raw) as ChartSpec;
      if (spec && spec.type && spec.data) {
        parts.push({ type: "chart", spec, raw });
      } else {
        parts.push({ type: "text", value: match[0] });
      }
    } catch {
      parts.push({ type: "text", value: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}

function downloadChartImage(chart: ChartJS | null, filename: string) {
  if (!chart) return;
  const url = chart.toBase64Image("image/png", 1);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "chart.png";
  link.click();
}

function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
  return `${base}${path}`;
}

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  citations?: ChatCitationItem[];
};

type ChatSession = {
  session_id: string;
  message_count: number;
  started_at: string | null;
  last_message_at: string | null;
};

type StarredGame = {
  app_id: number;
  name: string;
};

const DATE_FILTER_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last year" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Game context state (Chat with Your Data)
  const [starredGames, setStarredGames] = useState<StarredGame[]>([]);
  const [selectedGames, setSelectedGames] = useState<number[]>([]);
  const [dateFilter, setDateFilter] = useState("all");
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load starred games on mount
  useEffect(() => {
    async function loadGames() {
      setLoadingGames(true);
      try {
        const games = await fetchStarredGames();
        setStarredGames(
          games.map((g) => ({ app_id: g.app_id, name: g.name }))
        );
      } catch (error) {
        console.error("Failed to load starred games:", error);
      } finally {
        setLoadingGames(false);
      }
    }
    loadGames();
  }, []);

  // Load chat sessions and latest session history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        // Load all sessions
        console.log("Loading chat sessions from:", apiUrl("/chat/sessions"));
        const sessionsResponse = await authFetch(apiUrl("/chat/sessions"));
        if (sessionsResponse.ok) {
          const sessionsList = await sessionsResponse.json();
          console.log("Loaded chat sessions:", sessionsList.length);
          setSessions(sessionsList);

          // Load latest session if exists
          if (sessionsList.length > 0) {
            const latestSession = sessionsList[0];
            setCurrentSessionId(latestSession.session_id);

            console.log("Loading chat history for session:", latestSession.session_id);
            const historyResponse = await authFetch(
              apiUrl(`/chat/history?session_id=${latestSession.session_id}`)
            );
            if (historyResponse.ok) {
              const history = await historyResponse.json();
              console.log("Loaded chat history:", history.length, "messages");
              const loadedMessages = history.map((msg: any) => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              }));
              setMessages(loadedMessages);
            }
          }
        } else {
          console.error("Failed to load chat sessions, status:", sessionsResponse.status);
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, []);

  async function handleSend() {
    const message = input.trim();
    if (!message || loading) return;

    const userMessage: Message = {
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setChatStatus(null);

    // Generate session ID if needed
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
    }

    // Subscribe to SSE for status updates if we have game context
    let unsubscribe: (() => void) | null = null;
    if (selectedGames.length > 0) {
      unsubscribe = subscribeToChatStream(sessionId, {
        onStatus: (status) => setChatStatus(status),
        onDone: () => setChatStatus(null),
        onError: () => setChatStatus(null),
        onTimeout: () => setChatStatus(null),
      });
    }

    try {
      const data = await sendEnhancedChat({
        message,
        session_id: sessionId,
        app_ids: selectedGames.length > 0 ? selectedGames : undefined,
        date_filter: selectedGames.length > 0 ? dateFilter : undefined,
        max_reviews_per_game: 50,
      });

      console.log("Received chat response", {
        hasGameContext: data.has_game_context,
        reviewsSearched: data.reviews_searched,
        citationsCount: data.citations?.length ?? 0,
      });

      // Update session ID if changed
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        citations: data.citations,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Reload sessions to update sidebar
      reloadSessions();
    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${errorMsg}\n\nTip: Make sure GEMINI_API_KEY is set in your .env.local file.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setChatStatus(null);
      if (unsubscribe) unsubscribe();
    }
  }

  function toggleGameSelection(appId: number) {
    setSelectedGames((prev) => {
      if (prev.includes(appId)) {
        return prev.filter((id) => id !== appId);
      }
      // Max 2 games
      if (prev.length >= 2) {
        return [prev[1], appId];
      }
      return [...prev, appId];
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function handleNewConversation() {
    // Start a new conversation by clearing current session ID
    // The backend will create a new session ID on the next message
    setCurrentSessionId(null);
    setMessages([]);
    console.log("Started new conversation");
  }

  async function reloadSessions() {
    try {
      const sessionsResponse = await authFetch(apiUrl("/chat/sessions"));
      if (sessionsResponse.ok) {
        const sessionsList = await sessionsResponse.json();
        setSessions(sessionsList);
      }
    } catch (error) {
      console.error("Failed to reload sessions:", error);
    }
  }

  async function loadSession(sessionId: string) {
    try {
      console.log("Loading session:", sessionId);
      const response = await authFetch(apiUrl(`/chat/history?session_id=${sessionId}`));
      if (response.ok) {
        const history = await response.json();
        const loadedMessages = history.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        }));
        setMessages(loadedMessages);
        setCurrentSessionId(sessionId);
      }
    } catch (error) {
      console.error("Failed to load session:", error);
    }
  }

  return (
    <AppLayout>
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="w-full h-[calc(100vh-2rem)] flex flex-col px-4 py-6 sm:px-6 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                AI Assistant
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              {selectedGames.length > 0
                ? `Chatting with ${selectedGames.length} game${selectedGames.length > 1 ? "s" : ""} selected`
                : "Your intelligent conversation partner"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowContext(!showContext)}
              className="text-xs"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              Context
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </Button>
            <Button
              variant="secondary"
              onClick={handleNewConversation}
              className="text-xs"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Sidebar: History + Game Selector */}
          {(showHistory || showContext) && (
            <Card variant="glass" className="w-72 flex-shrink-0 p-4 overflow-hidden flex flex-col gap-4">
              {/* Game Selector */}
              {showContext && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                    Chat with Your Data
                  </h2>
                  {loadingGames ? (
                    <p className="text-xs text-slate-500 text-center py-2">Loading games...</p>
                  ) : starredGames.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">No starred games yet</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-500 mb-2">Select up to 2 games to search reviews:</p>
                      <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-hide">
                        {starredGames.map((game) => (
                          <button
                            key={game.app_id}
                            onClick={() => toggleGameSelection(game.app_id)}
                            className={`w-full p-2 rounded-lg border text-left text-xs transition ${
                              selectedGames.includes(game.app_id)
                                ? "bg-[rgb(0,255,255)]/10 border-[rgb(0,255,255)]/30 text-white"
                                : "bg-slate-900/40 border-white/5 hover:border-white/20 text-slate-400"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-3 h-3 rounded border flex items-center justify-center ${
                                  selectedGames.includes(game.app_id)
                                    ? "bg-[rgb(0,255,255)] border-[rgb(0,255,255)]"
                                    : "border-slate-600"
                                }`}
                              >
                                {selectedGames.includes(game.app_id) && (
                                  <svg className="w-2 h-2 text-slate-900" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span className="truncate">{game.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      {selectedGames.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <label className="text-[10px] text-slate-500 block mb-1">Date Range:</label>
                          <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1.5 text-xs text-white focus:border-[rgb(0,255,255)] focus:outline-none"
                          >
                            {DATE_FILTER_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {selectedGames.length > 0 && (
                        <button
                          onClick={() => setSelectedGames([])}
                          className="text-[10px] text-slate-500 hover:text-slate-300 mt-1"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {showContext && showHistory && (
                <div className="border-t border-white/10"></div>
              )}

              {/* Chat History */}
              {showHistory && (
                <div className="flex-1 flex flex-col min-h-0">
                  <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Chat History
                  </h2>
                  <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
                    {sessions.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">No conversations yet</p>
                    ) : (
                      <div className="space-y-2">
                        {sessions.map((session) => (
                          <button
                            key={session.session_id}
                            onClick={() => loadSession(session.session_id)}
                            className={`w-full p-3 rounded-lg border text-left transition ${
                              currentSessionId === session.session_id
                                ? "bg-[rgb(0,255,255)]/10 border-[rgb(0,255,255)]/30"
                                : "bg-slate-900/40 border-white/5 hover:border-white/20"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  currentSessionId === session.session_id
                                    ? "bg-[rgb(0,255,255)]"
                                    : "bg-slate-600"
                                }`}
                              ></div>
                              <span className="text-xs font-medium text-slate-300">
                                {session.message_count} messages
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              {session.last_message_at
                                ? new Date(session.last_message_at).toLocaleString()
                                : "No date"}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Messages Container */}
          <Card variant="glass" className="flex-1 flex flex-col overflow-hidden p-6">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-hide">
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-[rgb(0,255,255)] animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-400">Loading conversation...</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-300">Start a conversation</p>
                    <p className="text-xs text-slate-500 mt-1">Ask me anything!</p>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30 text-white"
                        : "bg-slate-900/60 border border-white/10 text-slate-100"
                    }`}
                  >
                    <div className="text-sm text-slate-100 space-y-3">
                      {splitChatContent(msg.content).map((part, partIdx) => {
                        if (part.type === "text") {
                          return (
                            <ReactMarkdown
                              key={`text-${partIdx}`}
                              components={markdownComponents}
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeSanitize]}
                            >
                              {part.value}
                            </ReactMarkdown>
                          );
                        }

                        const chartRef = { current: null as ChartJS | null };
                        const spec = part.spec;
                        const chartData = spec.data as any;
                        const chartOptions = {
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: true },
                            title: spec.title ? { display: true, text: spec.title } : { display: false },
                          },
                          ...spec.options,
                        } as any;

                        return (
                          <div
                            key={`chart-${partIdx}`}
                            className="rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                          >
                            {spec.title ? (
                              <p className="text-sm font-semibold text-white mb-2">{spec.title}</p>
                            ) : null}
                            {spec.description ? (
                              <p className="text-xs text-slate-400 mb-3">{spec.description}</p>
                            ) : null}
                            <div className="h-64">
                              <Chart
                                ref={(instance) => {
                                  chartRef.current = instance ?? null;
                                }}
                                type={spec.type as any}
                                data={chartData}
                                options={chartOptions}
                              />
                            </div>
                            <div className="mt-3 flex justify-end">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  downloadChartImage(
                                    chartRef.current,
                                    (spec.title || "chart").toLowerCase().replace(/\s+/g, "-") + ".png"
                                  )
                                }
                              >
                                Download PNG
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Citations for game-aware responses */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Sources ({msg.citations.length})</p>
                        <div className="space-y-2">
                          {msg.citations.slice(0, 3).map((citation, citIdx) => (
                            <div
                              key={citIdx}
                              className="bg-slate-800/50 rounded-lg p-2 text-[11px]"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[rgb(0,255,255)]">#{citation.review_id}</span>
                                <span className="text-slate-500">•</span>
                                <span className="text-slate-400">{citation.game_name}</span>
                                <span className="text-slate-500">•</span>
                                <span className="text-slate-500">{citation.votes_up} helpful</span>
                              </div>
                              <p className="text-slate-300 line-clamp-2">&quot;{citation.snippet}&quot;</p>
                            </div>
                          ))}
                          {msg.citations.length > 3 && (
                            <p className="text-[10px] text-slate-500">
                              +{msg.citations.length - 3} more citations
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-[rgb(0,255,255)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-[rgb(0,255,255)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-[rgb(0,255,255)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-xs text-slate-400">
                      {chatStatus || (selectedGames.length > 0 ? "Searching reviews..." : "Thinking...")}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                rows={2}
                disabled={loading}
                className="flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-[rgb(0,255,255)] focus:outline-none resize-none disabled:opacity-50"
              />
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="self-end"
              >
                {loading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </Button>
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              {selectedGames.length > 0 ? (
                <>Press Enter to search reviews and get insights</>
              ) : (
                <>Press Enter to send, Shift+Enter for new line</>
              )}
            </p>
          </div>
        </Card>
        </div>
      </div>
    </AppLayout>
  );
}
