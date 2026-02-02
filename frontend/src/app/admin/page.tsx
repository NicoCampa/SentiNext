'use client';

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchAdminChatSessions,
  fetchAdminChatHistory,
  AdminChatSession,
  AdminChatMessage,
} from "@/lib/api";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AdminPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdminStatus();
  const [sessions, setSessions] = useState<AdminChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AdminChatSession | null>(null);
  const [chatHistory, setChatHistory] = useState<AdminChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");

  // Load sessions on mount
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

  // Load chat history when session is selected
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

  // Filter sessions based on feedback
  const filteredSessions = sessions.filter((session) => {
    if (filter === "positive") return session.positive_feedback > 0;
    if (filter === "negative") return session.negative_feedback > 0;
    return true;
  });

  // Get feedback badge for a session
  function getFeedbackBadge(session: AdminChatSession) {
    const badges = [];
    if (session.positive_feedback > 0) {
      badges.push(
        <span
          key="positive"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px]"
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
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px]"
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

  // Show loading or access denied
  if (isAdminLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-slate-400">Checking admin status...</div>
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
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
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="w-full h-[calc(100vh-2rem)] flex flex-col px-4 py-6 sm:px-6 lg:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold">
            <span className="bg-gradient-to-r from-amber-300 via-orange-200 to-red-300 bg-clip-text text-transparent">
              Admin Dashboard
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            View all user chat sessions and feedback
          </p>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Sessions List */}
          <Card variant="glass" className="w-96 flex-shrink-0 flex flex-col overflow-hidden">
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
                          <p className="text-[10px] text-slate-500 mt-1">
                            User: {session.user_id.slice(0, 20)}...
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {session.message_count} messages
                          </p>
                          {getFeedbackBadge(session)}
                        </div>
                        <div className="text-[9px] text-slate-600 whitespace-nowrap">
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
          <Card variant="glass" className="flex-1 flex flex-col overflow-hidden p-6">
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
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
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
                          <div className="text-sm prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                          {msg.timestamp && (
                            <p className="text-[10px] text-slate-500 mt-2">
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
      </div>
    </AppLayout>
  );
}
