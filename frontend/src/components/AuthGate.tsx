'use client';

import { useState, useEffect, type ReactNode, type FormEvent } from "react";
import { SignedIn, SignedOut, SignInButton, SignUpButton, useClerk } from "@clerk/nextjs";
import { SentiNextLogo } from "@/components/SentiNextLogo";
import { fetchCapacity, joinWaitlist, fetchCreditStatus } from "@/lib/api";

export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>
        <CapacityGuard>{children}</CapacityGuard>
      </SignedIn>
      <SignedOut>
        <AuthGateLanding />
      </SignedOut>
    </>
  );
}

/**
 * For signed-in users: verify they have a subscription (i.e. they're not a
 * brand-new user who snuck in via Google sign-in while capacity is full).
 * The backend's get_user_subscription() raises CapacityExceededError for new
 * users at capacity — we detect that here and show a blocked screen.
 */
function CapacityGuard({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const [state, setState] = useState<"loading" | "ok" | "blocked">("loading");

  useEffect(() => {
    // fetchCreditStatus calls get_user_subscription() on the backend.
    // If the user is new and capacity is full, it will return 403.
    fetchCreditStatus()
      .then(() => setState("ok"))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg.toLowerCase().includes("capacity")) {
          setState("blocked");
        } else {
          // Other errors (network, etc.) — let them through, fail-open
          setState("ok");
        }
      });
  }, []);

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[rgb(5,5,15)]">
        <div className="w-6 h-6 border-2 border-[rgb(0,255,255)]/30 border-t-[rgb(0,255,255)] rounded-full animate-spin" />
      </main>
    );
  }

  if (state === "blocked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[rgb(5,5,15)] px-6 py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(0,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem]" />

        <div className="relative w-full max-w-lg space-y-8">
          {/* Logo and Title */}
          <div className="text-center space-y-6">
            <SentiNextLogo size="md" glow className="mx-auto" />

            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-wider">
                <span className="text-white">SENTINEXT</span>
              </h1>
              <div className="h-[1px] w-32 mx-auto bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/50 to-transparent" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-[rgb(0,255,255)]/60">
                Review Intelligence System
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-[rgb(255,0,128)]/20 bg-[rgb(255,0,128)]/5 px-6 py-5 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[rgb(255,0,128)]/80">
                System at Capacity
              </p>
              <p className="text-sm text-[rgb(150,150,170)]">
                All user slots are currently filled. We&apos;ll open more spots soon.
              </p>
            </div>

            <button
              type="button"
              onClick={() => signOut({ redirectUrl: "/" })}
              className="group relative w-full border border-[rgb(0,255,255)]/30 bg-[rgb(10,10,25)] px-6 py-4 text-xs uppercase tracking-[0.3em] text-[rgb(0,255,255)] transition-all hover:border-[rgb(0,255,255)] hover:shadow-lg hover:shadow-[rgb(0,255,255)]/20"
            >
              <span className="relative flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                Sign Out
              </span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

function AuthGateLanding() {
  const [capacityLoading, setCapacityLoading] = useState(true);
  const [acceptingNewUsers, setAcceptingNewUsers] = useState(true);

  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");

  useEffect(() => {
    fetchCapacity()
      .then((data) => {
        setAcceptingNewUsers(data.accepting_new_users);
      })
      .catch(() => {
        // Fail-open: if capacity endpoint is unreachable, allow signups
        setAcceptingNewUsers(true);
      })
      .finally(() => setCapacityLoading(false));
  }, []);

  const handleWaitlistSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setWaitlistError("");
    const email = waitlistEmail.trim();
    if (!email) return;

    setSubmitting(true);
    try {
      await joinWaitlist(email);
      setWaitlistSubmitted(true);
    } catch (err) {
      setWaitlistError(err instanceof Error ? err.message : "Failed to join waitlist.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(5,5,15)] px-6 py-16 relative overflow-hidden">
      {/* Cyberpunk grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(0,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-[rgb(0,255,255)] opacity-[0.03] blur-[100px] rounded-full" />

      <div className="relative w-full max-w-lg space-y-8">
        {/* Logo and Title */}
        <div className="text-center space-y-6">
          <SentiNextLogo size="md" glow className="mx-auto" />

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

        {/* Auth Buttons / Waitlist */}
        <div className="space-y-4">
          {/* Sign In — always visible */}
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

          {capacityLoading ? (
            /* Subtle skeleton while checking capacity */
            <div className="w-full border border-[rgb(0,255,255)]/10 px-6 py-4 animate-pulse">
              <div className="h-4 w-40 mx-auto bg-[rgb(0,255,255)]/5 rounded" />
            </div>
          ) : acceptingNewUsers ? (
            /* Sign Up — only when accepting new users */
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
          ) : (
            /* At capacity — show waitlist form */
            <div className="space-y-4">
              <div className="border border-[rgb(255,0,128)]/20 bg-[rgb(255,0,128)]/5 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[rgb(255,0,128)]/80">
                  System at Capacity
                </p>
                <p className="text-xs text-[rgb(150,150,170)] mt-1">
                  All slots are currently filled. Join the waitlist for early access.
                </p>
              </div>

              {waitlistSubmitted ? (
                <div className="border border-[rgb(0,255,136)]/30 bg-[rgb(0,255,136)]/5 px-4 py-4 text-center space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-[rgb(0,255,136)]">
                    Position Secured
                  </p>
                  <p className="text-xs text-[rgb(150,150,170)]">
                    We&apos;ll notify you when a spot opens up.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    className="w-full bg-[rgb(10,10,25)] border border-[rgb(255,0,128)]/20 px-4 py-3 text-sm text-white placeholder:text-[rgb(100,100,120)] focus:outline-none focus:border-[rgb(255,0,128)]/50 transition-colors"
                  />
                  {waitlistError && (
                    <p className="text-xs text-red-400">{waitlistError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group relative w-full border border-[rgb(255,0,128)]/30 bg-[rgb(10,10,25)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-[rgb(255,0,128)] transition-all hover:border-[rgb(255,0,128)] hover:shadow-lg hover:shadow-[rgb(255,0,128)]/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgb(255,0,128)]/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <span className="relative flex items-center justify-center gap-2">
                      <span className="w-1.5 h-1.5 border border-[rgb(255,0,128)] rounded-full group-hover:bg-[rgb(255,0,128)] transition-colors" />
                      {submitting ? "Transmitting..." : "Request Access"}
                    </span>
                  </button>
                </form>
              )}
            </div>
          )}
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
  );
}
