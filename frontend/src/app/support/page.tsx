'use client';

import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageTransition } from "@/components/PageTransition";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchSupportThread, sendSupportMessage, SupportMessage } from "@/lib/api";

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function SupportPage() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadThread() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupportThread();
      setMessages(data);
    } catch (err) {
      console.error("Failed to load support thread", err);
      setError((err as Error).message || "Failed to load support messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThread();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submitMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendSupportMessage(trimmed);
      setInput("");
      await loadThread();
    } catch (err) {
      console.error("Failed to send support message", err);
      setError((err as Error).message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitMessage();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="w-full h-[calc(100vh-2rem)] flex flex-col gap-4 px-4 py-6 sm:px-6 lg:px-6">
          <div>
            <h1 className="text-xl font-bold">
              <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-emerald-200 bg-clip-text text-transparent">
                Support
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Send a message to the admin team. Replies will appear here.
            </p>
          </div>

          <Card variant="glass" className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Support Inbox</p>
                <p className="text-xs text-slate-400 mt-1">Keep your requests short and clear.</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={loadThread}
                disabled={loading}
              >
                {loading ? t('common.loading') : t('common.refresh')}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 mx-auto border-2 border-[rgb(0,255,255)]/30 rounded-full flex items-center justify-center animate-spin">
                    <div className="w-4 h-4 bg-[rgb(0,255,255)] rounded-full" />
                  </div>
                  <p className="text-sm text-slate-400 mt-2">{t('common.loading')}</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400">No messages yet. Start the conversation below.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.sender_role === "user";
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          isUser
                            ? "bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30 text-white"
                            : "bg-slate-900/60 border border-white/10 text-slate-100"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        {msg.created_at && (
                          <p className="text-[11px] text-slate-500 mt-2">
                            {isUser ? "You" : "Admin"} • {formatTimestamp(msg.created_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSubmit} className="border-t border-white/10 p-4 flex flex-col gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your support message..."
                rows={3}
                className="w-full resize-none rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[rgb(0,255,255)]/40 focus:outline-none"
                disabled={sending}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Press Enter to send, Shift+Enter for a new line.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={sending || !input.trim()}
                >
                  {sending ? "Sending..." : "Send"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
