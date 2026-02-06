'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";

interface OnboardingContextValue {
  hasCompletedOnboarding: boolean;
  showOnboarding: boolean;
  markOnboardingComplete: () => void;
  resetOnboarding: () => void;
  dismissOnboarding: () => void;
}

const STORAGE_KEY_PREFIX = "sentinext_onboarding_completed_v1";

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  // Derive user-scoped storage key
  const storageKey = user?.id ? `${STORAGE_KEY_PREFIX}_${user.id}` : null;

  // Load state on mount (client-side only), scoped to authenticated user
  useEffect(() => {
    if (!isUserLoaded || !storageKey) return;
    const completed = window.localStorage.getItem(storageKey) === "true";
    setHasCompletedOnboarding(completed);
    setShowOnboarding(!completed);
    setMounted(true);
  }, [isUserLoaded, storageKey]);

  const markOnboardingComplete = useCallback(() => {
    setHasCompletedOnboarding(true);
    setShowOnboarding(false);
    if (storageKey) window.localStorage.setItem(storageKey, "true");
  }, [storageKey]);

  const resetOnboarding = useCallback(() => {
    setHasCompletedOnboarding(false);
    setShowOnboarding(true);
    if (storageKey) window.localStorage.setItem(storageKey, "false");
  }, [storageKey]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      hasCompletedOnboarding,
      showOnboarding: mounted && showOnboarding,
      markOnboardingComplete,
      resetOnboarding,
      dismissOnboarding,
    }),
    [hasCompletedOnboarding, showOnboarding, mounted, markOnboardingComplete, resetOnboarding, dismissOnboarding],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
