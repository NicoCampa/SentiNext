'use client';

import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { fetchLogTail } from "@/lib/api";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { SignedIn, useClerk, useUser } from "@clerk/nextjs";
import { useOnboarding } from "@/contexts/OnboardingContext";

export default function SettingsPage() {
  const { health, refresh: refreshHealth } = useBackendHealth();
  const [logTail, setLogTail] = useState<string>("");
  const [logTailError, setLogTailError] = useState<string | null>(null);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { t } = useLanguage();
  const [showLogs, setShowLogs] = useState(false);
  const { isAdmin } = useAdminStatus();
  const [mounted, setMounted] = useState(false);
  const { openUserProfile, signOut } = useClerk();
  const { user } = useUser();
  const { resetOnboarding } = useOnboarding();

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (isAdmin) loadLogTail();
  }, [isAdmin, loadLogTail]);

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
            {/* Account Section - Mobile only (desktop has it in sidebar) */}
            <SignedIn>
              <Card variant="glass" className={`p-4 sm:p-6 ${mounted ? 'animate-fade-slide-up animation-delay-100' : 'opacity-0'}`}>
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
