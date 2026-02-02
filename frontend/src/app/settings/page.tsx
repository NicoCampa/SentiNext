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
      <div className="mx-auto max-w-4xl space-y-8 sm:space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                {t('settings.title')}
              </span>
            </h1>
            <p className="text-sm text-slate-400">
              {t('settings.subtitle')}
            </p>
          </div>
          {isTauriApp() ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{t('settings.appVersion')}</p>
              <p className="mt-1 font-mono text-xs text-slate-200">{appVersion ?? t('common.loading')}</p>
            </div>
          ) : null}
        </div>

        <SignedIn>
          <Card variant="glass" className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t('settings.account')}</p>
              <p className="mt-2 text-sm text-slate-300">{t('settings.accountDesc')}</p>
            </div>
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "h-10 w-10",
                },
              }}
            />
          </Card>
        </SignedIn>

        <Card variant="glass" className="space-y-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t('settings.language')}</p>
            <p className="mt-2 text-sm text-slate-300">{t('settings.selectLanguage')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['en', 'it', 'fr', 'de'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`rounded-xl border p-4 text-left transition ${
                  language === lang
                    ? 'border-sky-500 bg-sky-500/10'
                    : 'border-white/10 bg-slate-900/30 hover:border-slate-600'
                }`}
              >
                <p className="text-sm font-semibold text-white">{t(`lang.${lang}`)}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card variant="glass" className="space-y-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t('settings.diagnostics')}</p>
            <p className="mt-2 text-sm text-slate-300">{t('settings.diagnosticsDesc')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => refreshHealth()}>
              {t('settings.recheckBackend')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => loadLogTail()}>
              {t('settings.refreshLogs')}
            </Button>
            <Button size="sm" variant="primary" onClick={handleCopyDiagnostics}>
              {t('settings.copyDiagnostics')}
            </Button>
            {copiedDiagnostics ? <span className="text-sm text-emerald-400">{t('settings.copied')}</span> : null}
          </div>
          {copyError ? (
            <p className="text-xs text-rose-400">{copyError}</p>
          ) : null}

          <div className="text-xs text-slate-400">
            {t('settings.backendStatus')}{" "}
            <span className="text-slate-200">
              {health.state === "online" ? t('settings.online') : health.state === "offline" ? t('settings.offline') : t('settings.checking')}
            </span>
          </div>

          {backendBootError ? (
            <div className="space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
              <p className="font-semibold">Backend failed to start</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/40 p-3 text-[11px] text-rose-100">
                {backendBootError}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleCopy(backendBootError)}>
                  Copy error
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Log tail</p>
            {logTailError ? (
              <p className="text-xs text-rose-400">{logTailError}</p>
            ) : (
              <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3 text-[11px] text-slate-200">
                {logTail || "No logs yet."}
              </pre>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
