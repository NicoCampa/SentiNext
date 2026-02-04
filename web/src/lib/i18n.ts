import type enDictionary from "../dictionaries/en.json";

export const supportedLocales = ["en", "it", "fr", "de"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (supportedLocales as readonly string[]).includes(value);
}

export function normalizeLocale(value: string): SupportedLocale {
  return isSupportedLocale(value) ? value : "en";
}

export type Dictionary = typeof enDictionary;
