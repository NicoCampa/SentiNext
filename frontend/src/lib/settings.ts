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

export function saveSettings(settings: LlmSettings): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeSettings(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function buildLlmRequestConfig(overrides: Partial<LlmRequestConfig> = {}): LlmRequestConfig {
  const settings = loadSettings();
  const provider = sanitizeProvider(overrides.llm_provider ?? settings.provider);
  const llmModel =
    normalizeText(overrides.llm_model) ||
    (provider === "openai" ? settings.openaiModel : settings.ollamaModel);
  const openaiKey =
    provider === "openai"
      ? normalizeText(overrides.openai_api_key ?? settings.openaiApiKey)
      : "";
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
