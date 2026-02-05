'use client';

import { useState, useRef, useEffect, useMemo, type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  BarController,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
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
import { PageTransition } from "@/components/PageTransition";
import { SteamImage } from "@/components/SteamImage";
import {
  authFetch,
  sendEnhancedChat,
  subscribeToChatStream,
  submitCitationFeedback,
  downloadChatSession,
  ChatCitationItem,
  EnhancedChatResponse,
} from "@/lib/api";
import { useStarredGames } from "@/contexts/StarredGamesContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/contexts/CreditsContext";
import { SourceReviewsWidget } from "@/components/chat/SourceReviewsWidget";

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
  BarController,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
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

// Vibrant color palette for dark backgrounds
const CHART_COLORS = [
  'rgba(96, 165, 250, 0.8)',   // bright blue
  'rgba(134, 239, 172, 0.8)',  // bright green
  'rgba(251, 146, 60, 0.8)',   // bright orange
  'rgba(244, 114, 182, 0.8)',  // bright pink
  'rgba(167, 139, 250, 0.8)',  // bright purple
  'rgba(253, 224, 71, 0.8)',   // bright yellow
  'rgba(248, 113, 113, 0.8)',  // bright red
  'rgba(103, 232, 249, 0.8)',  // bright cyan
  'rgba(196, 181, 253, 0.8)',  // light purple
  'rgba(134, 239, 212, 0.8)',  // bright teal
];

const CHART_BORDER_COLORS = [
  'rgba(96, 165, 250, 1)',
  'rgba(134, 239, 172, 1)',
  'rgba(251, 146, 60, 1)',
  'rgba(244, 114, 182, 1)',
  'rgba(167, 139, 250, 1)',
  'rgba(253, 224, 71, 1)',
  'rgba(248, 113, 113, 1)',
  'rgba(103, 232, 249, 1)',
  'rgba(196, 181, 253, 1)',
  'rgba(134, 239, 212, 1)',
];

const SUGGESTED_PROMPTS = [
  "Give me the review count and recommendation rate overview.",
  "Show the top issues by subcategory (with example reviews).",
  "Show the top praises by subcategory.",
  "What feature requests show up most often?",
  "Which review topics/subcategories are available?",
  "Show the recommendation rate trend over time.",
  "Show stats for the subcategory technical/bugs.",
  "Show example reviews about technical/performance.",
  "Compare the last 30 days vs the previous 30 days for key topics.",
];

const COMPARE_SUGGESTED_PROMPTS = [
  "Compare the two games on recommendation rate and key issues.",
  "Compare recommendation rate trends between the two games.",
  "Compare top issues between the two games.",
];

function normalizeChartData(spec: ChartSpec): ChartSpec["data"] {
  // Handle simplified format: {data: [{label, value}, ...]}
  if (Array.isArray(spec.data)) {
    const simplified = spec.data as Array<{label: string; value: number}>;
    return {
      labels: simplified.map(d => d.label),
      datasets: [{ data: simplified.map(d => d.value) }],
    };
  }
  // Handle case where data array is nested under data property
  if (spec.data && Array.isArray((spec.data as any).data)) {
    const simplified = (spec.data as any).data as Array<{label: string; value: number}>;
    return {
      labels: simplified.map(d => d.label),
      datasets: [{ data: simplified.map(d => d.value) }],
    };
  }
  // Already in Chart.js format
  return spec.data;
}

function enhanceChartData(spec: ChartSpec): any {
  const normalizedData = normalizeChartData(spec);
  const data = { ...normalizedData };

  // Ensure datasets exists
  if (!data.datasets || !Array.isArray(data.datasets)) {
    data.datasets = [{ data: [] }];
  }

  // Apply colors to datasets if not already present
  if (data.datasets.length > 0) {
    data.datasets = data.datasets.map((dataset: any, idx: number) => {
      const colorIdx = idx % CHART_COLORS.length;
      const enhanced = { ...dataset };

      // For pie/doughnut charts, apply different color to each segment
      if (spec.type === 'pie' || spec.type === 'doughnut' || spec.type === 'polarArea') {
        if (!enhanced.backgroundColor) {
          const dataLength = Array.isArray(enhanced.data) ? enhanced.data.length : 0;
          enhanced.backgroundColor = Array.from({ length: dataLength }, (_, i) =>
            CHART_COLORS[i % CHART_COLORS.length]
          );
          enhanced.borderColor = Array.from({ length: dataLength }, (_, i) =>
            CHART_BORDER_COLORS[i % CHART_BORDER_COLORS.length]
          );
          enhanced.borderWidth = 2;
        }
      } else {
        // For bar/line/radar charts, use single color per dataset
        if (!enhanced.backgroundColor) {
          enhanced.backgroundColor = CHART_COLORS[colorIdx];
        }
        if (!enhanced.borderColor) {
          enhanced.borderColor = CHART_BORDER_COLORS[colorIdx];
        }
        if (!enhanced.borderWidth) {
          enhanced.borderWidth = 2;
        }

        // Line-specific styling
        if (spec.type === 'line') {
          enhanced.tension = enhanced.tension ?? 0.3;
          enhanced.pointRadius = enhanced.pointRadius ?? 4;
          enhanced.pointHoverRadius = enhanced.pointHoverRadius ?? 6;
          enhanced.pointBackgroundColor = enhanced.pointBackgroundColor ?? CHART_BORDER_COLORS[colorIdx];
        }
      }

      return enhanced;
    });
  }

  return data;
}

function buildChartOptions(spec: ChartSpec) {
  // Check if it's a horizontal bar chart
  const isHorizontalBar = spec.type === 'bar' && spec.options?.indexAxis === 'y';

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    color: "#e2e8f0",
    // Add layout padding for horizontal bar charts to prevent label cutoff
    ...(isHorizontalBar && {
      layout: {
        padding: {
          left: 20,
          right: 20,
        },
      },
    }),
    plugins: {
      legend: {
        display: true,
        labels: {
          color: "#cbd5f5",
          font: {
            size: 12,
            weight: '500' as const,
          },
          padding: 12,
        },
      },
      title: spec.title
        ? {
            display: true,
            text: spec.title,
            color: "#e2e8f0",
            font: {
              size: 14,
              weight: '600' as const,
            },
            padding: { bottom: 16 },
          }
        : { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleColor: "#e2e8f0",
        bodyColor: "#e2e8f0",
        borderColor: "rgba(148, 163, 184, 0.3)",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 0,
        titleFont: {
          size: 13,
          weight: '600' as const,
        },
        bodyFont: {
          size: 12,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#cbd5f5",
          font: {
            size: 11,
          },
          ...(isHorizontalBar && { padding: 8 }),
        },
        grid: {
          color: "rgba(148, 163, 184, 0.1)",
          drawBorder: false,
        },
      },
      y: {
        ticks: {
          color: "#cbd5f5",
          font: {
            size: 11,
          },
          ...(isHorizontalBar && { padding: 8 }),
        },
        grid: {
          color: "rgba(148, 163, 184, 0.1)",
          drawBorder: false,
        },
        // Add spacing between bars for horizontal charts
        ...(isHorizontalBar && {
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        }),
      },
    },
  } as Record<string, unknown>;

  const merged = {
    ...base,
    ...(spec.options ?? {}),
    plugins: {
      ...(base.plugins as Record<string, unknown>),
      ...(spec.options?.plugins ?? {}),
    },
    scales: {
      ...(base.scales as Record<string, unknown>),
      ...(spec.options?.scales ?? {}),
    },
  };

  return merged;
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
  sourceReviews?: ChatCitationItem[];
  suggestedQuestions?: string[];
  needsClarification?: boolean;
  clarificationOptions?: string[];
  suggestSearchGame?: boolean;
  searchGameName?: string;
};

