'use client';

import { useState, useRef, useEffect } from 'react';

// Popular languages shown at the top
const POPULAR_LANGUAGES = [
  'english',
  'german',
  'french',
  'spanish',
  'russian',
  'schinese',
  'japanese',
  'portuguese',
  'brazilian',
];

// All available Steam languages
const ALL_LANGUAGES = [
  'english',
  'german',
  'french',
  'spanish',
  'italian',
  'polish',
  'portuguese',
  'brazilian',
  'russian',
  'turkish',
  'japanese',
  'koreana',
  'schinese',
  'tchinese',
  'thai',
  'czech',
  'danish',
  'dutch',
  'finnish',
  'greek',
  'hungarian',
  'norwegian',
  'romanian',
  'swedish',
  'ukrainian',
  'vietnamese',
  'arabic',
  'indonesian',
];

// Display names for languages
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  english: 'English',
  german: 'German',
  french: 'French',
  spanish: 'Spanish',
  italian: 'Italian',
  polish: 'Polish',
  portuguese: 'Portuguese',
  brazilian: 'Brazilian Portuguese',
  russian: 'Russian',
  turkish: 'Turkish',
  japanese: 'Japanese',
  koreana: 'Korean',
  schinese: 'Simplified Chinese',
  tchinese: 'Traditional Chinese',
  thai: 'Thai',
  czech: 'Czech',
  danish: 'Danish',
  dutch: 'Dutch',
  finnish: 'Finnish',
  greek: 'Greek',
  hungarian: 'Hungarian',
  norwegian: 'Norwegian',
  romanian: 'Romanian',
  swedish: 'Swedish',
  ukrainian: 'Ukrainian',
  vietnamese: 'Vietnamese',
  arabic: 'Arabic',
  indonesian: 'Indonesian',
};

interface LanguageSelectorProps {
  selectedLanguages: string[];
  onChange: (languages: string[]) => void;
  mode?: 'single' | 'multi';
}

export function LanguageSelector({
  selectedLanguages,
  onChange,
  mode = 'multi',
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSelected = selectedLanguages.length === 0 || selectedLanguages.includes('all');
  const displayLanguages = showAll ? ALL_LANGUAGES : POPULAR_LANGUAGES;
  const otherLanguages = ALL_LANGUAGES.filter((lang) => !POPULAR_LANGUAGES.includes(lang));

  const handleToggleLanguage = (lang: string) => {
    if (mode === 'single') {
      onChange([lang]);
      setIsOpen(false);
      return;
    }

    if (lang === 'all') {
      onChange([]);
      return;
    }

    // Remove 'all' if it was selected and we're selecting a specific language
    const withoutAll = selectedLanguages.filter((l) => l !== 'all');

    if (withoutAll.includes(lang)) {
      // Deselect
      const newSelection = withoutAll.filter((l) => l !== lang);
      onChange(newSelection.length === 0 ? [] : newSelection);
    } else {
      // Select
      onChange([...withoutAll, lang]);
    }
  };

  const getDisplayText = () => {
    if (isAllSelected) return 'All Languages';
    if (selectedLanguages.length === 1) {
      return LANGUAGE_DISPLAY_NAMES[selectedLanguages[0]] || selectedLanguages[0];
    }
    return `${selectedLanguages.length} languages`;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-white/20 focus:border-sky-500 focus:outline-none"
      >
        <span className="truncate">{getDisplayText()}</span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 max-h-80 overflow-auto rounded-lg border border-white/10 bg-slate-900 shadow-lg">
          {/* All Languages option */}
          <button
            type="button"
            onClick={() => handleToggleLanguage('all')}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-800 ${
              isAllSelected ? 'bg-sky-500/10 text-sky-400' : 'text-slate-300'
            }`}
          >
            {mode === 'multi' && (
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center ${
                  isAllSelected ? 'bg-sky-500 border-sky-500' : 'border-slate-500'
                }`}
              >
                {isAllSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            )}
            <span className="font-medium">All Languages</span>
          </button>

          <div className="border-t border-white/10 my-1" />

          {/* Popular languages label */}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            Popular
          </div>

          {/* Popular languages */}
          {POPULAR_LANGUAGES.map((lang) => {
            const isSelected = selectedLanguages.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => handleToggleLanguage(lang)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-800 ${
                  isSelected ? 'bg-sky-500/10 text-sky-400' : 'text-slate-300'
                }`}
              >
                {mode === 'multi' && (
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected ? 'bg-sky-500 border-sky-500' : 'border-slate-500'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                )}
                <span>{LANGUAGE_DISPLAY_NAMES[lang] || lang}</span>
              </button>
            );
          })}

          {/* Show more/less toggle */}
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="w-full px-3 py-2 text-xs text-sky-400 hover:bg-slate-800 text-left"
          >
            {showAll ? '▲ Show less' : `▼ Show ${otherLanguages.length} more languages`}
          </button>

          {/* Other languages */}
          {showAll && (
            <>
              <div className="border-t border-white/10 my-1" />
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                Other
              </div>
              {otherLanguages.map((lang) => {
                const isSelected = selectedLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleToggleLanguage(lang)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-800 ${
                      isSelected ? 'bg-sky-500/10 text-sky-400' : 'text-slate-300'
                    }`}
                  >
                    {mode === 'multi' && (
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-sky-500 border-sky-500' : 'border-slate-500'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    <span>{LANGUAGE_DISPLAY_NAMES[lang] || lang}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
