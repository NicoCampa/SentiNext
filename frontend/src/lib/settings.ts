export type LlmProvider = "ollama" | "openai";

export interface LlmSettings {
  provider: LlmProvider;
  openaiApiKey: string;
  openaiModel: string;
  ollamaHost: string;
  ollamaModel: string;
}

export interface LlmRequestConfig {
  llm_provider: LlmProvider;
  llm_model: string;
  openai_api_key?: string | null;
  ollama_host?: string | null;
}

const STORAGE_KEY = "sentinext_settings_v1";
let cachedOpenAiKey: string | null = null;
let openAiKeyPromise: Promise<string> | null = null;

const DEFAULT_SETTINGS: LlmSettings = {
  provider: "ollama",
  openaiApiKey: "",
  openaiModel: "gpt-5-mini",
  ollamaHost: "",
  ollamaModel: "gpt-oss:20b-cloud",
};

function sanitizeProvider(value: unknown): LlmProvider {
  return value === "openai" ? "openai" : "ollama";
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeSettings(raw: Partial<LlmSettings> | null): LlmSettings {
  const provider = sanitizeProvider(raw?.provider);
  return {
    provider,
    openaiApiKey: normalizeText(raw?.openaiApiKey),
    openaiModel: normalizeText(raw?.openaiModel) || DEFAULT_SETTINGS.openaiModel,
    ollamaHost: normalizeText(raw?.ollamaHost),
    ollamaModel: normalizeText(raw?.ollamaModel) || DEFAULT_SETTINGS.ollamaModel,
  };
}

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<T>(command, args);
}

export function getDefaultSettings(): LlmSettings {
  return { ...DEFAULT_SETTINGS };
}

export function loadSettings(): LlmSettings {
  if (typeof window === "undefined") {
    return getDefaultSettings();
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefaultSettings();
    return normalizeSettings(JSON.parse(stored));
  } catch (err) {
    console.warn("Failed to load settings, using defaults.", err);
    return getDefaultSettings();
  }
}

export async function loadOpenAiKey(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (!isTauriApp()) {
    return normalizeText(loadSettings().openaiApiKey);
  }
  if (cachedOpenAiKey !== null) return cachedOpenAiKey;
  if (openAiKeyPromise) return openAiKeyPromise;
  openAiKeyPromise = (async () => {
    try {
      const value = await invokeTauri<string | null>("get_openai_api_key");
      cachedOpenAiKey = normalizeText(value);
    } catch (err) {
      console.warn("Failed to load OpenAI key from keychain.", err);
      cachedOpenAiKey = "";
    } finally {
      openAiKeyPromise = null;
    }
    return cachedOpenAiKey ?? "";
  })();
  return openAiKeyPromise;
}

export async function saveOpenAiKey(value: string): Promise<void> {
  const normalized = normalizeText(value);
  cachedOpenAiKey = normalized;
  if (!isTauriApp()) return;
  if (normalized) {
    await invokeTauri("set_openai_api_key", { apiKey: normalized });
  } else {
    await invokeTauri("clear_openai_api_key");
  }
}

export async function loadSettingsWithSecrets(): Promise<LlmSettings> {
  const base = loadSettings();
  if (!isTauriApp()) return base;
  const openaiApiKey = await loadOpenAiKey();
  return { ...base, openaiApiKey };
}

export async function saveSettings(settings: LlmSettings): Promise<void> {
  if (typeof window === "undefined") return;
  const normalized = normalizeSettings(settings);
  if (isTauriApp()) {
    const { openaiApiKey, ...rest } = normalized;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, openaiApiKey: "" }));
    await saveOpenAiKey(openaiApiKey);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
}

export async function buildLlmRequestConfig(overrides: Partial<LlmRequestConfig> = {}): Promise<LlmRequestConfig> {
  const settings = loadSettings();
  const provider = sanitizeProvider(overrides.llm_provider ?? settings.provider);
  const llmModel =
    normalizeText(overrides.llm_model) ||
    (provider === "openai" ? settings.openaiModel : settings.ollamaModel);
  let openaiKey = "";
  if (provider === "openai") {
    if (typeof overrides.openai_api_key !== "undefined") {
      openaiKey = normalizeText(overrides.openai_api_key);
    } else {
      openaiKey = normalizeText(await loadOpenAiKey()) || normalizeText(settings.openaiApiKey);
    }
  }
  const ollamaHost =
    provider === "ollama"
      ? normalizeText(overrides.ollama_host ?? settings.ollamaHost)
      : "";

  return {
    llm_provider: provider,
    llm_model: llmModel || (provider === "openai" ? DEFAULT_SETTINGS.openaiModel : DEFAULT_SETTINGS.ollamaModel),
    openai_api_key: openaiKey || null,
    ollama_host: ollamaHost || null,
  };
}
