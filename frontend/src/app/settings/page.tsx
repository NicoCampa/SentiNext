'use client';

import { useCallback, useEffect, useState } from "react";
import { SignedIn, UserButton } from "@clerk/nextjs";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchLogTail, fetchStoragePaths } from "@/lib/api";
import {
  LlmSettings,
  getDefaultSettings,
  loadSettings,
  loadSettingsWithSecrets,
  saveSettings,
  isTauriApp,
} from "@/lib/settings";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import type { StoragePaths } from "@/types";

export default function SettingsPage() {
  const [form, setForm] = useState<LlmSettings>(() => getDefaultSettings());
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storagePaths, setStoragePaths] = useState<StoragePaths | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const { health, refresh: refreshHealth } = useBackendHealth();
  const [logTail, setLogTail] = useState<string>("");
  const [logTailError, setLogTailError] = useState<string | null>(null);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  const backendBootError =
    typeof window !== "undefined" ? window.__SENTINEXT_BACKEND_BOOT_ERROR__ ?? null : null;
  const backendBootLogFile =
    typeof window !== "undefined" ? window.__SENTINEXT_BACKEND_LOG_FILE__ ?? null : null;

  useEffect(() => {
    let active = true;
    async function load() {
      const base = loadSettings();
      if (isTauriApp()) {
        const withSecrets = await loadSettingsWithSecrets();
        if (active) setForm(withSecrets);
      } else {
        setForm(base);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    let active = true;
    fetchStoragePaths()
      .then((paths) => {
        if (active) {
          setStoragePaths(paths);
          setStorageError(null);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch storage paths", err);
        if (active) setStorageError("Failed to load storage paths.");
      });
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

  async function handleCopy(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyError(null);
    } catch (err) {
      console.error("Failed to copy value", err);
      setCopyError("Copy failed. Please copy manually.");
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
        storage: storagePaths,
        log_file: storagePaths?.log_file ?? null,
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

  async function handleSave() {
    setError(null);
    try {
      if (form.provider === "openai" && !form.openaiApiKey.trim()) {
        setError("Add an OpenAI key to use this provider.");
        return;
      }
      await saveSettings(form);
      setSaved(true);
    } catch (err) {
      console.error("Failed to save settings", err);
      setError("Failed to save settings.");
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-8 sm:space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="text-sm text-slate-400">
              Configure your LLM provider and API credentials (stored locally on this device).
            </p>
            {isTauriApp() ? (
              <p className="text-xs text-slate-500">OpenAI keys are stored in the OS keychain.</p>
            ) : null}
          </div>
          {isTauriApp() ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">App version</p>
              <p className="mt-1 font-mono text-xs text-slate-200">{appVersion ?? "Loading..."}</p>
            </div>
          ) : null}
        </div>

        <SignedIn>
          <Card variant="glass" className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Account</p>
              <p className="mt-2 text-sm text-slate-300">Manage your session and sign out.</p>
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
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">LLM Provider</p>
            <p className="mt-2 text-sm text-slate-300">Applies to analysis and chat.</p>
          </div>
          <select
            value={form.provider}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, provider: event.target.value as LlmSettings["provider"] }))
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="ollama">Ollama (local)</option>
            <option value="openai">OpenAI</option>
          </select>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card variant="glass" className="space-y-4 p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">OpenAI</p>
              <p className="mt-2 text-sm text-slate-300">Used when provider is set to OpenAI.</p>
            </div>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">API key</span>
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={form.openaiApiKey}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, openaiApiKey: event.target.value }))
                  }
                  placeholder="sk-..."
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-300 hover:border-sky-500/50 hover:text-white"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            {form.provider === "openai" && !form.openaiApiKey.trim() ? (
              <p className="text-xs text-rose-400">Add an OpenAI key to use this provider.</p>
            ) : null}
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Model</span>
              <input
                type="text"
                value={form.openaiModel}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, openaiModel: event.target.value }))
                }
                placeholder="gpt-5-mini"
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
          </Card>

          <Card variant="glass" className="space-y-4 p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Ollama</p>
              <p className="mt-2 text-sm text-slate-300">Used when provider is set to Ollama.</p>
            </div>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Host (optional)</span>
              <input
                type="text"
                value={form.ollamaHost}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ollamaHost: event.target.value }))
                }
                placeholder="http://127.0.0.1:11434"
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Model</span>
              <input
                type="text"
                value={form.ollamaModel}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ollamaModel: event.target.value }))
                }
                placeholder="gpt-oss:20b-cloud"
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} variant="primary">
            Save settings
          </Button>
          {saved ? <span className="text-sm text-emerald-400">Saved.</span> : null}
          {error ? <span className="text-sm text-rose-400">{error}</span> : null}
        </div>

        <Card variant="glass" className="space-y-3 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Local Data</p>
            <p className="mt-2 text-sm text-slate-300">Stored on this device only.</p>
          </div>
          {storageError ? <p className="text-xs text-rose-400">{storageError}</p> : null}
          {copyError ? <p className="text-xs text-rose-400">{copyError}</p> : null}
          {backendBootLogFile ? (
            <div className="space-y-1 text-xs text-slate-300">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Backend boot log</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all rounded-lg bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-200">
                  {backendBootLogFile}
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleCopy(backendBootLogFile)}>
                  Copy
                </Button>
              </div>
            </div>
          ) : null}
          {!storageError ? (
            <div className="space-y-3 text-xs text-slate-300">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Database</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all rounded-lg bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-200">
                    {storagePaths?.db_path || "Loading..."}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(storagePaths?.db_path || "")}
                    disabled={!storagePaths?.db_path}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Logs</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all rounded-lg bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-200">
                    {storagePaths?.log_file || "Loading..."}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(storagePaths?.log_file || "")}
                    disabled={!storagePaths?.log_file}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Card>

        <Card variant="glass" className="space-y-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Diagnostics</p>
            <p className="mt-2 text-sm text-slate-300">Use this when the backend is slow or unresponsive.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => refreshHealth()}>
              Recheck backend
            </Button>
            <Button size="sm" variant="secondary" onClick={() => loadLogTail()}>
              Refresh logs
            </Button>
            <Button size="sm" variant="primary" onClick={handleCopyDiagnostics}>
              Copy diagnostics
            </Button>
            {copiedDiagnostics ? <span className="text-sm text-emerald-400">Copied.</span> : null}
          </div>

          <div className="text-xs text-slate-400">
            Backend status:{" "}
            <span className="text-slate-200">
              {health.state === "online" ? "online" : health.state === "offline" ? "offline" : "checking"}
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
