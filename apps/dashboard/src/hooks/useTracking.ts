"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/api";

/**
 * Tracks page views automatically and returns a `track` function
 * for manual event tracking (button clicks, interactions).
 */
export function useTracking() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  // Auto-track page views on route change
  useEffect(() => {
    if (pathname && pathname !== lastPath.current) {
      lastPath.current = pathname;
      trackEvent({
        event_name: "page_view",
        event_category: "navigation",
        page: pathname,
      });
    }
  }, [pathname]);

  const track = useCallback(
    (
      eventName: string,
      options?: {
        category?: string;
        target?: string;
        metadata?: Record<string, unknown>;
      }
    ) => {
      trackEvent({
        event_name: eventName,
        event_category: options?.category ?? "interaction",
        page: pathname,
        target: options?.target,
        metadata: options?.metadata,
      });
    },
    [pathname]
  );

  return track;
}
