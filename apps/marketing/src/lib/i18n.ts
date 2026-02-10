import type enDictionary from "../dictionaries/en.json";

export const supportedLocales = ["en"] as const;

export type SupportedLocale = "en";

export function isSupportedLocale(value: string): value is SupportedLocale {
  return value === "en";
}

export function normalizeLocale(_value: string): SupportedLocale {
  return "en";
}

export type Dictionary = typeof enDictionary;
