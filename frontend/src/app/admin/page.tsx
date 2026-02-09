'use client';

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { PageTransition } from "@/components/PageTransition";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchAdminChatSessions,
  fetchAdminChatHistory,
  fetchAdminSupportThreads,
  fetchAdminSupportThread,
  sendAdminSupportReply,
  grantCredits,
  AdminChatSession,
  AdminChatMessage,
  SupportThreadSummary,
  SupportMessage,
  fetchAdminDashboardSummary,
  AdminDashboardSummary,
  fetchUserSubscriptions,
  updateUserTier,
  UserSubscriptionInfo,
  fetchAdminApiUsage,
  ApiUsageSummary,
  fetchAdminAnalytics,
  EventsSummary,
} from "@/lib/api";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useSupportNotification } from "@/contexts/SupportNotificationContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// Register Chart.js components
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

// Chart types and parsing (copied from chat page)
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

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  indie: "Indie",
  max: "Enterprise",
};

function splitChatContent(content: string): ChatPart[] {
  const parts: ChatPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  CHART_BLOCK_RE.lastIndex = 0;

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

// Chart colors
const CHART_COLORS = [
  'rgba(96, 165, 250, 0.8)',
  'rgba(134, 239, 172, 0.8)',
  'rgba(251, 146, 60, 0.8)',
  'rgba(244, 114, 182, 0.8)',
  'rgba(167, 139, 250, 0.8)',
  'rgba(253, 224, 71, 0.8)',
  'rgba(248, 113, 113, 0.8)',
  'rgba(103, 232, 249, 0.8)',
  'rgba(196, 181, 253, 0.8)',
  'rgba(134, 239, 212, 0.8)',
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

function normalizeChartData(spec: ChartSpec): ChartSpec["data"] {
  if (Array.isArray(spec.data)) {
    const simplified = spec.data as Array<{label: string; value: number}>;
    return {
      labels: simplified.map(d => d.label),
      datasets: [{ data: simplified.map(d => d.value) }],
    };
  }
  if (spec.data && Array.isArray((spec.data as any).data)) {
    const simplified = (spec.data as any).data as Array<{label: string; value: number}>;
    return {
      labels: simplified.map(d => d.label),
      datasets: [{ data: simplified.map(d => d.value) }],
    };
  }
  return spec.data;
}

function enhanceChartData(spec: ChartSpec): any {
  const normalizedData = normalizeChartData(spec);
  const data = { ...normalizedData };

  if (!data.datasets || !Array.isArray(data.datasets)) {
    data.datasets = [{ data: [] }];
  }

  if (data.datasets.length > 0) {
    data.datasets = data.datasets.map((dataset: any, idx: number) => {
      const colorIdx = idx % CHART_COLORS.length;
      const enhanced = { ...dataset };

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
        if (!enhanced.backgroundColor) {
          enhanced.backgroundColor = CHART_COLORS[colorIdx];
        }
        if (!enhanced.borderColor) {
          enhanced.borderColor = CHART_BORDER_COLORS[colorIdx];
        }
        if (!enhanced.borderWidth) {
          enhanced.borderWidth = 2;
        }

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
  const isHorizontalBar = spec.type === 'bar' && spec.options?.indexAxis === 'y';

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    color: "#e2e8f0",
    ...(isHorizontalBar && {
      layout: {
        padding: { left: 20, right: 20 },
      },
    }),
    plugins: {
      legend: {
        display: true,
        labels: {
          color: "#cbd5f5",
          font: { size: 12, weight: '500' as const },
          padding: 12,
        },
      },
      title: spec.title
        ? {
            display: true,
            text: spec.title,
            color: "#e2e8f0",
            font: { size: 14, weight: '600' as const },
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
      },
    },
    scales: {
      x: {
        ticks: { color: "#cbd5f5", font: { size: 11 } },
        grid: { color: "rgba(148, 163, 184, 0.1)", drawBorder: false },
      },
      y: {
        ticks: { color: "#cbd5f5", font: { size: 11 } },
        grid: { color: "rgba(148, 163, 184, 0.1)", drawBorder: false },
      },
    },
  } as Record<string, unknown>;

  return {
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
}

export default function AdminPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdminStatus();
  const { refresh: refreshNotification } = useSupportNotification();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<AdminChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AdminChatSession | null>(null);
  const [chatHistory, setChatHistory] = useState<AdminChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");
  const [activePanel, setActivePanel] = useState<"chat" | "support" | "analytics">(() => {
    // Initialize from URL if available (client-side only)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "inbox") return "support";
      if (tab === "analytics") return "analytics";
      return "chat";
    }
    return "chat";
  });

  const [supportThreads, setSupportThreads] = useState<SupportThreadSummary[]>([]);
  const [supportThreadsLoading, setSupportThreadsLoading] = useState(false);
  const [supportThreadsError, setSupportThreadsError] = useState<string | null>(null);
  const [selectedSupportThread, setSelectedSupportThread] = useState<SupportThreadSummary | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportReply, setSupportReply] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const supportBottomRef = useRef<HTMLDivElement | null>(null);

  const isInboxMode = searchParams?.get("tab") === "inbox";

  useEffect(() => {
    if (isInboxMode) {
      setActivePanel("support");
    }
  }, [isInboxMode]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboardSummary | null>(null);
  const [adminDashboardLoading, setAdminDashboardLoading] = useState(false);
  const [adminDashboardError, setAdminDashboardError] = useState<string | null>(null);
  const [adminDashboardDays, setAdminDashboardDays] = useState(30);

  // Credits management state
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [grantingCredits, setGrantingCredits] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  // User subscriptions management state
  const [users, setUsers] = useState<UserSubscriptionInfo[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  const [tierUpdateSuccess, setTierUpdateSuccess] = useState<string | null>(null);
  const [tierUpdateError, setTierUpdateError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // API usage state
  const [apiUsage, setApiUsage] = useState<ApiUsageSummary | null>(null);
  const [apiUsageLoading, setApiUsageLoading] = useState(false);

  // User analytics state
  const [analytics, setAnalytics] = useState<EventsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsHours, setAnalyticsHours] = useState(24);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadSessions() {
      if (!isAdmin) return;

      setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminChatSessions(200);
        setSessions(data);
      } catch (err) {
        console.error("Failed to load admin chat sessions:", err);
        setError((err as Error).message || "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }

    if (!isAdminLoading) {
      loadSessions();
    }
  }, [isAdmin, isAdminLoading]);

  async function loadSupportThreads(keepSelection: boolean = true) {
    if (!isAdmin) return;
    setSupportThreadsLoading(true);
    setSupportThreadsError(null);
    try {
      const data = await fetchAdminSupportThreads(200);
      setSupportThreads(data);
      if (keepSelection && selectedSupportThread) {
        const match = data.find((thread) => thread.user_id === selectedSupportThread.user_id);
        setSelectedSupportThread(match ?? null);
      }
    } catch (err) {
      console.error("Failed to load support threads:", err);
      setSupportThreadsError((err as Error).message || "Failed to load support threads");
    } finally {
      setSupportThreadsLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdminLoading && isAdmin) {
      loadSupportThreads();
    }
  }, [isAdmin, isAdminLoading]);

  useEffect(() => {
    if (activePanel === "support") {
      supportBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [supportMessages, activePanel]);

  async function loadAdminDashboard(days: number = adminDashboardDays) {
    if (!isAdmin) return;
    setAdminDashboardLoading(true);
    setApiUsageLoading(true);
    try {
      const [summary, usage] = await Promise.all([
        fetchAdminDashboardSummary({ days }),
        fetchAdminApiUsage({ days }).catch((err) => {
          console.error("Failed to load API usage", err);
          return null;
        }),
      ]);
      setAdminDashboard(summary);
      setApiUsage(usage);
      setAdminDashboardError(null);
    } catch (err) {
      console.error("Failed to load admin dashboard", err);
      setAdminDashboardError("Failed to load admin dashboard.");
    } finally {
      setAdminDashboardLoading(false);
      setApiUsageLoading(false);
    }
  }

  async function loadAnalytics(hours: number = analyticsHours) {
    if (!isAdmin) return;
    setAnalyticsLoading(true);
    try {
      const data = await fetchAdminAnalytics(hours);
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load analytics", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdminLoading && isAdmin) {
      loadAdminDashboard(adminDashboardDays);
      loadUserSubscriptions();
      loadAnalytics(analyticsHours);
    }
  }, [isAdmin, isAdminLoading, adminDashboardDays]);

  async function handleSelectSession(session: AdminChatSession) {
    setSelectedSession(session);
    setLoadingHistory(true);
    try {
      const history = await fetchAdminChatHistory(session.session_id);
      setChatHistory(history);
    } catch (err) {
      console.error("Failed to load chat history:", err);
      setChatHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSelectSupportThread(thread: SupportThreadSummary) {
    setSelectedSupportThread(thread);
    setSupportLoading(true);
    try {
      const messages = await fetchAdminSupportThread(thread.user_id);
      setSupportMessages(messages);
      setSupportThreads((prev) =>
        prev.map((item) =>
          item.user_id === thread.user_id ? { ...item, unread_count: 0 } : item
        )
      );
      // Refresh notification count since viewing marks messages as read
      void refreshNotification();
    } catch (err) {
      console.error("Failed to load support thread:", err);
      setSupportMessages([]);
    } finally {
      setSupportLoading(false);
    }
  }

  async function handleSupportReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupportThread) return;
    const message = supportReply.trim();
    if (!message) return;

    setSupportSending(true);
    try {
      await sendAdminSupportReply(selectedSupportThread.user_id, message);
      setSupportReply("");
      const messages = await fetchAdminSupportThread(selectedSupportThread.user_id);
      setSupportMessages(messages);
      await loadSupportThreads(true);
    } catch (err) {
      console.error("Failed to send support reply:", err);
    } finally {
      setSupportSending(false);
    }
  }

  async function loadUserSubscriptions() {
    if (!isAdmin) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const data = await fetchUserSubscriptions(100);
      setUsers(data);
    } catch (err) {
      console.error("Failed to load user subscriptions:", err);
      setUsersError((err as Error).message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleUpdateTier(userId: string, newTier: "free" | "indie" | "pro" | "max") {
    setUpdatingTier(userId);
    setTierUpdateSuccess(null);
    setTierUpdateError(null);

    try {
      const result = await updateUserTier({ user_id: userId, tier: newTier });
      setTierUpdateSuccess(
        `Updated ${userId.slice(0, 12)}... to ${result.tier}. New limit: ${result.credits_monthly_limit}`
      );

      // Reload users
      await loadUserSubscriptions();
    } catch (err) {
      console.error("Failed to update tier:", err);
      setTierUpdateError((err as Error).message || "Failed to update tier");
    } finally {
      setUpdatingTier(null);
    }
  }

  async function handleGrantCredits(e: React.FormEvent) {
    e.preventDefault();
    setGrantingCredits(true);
    setGrantSuccess(null);
    setGrantError(null);

    try {
      const amount = parseInt(creditAmount, 10);
      if (!creditUserId || !amount || !creditReason) {
        setGrantError("All fields are required");
        return;
      }
      if (amount === 0 || amount < -100000 || amount > 100000) {
        setGrantError("Amount must be between -100,000 and 100,000 (non-zero)");
        return;
      }

      const result = await grantCredits({
        user_id: creditUserId,
        amount,
        reason: creditReason,
      });

      const action = amount < 0 ? "deducted" : "granted";
      setGrantSuccess(
        `Successfully ${action} ${Math.abs(result.amount_granted)} credits. New balance: ${result.new_balance}`
      );
      setCreditUserId("");
      setCreditAmount("");
      setCreditReason("");
    } catch (err) {
      console.error("Failed to grant credits:", err);
      setGrantError((err as Error).message || "Failed to grant credits");
    } finally {
      setGrantingCredits(false);
    }
  }

  const filteredSessions = sessions.filter((session) => {
    if (filter === "positive") return session.positive_feedback > 0;
    if (filter === "negative") return session.negative_feedback > 0;
    return true;
  });
  const supportUnreadCount = supportThreads.reduce((sum, thread) => sum + thread.unread_count, 0);

  function getFeedbackBadge(session: AdminChatSession) {
    const badges = [];
    if (session.positive_feedback > 0) {
      badges.push(
        <span
          key="positive"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>
          {session.positive_feedback}
        </span>
      );
    }
    if (session.negative_feedback > 0) {
      badges.push(
        <span
          key="negative"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
          </svg>
          {session.negative_feedback}
        </span>
      );
    }
    return badges.length > 0 ? <div className="flex gap-1 mt-1">{badges}</div> : null;
  }

  function formatTime(date: string | null) {
    if (!date) return "Unknown";
    return new Date(date).toLocaleString();
  }

  if (isAdminLoading) {
    return (
      <AppLayout>
      <PageTransition>
        <div className="flex items-center justify-center h-screen">
          <div className="text-slate-400">Checking admin status...</div>
        </div>
      </PageTransition>
    </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
      <PageTransition>
        <div className="flex items-center justify-center h-screen">
          <Card variant="glass" className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-2 border-red-500/30 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
            <p className="text-slate-400">You do not have admin access to view this page.</p>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="w-full h-[calc(100vh-2rem)] flex flex-col gap-4 px-4 py-6 sm:px-6 lg:px-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold">
              <span className="text-white">
                {isInboxMode ? "Support Inbox" : "Admin Dashboard"}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              {isInboxMode ? "View and respond to user support messages" : "Manage credits and view user chat sessions"}
            </p>
          </div>

        {!isInboxMode && (
          <>
          <Card variant="glass" className={`mb-4 p-6 ${mounted ? 'animate-fade-slide-up' : 'opacity-0'}`}>
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🧠</span>
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">
                Usage Overview
              </p>
            </div>
            <p className="text-sm text-slate-400">Metrics for the last {adminDashboard?.days ?? adminDashboardDays} days</p>
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Overview
            </span>
            <div className="flex items-center gap-2">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => { setAdminDashboardDays(days); }}
                  className={`px-2 py-1 text-xs uppercase tracking-[0.2em] border ${
                    adminDashboardDays === days
                      ? "border-amber-400 text-amber-300"
                      : "border-white/10 text-slate-400"
                  }`}
                >
                  {days}d
                </button>
              ))}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => loadAdminDashboard(adminDashboardDays)}
                disabled={adminDashboardLoading}
              >
                {adminDashboardLoading ? "Loading..." : "Refresh"}
              </Button>
            </div>
          </div>

          {adminDashboardLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 bg-white/5 rounded" />
              <div className="h-3 bg-white/5 rounded w-2/3" />
              <div className="h-10 bg-white/5 rounded" />
            </div>
          ) : adminDashboard ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Users</p>
                  <p className="font-mono text-xs text-amber-300">{adminDashboard.users.total.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">New Users</p>
                  <p className="font-mono text-xs text-amber-300">{adminDashboard.users.new.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active Users</p>
                  <p className="font-mono text-xs text-amber-300">{adminDashboard.users.active.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Paid Users</p>
                  <p className="font-mono text-xs text-amber-300">{adminDashboard.users.paid.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">MRR (Est.)</p>
                  <p className="font-mono text-xs text-amber-300">${adminDashboard.users.mrr_estimate.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Credits Used</p>
                  <p className="font-mono text-xs text-amber-300">{adminDashboard.credits.used.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LLM Cost</p>
                  <p className="font-mono text-xs text-amber-300">${adminDashboard.llm.cost_total_usd.toFixed(4)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LLM Calls</p>
                  <p className="font-mono text-xs text-amber-300">{adminDashboard.llm.calls.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LLM Tokens</p>
                  <p className="font-mono text-xs text-amber-300">{adminDashboard.llm.total_tokens.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  Top Credit Operations
                </p>
                <div className="space-y-2">
                  {adminDashboard.credits.by_operation.slice(0, 5).map((item, idx) => (
                    <div key={`${item.operation ?? "unknown"}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{item.operation ?? "unknown"}</span>
                      <span className="font-mono text-amber-300">{item.credits_used.toLocaleString()} credits</span>
                    </div>
                  ))}
                  {adminDashboard.credits.by_operation.length === 0 && (
                    <p className="text-xs text-slate-500">No usage recorded yet.</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  Tier Breakdown
                </p>
                <div className="space-y-2">
                  {adminDashboard.users.tier_counts.map((item, idx) => (
                    <div key={`${item.tier ?? "unknown"}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        {item.tier ? (TIER_LABELS[item.tier] ?? item.tier) : "unknown"}
                      </span>
                      <span className="font-mono text-amber-300">{item.count.toLocaleString()}</span>
                    </div>
                  ))}
                  {adminDashboard.users.tier_counts.length === 0 && (
                    <p className="text-xs text-slate-500">No tier data available.</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  Top Users by Credits
                </p>
                <div className="space-y-2">
                  {adminDashboard.credits.top_users.slice(0, 5).map((item, idx) => (
                    <div key={`${item.user_id}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{item.user_id}</span>
                      <span className="font-mono text-amber-300">{item.credits_used.toLocaleString()}</span>
                    </div>
                  ))}
                  {adminDashboard.credits.top_users.length === 0 && (
                    <p className="text-xs text-slate-500">No user data available.</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  Top Apps by Credits
                </p>
                <div className="space-y-2">
                  {adminDashboard.credits.top_apps.slice(0, 5).map((item, idx) => (
                    <div key={`${item.app_id}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">App {item.app_id}</span>
                      <span className="font-mono text-amber-300">{item.credits_used.toLocaleString()}</span>
                    </div>
                  ))}
                  {adminDashboard.credits.top_apps.length === 0 && (
                    <p className="text-xs text-slate-500">No app data available.</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  LLM Costs by Operation
                </p>
                <div className="space-y-2">
                  {adminDashboard.llm.by_operation.slice(0, 5).map((item, idx) => (
                    <div key={`${item.key}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{item.key}</span>
                      <span className="font-mono text-amber-300">${item.cost_total_usd.toFixed(4)}</span>
                    </div>
                  ))}
                  {adminDashboard.llm.by_operation.length === 0 && (
                    <p className="text-xs text-slate-500">No LLM usage recorded yet.</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  LLM Costs by Model
                </p>
                <div className="space-y-2">
                  {adminDashboard.llm.by_model.map((item, idx) => (
                    <div key={`${item.key}-${idx}`} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 truncate mr-2">{item.key}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-mono text-amber-300">${item.cost_total_usd.toFixed(4)}</span>
                        <span className="font-mono text-slate-500">{item.calls.toLocaleString()} calls</span>
                      </div>
                    </div>
                  ))}
                  {adminDashboard.llm.by_model.length === 0 && (
                    <p className="text-xs text-slate-500">No model data available.</p>
                  )}
                </div>
              </div>

              {adminDashboard.cost_per_user && adminDashboard.cost_per_user.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">
                    Expected LLM Cost Per User
                  </p>
                  <p className="text-[10px] text-slate-600 mb-3">
                    Estimated provider cost per user if all credits are consumed
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-1.5 text-slate-500 font-medium">Tier</th>
                          <th className="text-right py-1.5 text-slate-500 font-medium">Credits</th>
                          <th className="text-right py-1.5 text-green-400/70 font-medium">Light</th>
                          <th className="text-right py-1.5 text-amber-400/70 font-medium">Typical</th>
                          <th className="text-right py-1.5 text-red-400/70 font-medium">Heavy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminDashboard.cost_per_user.map((est) => (
                          <tr key={est.tier} className="border-b border-white/5">
                            <td className="py-1.5 text-slate-300">
                              {TIER_LABELS[est.tier] ?? est.tier}
                            </td>
                            <td className="py-1.5 text-right font-mono text-slate-400">
                              {est.credits.toLocaleString()}
                            </td>
                            <td className="py-1.5 text-right font-mono text-green-400">
                              ${est.light_usd.toFixed(2)}
                            </td>
                            <td className="py-1.5 text-right font-mono text-amber-300">
                              ${est.typical_usd.toFixed(2)}
                            </td>
                            <td className="py-1.5 text-right font-mono text-red-400">
                              ${est.heavy_usd.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">
                    Light = all classify &middot; Typical = 55% classify + 20% chat + 15% summary + 10% other &middot; Heavy = all chat agent
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-rose-400">{adminDashboardError ?? "No dashboard data available."}</p>
          )}
        </Card>

        {/* API Activity Section */}
        <Card variant="glass" className={`mb-4 p-6 ${mounted ? 'animate-fade-slide-up animation-delay-50' : 'opacity-0'}`}>
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📡</span>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">
                API Activity
              </p>
            </div>
            <p className="text-sm text-slate-400">Request metrics for the last {apiUsage?.period_days ?? adminDashboardDays} days</p>
          </div>

          {apiUsageLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 bg-white/5 rounded" />
              <div className="h-3 bg-white/5 rounded w-2/3" />
              <div className="h-10 bg-white/5 rounded" />
            </div>
          ) : apiUsage ? (
            <>
              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Requests</p>
                  <p className="font-mono text-xs text-cyan-300">{apiUsage.total_requests.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950/40 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Unique Users</p>
                  <p className="font-mono text-xs text-cyan-300">{apiUsage.unique_users.toLocaleString()}</p>
                </div>
              </div>

              {/* Daily Activity Chart */}
              {apiUsage.daily.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">
                    Daily Activity
                  </p>
                  <div className="h-48">
                    <Chart
                      type="line"
                      data={{
                        labels: apiUsage.daily.map((d) => d.date),
                        datasets: [
                          {
                            label: "Requests",
                            data: apiUsage.daily.map((d) => d.count),
                            borderColor: "rgba(103, 232, 249, 1)",
                            backgroundColor: "rgba(103, 232, 249, 0.15)",
                            borderWidth: 2,
                            tension: 0.3,
                            pointRadius: 2,
                            pointHoverRadius: 5,
                            pointBackgroundColor: "rgba(103, 232, 249, 1)",
                            fill: true,
                          },
                        ],
                      }}
                      options={buildChartOptions({
                        type: "line",
                        data: { datasets: [] },
                      }) as any}
                    />
                  </div>
                </div>
              )}

              {/* Top Endpoints Bar Chart */}
              {apiUsage.by_endpoint.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">
                    Top Endpoints
                  </p>
                  <div className="h-64 mb-4">
                    <Chart
                      type="bar"
                      data={{
                        labels: apiUsage.by_endpoint.slice(0, 10).map((e) => e.path),
                        datasets: [
                          {
                            label: "Requests",
                            data: apiUsage.by_endpoint.slice(0, 10).map((e) => e.count),
                            backgroundColor: "rgba(103, 232, 249, 0.6)",
                            borderColor: "rgba(103, 232, 249, 1)",
                            borderWidth: 1,
                          },
                        ],
                      }}
                      options={buildChartOptions({
                        type: "bar",
                        data: { datasets: [] },
                        options: { indexAxis: "y" as const },
                      }) as any}
                    />
                  </div>
                  <div className="space-y-2">
                    {apiUsage.by_endpoint.map((ep, idx) => (
                      <div key={`${ep.path}-${idx}`} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 truncate mr-4">{ep.path}</span>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="font-mono text-cyan-300">{ep.count.toLocaleString()}</span>
                          <span className="font-mono text-slate-500">{ep.avg_ms}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Activity */}
              {apiUsage.by_user.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                    User Activity
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {apiUsage.by_user.map((u, idx) => (
                      <div key={`${u.user_id}-${idx}`} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 truncate mr-4">{u.user_id}</span>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="font-mono text-cyan-300">{u.count.toLocaleString()}</span>
                          <span className="text-slate-500">
                            {u.first_seen ? new Date(u.first_seen).toLocaleDateString() : "—"}
                            {" - "}
                            {u.last_seen ? new Date(u.last_seen).toLocaleDateString() : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">No API usage data available.</p>
          )}
        </Card>

        {/* Credits Management Section */}
        <Card variant="glass" className={`mb-4 p-5 ${mounted ? 'animate-fade-slide-up animation-delay-100' : 'opacity-0'}`}>
          <h2 className="text-sm font-semibold text-white mb-3">Manage Credits</h2>
          <form onSubmit={handleGrantCredits} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">User ID</label>
                <input
                  type="text"
                  value={creditUserId}
                  onChange={(e) => setCreditUserId(e.target.value)}
                  placeholder="user_xxx"
                  className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  disabled={grantingCredits}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Amount</label>
                <input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="1000"
                  min="-100000"
                  max="100000"
                  className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  disabled={grantingCredits}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reason</label>
                <input
                  type="text"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="bonus"
                  className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  disabled={grantingCredits}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                {grantSuccess && (
                  <p className="text-xs text-green-400">{grantSuccess}</p>
                )}
                {grantError && (
                  <p className="text-xs text-red-400">{grantError}</p>
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={grantingCredits || !creditUserId || !creditAmount || !creditReason}
              >
                {grantingCredits ? "Processing..." : "Submit"}
              </Button>
            </div>
          </form>
        </Card>

        {/* User Subscriptions Management Section */}
        <Card variant="glass" className={`mb-4 p-5 ${mounted ? 'animate-fade-slide-up animation-delay-200' : 'opacity-0'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">User Subscriptions</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={loadUserSubscriptions}
              disabled={loadingUsers}
            >
              {loadingUsers ? "Loading..." : "Refresh"}
            </Button>
          </div>

          {tierUpdateSuccess && (
            <div className="mb-3 p-2 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-400">
              {tierUpdateSuccess}
            </div>
          )}

          {tierUpdateError && (
            <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400">
              {tierUpdateError}
            </div>
          )}

          {loadingUsers ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-white/5 rounded" />
              ))}
            </div>
          ) : usersError ? (
            <p className="text-xs text-red-400">{usersError}</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-slate-500">No users found</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {users.map((user) => (
                <div
                  key={user.user_id}
                  className="p-3 bg-slate-950/40 border border-white/10 rounded-lg"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium text-slate-300 truncate">
                        {user.user_id}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Balance: {user.credits_balance.toLocaleString()} | Used: {user.credits_used_this_period.toLocaleString()}/{user.credits_monthly_limit.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {(["free", "indie", "pro", "max"] as const).map((tier) => (
                        <button
                          key={tier}
                          onClick={() => handleUpdateTier(user.user_id, tier)}
                          disabled={updatingTier === user.user_id || user.tier === tier}
                          className={`flex-1 px-2 py-1 text-xs font-medium rounded transition ${
                            user.tier === tier
                              ? tier === "free"
                                ? "bg-slate-600 text-white border border-slate-500"
                                : tier === "indie"
                                ? "bg-emerald-600 text-white border border-emerald-500"
                                : tier === "pro"
                                ? "bg-sky-600 text-white border border-sky-500"
                                : "bg-purple-600 text-white border border-purple-500"
                              : "bg-slate-900/50 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {TIER_LABELS[tier] ?? tier}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-slate-500">
                      {user.updated_at
                        ? new Date(user.updated_at).toLocaleDateString()
                        : "Never"}
                    </div>
                    {updatingTier === user.user_id && (
                      <div className="text-xs text-amber-400">Updating...</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </Card>
          </>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant={activePanel === "chat" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setActivePanel("chat")}
                className="text-xs"
              >
                Chat Sessions
              </Button>
              <Button
                variant={activePanel === "support" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setActivePanel("support")}
                className="text-xs"
              >
                Inbox
              </Button>
              <Button
                variant={activePanel === "analytics" ? "primary" : "secondary"}
                size="sm"
                onClick={() => { setActivePanel("analytics"); loadAnalytics(analyticsHours); }}
                className="text-xs"
              >
                User Analytics
              </Button>
            </div>
            <div className="text-xs text-slate-500">
              {activePanel === "chat"
                ? `${filteredSessions.length} sessions`
                : activePanel === "support"
                ? `${supportThreads.length} threads${supportUnreadCount ? ` | ${supportUnreadCount} unread` : ""}`
                : analytics ? `${analytics.total_events.toLocaleString()} events | ${analytics.unique_users} users` : "Loading..."}
            </div>
          </div>
          {activePanel === "chat" ? (
            <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Sessions List */}
          <Card variant="glass" className={`w-96 flex-shrink-0 flex flex-col overflow-hidden ${mounted ? 'animate-fade-slide-up animation-delay-300' : 'opacity-0'}`}>
            {/* Filter Tabs */}
            <div className="p-4 border-b border-white/10">
              <div className="flex gap-2">
                <Button
                  variant={filter === "all" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setFilter("all")}
                  className="text-xs"
                >
                  All ({sessions.length})
                </Button>
                <Button
                  variant={filter === "positive" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setFilter("positive")}
                  className="text-xs"
                >
                  <svg className="w-3 h-3 mr-1 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  Positive
                </Button>
                <Button
                  variant={filter === "negative" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setFilter("negative")}
                  className="text-xs"
                >
                  <svg className="w-3 h-3 mr-1 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                  </svg>
                  Negative
                </Button>
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center animate-spin">
                    <div className="w-4 h-4 bg-[rgb(0,255,255)] rounded-full" />
                  </div>
                  <p className="text-sm text-slate-400 mt-2">Loading sessions...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400">No sessions found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSessions.map((session) => (
                    <button
                      key={session.session_id}
                      onClick={() => handleSelectSession(session)}
                      className={`w-full p-3 rounded-lg border text-left transition ${
                        selectedSession?.session_id === session.session_id
                          ? "bg-[rgb(0,255,255)]/10 border-[rgb(0,255,255)]/30"
                          : "bg-slate-900/40 border-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-300 truncate">
                            {session.first_user_message?.slice(0, 60) || "No message"}
                            {session.first_user_message && session.first_user_message.length > 60 ? "..." : ""}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            User: {session.user_id.slice(0, 20)}...
                          </p>
                          <p className="text-xs text-slate-500">
                            {session.message_count} messages
                          </p>
                          {getFeedbackBadge(session)}
                        </div>
                        <div className="text-xs text-slate-600 whitespace-nowrap">
                          {session.updated_at
                            ? new Date(session.updated_at).toLocaleDateString()
                            : "Unknown"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Chat History View */}
          <Card variant="glass" className={`flex-1 flex flex-col overflow-hidden p-6 ${mounted ? 'animate-fade-slide-up animation-delay-400' : 'opacity-0'}`}>
            {!selectedSession ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-300">Select a session to view chat history</p>
                  <p className="text-xs text-slate-500 mt-1">Click on any session from the list</p>
                </div>
              </div>
            ) : (
              <>
                {/* Session Header */}
                <div className="pb-4 border-b border-white/10 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200">
                        {selectedSession.first_user_message?.slice(0, 80) || "Chat Session"}
                      </h2>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                        <span>User: {selectedSession.user_id}</span>
                        <span>|</span>
                        <span>{selectedSession.message_count} messages</span>
                        <span>|</span>
                        <span>{formatTime(selectedSession.updated_at)}</span>
                      </div>
                      {(selectedSession.positive_feedback > 0 || selectedSession.negative_feedback > 0) && (
                        <div className="flex gap-2 mt-2">
                          {selectedSession.positive_feedback > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                              </svg>
                              {selectedSession.positive_feedback} positive
                            </span>
                          )}
                          {selectedSession.negative_feedback > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                              </svg>
                              {selectedSession.negative_feedback} negative
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedSession(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {loadingHistory ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center animate-spin">
                        <div className="w-4 h-4 bg-[rgb(0,255,255)] rounded-full" />
                      </div>
                      <p className="text-sm text-slate-400 mt-2">Loading messages...</p>
                    </div>
                  ) : chatHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-400">No messages found</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                            msg.role === "user"
                              ? "bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30 text-white"
                              : "bg-slate-900/60 border border-white/10 text-slate-100"
                          }`}
                        >
                          <div className="text-sm space-y-3">
                            {splitChatContent(msg.content).map((part, partIdx) => {
                              if (part.type === "text") {
                                return (
                                  <div key={`text-${partIdx}`} className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                                      {part.value}
                                    </ReactMarkdown>
                                  </div>
                                );
                              }

                              // Render chart
                              const spec = part.spec;
                              const chartData = enhanceChartData(spec);
                              const chartOptions = buildChartOptions(spec) as any;

                              let chartHeight = "h-64";
                              if (spec.type === "bar" && spec.data.labels) {
                                const numItems = spec.data.labels.length;
                                const isHorizontal = spec.options?.indexAxis === "y";
                                if (isHorizontal) {
                                  if (numItems <= 3) chartHeight = "h-48";
                                  else if (numItems <= 5) chartHeight = "h-64";
                                  else if (numItems <= 8) chartHeight = "h-80";
                                  else chartHeight = "h-96";
                                }
                              }

                              return (
                                <div
                                  key={`chart-${partIdx}`}
                                  className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-sm p-4 -mx-2"
                                >
                                  {spec.title && (
                                    <p className="text-sm font-semibold text-white mb-2">{spec.title}</p>
                                  )}
                                  {spec.description && (
                                    <p className="text-xs text-slate-400 mb-3">{spec.description}</p>
                                  )}
                                  <div className={chartHeight}>
                                    <Chart
                                      type={spec.type as any}
                                      data={chartData}
                                      options={chartOptions}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {msg.timestamp && (
                            <p className="text-xs text-slate-500 mt-2">
                              {new Date(msg.timestamp).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </Card>
            </div>
          ) : activePanel === "support" ? (
            <div className="flex-1 flex gap-4 overflow-hidden">
              <Card variant="glass" className={`w-96 flex-shrink-0 flex flex-col overflow-hidden ${mounted ? 'animate-fade-slide-up animation-delay-300' : 'opacity-0'}`}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Inbox</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {supportUnreadCount} unread
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => loadSupportThreads(false)}
                    disabled={supportThreadsLoading}
                  >
                    {supportThreadsLoading ? "Loading..." : "Refresh"}
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {supportThreadsLoading ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center animate-spin">
                        <div className="w-4 h-4 bg-[rgb(0,255,255)] rounded-full" />
                      </div>
                      <p className="text-sm text-slate-400 mt-2">Loading threads...</p>
                    </div>
                  ) : supportThreadsError ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-red-400">{supportThreadsError}</p>
                    </div>
                  ) : supportThreads.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-400">No support threads yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {supportThreads.map((thread) => (
                        <button
                          key={thread.user_id}
                          onClick={() => handleSelectSupportThread(thread)}
                          className={`w-full p-3 rounded-lg border text-left transition ${
                            selectedSupportThread?.user_id === thread.user_id
                              ? "bg-[rgb(0,255,255)]/10 border-[rgb(0,255,255)]/30"
                              : "bg-slate-900/40 border-white/5 hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-300 truncate">
                                {thread.user_id}
                              </p>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                {thread.last_message?.slice(0, 60) || "No message"}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[11px] text-slate-500">
                                  {thread.message_count} messages
                                </span>
                                {thread.unread_count > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
                                    {thread.unread_count} new
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-slate-600 whitespace-nowrap">
                              {thread.last_message_at
                                ? new Date(thread.last_message_at).toLocaleDateString()
                                : "Unknown"}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              <Card variant="glass" className={`flex-1 flex flex-col overflow-hidden p-6 ${mounted ? 'animate-fade-slide-up animation-delay-400' : 'opacity-0'}`}>
                {!selectedSupportThread ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-[rgb(0,255,255)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <p className="text-sm text-slate-300">Select a thread to view messages</p>
                      <p className="text-xs text-slate-500 mt-1">Click on a user from the inbox</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="pb-4 border-b border-white/10 mb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-200">Support Thread</h2>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span>User: {selectedSupportThread.user_id}</span>
                            <span>|</span>
                            <span>{selectedSupportThread.message_count} messages</span>
                            {selectedSupportThread.last_message_at && (
                              <>
                                <span>|</span>
                                <span>{formatTime(selectedSupportThread.last_message_at)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedSupportThread(null)}
                        >
                          Close
                        </Button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                      {supportLoading ? (
                        <div className="text-center py-8">
                          <div className="w-8 h-8 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center animate-spin">
                            <div className="w-4 h-4 bg-[rgb(0,255,255)] rounded-full" />
                          </div>
                          <p className="text-sm text-slate-400 mt-2">Loading messages...</p>
                        </div>
                      ) : supportMessages.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-slate-400">No messages found</p>
                        </div>
                      ) : (
                        supportMessages.map((msg) => {
                          const isUser = msg.sender_role === "user";
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                            >
                              <div
                                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                  isUser
                                    ? "bg-slate-900/60 border border-white/10 text-slate-100"
                                    : "bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30 text-white"
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                {msg.created_at && (
                                  <p className="text-xs text-slate-500 mt-2">
                                    {isUser ? "User" : "Admin"} | {formatTime(msg.created_at)}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={supportBottomRef} />
                    </div>

                    <form onSubmit={handleSupportReply} className="border-t border-white/10 pt-4 mt-4 space-y-3">
                      <textarea
                        value={supportReply}
                        onChange={(e) => setSupportReply(e.target.value)}
                        placeholder="Write a reply..."
                        rows={3}
                        className="w-full resize-none rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[rgb(0,255,255)]/40 focus:outline-none"
                        disabled={supportSending}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">Replies go directly to the user inbox.</p>
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={supportSending || !supportReply.trim()}
                        >
                          {supportSending ? "Sending..." : "Send Reply"}
                        </Button>
                      </div>
                    </form>
                  </>
                )}
              </Card>
            </div>
          ) : activePanel === "analytics" ? (
            /* ─── User Analytics Panel ─── */
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
              {/* Time range selector */}
              <div className="flex items-center gap-2">
                {[1, 6, 24, 72, 168].map((h) => (
                  <button
                    key={h}
                    onClick={() => { setAnalyticsHours(h); loadAnalytics(h); }}
                    className={`px-2 py-1 text-xs uppercase tracking-[0.2em] border ${
                      analyticsHours === h
                        ? "border-emerald-400 text-emerald-300"
                        : "border-white/10 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    {h < 24 ? `${h}h` : `${h / 24}d`}
                  </button>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => loadAnalytics(analyticsHours)}
                  disabled={analyticsLoading}
                >
                  {analyticsLoading ? "Loading..." : "Refresh"}
                </Button>
              </div>

              {analyticsLoading && !analytics ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-20 bg-white/5 rounded" />
                  <div className="h-48 bg-white/5 rounded" />
                  <div className="h-32 bg-white/5 rounded" />
                </div>
              ) : analytics ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card variant="glass" className="p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Events</p>
                      <p className="font-mono text-lg text-emerald-300">{analytics.total_events.toLocaleString()}</p>
                    </Card>
                    <Card variant="glass" className="p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Unique Users</p>
                      <p className="font-mono text-lg text-emerald-300">{analytics.unique_users.toLocaleString()}</p>
                    </Card>
                  </div>

                  {/* Events Over Time Chart */}
                  {analytics.events_over_time.length > 0 && (
                    <Card variant="glass" className="p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Events Over Time</p>
                      <div className="h-48">
                        <Chart
                          type="line"
                          data={{
                            labels: analytics.events_over_time.map((d) => {
                              const date = new Date(d.hour);
                              return analyticsHours <= 24
                                ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit" });
                            }),
                            datasets: [
                              {
                                label: "Events",
                                data: analytics.events_over_time.map((d) => d.count),
                                borderColor: "rgba(52, 211, 153, 1)",
                                backgroundColor: "rgba(52, 211, 153, 0.15)",
                                borderWidth: 2,
                                tension: 0.3,
                                pointRadius: 2,
                                pointHoverRadius: 5,
                                pointBackgroundColor: "rgba(52, 211, 153, 1)",
                                fill: true,
                              },
                            ],
                          }}
                          options={buildChartOptions({
                            type: "line",
                            data: { datasets: [] },
                          }) as any}
                        />
                      </div>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Top Events */}
                    <Card variant="glass" className="p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Top Events</p>
                      {analytics.top_events.length === 0 ? (
                        <p className="text-xs text-slate-500">No events recorded yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {analytics.top_events.map((ev, idx) => (
                            <div key={`${ev.event_name}-${idx}`} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-slate-300 truncate">{ev.event_name}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px] flex-shrink-0">
                                  {ev.event_category}
                                </span>
                              </div>
                              <span className="font-mono text-emerald-300 flex-shrink-0 ml-2">{ev.count.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    {/* Top Pages */}
                    <Card variant="glass" className="p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Top Pages</p>
                      {analytics.top_pages.length === 0 ? (
                        <p className="text-xs text-slate-500">No page views recorded yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {analytics.top_pages.map((pg, idx) => (
                            <div key={`${pg.page}-${idx}`} className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 truncate">{pg.page}</span>
                              <span className="font-mono text-emerald-300 flex-shrink-0 ml-2">{pg.count.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Active Users */}
                  <Card variant="glass" className="p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Active Users</p>
                    {analytics.active_users.length === 0 ? (
                      <p className="text-xs text-slate-500">No active users in this period.</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {analytics.active_users.map((u, idx) => (
                          <div key={`${u.user_id}-${idx}`} className="flex items-center justify-between text-xs">
                            <span className="text-slate-300 truncate mr-4">{u.user_id}</span>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              <span className="font-mono text-emerald-300">{u.event_count} events</span>
                              <span className="text-slate-500">
                                {new Date(u.last_active).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Recent Events Feed */}
                  <Card variant="glass" className="p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Recent Events</p>
                    {analytics.recent_events.length === 0 ? (
                      <p className="text-xs text-slate-500">No recent events.</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {analytics.recent_events.map((ev, idx) => (
                          <div
                            key={`${ev.created_at}-${idx}`}
                            className="p-2 bg-slate-950/40 border border-white/5 rounded text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-300 font-medium">{ev.event_name}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">
                                  {ev.event_category}
                                </span>
                              </div>
                              <span className="text-slate-500 text-[10px]">
                                {new Date(ev.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-slate-500">
                              <span className="truncate">{ev.user_id}</span>
                              {ev.page && <span>on {ev.page}</span>}
                              {ev.target && <span className="text-slate-400">→ {ev.target}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              ) : (
                <p className="text-xs text-slate-500">No analytics data available.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </PageTransition>
    </AppLayout>
  );
}
