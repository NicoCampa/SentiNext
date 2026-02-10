'use client';

import { createContext, useCallback, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { fetchSupportUnreadCount, fetchAdminSupportUnreadCount } from "@/lib/api";
import { useAdminStatus } from "@/hooks/useAdminStatus";

// Polling interval for unread count updates (60 seconds)
const POLL_INTERVAL = 60000;
const WELCOME_SEEN_KEY = "sentinext_support_welcomed_v1_local";

interface SupportNotificationContextType {
  /** Unread count for regular users (admin replies) */
  userUnreadCount: number;
  /** Unread count for admins (user messages) */
  adminUnreadCount: number;
  /** Whether to show a badge for the hardcoded welcome message (first-time users) */
  showWelcomeBadge: boolean;
  /** Mark as read (resets count locally, actual read happens on page visit) */
  markAsRead: () => void;
  /** Mark the welcome message as seen (called when user visits support page) */
  markWelcomeSeen: () => void;
  /** Force refresh the unread count */
  refresh: () => Promise<void>;
}

const SupportNotificationContext = createContext<SupportNotificationContextType | null>(null);

export function SupportNotificationProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdminStatus();
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [welcomeSeen, setWelcomeSeen] = useState(true); // default true to avoid flash
  const refreshingRef = useRef(false);

  // Load welcome-seen flag
  useEffect(() => {
    const seen = window.localStorage.getItem(WELCOME_SEEN_KEY) === "true";
    setWelcomeSeen(seen);
  }, []);

  const markWelcomeSeen = useCallback(() => {
    setWelcomeSeen(true);
    window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      if (isAdmin) {
        const data = await fetchAdminSupportUnreadCount();
        setAdminUnreadCount(data.unread_count);
      } else {
        const data = await fetchSupportUnreadCount();
        setUserUnreadCount(data.unread_count);
      }
    } catch (err) {
      // Silent fail - don't break the UI for notification counts
      console.error("Failed to fetch support unread count:", err);
    } finally {
      refreshingRef.current = false;
    }
  }, [isAdmin]);

  const markAsRead = useCallback(() => {
    if (isAdmin) {
      setAdminUnreadCount(0);
    } else {
      setUserUnreadCount(0);
    }
  }, [isAdmin]);

  // Initial fetch once we know admin status
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Periodic polling
  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  // Refresh on window focus
  useEffect(() => {
    const handleFocus = () => {
      refresh();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  const showWelcomeBadge = !isAdmin && !welcomeSeen;

  return (
    <SupportNotificationContext.Provider value={{ userUnreadCount, adminUnreadCount, showWelcomeBadge, markAsRead, markWelcomeSeen, refresh }}>
      {children}
    </SupportNotificationContext.Provider>
  );
}

export function useSupportNotification(): SupportNotificationContextType {
  const context = useContext(SupportNotificationContext);
  if (!context) {
    return {
      userUnreadCount: 0,
      adminUnreadCount: 0,
      showWelcomeBadge: false,
      markAsRead: () => {},
      markWelcomeSeen: () => {},
      refresh: async () => {},
    };
  }
  return context;
}
