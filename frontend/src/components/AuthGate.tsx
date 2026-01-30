'use client';

import type { ReactNode } from "react";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";

export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-16">
          <div className="w-full max-w-lg space-y-6 rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-center shadow-2xl shadow-slate-950/50 backdrop-blur">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
              <span className="text-2xl font-bold text-white">SN</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white">Welcome to SentiNext</h1>
              <p className="text-sm text-slate-400">
                Sign in to access your analytics dashboard and saved insights.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-5 py-3 text-xs uppercase tracking-[0.3em] text-slate-100 transition hover:border-sky-400/60 hover:text-white"
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-xs uppercase tracking-[0.3em] text-slate-100 transition hover:border-sky-400/60 hover:text-white"
                >
                  Sign up
                </button>
              </SignUpButton>
            </div>
          </div>
        </main>
      </SignedOut>
    </>
  );
}
