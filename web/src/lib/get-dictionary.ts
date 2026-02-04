import 'server-only';

import type { Dictionary, SupportedLocale } from "./i18n";

const dictionaries: Record<SupportedLocale, () => Promise<Dictionary>> = {
    en: () => import('../dictionaries/en.json').then((module) => module.default),
    it: () => import('../dictionaries/it.json').then((module) => module.default),
    fr: () => import('../dictionaries/fr.json').then((module) => module.default),
    de: () => import('../dictionaries/de.json').then((module) => module.default),
};

export const getDictionary = async (locale: SupportedLocale): Promise<Dictionary> => dictionaries[locale]();
