'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Portal } from '@/components/Portal';
import { createCheckoutSession } from '@/lib/api';
import { useCredits } from '@/contexts/CreditsContext';
import Link from 'next/link';

interface UpgradeModalProps {
  onClose: () => void;
  message?: string;
}

export function UpgradeModal({ onClose, message }: UpgradeModalProps) {
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const { credits } = useCredits();

  const isFreeTier = !credits?.tier || credits.tier === "free";

  async function handleUpgrade() {
    setUpgradeLoading(true);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckoutSession(
        "indie",
        `${baseUrl}/settings?upgrade=success`,
        `${baseUrl}/settings?upgrade=cancelled`,
        "monthly"
      );
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        console.error("Checkout session created but no checkout_url returned");
      }
    } catch (err) {
      console.error("Failed to create checkout session", err);
    } finally {
      setUpgradeLoading(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Credits Required</h3>
              <p className="text-xs text-slate-400">
                {credits ? `${credits.balance} credits remaining` : 'No credits available'}
              </p>
            </div>
          </div>

          {/* Message */}
          <p className="text-sm text-slate-300 mb-6">
            {message || (isFreeTier
              ? "You don't have enough credits for this operation. Upgrade your plan to continue analyzing games."
              : "You've used all your credits for this billing period. Contact us if you need more capacity."
            )}
          </p>

          {/* Options */}
          <div className="mb-6 space-y-3">
            {isFreeTier ? (
              /* Free tier → Indie upgrade */
              <button
                onClick={handleUpgrade}
                disabled={upgradeLoading}
                className="w-full flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-left transition hover:bg-emerald-500/10 hover:border-emerald-500/50 disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-semibold text-white">Indie</p>
                  <p className="text-xs text-slate-400 mt-0.5">5,000 credits/month</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-400">
                    {upgradeLoading ? "Redirecting..." : "$8/mo"}
                  </p>
                </div>
              </button>
            ) : (
              /* Indie tier → Contact support or Enterprise */
              <>
                <Link
                  href="/support"
                  onClick={onClose}
                  className="w-full flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-left transition hover:bg-sky-500/10 hover:border-sky-500/50"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">Contact Support</p>
                    <p className="text-xs text-slate-400 mt-0.5">Get help with your account</p>
                  </div>
                  <svg className="w-4 h-4 text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="/support"
                  onClick={onClose}
                  className="w-full flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 text-left transition hover:bg-purple-500/10 hover:border-purple-500/50"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">Enterprise</p>
                    <p className="text-xs text-slate-400 mt-0.5">Custom credits and dedicated support</p>
                  </div>
                  <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </>
            )}
          </div>

          {/* Dismiss */}
          <Button onClick={onClose} variant="ghost" size="sm" className="w-full text-slate-400 hover:text-white">
            Not now
          </Button>
        </div>
      </div>
    </Portal>
  );
}
