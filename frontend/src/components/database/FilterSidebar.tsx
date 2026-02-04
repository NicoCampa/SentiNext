'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LANGUAGE_OPTIONS } from '@/lib/languageOptions';
import type { DatabaseGameOption } from '@/types';

interface FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  queryInput: string;
  setQueryInput: (value: string) => void;
  onApplyFilters: () => void;
  languageFilter: string;
  setLanguageFilter: (value: string) => void;
  selectedAppId: number | null;
  setSelectedAppId: (value: number | null) => void;
  games: DatabaseGameOption[];
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  selectedSubcategory: string;
  setSelectedSubcategory: (value: string) => void;
  categoryOptions: { value: string; label: string }[];
  subcategoryOptions: { value: string; label: string; main?: string }[];
  onClearAll: () => void;
  activeFilterCount: number;
  hasPendingChanges: boolean;
  hasAppliedFilters: boolean;
  t: (key: string) => string;
}

export function FilterSidebar({
  isOpen,
  onClose,
  queryInput,
  setQueryInput,
  onApplyFilters,
  languageFilter,
  setLanguageFilter,
  selectedAppId,
  setSelectedAppId,
  games,
  selectedCategory,
  setSelectedCategory,
  selectedSubcategory,
  setSelectedSubcategory,
  categoryOptions,
  subcategoryOptions,
  onClearAll,
  activeFilterCount,
  hasPendingChanges,
  hasAppliedFilters,
  t,
}: FilterSidebarProps) {
  const [searchExpanded, setSearchExpanded] = useState(true);
  const [gameExpanded, setGameExpanded] = useState(true);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[280px] transform bg-slate-900/95 backdrop-blur-xl border-r border-white/10 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">{t('common.filters')}</h2>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">
                  {activeFilterCount}
                </span>
              )}
              {hasPendingChanges && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs uppercase tracking-wider text-amber-300">
                  {t('common.pending')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Search Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSearchExpanded(!searchExpanded)}
                className="flex w-full items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-400 hover:text-slate-300"
              >
                <span>🔍 {t('common.search')}</span>
                <svg
                  className={`h-4 w-4 transform transition-transform ${searchExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {searchExpanded && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">{t('database.searchText')}</label>
                    <div className="flex gap-2">
                      <input
                        value={queryInput}
                        onChange={(e) => setQueryInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onApplyFilters()}
                        placeholder={t('database.searchPlaceholder')}
                        className="flex-1 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onApplyFilters}
                        disabled={!hasPendingChanges && hasAppliedFilters}
                      >
                        {t('common.apply')}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">{t('database.language')}</label>
                    <select
                      value={languageFilter}
                      onChange={(e) => setLanguageFilter(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      {LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Game Filter Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setGameExpanded(!gameExpanded)}
                className="flex w-full items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-400 hover:text-slate-300"
              >
                <span>🎮 {t('database.game')}</span>
                <svg
                  className={`h-4 w-4 transform transition-transform ${gameExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {gameExpanded && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">{t('database.game')}</label>
                    <select
                      value={selectedAppId ?? ''}
                      onChange={(e) => setSelectedAppId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="">{t('database.allGames')}</option>
                      {games.map((game) => (
                        <option key={game.app_id} value={game.app_id}>
                          {game.name ? `${game.name} (${game.app_id})` : `App ${game.app_id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Advanced Filters Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
                className="flex w-full items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-400 hover:text-slate-300"
              >
                <span>🧭 {t('database.categories')}</span>
                <svg
                  className={`h-4 w-4 transform transition-transform ${advancedExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {advancedExpanded && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">{t('database.category')}</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setSelectedSubcategory('all');
                      }}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="all">{t('database.allCategories')}</option>
                      {categoryOptions.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">{t('database.subcategory')}</label>
                    <select
                      value={selectedSubcategory}
                      onChange={(e) => setSelectedSubcategory(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="all">{t('database.allSubcategories')}</option>
                      {subcategoryOptions
                        .filter((opt) => !selectedCategory || selectedCategory === 'all' || opt.main === selectedCategory)
                        .map((subcat) => (
                          <option key={subcat.value} value={subcat.value}>
                            {subcat.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 p-4">
            <Button
              size="sm"
              variant="primary"
              className="w-full mb-2"
              onClick={onApplyFilters}
              disabled={!hasPendingChanges && hasAppliedFilters}
            >
              {t('database.applyFilters')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onClearAll}
              disabled={activeFilterCount === 0}
            >
              {t('common.clearFilters')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
