'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

interface OnboardingContextValue {
  hasCompletedOnboarding: boolean;
  showOnboarding: boolean;
  markOnboardingComplete: () => void;
  resetOnboarding: () => void;
  dismissOnboarding: () => void;
}

const STORAGE_KEY = "sentinext_onboarding_completed_v1_local";

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  // Load state on mount (client-side only)
  useEffect(() => {
    try {
      const completed = window.localStorage.getItem(STORAGE_KEY) === "true";
      setHasCompletedOnboarding(completed);
      setShowOnboarding(!completed);
    } catch {
      // localStorage unavailable (private browsing, storage disabled) -- skip onboarding
      setHasCompletedOnboarding(true);
      setShowOnboarding(false);
    }
    setMounted(true);
  }, []);

  const markOnboardingComplete = useCallback(() => {
    setHasCompletedOnboarding(true);
    setShowOnboarding(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch { /* storage unavailable */ }
  }, []);

  const resetOnboarding = useCallback(() => {
    setHasCompletedOnboarding(false);
    setShowOnboarding(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "false");
    } catch { /* storage unavailable */ }
  }, []);

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
