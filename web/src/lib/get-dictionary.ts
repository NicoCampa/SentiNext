import 'server-only';

const dictionaries = {
    en: () => import('../dictionaries/en.json').then((module) => module.default),
    it: () => import('../dictionaries/it.json').then((module) => module.default),
    fr: () => import('../dictionaries/fr.json').then((module) => module.default),
    de: () => import('../dictionaries/de.json').then((module) => module.default),
};

export const getDictionary = async (locale: 'en' | 'it' | 'fr' | 'de') =>
    dictionaries[locale]();