type ChatSession = {
  session_id: string;
  message_count: number;
  started_at: string | null;
  last_message_at: string | null;
  first_user_message?: string | null;
};

type StarredGame = {
  app_id: number;
  name: string;
  metadata: {
    header_image?: string | null;
  };
  hasAnalysis: boolean;
};


export default function ChatPage() {
  const { language, t } = useLanguage();
  const { silentRefresh: refreshCredits } = useCredits();
  const { games: allStarredGames, loading: loadingGames } = useStarredGames();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Game context state (Chat with Your Data)
  // Filter to only games with analysis (insights not null)
  const starredGames = useMemo(() => {
    return allStarredGames
      .filter((g) => g.insights !== null)
      .map((g) => ({
        app_id: g.app_id,
        name: g.name,
        metadata: g.metadata,
        hasAnalysis: true,
      }));
  }, [allStarredGames]);
  const [selectedGames, setSelectedGames] = useState<number[]>([]);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [promptNotice, setPromptNotice] = useState<string | null>(null);
  const suggestedQueriesRef = useRef<HTMLDivElement>(null);
  const prevSelectedCountRef = useRef(0);

  // Message feedback state: tracks which message indices user has voted on
  const [messageFeedback, setMessageFeedback] = useState<Record<number, boolean>>({});
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<number | null>(null);
  const chatLocked = selectedGames.length === 0 && messages.length === 0;


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!copyToast) return;
    const timeout = setTimeout(() => setCopyToast(null), 2000);
    return () => clearTimeout(timeout);
  }, [copyToast]);

  useEffect(() => {
    if (!promptNotice) return;
    const timeout = setTimeout(() => setPromptNotice(null), 2000);
    return () => clearTimeout(timeout);
  }, [promptNotice]);

  useEffect(() => {
    if (selectedGames.length > 0) {
      setPromptNotice(null);
    }
  }, [selectedGames]);

  useEffect(() => {
    const prevCount = prevSelectedCountRef.current;
    if (selectedGames.length > prevCount && messages.length === 0) {
      requestAnimationFrame(() => {
        suggestedQueriesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    prevSelectedCountRef.current = selectedGames.length;
  }, [selectedGames.length, messages.length]);

  // Load chat sessions on mount (start with a fresh chat view)
  useEffect(() => {
    async function loadSessions() {
      try {
        // Load all sessions
        console.log("Loading chat sessions from:", apiUrl("/chat/sessions"));
        const sessionsResponse = await authFetch(apiUrl("/chat/sessions"));
        if (sessionsResponse.ok) {
          const sessionsList = await sessionsResponse.json();
          console.log("Loaded chat sessions:", sessionsList.length);
          setSessions(sessionsList);
        } else {
          console.error("Failed to load chat sessions, status:", sessionsResponse.status);
        }
      } catch (error) {
        console.error("Failed to load chat sessions:", error);
      } finally {
        setLoadingHistory(false);
      }
    }
    // Ensure the chat view starts fresh by default.
    setCurrentSessionId(null);
    setMessages([]);
    loadSessions();
  }, []);

  async function handleSend() {
    if (chatLocked) {
      return;
    }
    await sendMessage(input);
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

  async function handleMessageFeedback(messageIndex: number, helpful: boolean) {
    if (!currentSessionId || feedbackSubmitting !== null) return;

    setFeedbackSubmitting(messageIndex);
    try {
      // Submit feedback for the message (using session_id and message index)
      await submitCitationFeedback({
        review_id: `msg_${messageIndex}`, // Use message index as identifier
        session_id: currentSessionId,
        helpful,
      });
      setMessageFeedback((prev) => ({ ...prev, [messageIndex]: helpful }));
    } catch (error) {
      console.error("Failed to submit message feedback:", error);
    } finally {
      setFeedbackSubmitting(null);
    }
  }

  async function handleExportChat() {
    if (!currentSessionId) return;
    try {
      await downloadChatSession(currentSessionId, "markdown");
    } catch (error) {
      console.error("Failed to export chat:", error);
    }
  }

  async function handleCopyAnswer(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(t("chat.copySuccess"));
    } catch {
      setCopyToast(t("chat.copyFailed"));
    }
  }

  function findPreviousUserMessage(index: number): string | null {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return null;
  }

  function handleRegenerate(index: number) {
    if (loading) return;
    const prompt = findPreviousUserMessage(index);
    if (!prompt) return;
    sendMessage(prompt);
  }

  async function handleSuggestedQuestion(question: string) {
    if (loading) return;
    setInput(question);
    // Use setTimeout to allow state to update, then trigger send
    setTimeout(() => {
      sendMessage(question);
    }, 0);
  }

  function handlePresetPrompt(prompt: string) {
    if (loading) return;
    if (selectedGames.length === 0) {
      setInput(prompt);
      setPromptNotice(t("chat.selectGameNotice"));
      return;
    }
    sendMessage(prompt);
  }

  async function handleClarificationOption(option: string) {
    if (loading) return;
    setInput(option);
    setTimeout(() => {
      sendMessage(option);
    }, 0);
  }

  // Extract the core send logic to be reusable
  async function sendMessage(messageText: string) {
    const message = messageText.trim();
    if (!message || loading || chatLocked) return;

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
        max_reviews_per_game: 50,
        language: language,
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
        sourceReviews: data.source_reviews,
        suggestedQuestions: data.suggested_questions,
        needsClarification: data.needs_clarification,
        clarificationOptions: data.clarification_options,
        suggestSearchGame: data.suggest_search_game,
        searchGameName: data.search_game_name,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Refresh credits after chat (chat consumes credits)
      refreshCredits();

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

  async function handleNewConversation() {
    // Start a new conversation by clearing current session ID
    // The backend will create a new session ID on the next message
    setCurrentSessionId(null);
    setMessages([]);
    setSelectedGames([]);
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
      <PageTransition>
        <div className="w-full h-[calc(100vh-5rem)] sm:h-[calc(100vh-2rem)] flex flex-col gap-2 sm:gap-4 px-2 py-3 sm:px-4 sm:py-6 lg:px-6">
          {/* Header */}
          <div className="mb-2 sm:mb-6 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold">
                <span className="text-white">
                  {t('chat.title')}
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                {selectedGames.length > 0
                  ? `${selectedGames.length} game${selectedGames.length > 1 ? "s" : ""} selected`
                  : t('chat.subtitle')}
              </p>
            </div>
            <div className="flex gap-1 sm:gap-2 flex-shrink-0">
              {currentSessionId && messages.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={handleExportChat}
                  className="text-[10px] sm:text-xs px-2 sm:px-3"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="hidden sm:inline">Export</span>
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={handleNewConversation}
                className="text-[10px] sm:text-xs px-2 sm:px-3"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">{t('chat.newChat')}</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 overflow-hidden">
          {/* Left Sidebar: Chat History - hidden on mobile, shown on desktop */}
          <Card variant="glass" className="hidden lg:flex w-72 flex-shrink-0 p-4 overflow-hidden flex-col transition-colors duration-200">
            <div className="flex-1 flex flex-col gap-4 animate-slide-up-soft">
            {/* Chat History */}
            <div className="flex-1 flex flex-col min-h-0">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('chat.history')}
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
                {loadingHistory ? (
                  <div className="space-y-2 animate-pulse">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={`session-skeleton-${idx}`}
                        className="w-full rounded-lg border border-white/5 bg-slate-900/40 p-3"
                      >
                        <div className="h-3 w-3/4 bg-slate-700/40 rounded mb-2" />
                        <div className="h-2 w-1/2 bg-slate-700/30 rounded" />
                      </div>
                    ))}
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">{t('chat.noConversations')}</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => {
                      const title = session.first_user_message
                        ? session.first_user_message.trim().slice(0, 50) + (session.first_user_message.length > 50 ? '...' : '')
                        : `${session.message_count} messages`;
                      return (
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
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                currentSessionId === session.session_id
                                  ? "bg-[rgb(0,255,255)]"
                                  : "bg-slate-600"
                              }`}
                            ></div>
                            <span className="text-xs font-medium text-slate-300 truncate">
                              {title}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {session.last_message_at
                              ? new Date(session.last_message_at).toLocaleString()
                              : "No date"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            </div>
          </Card>

          {/* Messages Container */}
          <Card variant="glass" className="flex-1 flex flex-col overflow-hidden relative transition-colors duration-200">
            {copyToast && (
              <div className="absolute right-3 sm:right-6 top-2 sm:top-4 rounded-lg border border-white/10 bg-slate-900/90 px-2 sm:px-3 py-1 text-[10px] sm:text-xs text-slate-200">
                {copyToast}
              </div>
            )}
            <div className="flex h-full flex-col px-3 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 animate-slide-up-soft animation-delay-100">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto mb-4 pr-2 scrollbar-hide">
                <div className="min-h-full space-y-4">
                {messages.length > 0 && selectedGames.length > 0 && (
                  <div className="sticky top-0 z-10 -mx-3 sm:-mx-6 mb-2 sm:mb-3 border-b border-white/10 bg-slate-900/90 px-3 sm:px-6 py-1.5 sm:py-2 backdrop-blur">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-slate-400">
                      <span>Chatting with:</span>
                      {selectedGames.map((appId) => {
                        const game = starredGames.find(g => g.app_id === appId);
                        return game ? (
                          <span key={appId} className="px-1.5 sm:px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] sm:text-[11px] truncate max-w-[120px] sm:max-w-none">
                            {game.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                {messages.length === 0 ? (
                  /* Game Selection Screen */
                  <div className="h-full flex flex-col p-2 sm:p-4">
                    {/* Header - sticky at top */}
                    <div className="text-center pb-3 sm:pb-4 flex-shrink-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white mb-1">
                        Select Games to Chat About
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        {selectedGames.length === 0
                          ? "Choose up to 2 games to unlock chat"
                          : `${selectedGames.length} selected. Ask a question below.`}
                      </p>
                    </div>

                    {/* Scrollable game grid */}
                    <div className="flex-1 overflow-y-auto">
                    <div className="w-full max-w-3xl mx-auto space-y-4 sm:space-y-6">
                      {/* Game Grid */}
                      {loadingGames ? (
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => (
                            <div
                              key={`game-skeleton-${idx}`}
                              className="relative overflow-hidden rounded-lg border border-white/10 bg-slate-900/40"
                            >
                              <div className="aspect-[460/215] bg-slate-800/50 animate-pulse" />
                              <div className="p-2 sm:p-3 bg-slate-900/90">
                                <div className="h-3 w-3/4 bg-slate-700/40 rounded animate-pulse" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : starredGames.length === 0 ? (
                        <div className="text-center py-6 sm:py-8">
                          <p className="text-xs sm:text-sm text-slate-400 mb-2">No analyzed games found</p>
                          <p className="text-[10px] sm:text-xs text-slate-500 mb-4">Analyze a game before chatting.</p>
                          <a href="/" className="text-xs sm:text-sm text-[rgb(0,255,255)] hover:underline inline-block">
                            Go to Dashboard
                          </a>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {starredGames.map((game) => {
                            const isSelected = selectedGames.includes(game.app_id);
                            return (
                              <button
                                key={game.app_id}
                                onClick={() => toggleGameSelection(game.app_id)}
                                className={`relative overflow-hidden rounded-lg border transition-all active:scale-[0.98] ${
                                  isSelected
                                    ? "border-sky-500 ring-2 ring-sky-500/50"
                                    : "border-white/10 hover:border-white/20"
                                }`}
                              >
                                <div className="aspect-[460/215] relative">
                                  <SteamImage
                                    appId={game.app_id}
                                    variant="header"
                                    alt={game.name}
                                    className="h-full w-full object-cover"
                                    imageUrl={game.metadata.header_image}
                                  />
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-sky-500/20 flex items-center justify-center">
                                      <div className="bg-sky-500 text-white rounded-full p-1.5 sm:p-2">
                                        <svg
                                          className="w-4 h-4 sm:w-6 sm:h-6"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={3}
                                            d="M5 13l4 4L19 7"
                                          />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="p-2 sm:p-3 bg-slate-900/90">
                                  <p className="text-xs sm:text-sm font-medium text-white truncate">{game.name}</p>
                                </div>
                                {isSelected && (
                                  <div className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2 rounded-full bg-sky-500 px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs font-bold text-white z-10">
                                    Selected
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Suggested Prompts */}
                  {!loadingGames && selectedGames.length > 0 && (
                    <div ref={suggestedQueriesRef} className="border-t border-white/10 pt-4">
                      <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-slate-500 mb-3 text-center">
                        Suggested Questions
                      </p>
                          <div className="flex overflow-x-auto pb-2 gap-2 sm:flex-wrap sm:justify-center sm:overflow-x-visible sm:pb-0 scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0">
                            {(selectedGames.length > 1
                              ? [...SUGGESTED_PROMPTS, ...COMPARE_SUGGESTED_PROMPTS]
                              : SUGGESTED_PROMPTS
                            ).map((prompt) => (
                              <button
                                key={prompt}
                                onClick={() => sendMessage(prompt)}
                                className="text-[11px] sm:text-xs px-2.5 py-1.5 sm:px-3 rounded-full border border-[rgb(0,255,255)]/30 bg-[rgb(0,255,255)]/10 text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/20 transition whitespace-nowrap flex-shrink-0 active:scale-[0.98]"
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] sm:text-xs text-slate-500 mt-3 text-center">
                            Pick one to start, or type your own question below.
                          </p>
                        </div>
                      )}
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
                        className={`${
                          msg.role === "user" ? "max-w-[85%] sm:max-w-[75%]" : "max-w-[98%] sm:max-w-[95%]"
                        } rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 ${
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
                            const chartData = enhanceChartData(spec);
                            const chartOptions = buildChartOptions(spec) as any;

                            // Calculate adaptive height for bar charts
                            let chartHeight = "h-80"; // default
                            if (spec.type === "bar" && spec.data.labels) {
                              const numItems = spec.data.labels.length;
                              // For horizontal bar charts, give more height per item
                              const isHorizontal = spec.options?.indexAxis === "y";
                              if (isHorizontal) {
                                if (numItems <= 3) chartHeight = "h-64";
                                else if (numItems <= 5) chartHeight = "h-80";
                                else if (numItems <= 8) chartHeight = "h-96";
                                else chartHeight = "h-[32rem]";
                              }
                            }

                            return (
                              <div
                                key={`chart-${partIdx}`}
                                className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-sm p-5 -mx-2"
                              >
                                {spec.title ? (
                                  <p className="text-sm font-semibold text-white mb-2">{spec.title}</p>
                                ) : null}
                                {spec.description ? (
                                  <p className="text-xs text-slate-400 mb-3">{spec.description}</p>
                                ) : null}
                                <div className={chartHeight}>
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
                        {showSources && msg.citations && msg.citations.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">{t('chat.sources')} ({msg.citations.length})</p>
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
                                <p className="text-xs text-slate-500">
                                  +{msg.citations.length - 3} more citations
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Source Reviews Widget */}
                        {showSources && msg.sourceReviews && msg.sourceReviews.length > 0 && (
                          <SourceReviewsWidget reviews={msg.sourceReviews} />
                        )}
                        {/* Suggested follow-up questions */}
                        {msg.role === "assistant" && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-white/10">
                            <p className="text-[10px] sm:text-xs text-slate-500 mb-2 uppercase tracking-wider">{t("chat.suggestedQuestions")}</p>
                            <div className="flex overflow-x-auto pb-1 gap-1.5 sm:gap-2 sm:flex-wrap sm:overflow-x-visible sm:pb-0 scrollbar-hide -mx-1 px-1 sm:mx-0 sm:px-0">
                              {msg.suggestedQuestions.map((q, qIdx) => (
                                <button
                                  key={qIdx}
                                  onClick={() => handleSuggestedQuestion(q)}
                                  className="text-[11px] sm:text-xs px-2.5 py-1.5 sm:px-3 rounded-full border border-[rgb(0,255,255)]/30 bg-[rgb(0,255,255)]/10 text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/20 transition whitespace-nowrap flex-shrink-0 active:scale-[0.98]"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Clarification options */}
                        {msg.role === "assistant" && msg.needsClarification && msg.clarificationOptions && msg.clarificationOptions.length > 0 && (
                          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-white/10">
                            <p className="text-[10px] sm:text-xs text-slate-500 mb-2 uppercase tracking-wider">{t("chat.pleaseClarify")}</p>
                            <div className="flex overflow-x-auto pb-1 gap-1.5 sm:gap-2 sm:flex-wrap sm:overflow-x-visible sm:pb-0 scrollbar-hide -mx-1 px-1 sm:mx-0 sm:px-0">
                              {msg.clarificationOptions.map((opt, optIdx) => (
                                <button
                                  key={optIdx}
                                  onClick={() => handleClarificationOption(opt)}
                                  className="text-[11px] sm:text-xs px-2.5 py-1.5 sm:px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition whitespace-nowrap flex-shrink-0 active:scale-[0.98]"
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Search for game suggestion */}
                        {msg.role === "assistant" && msg.suggestSearchGame && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <Link
                              href="/"
                              className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              {msg.searchGameName
                                ? t("chat.searchFor").replace("{game}", `"${msg.searchGameName}"`)
                                : t("chat.searchForGames")}
                            </Link>
                          </div>
                        )}
                        {/* Timestamp and message feedback */}
                        <div className="flex items-center justify-between mt-2 gap-1 sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-slate-500">
                            <span>{formatTime(msg.timestamp)}</span>
                            {msg.role === "assistant" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCopyAnswer(msg.content)}
                                  className="rounded-full border border-white/10 px-1.5 py-0.5 sm:px-2 text-[10px] sm:text-xs text-slate-300 hover:border-slate-400 active:scale-[0.98]"
                                >
                                  {t("chat.copy")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRegenerate(idx)}
                                  disabled={loading}
                                  className="rounded-full border border-white/10 px-1.5 py-0.5 sm:px-2 text-[10px] sm:text-xs text-slate-300 hover:border-slate-400 disabled:opacity-50 active:scale-[0.98]"
                                >
                                  {t("chat.regenerate")}
                                </button>
                              </>
                            )}
                          </div>
                          {/* Message feedback buttons - only for assistant messages */}
                          {msg.role === "assistant" && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleMessageFeedback(idx, true)}
                                disabled={feedbackSubmitting === idx || messageFeedback[idx] !== undefined}
                                className={`p-1.5 rounded-lg transition ${
                                  messageFeedback[idx] === true
                                    ? "text-green-400 bg-green-400/10"
                                    : messageFeedback[idx] === false
                                    ? "text-slate-600"
                                    : "text-slate-500 hover:text-green-400 hover:bg-green-400/10"
                                }`}
                                title="Helpful response"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleMessageFeedback(idx, false)}
                                disabled={feedbackSubmitting === idx || messageFeedback[idx] !== undefined}
                                className={`p-1.5 rounded-lg transition ${
                                  messageFeedback[idx] === false
                                    ? "text-red-400 bg-red-400/10"
                                    : messageFeedback[idx] === true
                                    ? "text-slate-600"
                                    : "text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                                }`}
                                title="Not helpful"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
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
              </div>

            {/* Input Area */}
            <div className="border-t border-white/10 pt-3 sm:pt-4">
            <div className="flex gap-2 sm:gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={chatLocked ? "Select at least one game to start chatting" : t('chat.placeholder')}
                rows={2}
                disabled={loading || chatLocked}
                className="flex-1 rounded-lg sm:rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 sm:px-4 sm:py-3 text-sm text-white placeholder:text-slate-500 focus:border-[rgb(0,255,255)] focus:outline-none resize-none disabled:opacity-50"
              />
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={loading || !input.trim() || chatLocked}
                className="self-end min-w-[44px] min-h-[44px] flex items-center justify-center"
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
            <p className="text-[10px] sm:text-xs text-slate-600 mt-2">
              {!chatLocked ? (
                <>Press Enter to search reviews and get insights</>
              ) : (
                <>Select at least one game above to start chatting</>
              )}
            </p>
            </div>
            </div>
          </Card>
        </div>
      </div>
      </PageTransition>
    </AppLayout>
  );
}
