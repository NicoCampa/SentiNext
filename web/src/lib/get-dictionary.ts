import 'server-only';

import type { Dictionary, SupportedLocale } from "./i18n";

const loadEnglish = () => import('../dictionaries/en.json').then((module) => module.default);

export const getDictionary = async (_locale: SupportedLocale): Promise<Dictionary> => loadEnglish();
