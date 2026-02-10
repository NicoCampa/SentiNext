'use client';

import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { fetchLogTail, getProviders, getLlmSettings, updateLlmSettings, getApiKeyStatus, updateApiKey } from "@/lib/api";
import type { LlmProvider } from "@/lib/api";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOnboarding } from "@/contexts/OnboardingContext";

const API_KEY_PROVIDERS = [
  { name: "gemini", label: "Gemini", placeholder: "AIza..." },
  { name: "xai", label: "xAI (Grok)", placeholder: "xai-..." },
  { name: "openai", label: "OpenAI", placeholder: "sk-..." },
] as const;

export default function SettingsPage() {
  const { health, refresh: refreshHealth } = useBackendHealth();
  const [logTail, setLogTail] = useState<string>("");
  const [logTailError, setLogTailError] = useState<string | null>(null);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { t } = useLanguage();
  const [showLogs, setShowLogs] = useState(false);
  const { resetOnboarding } = useOnboarding();

  // LLM settings state
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [currentProvider, setCurrentProvider] = useState("");
  const [currentModel, setCurrentModel] = useState("");
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmSuccess, setLlmSuccess] = useState(false);

  // API key state
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [apiKeySaving, setApiKeySaving] = useState<string | null>(null);
  const [apiKeySuccess, setApiKeySuccess] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const loadAllSettings = useCallback(async () => {
    setLlmLoading(true);
    setLlmError(null);
    try {
      const [providersRes, settingsRes, keyStatus] = await Promise.all([
        getProviders(),
        getLlmSettings(),
        getApiKeyStatus(),
      ]);
      setProviders(providersRes.providers);
      setCurrentProvider(settingsRes.provider);
      setCurrentModel(settingsRes.model);
      setSelectedProvider(settingsRes.provider);
      setModelInput(settingsRes.model);
      setApiKeyStatus(keyStatus.keys);
    } catch (err) {
      console.error("Failed to load settings", err);
      setLlmError("Failed to load settings. Is the backend running?");
    } finally {
      setLlmLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllSettings();
  }, [loadAllSettings]);

  const handleProviderChange = useCallback((providerName: string) => {
    setSelectedProvider(providerName);
    const provider = providers.find(p => p.name === providerName);
    if (provider && provider.suggested_models.length > 0) {
      setModelInput(provider.suggested_models[0]);
    }
  }, [providers]);

  const handleSaveLlm = useCallback(async () => {
    setLlmSaving(true);
    setLlmError(null);
    setLlmSuccess(false);
    try {
      const result = await updateLlmSettings(selectedProvider, modelInput);
      setCurrentProvider(result.provider);
      setCurrentModel(result.model);
      setLlmSuccess(true);
      setTimeout(() => setLlmSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save LLM settings", err);
      setLlmError(err instanceof Error ? err.message : "Failed to save LLM settings.");
    } finally {
      setLlmSaving(false);
    }
  }, [selectedProvider, modelInput]);

  const handleSaveApiKey = useCallback(async (provider: string) => {
    const key = apiKeyInputs[provider] || "";
    setApiKeySaving(provider);
    setApiKeyError(null);
    setApiKeySuccess(null);
    try {
      const result = await updateApiKey(provider, key);
      setApiKeyStatus(result.keys);
      setApiKeyInputs(prev => ({ ...prev, [provider]: "" }));
      setApiKeySuccess(provider);
      setTimeout(() => setApiKeySuccess(null), 3000);
      const providersRes = await getProviders();
      setProviders(providersRes.providers);
    } catch (err) {
      console.error(`Failed to save API key for ${provider}`, err);
      setApiKeyError(err instanceof Error ? err.message : `Failed to save API key for ${provider}.`);
    } finally {
      setApiKeySaving(null);
    }
  }, [apiKeyInputs]);

  const handleRemoveApiKey = useCallback(async (provider: string) => {
    setApiKeySaving(provider);
    setApiKeyError(null);
    try {
      const result = await updateApiKey(provider, "");
      setApiKeyStatus(result.keys);
      const providersRes = await getProviders();
      setProviders(providersRes.providers);
    } catch (err) {
      console.error(`Failed to remove API key for ${provider}`, err);
      setApiKeyError(err instanceof Error ? err.message : `Failed to remove API key.`);
    } finally {
      setApiKeySaving(null);
    }
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

  const availableProviders = providers.filter(p => p.available);
  const selectedProviderObj = providers.find(p => p.name === selectedProvider);
  const hasChanges = selectedProvider !== currentProvider || modelInput !== currentModel;

  return (
    <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">{t('settings.title')}</h1>
            <p className="text-sm text-slate-400">System configuration and diagnostics</p>
          </div>

          {/* System Status Bar */}
          <Card variant="glass" className="overflow-hidden p-0">
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_80%_0%,rgba(14,165,233,0.15),transparent_60%)]" />
              <div className="relative flex flex-wrap items-center gap-4 p-4 sm:gap-6 sm:p-5">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    health.state === "online"
                      ? 'bg-emerald-400'
                      : health.state === "offline"
                      ? 'bg-rose-500'
                      : 'bg-amber-500 animate-pulse'
                  }`} />
                  <span className="text-xs uppercase tracking-wider text-slate-400">Backend</span>
                  <span className={`text-xs font-medium ${
                    health.state === "online"
                      ? 'text-emerald-300'
                      : health.state === "offline"
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}>
                    {health.state === "online" ? t('settings.online') : health.state === "offline" ? t('settings.offline') : t('settings.checking')}
                  </span>
                </div>

                {currentProvider && (
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    <span className="text-xs uppercase tracking-wider text-slate-400">Active LLM</span>
                    <span className="text-xs font-mono text-sky-300">{currentProvider} / {currentModel}</span>
                  </div>
                )}

                <div className="ml-auto">
                  <Button size="sm" variant="secondary" onClick={() => refreshHealth()} className="text-xs">
                    {t('settings.recheckBackend')}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* API Keys */}
            <Card variant="glass" className="p-5">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">API Keys</p>
                <p className="mt-1.5 text-sm text-slate-400">Add API keys to enable LLM providers</p>
              </div>

              <div className="space-y-3">
                {API_KEY_PROVIDERS.map(({ name, label, placeholder }) => {
                  const hasKey = apiKeyStatus[name] ?? false;
                  const isSaving = apiKeySaving === name;
                  const isSuccess = apiKeySuccess === name;
                  return (
                    <div key={name} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-200">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${hasKey ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          <span className={`text-[10px] uppercase tracking-wider ${hasKey ? 'text-emerald-300' : 'text-slate-500'}`}>
                            {hasKey ? 'Configured' : 'Not set'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={apiKeyInputs[name] || ""}
                          onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [name]: e.target.value }))}
                          placeholder={hasKey ? "Enter new key to replace" : placeholder}
                          className="flex-1 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none transition-colors"
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleSaveApiKey(name)}
                          disabled={isSaving || !(apiKeyInputs[name] || "").trim()}
                          className="text-xs"
                        >
                          {isSaving ? '...' : 'Save'}
                        </Button>
                        {hasKey && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRemoveApiKey(name)}
                            disabled={isSaving}
                            className="text-xs text-rose-400 hover:text-rose-300"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      {isSuccess && (
                        <p className="mt-1.5 text-[10px] text-emerald-300">API key saved</p>
                      )}
                    </div>
                  );
                })}
                {apiKeyError && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2">
                    <p className="text-xs text-rose-400">{apiKeyError}</p>
                  </div>
                )}
                <p className="text-[10px] text-slate-500">
                  Ollama does not require an API key. Keys are stored locally on your server.
                </p>
              </div>
            </Card>

            {/* LLM Provider Selection */}
            <Card variant="glass" className="p-5">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">LLM Provider</p>
                <p className="mt-1.5 text-sm text-slate-400">Configure which AI model powers review classification</p>
              </div>

              {llmLoading ? (
                <div className="space-y-3">
                  <div className="h-10 animate-pulse rounded-lg bg-white/5" />
                  <div className="h-10 animate-pulse rounded-lg bg-white/5" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                </div>
              ) : llmError && providers.length === 0 ? (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                  <p className="text-sm text-rose-400">{llmError}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Provider Selection */}
                  <div>
                    <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-slate-500">
                      Provider
                    </label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/50 p-2.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none transition-colors"
                    >
                      <option value="" disabled>Select a provider...</option>
                      {providers.map((p) => (
                        <option key={p.name} value={p.name} disabled={!p.available}>
                          {p.name}{!p.available ? ' (no API key)' : ''}
                        </option>
                      ))}
                    </select>
                    {availableProviders.length === 0 && providers.length > 0 && (
                      <p className="mt-1.5 text-xs text-amber-400">
                        No providers have API keys configured. Add an API key to get started.
                      </p>
                    )}
                  </div>

                  {/* Model Input */}
                  <div>
                    <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-slate-500">
                      Model
                    </label>
                    <input
                      type="text"
                      value={modelInput}
                      onChange={(e) => setModelInput(e.target.value)}
                      placeholder="e.g. gpt-4o-mini"
                      className="w-full rounded-lg border border-white/10 bg-slate-950/50 p-2.5 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none transition-colors"
                    />
                    {selectedProviderObj && selectedProviderObj.suggested_models.length > 1 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-500">Suggested:</span>
                        {selectedProviderObj.suggested_models.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setModelInput(m)}
                            className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 transition hover:border-sky-500/50 hover:text-sky-300"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {llmError && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2">
                      <p className="text-xs text-rose-400">{llmError}</p>
                    </div>
                  )}
                  {llmSuccess && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="text-xs text-emerald-300">Settings saved successfully</span>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleSaveLlm}
                    disabled={llmSaving || !selectedProvider || !modelInput || !hasChanges}
                    className="text-xs"
                  >
                    {llmSaving ? 'Saving...' : 'Save LLM Settings'}
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Diagnostics */}
          <Card variant="glass" className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('settings.diagnostics')}</p>
                <p className="mt-1.5 text-sm text-slate-400">{t('settings.diagnosticsDesc')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => { loadLogTail(); setShowLogs(true); }} className="text-xs">
                  {t('settings.refreshLogs')}
                </Button>
                <Button size="sm" variant="primary" onClick={handleCopyDiagnostics} className="text-xs">
                  {t('settings.copyDiagnostics')}
                </Button>
                <Button size="sm" variant="secondary" onClick={resetOnboarding} className="text-xs">
                  Test Onboarding
                </Button>
              </div>
            </div>

            {copiedDiagnostics && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-300">{t('settings.copied')}</span>
              </div>
            )}

            {copyError && (
              <p className="mb-4 text-xs text-rose-400">{copyError}</p>
            )}

            <div className="space-y-3">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex w-full items-center gap-2 text-left"
              >
                <svg className={`h-3 w-3 text-slate-500 transition-transform ${showLogs ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">System Logs</p>
              </button>

              {showLogs && (
                <>
                  {logTailError ? (
                    <p className="text-xs text-rose-400">{logTailError}</p>
                  ) : (
                    <pre className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs text-slate-300">
                      {logTail || "No logs yet."}
                    </pre>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
