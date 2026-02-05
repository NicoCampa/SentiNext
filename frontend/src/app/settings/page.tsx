'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { fetchLogTail, createCheckoutSession, getBillingPortalUrl } from "@/lib/api";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useCredits } from "@/contexts/CreditsContext";
import { SignedIn, useClerk, useUser } from "@clerk/nextjs";
import { useOnboarding } from "@/contexts/OnboardingContext";

export default function SettingsPage() {
  const { health, refresh: refreshHealth } = useBackendHealth();
  const [logTail, setLogTail] = useState<string>("");
  const [logTailError, setLogTailError] = useState<string | null>(null);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { language, setLanguage, t } = useLanguage();
  const [showLogs, setShowLogs] = useState(false);
  const { isAdmin } = useAdminStatus();
  const { credits, loading: creditsLoading } = useCredits();
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { openUserProfile, signOut } = useClerk();
  const { user } = useUser();
  const { resetOnboarding } = useOnboarding();

  useEffect(() => {
    setMounted(true);
  }, []);

  const tierLabelMap: Record<string, string> = {
    free: "Free",
    indie: "Indie",
    pro: "Pro",
    max: "Enterprise",
  };

  const tierCreditsMap: Record<string, string> = {
    free: "1,000 one-time trial credits",
    indie: "2,500 credits / month",
    pro: "5,000 credits / month",
    max: "Custom credits / month",
  };

  const tierColorMap: Record<string, string> = {
    free: "text-[rgb(150,150,170)]",
    indie: "text-emerald-400",
    pro: "text-sky-400",
    max: "text-purple-400",
  };

  const loadLogTail = useCallback(async () => {
    try {
      const result = await fetchLogTail(20000);
      setLogTail(result.tail || "");
      setLogTailError(null);
    } catch (err) {
      console.error("Failed to fetch log tail", err);
      setLogTailError("Failed to load logs.");
    }
  }, []);

  useEffect(() => {
    loadLogTail();
  }, [loadLogTail]);

  async function handleUpgrade(tier: "indie" | "pro") {
    setUpgradeLoading(tier);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckoutSession(
        tier,
        `${baseUrl}/settings?upgrade=success`,
        `${baseUrl}/settings?upgrade=cancelled`,
        "monthly"
      );
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    } catch (err) {
      console.error("Failed to create checkout session", err);
      alert("Failed to start upgrade. Please try again.");
    } finally {
      setUpgradeLoading(null);
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const result = await getBillingPortalUrl(`${baseUrl}/settings`);
      if (result.portal_url) {
        window.location.href = result.portal_url;
      }
    } catch (err) {
      console.error("Failed to open billing portal", err);
      alert("Failed to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleCopyDiagnostics() {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        api_base: typeof window !== "undefined" ? window.__SENTINEXT_API_BASE__ ?? null : null,
        backend_health: health,
        log_tail: logTail ? logTail.slice(-20000) : "",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedDiagnostics(true);
      setTimeout(() => setCopiedDiagnostics(false), 2000);
      setCopyError(null);
    } catch (err) {
      console.error("Failed to copy diagnostics", err);
      setCopyError("Failed to copy diagnostics.");
    }
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-8 space-y-4 sm:space-y-6">
          {/* Header */}
          <div className="mb-4 sm:mb-8 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 border border-[rgb(0,255,255)]/50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[rgb(0,255,255)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold tracking-wider">
                  <span className="text-white">
                    {t('settings.title').toUpperCase()}
                  </span>
                </h1>
                <p className="text-[10px] sm:text-xs text-[rgb(150,150,170)] uppercase tracking-[0.15em] sm:tracking-[0.2em]">
                  System Configuration
                </p>
              </div>
            </div>
            <div className="h-[1px] bg-gradient-to-r from-[rgb(0,255,255)]/50 via-[rgb(0,255,255)]/20 to-transparent" />
          </div>

          <div className={`grid gap-6 ${isAdmin ? 'lg:grid-cols-2' : 'lg:grid-cols-1 max-w-xl mx-auto'}`}>
          {/* Left Column */}
          <div className="space-y-6">
            {/* Language Section */}
            <Card variant="glass" className={`p-4 sm:p-6 ${mounted ? 'animate-fade-slide-up' : 'opacity-0'}`}>
              <div className="mb-4 sm:mb-5">
                <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[rgb(0,255,255)]/70">
                    {t('settings.language')}
                  </p>
                </div>
                <p className="text-xs sm:text-sm text-[rgb(150,150,170)]">{t('settings.selectLanguage')}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(['en', 'it', 'fr', 'de'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`group relative p-2.5 sm:p-3 border transition-all active:scale-[0.98] ${
                      language === lang
                        ? 'border-[rgb(0,255,255)] bg-[rgb(0,255,255)]/10'
                        : 'border-[rgb(0,255,255)]/20 hover:border-[rgb(0,255,255)]/50 bg-[rgb(10,10,25)]'
                    }`}
                  >
                    {language === lang && (
                      <>
                        <div className="absolute top-0 left-0 w-1.5 h-1.5 sm:w-2 sm:h-2 border-t-2 border-l-2 border-[rgb(0,255,255)]" />
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 border-t-2 border-r-2 border-[rgb(0,255,255)]" />
                        <div className="absolute bottom-0 left-0 w-1.5 h-1.5 sm:w-2 sm:h-2 border-b-2 border-l-2 border-[rgb(0,255,255)]" />
                        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 border-b-2 border-r-2 border-[rgb(0,255,255)]" />
                      </>
                    )}
                    <p className={`text-xs sm:text-sm font-medium ${
                      language === lang ? 'text-[rgb(0,255,255)]' : 'text-[rgb(200,200,210)]'
                    }`}>
                      {t(`lang.${lang}`)}
                    </p>
                  </button>
                ))}
              </div>
            </Card>

            {/* Account Section - Mobile only (desktop has it in sidebar) */}
            <SignedIn>
              <Card variant="glass" className={`p-4 sm:p-6 lg:hidden ${mounted ? 'animate-fade-slide-up animation-delay-100' : 'opacity-0'}`}>
                <div className="mb-4 sm:mb-5">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[rgb(0,255,255)]/70">
                      {t('settings.account') || 'Account'}
                    </p>
                  </div>
                  <p className="text-xs sm:text-sm text-[rgb(150,150,170)]">Manage your account and sign out</p>
                </div>

                {/* User Info */}
                <div className="flex items-center gap-3 p-3 sm:p-4 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/20 mb-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {user?.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt="Profile"
                        className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border border-[rgb(0,255,255)]/30"
                      />
                    ) : (
                      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border border-[rgb(0,255,255)]/30 bg-[rgb(0,255,255)]/10 flex items-center justify-center">
                        <span className="text-[rgb(0,255,255)] text-base sm:text-lg font-bold">
                          {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-[rgb(0,255,136)] rounded-full border-2 border-[rgb(10,10,25)]" />
                  </div>
                  {/* User Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base text-white font-medium truncate">
                      {user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-[10px] sm:text-xs text-[rgb(150,150,170)] truncate">
                      {user?.emailAddresses?.[0]?.emailAddress || ''}
                    </p>
                  </div>
                </div>

                {/* Account Actions */}
                <div className="space-y-2">
                  <button
                    onClick={() => openUserProfile()}
                    className="w-full flex items-center justify-between p-3 bg-[rgb(10,10,25)] border border-[rgb(0,255,255)]/20 hover:border-[rgb(0,255,255)]/50 hover:bg-[rgb(0,255,255)]/5 transition-all active:scale-[0.98]"
                  >
                    <span className="text-xs sm:text-sm text-[rgb(200,200,210)]">Manage Account</span>
                    <svg className="w-4 h-4 text-[rgb(0,255,255)]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => signOut()}
                    className="w-full flex items-center justify-between p-3 bg-[rgb(10,10,25)] border border-rose-500/20 hover:border-rose-500/50 hover:bg-rose-500/5 transition-all active:scale-[0.98]"
                  >
                    <span className="text-xs sm:text-sm text-rose-400">Sign Out</span>
                    <svg className="w-4 h-4 text-rose-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              </Card>
            </SignedIn>

            {/* System Status */}
            <Card variant="glass" className={`p-4 sm:p-6 ${mounted ? 'animate-fade-slide-up animation-delay-200 lg:animation-delay-100' : 'opacity-0'}`}>
              <div className="mb-4 sm:mb-5">
                <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                  <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[rgb(0,255,255)]/70">
                    System Status
                  </p>
                </div>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {/* Backend Status */}
                <div className="flex items-center justify-between p-2.5 sm:p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10">
                  <span className="text-[10px] sm:text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                    Backend
                  </span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                      health.state === "online"
                        ? 'bg-[rgb(0,255,136)]'
                        : health.state === "offline"
                        ? 'bg-rose-500'
                        : 'bg-amber-500 animate-pulse'
                    }`} />
                    <span className={`text-[10px] sm:text-xs font-mono uppercase ${
                      health.state === "online"
                        ? 'text-[rgb(0,255,136)]'
                        : health.state === "offline"
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}>
                      {health.state === "online" ? t('settings.online') : health.state === "offline" ? t('settings.offline') : t('settings.checking')}
                    </span>
                  </div>
                </div>

                {/* Frontend Version */}
                <div className="flex items-center justify-between p-2.5 sm:p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10">
                  <span className="text-[10px] sm:text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                    Frontend
                  </span>
                  <span className="font-mono text-[10px] sm:text-xs text-[rgb(0,255,255)]">
                    v0.1.0
                  </span>
                </div>
              </div>
            </Card>

            {/* Subscription & Credits */}
            <Card variant="glass" className={`p-4 sm:p-6 ${mounted ? 'animate-fade-slide-up animation-delay-300 lg:animation-delay-200' : 'opacity-0'}`}>
              <div className="mb-4 sm:mb-5">
                <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[rgb(0,255,255)]/70">
                    Subscription & Credits
                  </p>
                </div>
                <p className="text-xs sm:text-sm text-[rgb(150,150,170)]">Manage your plan and credit balance</p>
              </div>

              {creditsLoading && !credits ? (
                <div className="space-y-2 sm:space-y-3 animate-pulse">
                  <div className="h-8 sm:h-10 bg-[rgb(0,255,255)]/10 rounded" />
                  <div className="h-3 bg-[rgb(0,255,255)]/10 rounded w-2/3" />
                </div>
              ) : credits ? (
                <>
                  {/* Current Plan */}
                  <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/20">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <span className="text-[10px] sm:text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                        Current Plan
                      </span>
                      <span className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${
                        tierColorMap[credits.tier] ?? "text-[rgb(150,150,170)]"
                      }`}>
                        {tierLabelMap[credits.tier] ?? credits.tier}
                      </span>
                    </div>

                    {/* Tier Benefits */}
                    <p className="text-[10px] sm:text-xs text-[rgb(150,150,170)]">
                      {tierCreditsMap[credits.tier] ?? ""}
                    </p>
                  </div>

                  {/* Credits */}
                  <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/20">
                    {(() => {
                      const effectiveMax = Math.max(credits.limit ?? 0, (credits.balance ?? 0) + (credits.used ?? 0));
                      const percentRemaining = effectiveMax > 0
                        ? Math.min(100, Math.max(0, ((credits.balance ?? 0) / effectiveMax) * 100))
                        : 0;
                      const resetDate = credits.period_end
                        ? new Date(credits.period_end).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : null;
                      const isWallet = !credits.limit || credits.limit <= 0;

                      return (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] sm:text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                              Credits
                            </span>
                            <span className="font-mono text-[10px] sm:text-xs text-[rgb(0,255,255)]">
                              {Math.max(0, credits.balance).toLocaleString()} left
                            </span>
                          </div>

                          <div className="h-1.5 sm:h-2 bg-[rgb(0,255,255)]/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                credits.warning ? "bg-amber-500" : "bg-[rgb(0,255,255)]"
                              }`}
                              style={{ width: `${percentRemaining}%` }}
                            />
                          </div>

                          <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-[rgb(150,150,170)]">
                            <div>
                              <span className="uppercase tracking-wider text-[8px] sm:text-[9px] text-[rgb(0,255,255)]/50">Balance</span>
                              <div className="font-mono text-[10px] sm:text-xs text-[rgb(0,255,255)]">{Math.max(0, credits.balance).toLocaleString()}</div>
                            </div>
                            <div>
                              <span className="uppercase tracking-wider text-[8px] sm:text-[9px] text-[rgb(0,255,255)]/50">Used</span>
                              <div className="font-mono text-[10px] sm:text-xs text-[rgb(0,255,255)]">{Math.max(0, credits.used).toLocaleString()}</div>
                            </div>
                            <div>
                              <span className="uppercase tracking-wider text-[8px] sm:text-[9px] text-[rgb(0,255,255)]/50">Monthly limit</span>
                              <div className="font-mono text-[10px] sm:text-xs text-[rgb(0,255,255)]">
                                {isWallet ? "No monthly reset" : credits.limit.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <span className="uppercase tracking-wider text-[8px] sm:text-[9px] text-[rgb(0,255,255)]/50">Resets</span>
                              <div className="font-mono text-[10px] sm:text-xs text-[rgb(0,255,255)]">
                                {isWallet ? "—" : (resetDate || "—")}
                              </div>
                            </div>
                          </div>

                          {isWallet && (
                            <p className="mt-2 text-[10px] sm:text-[11px] text-[rgb(150,150,170)]">
                              One-time trial credits (no monthly reset).
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Upgrade Options */}
                  {credits.tier !== "max" && (
                    <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                      <p className="text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[rgb(0,255,255)]/50">
                        Upgrade Your Plan
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {credits.tier === "free" && (
                          <button
                            onClick={() => handleUpgrade("indie")}
                            disabled={upgradeLoading !== null}
                            className="p-2.5 sm:p-3 border border-emerald-500/30 bg-[rgb(10,10,25)] hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                          >
                            <p className="text-xs sm:text-sm font-bold text-emerald-400">Indie</p>
                            <p className="text-[10px] sm:text-xs text-emerald-400/50 mt-0.5 sm:mt-1">2,500 credits / month</p>
                          </button>
                        )}
                        {(credits.tier === "free" || credits.tier === "indie") && (
                          <button
                            onClick={() => handleUpgrade("pro")}
                            disabled={upgradeLoading !== null}
                            className="p-2.5 sm:p-3 border border-sky-500/30 bg-[rgb(10,10,25)] hover:bg-sky-500/10 hover:border-sky-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                          >
                            <p className="text-xs sm:text-sm font-bold text-sky-400">Pro</p>
                            <p className="text-[10px] sm:text-xs text-sky-400/50 mt-0.5 sm:mt-1">5,000 credits / month</p>
                          </button>
                        )}
                        {(credits.tier === "free" || credits.tier === "indie" || credits.tier === "pro") && (
                          <Link
                            href="/support"
                            className="p-2.5 sm:p-3 border border-purple-500/30 bg-[rgb(10,10,25)] hover:bg-purple-500/10 hover:border-purple-500/50 transition-all active:scale-[0.98]"
                          >
                            <p className="text-xs sm:text-sm font-bold text-purple-400">Enterprise</p>
                            <p className="text-[10px] sm:text-xs text-purple-400/50 mt-0.5 sm:mt-1">Custom pricing</p>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Manage Subscription (for paid users) */}
                  {credits.stripe_customer_id && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className="w-full"
                    >
                      {portalLoading ? "Loading..." : "Manage Subscription"}
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-xs text-rose-400">Failed to load subscription information</p>
              )}
            </Card>
          </div>

          {/* Right Column - Diagnostics (Admin Only) */}
          {isAdmin && (
            <div className="space-y-4 sm:space-y-6">
              <Card variant="glass" className={`p-4 sm:p-6 ${mounted ? 'animate-fade-slide-up animation-delay-300' : 'opacity-0'}`}>
                <div className="mb-4 sm:mb-5">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[rgb(0,255,255)]/70">
                      {t('settings.diagnostics')}
                    </p>
                  </div>
                  <p className="text-xs sm:text-sm text-[rgb(150,150,170)]">{t('settings.diagnosticsDesc')}</p>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-5">
                  <Button size="sm" variant="secondary" onClick={() => refreshHealth()} className="text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2">
                    {t('settings.recheckBackend')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { loadLogTail(); setShowLogs(true); }} className="text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2">
                    {t('settings.refreshLogs')}
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleCopyDiagnostics} className="text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2">
                    {t('settings.copyDiagnostics')}
                  </Button>
                  <Button size="sm" variant="update" onClick={resetOnboarding} className="text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2">
                    Test Onboarding
                  </Button>
                </div>

                {copiedDiagnostics && (
                  <div className="flex items-center gap-2 mb-3 sm:mb-4 p-2 bg-[rgb(0,255,136)]/10 border border-[rgb(0,255,136)]/30">
                    <span className="w-1.5 h-1.5 bg-[rgb(0,255,136)] rounded-full" />
                    <span className="text-[10px] sm:text-xs text-[rgb(0,255,136)]">{t('settings.copied')}</span>
                  </div>
                )}

                {copyError && (
                  <p className="text-[10px] sm:text-xs text-rose-400 mb-3 sm:mb-4">{copyError}</p>
                )}

                {/* Log Tail (Collapsible) */}
                <div className="space-y-2 sm:space-y-3">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="flex items-center gap-2 text-left w-full min-h-[44px] sm:min-h-0"
                  >
                    <span className={`text-[rgb(0,255,255)]/50 transition-transform ${showLogs ? 'rotate-90' : ''}`}>
                      &gt;
                    </span>
                    <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[rgb(0,255,255)]/50">
                      System Logs
                    </p>
                  </button>

                  {showLogs && (
                    <>
                      {logTailError ? (
                        <p className="text-[10px] sm:text-xs text-rose-400">{logTailError}</p>
                      ) : (
                        <pre className="max-h-36 sm:max-h-48 overflow-auto border border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)] p-3 sm:p-4 text-[10px] sm:text-xs text-[rgb(200,200,210)] font-mono">
                          {logTail || "No logs yet."}
                        </pre>
                      )}
                    </>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
      </PageTransition>
    </AppLayout>
  );
}
