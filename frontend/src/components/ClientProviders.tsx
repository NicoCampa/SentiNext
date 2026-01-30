'use client';

import { ReactNode } from "react";
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
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Auth not configured</h1>
          <p className="mt-2 text-sm text-slate-400">
            Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable sign-in.
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
