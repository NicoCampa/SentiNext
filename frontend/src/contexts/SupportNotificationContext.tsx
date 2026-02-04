'use client';

import { createContext, useCallback, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { fetchSupportUnreadCount, fetchAdminSupportUnreadCount } from "@/lib/api";
import { useAdminStatus } from "@/hooks/useAdminStatus";

// Polling interval for unread count updates (60 seconds)
const POLL_INTERVAL = 60000;

interface SupportNotificationContextType {
  /** Unread count for regular users (admin replies) */
  userUnreadCount: number;
  /** Unread count for admins (user messages) */
  adminUnreadCount: number;
  /** Mark as read (resets count locally, actual read happens on page visit) */
  markAsRead: () => void;
  /** Force refresh the unread count */
  refresh: () => Promise<void>;
}

const SupportNotificationContext = createContext<SupportNotificationContextType | null>(null);

export function SupportNotificationProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdminStatus();
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const refreshingRef = useRef(false);

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

  return (
    <SupportNotificationContext.Provider value={{ userUnreadCount, adminUnreadCount, markAsRead, refresh }}>
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
      markAsRead: () => {},
      refresh: async () => {},
    };
  }
  return context;
}
