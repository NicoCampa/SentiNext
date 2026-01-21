'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  LlmSettings,
  getDefaultSettings,
  loadSettingsWithSecrets,
  saveSettings,
  isTauriApp,
} from "@/lib/settings";

const SETUP_KEY = "sentinext_setup_complete_v1";

export function FirstRunSetup() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<LlmSettings>(() => getDefaultSettings());

  useEffect(() => {
    if (!isTauriApp()) {
      setLoading(false);
      return;
    }
    const completed = window.localStorage.getItem(SETUP_KEY);
    if (completed) {
      setLoading(false);
      return;
    }
    let active = true;
    loadSettingsWithSecrets()
      .then((settings) => {
        if (active) setForm(settings);
      })
      .finally(() => {
        if (active) {
          setOpen(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    setError(null);
    if (form.provider === "openai" && !form.openaiApiKey.trim()) {
      setError("Add an OpenAI key to continue.");
      return;
    }
    try {
      await saveSettings(form);
      window.localStorage.setItem(SETUP_KEY, "true");
      setOpen(false);
    } catch (err) {
      console.error("Failed to save settings", err);
      setError("Failed to save settings.");
    }
  }

  async function handleSkip() {
    try {
      await saveSettings({ ...form, provider: "ollama" });
    } catch (err) {
      console.warn("Failed to persist defaults during setup skip.", err);
    } finally {
      window.localStorage.setItem(SETUP_KEY, "true");
      setOpen(false);
    }
  }

  if (loading || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-10 backdrop-blur">
      <Card variant="glass" className="w-full max-w-2xl space-y-6 p-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">Welcome to SentiNext</h2>
          <p className="text-sm text-slate-300">
            Choose your LLM provider and add your API key to get started.
          </p>
          <p className="text-xs text-slate-500">OpenAI keys are stored in the OS keychain.</p>
        </div>

        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">LLM Provider</span>
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
          </label>

          {form.provider === "openai" ? (
            <div className="space-y-3">
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">OpenAI API key</span>
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
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Ollama host</span>
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
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-rose-400">{error}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} variant="primary">
              Save & Continue
            </Button>
            <Button onClick={handleSkip} variant="secondary">
              Skip for now
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
