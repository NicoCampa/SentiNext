'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'it' | 'fr' | 'de';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.dashboard': 'Dashboard',
    'nav.chat': 'Chat',
    'nav.compare': 'Compare',
    'nav.database': 'Database',
    'nav.settings': 'Settings',
    
    // Common
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.sort': 'Sort',
    'common.reset': 'Reset',
    
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.analyze': 'Analyze Games',
    'dashboard.noGames': 'No games analyzed yet',
    'dashboard.recommendation': 'Recommendation Rate',
    
    // Chat
    'chat.title': 'AI Assistant',
    'chat.placeholder': 'Type your message...',
    'chat.send': 'Send',
    'chat.newChat': 'New Chat',
    'chat.history': 'Chat History',
    'chat.context': 'Context',
    
    // Compare
    'compare.title': 'Game Comparison',
    'compare.selectGames': 'Select at least 2 games',
    'compare.categoryOverview': 'Category Overview',
    'compare.categoryRecommendation': 'Category recommendation',
    'compare.sortBy': 'Sort by:',
    'compare.biggestDiff': 'Biggest Difference',
    'compare.highestRating': 'Highest Rating',
    'compare.lowestRating': 'Lowest Rating',
    'compare.mostReviews': 'Most Reviews',
    'compare.onlySignificant': 'Only show significant differences (>10%)',
    'compare.resetFilters': 'Reset filters',
    'compare.sampleReviews': 'Sample Reviews',
    'compare.exampleReviews': 'Example reviews from each game for this subcategory',
    
    // Settings
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.selectLanguage': 'Select your preferred language',
    'settings.appearance': 'Appearance',
    'settings.notifications': 'Notifications',
    'settings.account': 'Account',
    
    // Languages
    'lang.en': 'English',
    'lang.it': 'Italian',
    'lang.fr': 'French',
    'lang.de': 'German',
  },
  it: {
    // Navigation
    'nav.home': 'Home',
    'nav.dashboard': 'Cruscotto',
    'nav.chat': 'Chat',
    'nav.compare': 'Confronta',
    'nav.database': 'Database',
    'nav.settings': 'Impostazioni',
    
    // Common
    'common.loading': 'Caricamento...',
    'common.error': 'Errore',
    'common.success': 'Successo',
    'common.cancel': 'Annulla',
    'common.save': 'Salva',
    'common.delete': 'Elimina',
    'common.edit': 'Modifica',
    'common.close': 'Chiudi',
    'common.search': 'Cerca',
    'common.filter': 'Filtra',
    'common.sort': 'Ordina',
    'common.reset': 'Reimposta',
    
    // Dashboard
    'dashboard.title': 'Cruscotto',
    'dashboard.analyze': 'Analizza Giochi',
    'dashboard.noGames': 'Nessun gioco analizzato',
    'dashboard.recommendation': 'Tasso di Raccomandazione',
    
    // Chat
    'chat.title': 'Assistente AI',
    'chat.placeholder': 'Scrivi il tuo messaggio...',
    'chat.send': 'Invia',
    'chat.newChat': 'Nuova Chat',
    'chat.history': 'Cronologia Chat',
    'chat.context': 'Contesto',
    
    // Compare
    'compare.title': 'Confronto Giochi',
    'compare.selectGames': 'Seleziona almeno 2 giochi',
    'compare.categoryOverview': 'Panoramica Categorie',
    'compare.categoryRecommendation': 'Raccomandazione per categoria',
    'compare.sortBy': 'Ordina per:',
    'compare.biggestDiff': 'Differenza Maggiore',
    'compare.highestRating': 'Valutazione Più Alta',
    'compare.lowestRating': 'Valutazione Più Bassa',
    'compare.mostReviews': 'Più Recensioni',
    'compare.onlySignificant': 'Mostra solo differenze significative (>10%)',
    'compare.resetFilters': 'Reimposta filtri',
    'compare.sampleReviews': 'Recensioni di Esempio',
    'compare.exampleReviews': 'Esempi di recensioni da ogni gioco per questa sottocategoria',
    
    // Settings
    'settings.title': 'Impostazioni',
    'settings.language': 'Lingua',
    'settings.selectLanguage': 'Seleziona la tua lingua preferita',
    'settings.appearance': 'Aspetto',
    'settings.notifications': 'Notifiche',
    'settings.account': 'Account',
    
    // Languages
    'lang.en': 'Inglese',
    'lang.it': 'Italiano',
    'lang.fr': 'Francese',
    'lang.de': 'Tedesco',
  },
  fr: {
    // Navigation
    'nav.home': 'Accueil',
    'nav.dashboard': 'Tableau de bord',
    'nav.chat': 'Chat',
    'nav.compare': 'Comparer',
    'nav.database': 'Base de données',
    'nav.settings': 'Paramètres',
    
    // Common
    'common.loading': 'Chargement...',
    'common.error': 'Erreur',
    'common.success': 'Succès',
    'common.cancel': 'Annuler',
    'common.save': 'Enregistrer',
    'common.delete': 'Supprimer',
    'common.edit': 'Modifier',
    'common.close': 'Fermer',
    'common.search': 'Rechercher',
    'common.filter': 'Filtrer',
    'common.sort': 'Trier',
    'common.reset': 'Réinitialiser',
    
    // Dashboard
    'dashboard.title': 'Tableau de bord',
    'dashboard.analyze': 'Analyser les jeux',
    'dashboard.noGames': 'Aucun jeu analysé',
    'dashboard.recommendation': 'Taux de recommandation',
    
    // Chat
    'chat.title': 'Assistant IA',
    'chat.placeholder': 'Tapez votre message...',
    'chat.send': 'Envoyer',
    'chat.newChat': 'Nouveau Chat',
    'chat.history': 'Historique des chats',
    'chat.context': 'Contexte',
    
    // Compare
    'compare.title': 'Comparaison de jeux',
    'compare.selectGames': 'Sélectionnez au moins 2 jeux',
    'compare.categoryOverview': 'Aperçu des catégories',
    'compare.categoryRecommendation': 'Recommandation par catégorie',
    'compare.sortBy': 'Trier par:',
    'compare.biggestDiff': 'Plus grande différence',
    'compare.highestRating': 'Note la plus élevée',
    'compare.lowestRating': 'Note la plus basse',
    'compare.mostReviews': 'Plus d\'avis',
    'compare.onlySignificant': 'Afficher uniquement les différences significatives (>10%)',
    'compare.resetFilters': 'Réinitialiser les filtres',
    'compare.sampleReviews': 'Exemples d\'avis',
    'compare.exampleReviews': 'Exemples d\'avis de chaque jeu pour cette sous-catégorie',
    
    // Settings
    'settings.title': 'Paramètres',
    'settings.language': 'Langue',
    'settings.selectLanguage': 'Sélectionnez votre langue préférée',
    'settings.appearance': 'Apparence',
    'settings.notifications': 'Notifications',
    'settings.account': 'Compte',
    
    // Languages
    'lang.en': 'Anglais',
    'lang.it': 'Italien',
    'lang.fr': 'Français',
    'lang.de': 'Allemand',
  },
  de: {
    // Navigation
    'nav.home': 'Startseite',
    'nav.dashboard': 'Dashboard',
    'nav.chat': 'Chat',
    'nav.compare': 'Vergleichen',
    'nav.database': 'Datenbank',
    'nav.settings': 'Einstellungen',
    
    // Common
    'common.loading': 'Laden...',
    'common.error': 'Fehler',
    'common.success': 'Erfolg',
    'common.cancel': 'Abbrechen',
    'common.save': 'Speichern',
    'common.delete': 'Löschen',
    'common.edit': 'Bearbeiten',
    'common.close': 'Schließen',
    'common.search': 'Suchen',
    'common.filter': 'Filtern',
    'common.sort': 'Sortieren',
    'common.reset': 'Zurücksetzen',
    
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.analyze': 'Spiele analysieren',
    'dashboard.noGames': 'Noch keine Spiele analysiert',
    'dashboard.recommendation': 'Empfehlungsrate',
    
    // Chat
    'chat.title': 'KI-Assistent',
    'chat.placeholder': 'Geben Sie Ihre Nachricht ein...',
    'chat.send': 'Senden',
    'chat.newChat': 'Neuer Chat',
    'chat.history': 'Chat-Verlauf',
    'chat.context': 'Kontext',
    
    // Compare
    'compare.title': 'Spielevergleich',
    'compare.selectGames': 'Wählen Sie mindestens 2 Spiele',
    'compare.categoryOverview': 'Kategorieübersicht',
    'compare.categoryRecommendation': 'Kategorieempfehlung',
    'compare.sortBy': 'Sortieren nach:',
    'compare.biggestDiff': 'Größter Unterschied',
    'compare.highestRating': 'Höchste Bewertung',
    'compare.lowestRating': 'Niedrigste Bewertung',
    'compare.mostReviews': 'Meiste Bewertungen',
    'compare.onlySignificant': 'Nur signifikante Unterschiede anzeigen (>10%)',
    'compare.resetFilters': 'Filter zurücksetzen',
    'compare.sampleReviews': 'Beispielbewertungen',
    'compare.exampleReviews': 'Beispielbewertungen von jedem Spiel für diese Unterkategorie',
    
    // Settings
    'settings.title': 'Einstellungen',
    'settings.language': 'Sprache',
    'settings.selectLanguage': 'Wählen Sie Ihre bevorzugte Sprache',
    'settings.appearance': 'Erscheinungsbild',
    'settings.notifications': 'Benachrichtigungen',
    'settings.account': 'Konto',
    
    // Languages
    'lang.en': 'Englisch',
    'lang.it': 'Italienisch',
    'lang.fr': 'Französisch',
    'lang.de': 'Deutsch',
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    // Load language from localStorage
    const saved = localStorage.getItem('senti-next-language') as Language;
    if (saved && ['en', 'it', 'fr', 'de'].includes(saved)) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('senti-next-language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
