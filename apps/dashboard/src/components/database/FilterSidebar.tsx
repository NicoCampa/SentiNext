'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Portal } from '@/components/Portal';
import { LANGUAGE_OPTIONS } from '@/lib/languageOptions';
import type { DatabaseGameOption } from '@/types';

interface FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  queryInput: string;
  setQueryInput: (value: string) => void;
  onSearch: () => void;
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
  onDeleteGame: () => void;
  onClearDatabase: () => void;
  t: (key: string) => string;
}

const selectClass =
  'w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none';

export function FilterSidebar({
  isOpen,
  onClose,
  queryInput,
  setQueryInput,
  onSearch,
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
  onDeleteGame,
  onClearDatabase,
  t,
}: FilterSidebarProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [dataOpen, setDataOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'game' | 'all' | null>(null);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <Portal>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
        </Portal>
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[280px] transform border-r border-white/10 bg-slate-900/95 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:h-auto lg:w-full lg:translate-x-0 lg:rounded-2xl lg:border lg:border-white/10 lg:bg-slate-900/65 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-sm font-medium text-white">{t('common.filters')}</h2>
                <p className="text-[11px] text-slate-500">Search + narrow with labels and language</p>
              </div>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Search */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">{t('common.search')}</label>
              <div className="flex gap-2">
                <input
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                  placeholder={t('database.searchPlaceholder')}
                  className="flex-1 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                />
                <Button variant="secondary" size="sm" onClick={onSearch}>
                  Go
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">Press Enter to apply search.</p>
            </div>

            {/* Game */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">{t('database.game')}</label>
              <select
                value={selectedAppId ?? ''}
                onChange={(e) =>
                  setSelectedAppId(e.target.value ? Number(e.target.value) : null)
                }
                className={selectClass}
              >
                <option value="">{t('database.allGames')}</option>
                {games.map((g) => (
                  <option key={g.app_id} value={g.app_id}>
                    {g.name || `App ${g.app_id}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">{t('database.language')}</label>
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className={selectClass}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Categories - collapsible */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setCategoriesOpen(!categoriesOpen)}
                className="flex w-full items-center justify-between text-xs text-slate-400 hover:text-slate-300"
              >
                <span>{t('database.categories')}</span>
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${categoriesOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {categoriesOpen && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">{t('database.category')}</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className={selectClass}
                    >
                      <option value="all">{t('database.allCategories')}</option>
                      {categoryOptions.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">{t('database.subcategory')}</label>
                    <select
                      value={selectedSubcategory}
                      onChange={(e) => setSelectedSubcategory(e.target.value)}
                      className={selectClass}
                    >
                      <option value="all">{t('database.allSubcategories')}</option>
                      {subcategoryOptions
                        .filter(
                          (o) =>
                            !selectedCategory ||
                            selectedCategory === 'all' ||
                            o.main === selectedCategory,
                        )
                        .map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Data management - collapsible */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setDataOpen(!dataOpen)}
                className="flex w-full items-center justify-between text-xs text-slate-400 hover:text-slate-300"
              >
                <span>Data</span>
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${dataOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {dataOpen && (
                <div className="space-y-2 pt-1">
                  {selectedAppId !== null && (
                    <div>
                      {confirmAction === 'game' ? (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1 border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                            onClick={() => { onDeleteGame(); setConfirmAction(null); }}
                          >
                            Confirm
                          </Button>
                          <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirmAction(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full text-rose-300 hover:bg-rose-500/10"
                          onClick={() => setConfirmAction('game')}
                        >
                          Delete selected game
                        </Button>
                      )}
                    </div>
                  )}
                  <div>
                    {confirmAction === 'all' ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                          onClick={() => { onClearDatabase(); setConfirmAction(null); }}
                        >
                          Confirm
                        </Button>
                        <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirmAction(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-rose-300 hover:bg-rose-500/10"
                        onClick={() => setConfirmAction('all')}
                      >
                        Clear entire database
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer - only show clear when filters are active */}
          {activeFilterCount > 0 && (
            <div className="border-t border-white/10 p-4">
              <Button variant="secondary" size="sm" className="w-full" onClick={onClearAll}>
                {t('common.clearFilters')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
