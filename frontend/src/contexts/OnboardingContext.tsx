'use client';

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface OnboardingContextValue {
  hasCompletedOnboarding: boolean;
  showOnboarding: boolean;
  markOnboardingComplete: () => void;
  resetOnboarding: () => void;
  dismissOnboarding: () => void;
}

const STORAGE_KEY = "sentinext_onboarding_completed_v1";

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function loadOnboardingState(): boolean {
  if (typeof window === "undefined") return true; // SSR: assume completed
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function persistOnboardingState(completed: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, completed ? "true" : "false");
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  // Load state on mount (client-side only)
  useEffect(() => {
    const completed = loadOnboardingState();
    setHasCompletedOnboarding(completed);
    setShowOnboarding(!completed);
    setMounted(true);
  }, []);

  const markOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
    setShowOnboarding(false);
    persistOnboardingState(true);
  };

  const resetOnboarding = () => {
    setHasCompletedOnboarding(false);
    setShowOnboarding(true);
    persistOnboardingState(false);
  };

  const dismissOnboarding = () => {
    setShowOnboarding(false);
  };

  const value = useMemo<OnboardingContextValue>(
    () => ({
      hasCompletedOnboarding,
      showOnboarding: mounted && showOnboarding,
      markOnboardingComplete,
      resetOnboarding,
      dismissOnboarding,
    }),
    [hasCompletedOnboarding, showOnboarding, mounted],
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
