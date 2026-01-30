'use client';

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClerkLoaded,
  ClerkLoading,
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
} from "@clerk/clerk-react";
import { AnalysisProvider } from "@/contexts/AnalysisContext";
import { AnalysisWidget } from "@/components/AnalysisWidget";
import { GlobalFiltersProvider } from "@/contexts/GlobalFiltersContext";
import { GameProvider } from "@/contexts/GameContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";

export function ClientProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [publishableKey, setPublishableKey] = useState<string | null>(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || null
  );
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (publishableKey) return;
    let active = true;

    const resolveBase = () => {
      if (typeof window !== "undefined" && window.__SENTINEXT_API_BASE__) {
        return window.__SENTINEXT_API_BASE__;
      }
      if (process.env.NEXT_PUBLIC_API_BASE_URL) {
        return process.env.NEXT_PUBLIC_API_BASE_URL;
      }
      return "/api";
    };

    const apiUrl = () => {
      const base = resolveBase().trim();
      if (!base) return "/api/auth/config";
      if (base.startsWith("http://") || base.startsWith("https://")) {
        return new URL("/auth/config", base).toString();
      }
      return `${base.replace(/\/$/, "")}/auth/config`;
    };

    (async () => {
      try {
        const response = await fetch(apiUrl(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load auth config (${response.status})`);
        }
        const payload = (await response.json()) as { publishable_key?: string };
        if (!active) return;
        const key = (payload.publishable_key || "").trim();
        if (key) {
          setPublishableKey(key);
        } else {
          setConfigError("Auth publishable key is missing.");
        }
      } catch (err) {
        if (!active) return;
        setConfigError((err as Error).message || "Failed to load auth config.");
      }
    })();

    return () => {
      active = false;
    };
  }, [publishableKey]);

  if (!publishableKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Auth not configured</h1>
          <p className="mt-2 text-sm text-slate-400">
            {configError || "Loading auth configuration..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} navigate={(to) => router.push(to)}>
      <ClerkLoading>
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-sky-500" />
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignedOut>
          <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
            <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
              <div className="text-center">
                <h1 className="text-2xl font-semibold tracking-tight">
                  <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                    SentiNext
                  </span>
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Sign in to access your analytics workspace.
                </p>
              </div>
              <SignIn
                routing="hash"
                afterSignInUrl="/dashboard?view=home"
                afterSignUpUrl="/dashboard?view=home"
              />
            </div>
          </div>
        </SignedOut>
        <SignedIn>
          <AnalysisProvider>
            <GlobalFiltersProvider>
              <UiPreferencesProvider>
                <GameProvider>
                  {children}
                  <AnalysisWidget />
                </GameProvider>
              </UiPreferencesProvider>
            </GlobalFiltersProvider>
          </AnalysisProvider>
        </SignedIn>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
