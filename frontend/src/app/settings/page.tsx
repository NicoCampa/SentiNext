'use client';

import { useCallback, useEffect, useState } from "react";
import { SignedIn, UserButton } from "@clerk/nextjs";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchLogTail } from "@/lib/api";
import { isTauriApp } from "@/lib/settings";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useLanguage } from "@/contexts/LanguageContext";

export default function SettingsPage() {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const { health, refresh: refreshHealth } = useBackendHealth();
  const [logTail, setLogTail] = useState<string>("");
  const [logTailError, setLogTailError] = useState<string | null>(null);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'general' | 'diagnostics'>('general');

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
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
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

        {/* Tab Navigation */}
        <div className="mb-6 flex gap-2 border-b border-[rgb(0,255,255)]/10 pb-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-xs uppercase tracking-[0.2em] transition-all ${
              activeTab === 'general'
                ? 'text-[rgb(0,255,255)] border-b-2 border-[rgb(0,255,255)]'
                : 'text-[rgb(150,150,170)] hover:text-[rgb(200,200,210)]'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2 text-xs uppercase tracking-[0.2em] transition-all relative ${
              activeTab === 'diagnostics'
                ? 'text-[rgb(0,255,255)] border-b-2 border-[rgb(0,255,255)]'
                : 'text-[rgb(150,150,170)] hover:text-[rgb(200,200,210)]'
            }`}
          >
            Diagnostics
            {health.state === "offline" && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'general' && (
            <>
              {/* Account Section */}
              <SignedIn>
                <Card variant="glass" className="p-6">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                        <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                          {t('settings.account')}
                        </p>
                      </div>
                      <p className="text-sm text-[rgb(150,150,170)]">{t('settings.accountDesc')}</p>
                    </div>
                    <UserButton
                      appearance={{
                        elements: {
                          userButtonAvatarBox: "h-12 w-12 border border-[rgb(0,255,255)]/30",
                        },
                      }}
                    />
                  </div>
                </Card>
              </SignedIn>

              {/* Language Section */}
              <Card variant="glass" className="p-6">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                    <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                      {t('settings.language')}
                    </p>
                  </div>
                  <p className="text-sm text-[rgb(150,150,170)]">{t('settings.selectLanguage')}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(['en', 'it', 'fr', 'de'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`group relative p-4 border transition-all ${
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
                      <p className={`text-sm font-semibold ${
                        language === lang ? 'text-[rgb(0,255,255)]' : 'text-[rgb(200,200,210)]'
                      }`}>
                        {t(`lang.${lang}`)}
                      </p>
                    </button>
                  ))}
                </div>
              </Card>

              {/* System Info */}
              {isTauriApp() && (
                <Card variant="glass" className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                    <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                      System Information
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10">
                      <span className="text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                        {t('settings.appVersion')}
                      </span>
                      <span className="font-mono text-xs text-[rgb(0,255,255)]">
                        {appVersion ?? t('common.loading')}
                      </span>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}

          {activeTab === 'diagnostics' && (
            <>
              {/* Backend Status */}
              <Card variant="glass" className="p-6">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                    <p className="text-xs uppercase tracking-[0.25em] text-[rgb(0,255,255)]/70">
                      {t('settings.diagnostics')}
                    </p>
                  </div>
                  <p className="text-sm text-[rgb(150,150,170)]">{t('settings.diagnosticsDesc')}</p>
                </div>

                {/* Status Display */}
                <div className="mb-6 p-4 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[rgb(150,150,170)] uppercase tracking-wider">
                      {t('settings.backendStatus')}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        health.state === "online"
                          ? 'bg-[rgb(0,255,136)] animate-pulse'
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
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mb-6">
                  <Button size="sm" variant="secondary" onClick={() => refreshHealth()}>
                    {t('settings.recheckBackend')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => loadLogTail()}>
                    {t('settings.refreshLogs')}
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleCopyDiagnostics}>
                    {t('settings.copyDiagnostics')}
                  </Button>
                  {copiedDiagnostics && (
                    <span className="flex items-center gap-1.5 text-xs text-[rgb(0,255,136)]">
                      <span className="w-1.5 h-1.5 bg-[rgb(0,255,136)] rounded-full" />
                      {t('settings.copied')}
                    </span>
                  )}
                </div>

                {copyError && (
                  <p className="text-xs text-rose-400 mb-4">{copyError}</p>
                )}

                {/* Backend Boot Error */}
                {backendBootError && (
                  <div className="space-y-3 p-4 border border-rose-500/30 bg-rose-500/5 mb-6">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                      <p className="text-xs uppercase tracking-[0.2em] text-rose-400">
                        Backend Failed to Start
                      </p>
                    </div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-rose-500/20 bg-[rgb(10,10,25)] p-3 text-[11px] text-rose-200 font-mono">
                      {backendBootError}
                    </pre>
                    <Button size="sm" variant="secondary" onClick={() => handleCopy(backendBootError)}>
                      Copy Error
                    </Button>
                  </div>
                )}

                {/* Log Tail */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[rgb(0,255,255)]/50">
                      Log Tail
                    </p>
                  </div>
                  {logTailError ? (
                    <p className="text-xs text-rose-400">{logTailError}</p>
                  ) : (
                    <pre className="max-h-64 overflow-auto border border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)] p-4 text-[11px] text-[rgb(200,200,210)] font-mono">
                      {logTail || "No logs yet."}
                    </pre>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
