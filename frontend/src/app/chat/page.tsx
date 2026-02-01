'use client';

import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/api";

function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
  return `${base}${path}`;
}

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type ChatSession = {
  session_id: string;
  message_count: number;
  started_at: string | null;
  last_message_at: string | null;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

    try {
      const response = await authFetch(apiUrl("/chat/simple"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          session_id: currentSessionId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Chat API error:", response.status, errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.detail || `Error ${response.status}: ${errorText}`);
        } catch {
          throw new Error(`Error ${response.status}: ${errorText}`);
        }
      }

      const data = await response.json();
      console.log("Received chat response, backend should have saved messages");

      // Update session ID if this was a new session
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
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
    }
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
      <div className="mx-auto max-w-5xl h-[calc(100vh-2rem)] flex flex-col px-4 py-6 sm:px-6 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                AI Assistant
              </span>
            </h1>
            <p className="text-xs text-slate-400">Your intelligent conversation partner</p>
          </div>
          <div className="flex gap-2">
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
          {/* History Sidebar */}
          {showHistory && (
            <Card variant="glass" className="w-64 flex-shrink-0 p-4 overflow-hidden flex flex-col">
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
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
                    <span className="text-xs text-slate-400">Thinking...</span>
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
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </Card>
        </div>
      </div>
    </AppLayout>
  );
}
