'use client';

import { useState, useEffect, useRef } from "react";
import {
  fetchAdminSupportThreads,
  fetchAdminSupportThread,
  sendAdminSupportReply,
  SupportThreadSummary,
  SupportMessage,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SupportTabProps {
  isAdmin: boolean;
  refreshNotification: () => void;
}

export function SupportTab({ isAdmin, refreshNotification }: SupportTabProps) {
  const [supportThreads, setSupportThreads] = useState<SupportThreadSummary[]>([]);
  const [supportThreadsLoading, setSupportThreadsLoading] = useState(false);
  const [supportThreadsError, setSupportThreadsError] = useState<string | null>(null);
  const [selectedSupportThread, setSelectedSupportThread] = useState<SupportThreadSummary | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportReply, setSupportReply] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const supportBottomRef = useRef<HTMLDivElement | null>(null);

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
    if (isAdmin) {
      loadSupportThreads();
    }
  }, [isAdmin]);

  useEffect(() => {
    supportBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [supportMessages]);

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

  const supportUnreadCount = supportThreads.reduce((sum, thread) => sum + thread.unread_count, 0);

  function formatTime(date: string | null) {
    if (!date) return "Unknown";
    return new Date(date).toLocaleString();
  }

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      <Card variant="glass" className="w-96 flex-shrink-0 flex flex-col overflow-hidden">
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

      <Card variant="glass" className="flex-1 flex flex-col overflow-hidden p-6">
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
  );
}
