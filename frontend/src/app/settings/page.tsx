'use client';

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LlmSettings,
  getDefaultSettings,
  loadSettings,
  saveSettings,
} from "@/lib/settings";

export default function SettingsPage() {
  const [form, setForm] = useState<LlmSettings>(() => getDefaultSettings());
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(loadSettings());
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  function handleSave() {
    setError(null);
    try {
      saveSettings(form);
      setSaved(true);
    } catch (err) {
      console.error("Failed to save settings", err);
      setError("Failed to save settings.");
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
          <p className="text-sm text-slate-400">
            Configure your LLM provider and API credentials (stored locally on this device).
          </p>
        </div>

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
      </div>
    </AppLayout>
  );
}
