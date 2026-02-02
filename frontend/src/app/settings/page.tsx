'use client';

import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchLogTail, createCheckoutSession, getBillingPortalUrl, CreditStatus } from "@/lib/api";
import { isTauriApp } from "@/lib/settings";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useCredits } from "@/contexts/CreditsContext";

export default function SettingsPage() {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const { health, refresh: refreshHealth } = useBackendHealth();
  const [logTail, setLogTail] = useState<string>("");
  const [logTailError, setLogTailError] = useState<string | null>(null);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { language, setLanguage, t } = useLanguage();
  const [showLogs, setShowLogs] = useState(false);
  const { isAdmin } = useAdminStatus();
  const { credits, loading: creditsLoading, refresh: refreshCredits } = useCredits();
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const backendBootError =
    typeof window !== "undefined" ? window.__SENTINEXT_BACKEND_BOOT_ERROR__ ?? null : null;
  const backendBootLogFile =
    typeof window !== "undefined" ? window.__SENTINEXT_BACKEND_LOG_FILE__ ?? null : null;

  useEffect(() => {
    let active = true;
    if (!isTauriApp()) {
      setAppVersion(null);
      return () => {
        active = false;
      };
    }
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (active) setAppVersion(version);
      } catch (err) {
        console.error("Failed to read app version.", err);
        if (active) setAppVersion("unknown");
      }
    })();
    return () => {
      active = false;
    };
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
    loadLogTail();
  }, [loadLogTail]);

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  }

  async function handleUpgrade(tier: "pro" | "max") {
    setUpgradeLoading(tier);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckoutSession(
        tier,
        `${baseUrl}/settings?upgrade=success`,
        `${baseUrl}/settings?upgrade=cancelled`
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
        app_version: appVersion,
        api_base: typeof window !== "undefined" ? window.__SENTINEXT_API_BASE__ ?? null : null,
        backend_boot_error: backendBootError,
        backend_boot_log_file: backendBootLogFile,
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
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-[rgb(0,255,255)]/50 flex items-center justify-center">
              <span className="text-[rgb(0,255,255)] text-lg">⚙</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-wider">
                <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                  {t('settings.title').toUpperCase()}
                </span>
              </h1>
              <p className="text-xs text-[rgb(150,150,170)] uppercase tracking-[0.2em]">
                System Configuration
              </p>
            </div>
          </div>
          <div className="h-[1px] bg-gradient-to-r from-[rgb(0,255,255)]/50 via-[rgb(0,255,255)]/20 to-transparent" />
        </div>

        <div className={`grid gap-6 ${isAdmin ? 'lg:grid-cols-2' : 'lg:grid-cols-1 max-w-xl'}`}>
          {/* Left Column */}
          <div className="space-y-6">
            {/* Language Section */}
            <Card variant="glass" className="p-6">
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🌐</span>
                  <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                    {t('settings.language')}
                  </p>
                </div>
                <p className="text-sm text-[rgb(150,150,170)]">{t('settings.selectLanguage')}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(['en', 'it', 'fr', 'de'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`group relative p-3 border transition-all ${
                      language === lang
                        ? 'border-[rgb(0,255,255)] bg-[rgb(0,255,255)]/10'
                        : 'border-[rgb(0,255,255)]/20 hover:border-[rgb(0,255,255)]/50 bg-[rgb(10,10,25)]'
                    }`}
                  >
                    {language === lang && (
                      <>
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[rgb(0,255,255)]" />
                        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[rgb(0,255,255)]" />
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[rgb(0,255,255)]" />
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[rgb(0,255,255)]" />
                      </>
                    )}
                    <p className={`text-sm font-medium ${
                      language === lang ? 'text-[rgb(0,255,255)]' : 'text-[rgb(200,200,210)]'
                    }`}>
                      {t(`lang.${lang}`)}
                    </p>
                  </button>
                ))}
              </div>
            </Card>

            {/* System Status */}
            <Card variant="glass" className="p-6">
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">📡</span>
                  <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                    System Status
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Backend Status */}
                <div className="flex items-center justify-between p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10">
                  <span className="text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                    Backend
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      health.state === "online"
                        ? 'bg-[rgb(0,255,136)]'
                        : health.state === "offline"
                        ? 'bg-rose-500'
                        : 'bg-amber-500 animate-pulse'
                    }`} />
                    <span className={`text-xs font-mono uppercase ${
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

                {/* App Version (if Tauri) */}
                {isTauriApp() && (
                  <div className="flex items-center justify-between p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10">
                    <span className="text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                      {t('settings.appVersion')}
                    </span>
                    <span className="font-mono text-xs text-[rgb(0,255,255)]">
                      {appVersion ?? t('common.loading')}
                    </span>
                  </div>
                )}

                {/* Frontend Version */}
                <div className="flex items-center justify-between p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10">
                  <span className="text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                    Frontend
                  </span>
                  <span className="font-mono text-xs text-[rgb(0,255,255)]">
                    v0.1.0
                  </span>
                </div>
              </div>
            </Card>

            {/* Subscription & Credits */}
            <Card variant="glass" className="p-6">
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">💎</span>
                  <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                    Subscription & Credits
                  </p>
                </div>
                <p className="text-sm text-[rgb(150,150,170)]">Manage your plan and credit usage</p>
              </div>

              {creditsLoading && !credits ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-10 bg-[rgb(0,255,255)]/10 rounded" />
                  <div className="h-3 bg-[rgb(0,255,255)]/10 rounded w-2/3" />
                </div>
              ) : credits ? (
                <>
                  {/* Current Plan */}
                  <div className="mb-4 p-4 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/20">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                        Current Plan
                      </span>
                      <span className={`text-sm font-bold uppercase tracking-wider ${
                        credits.tier === "max"
                          ? "text-purple-400"
                          : credits.tier === "pro"
                          ? "text-[rgb(0,255,255)]"
                          : "text-[rgb(150,150,170)]"
                      }`}>
                        {credits.tier}
                      </span>
                    </div>

                    {/* Credit Usage Bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[rgb(150,150,170)]">Credits Used</span>
                        <span className={`font-mono ${
                          credits.blocked
                            ? "text-rose-400"
                            : credits.warning
                            ? "text-amber-400"
                            : "text-[rgb(0,255,255)]"
                        }`}>
                          {credits.used.toLocaleString()} / {credits.limit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 bg-[rgb(0,255,255)]/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            credits.blocked
                              ? "bg-rose-500"
                              : credits.warning
                              ? "bg-amber-500"
                              : "bg-[rgb(0,255,255)]"
                          }`}
                          style={{ width: `${Math.min(credits.percent_used, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Reset Date */}
                    {credits.period_end && (
                      <p className="text-[10px] text-[rgb(150,150,170)]">
                        Resets on {new Date(credits.period_end).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>

                  {/* Warning/Blocked Messages */}
                  {credits.blocked && (
                    <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30">
                      <p className="text-xs text-rose-400">
                        You&apos;ve exceeded your credit limit. Upgrade your plan or wait for credits to reset.
                      </p>
                    </div>
                  )}
                  {credits.warning && !credits.blocked && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30">
                      <p className="text-xs text-amber-400">
                        You&apos;ve used over 100% of your monthly credits. Consider upgrading.
                      </p>
                    </div>
                  )}

                  {/* Upgrade Options */}
                  {credits.tier !== "max" && (
                    <div className="space-y-3 mb-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/50">
                        Upgrade Your Plan
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {credits.tier === "free" && (
                          <button
                            onClick={() => handleUpgrade("pro")}
                            disabled={upgradeLoading !== null}
                            className="p-3 border border-[rgb(0,255,255)]/30 bg-[rgb(10,10,25)] hover:bg-[rgb(0,255,255)]/10 hover:border-[rgb(0,255,255)]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <p className="text-sm font-bold text-[rgb(0,255,255)]">Pro</p>
                            <p className="text-xs text-[rgb(150,150,170)]">$19/mo</p>
                            <p className="text-[10px] text-[rgb(0,255,255)]/50 mt-1">5,000 credits</p>
                          </button>
                        )}
                        <button
                          onClick={() => handleUpgrade("max")}
                          disabled={upgradeLoading !== null}
                          className="p-3 border border-purple-500/30 bg-[rgb(10,10,25)] hover:bg-purple-500/10 hover:border-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <p className="text-sm font-bold text-purple-400">Max</p>
                          <p className="text-xs text-[rgb(150,150,170)]">$49/mo</p>
                          <p className="text-[10px] text-purple-400/50 mt-1">25,000 credits</p>
                        </button>
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
                <p className="text-xs text-rose-400">Failed to load credit information</p>
              )}
            </Card>
          </div>

          {/* Right Column - Diagnostics (Admin Only) */}
          {isAdmin && (
            <div className="space-y-6">
              <Card variant="glass" className="p-6">
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🔧</span>
                    <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                      {t('settings.diagnostics')}
                    </p>
                  </div>
                  <p className="text-sm text-[rgb(150,150,170)]">{t('settings.diagnosticsDesc')}</p>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 mb-5">
                  <Button size="sm" variant="secondary" onClick={() => refreshHealth()}>
                    {t('settings.recheckBackend')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { loadLogTail(); setShowLogs(true); }}>
                    {t('settings.refreshLogs')}
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleCopyDiagnostics}>
                    {t('settings.copyDiagnostics')}
                  </Button>
                </div>

                {copiedDiagnostics && (
                  <div className="flex items-center gap-2 mb-4 p-2 bg-[rgb(0,255,136)]/10 border border-[rgb(0,255,136)]/30">
                    <span className="w-1.5 h-1.5 bg-[rgb(0,255,136)] rounded-full" />
                    <span className="text-xs text-[rgb(0,255,136)]">{t('settings.copied')}</span>
                  </div>
                )}

                {copyError && (
                  <p className="text-xs text-rose-400 mb-4">{copyError}</p>
                )}

                {/* Backend Boot Error */}
                {backendBootError && (
                  <div className="space-y-3 p-4 border border-rose-500/30 bg-rose-500/5 mb-5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                      <p className="text-xs uppercase tracking-[0.2em] text-rose-400">
                        Backend Error
                      </p>
                    </div>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-rose-500/20 bg-[rgb(10,10,25)] p-3 text-[11px] text-rose-200 font-mono">
                      {backendBootError}
                    </pre>
                    <Button size="sm" variant="secondary" onClick={() => handleCopy(backendBootError)}>
                      Copy Error
                    </Button>
                  </div>
                )}

                {/* Log Tail (Collapsible) */}
                <div className="space-y-3">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="flex items-center gap-2 text-left w-full"
                  >
                    <span className={`text-[rgb(0,255,255)]/50 transition-transform ${showLogs ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[rgb(0,255,255)]/50">
                      System Logs
                    </p>
                  </button>

                  {showLogs && (
                    <>
                      {logTailError ? (
                        <p className="text-xs text-rose-400">{logTailError}</p>
                      ) : (
                        <pre className="max-h-48 overflow-auto border border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)] p-4 text-[10px] text-[rgb(200,200,210)] font-mono">
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
    </AppLayout>
  );
}
