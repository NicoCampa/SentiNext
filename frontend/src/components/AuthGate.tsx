'use client';

import type { ReactNode } from "react";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";

export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <main className="flex min-h-screen items-center justify-center bg-[rgb(5,5,15)] px-6 py-16 relative overflow-hidden">
          {/* Cyberpunk grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(0,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem]" />

          {/* Glow effect */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-[rgb(0,255,255)] opacity-[0.03] blur-[100px] rounded-full" />

          <div className="relative w-full max-w-lg space-y-8">
            {/* Logo and Title */}
            <div className="text-center space-y-6">
              <div className="mx-auto w-20 h-20 border-2 border-[rgb(0,255,255)] flex items-center justify-center relative group">
                {/* Corner accents */}
                <div className="absolute -top-[2px] -left-[2px] w-3 h-3 border-t-2 border-l-2 border-[rgb(0,255,255)]" />
                <div className="absolute -top-[2px] -right-[2px] w-3 h-3 border-t-2 border-r-2 border-[rgb(0,255,255)]" />
                <div className="absolute -bottom-[2px] -left-[2px] w-3 h-3 border-b-2 border-l-2 border-[rgb(255,0,128)]" />
                <div className="absolute -bottom-[2px] -right-[2px] w-3 h-3 border-b-2 border-r-2 border-[rgb(255,0,128)]" />

                <span className="text-white text-2xl font-bold">SN</span>

                {/* Glow on hover */}
                <div className="absolute inset-0 bg-[rgb(0,255,255)] opacity-0 group-hover:opacity-10 blur-xl transition-opacity" />
              </div>

              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-wider">
                  <span className="text-white">
                    SENTINEXT
                  </span>
                </h1>
                <div className="h-[1px] w-32 mx-auto bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/50 to-transparent" />
                <p className="text-[10px] uppercase tracking-[0.3em] text-[rgb(0,255,255)]/60">
                  Review Intelligence System
                </p>
                <p className="text-sm text-[rgb(150,150,170)] max-w-md mx-auto mt-4">
                  Sign in to access your analytics dashboard and saved insights
                </p>
              </div>
            </div>

            {/* Auth Buttons */}
            <div className="space-y-4">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="group relative w-full border border-[rgb(0,255,255)]/30 bg-[rgb(10,10,25)] px-6 py-4 text-xs uppercase tracking-[0.3em] text-[rgb(0,255,255)] transition-all hover:border-[rgb(0,255,255)] hover:shadow-lg hover:shadow-[rgb(0,255,255)]/20 overflow-hidden"
                >
                  {/* Animated border glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

                  <span className="relative flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                    Access System
                  </span>
                </button>
              </SignInButton>

              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="group relative w-full border border-[rgb(0,255,255)]/20 px-6 py-4 text-xs uppercase tracking-[0.3em] text-[rgb(150,150,170)] transition-all hover:border-[rgb(0,255,255)]/50 hover:text-[rgb(200,200,210)]"
                >
                  <span className="relative flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 border border-[rgb(150,150,170)] rounded-full group-hover:border-[rgb(0,255,255)] group-hover:bg-[rgb(0,255,255)] transition-colors" />
                    Initialize New Account
                  </span>
                </button>
              </SignUpButton>
            </div>

            {/* System info footer */}
            <div className="flex items-center justify-between text-[9px] text-[rgb(0,255,255)]/30 uppercase tracking-wider border-t border-[rgb(0,255,255)]/10 pt-6">
              <span>v0.1.0</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[rgb(0,255,136)] rounded-full animate-pulse" />
                System Online
              </span>
            </div>
          </div>
        </main>
      </SignedOut>
    </>
  );
}
