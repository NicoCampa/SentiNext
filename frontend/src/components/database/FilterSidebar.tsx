'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatTaxonomyLabel, MAIN_CATEGORY_LABELS, titleize } from '@/lib/taxonomyLabels';
import type { DatabaseGameOption } from '@/types';

interface FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  queryInput: string;
  setQueryInput: (value: string) => void;
  onApplyQuery: () => void;
  languageFilter: string;
  setLanguageFilter: (value: string) => void;
  selectedAppId: number | null;
  setSelectedAppId: (value: number | null) => void;
  games: DatabaseGameOption[];
  scope: 'me' | 'all';
  setScope: (value: 'me' | 'all') => void;
  isAdmin: boolean;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  selectedSubcategory: string;
  setSelectedSubcategory: (value: string) => void;
  categoryOptions: { value: string; label: string }[];
  subcategoryOptions: { value: string; label: string; main?: string }[];
  quickSentiment: 'all' | 'positive' | 'negative';
  setQuickSentiment: (value: 'all' | 'positive' | 'negative') => void;
  quickType: 'all' | 'issue' | 'request';
  setQuickType: (value: 'all' | 'issue' | 'request') => void;
  onClearAll: () => void;
  activeFilterCount: number;
  onExportPreview: () => void;
  downloadBusy: boolean;
  t: (key: string) => string;
}

export function FilterSidebar({
  isOpen,
  onClose,
  queryInput,
  setQueryInput,
  onApplyQuery,
  languageFilter,
  setLanguageFilter,
  selectedAppId,
  setSelectedAppId,
  games,
  scope,
  setScope,
  isAdmin,
  selectedCategory,
  setSelectedCategory,
  selectedSubcategory,
  setSelectedSubcategory,
  categoryOptions,
  subcategoryOptions,
  quickSentiment,
  setQuickSentiment,
  quickType,
  setQuickType,
  onClearAll,
  activeFilterCount,
  onExportPreview,
  downloadBusy,
  t,
}: FilterSidebarProps) {
  const [searchExpanded, setSearchExpanded] = useState(true);
  const [gameExpanded, setGameExpanded] = useState(true);
  const [categoryExpanded, setCategoryExpanded] = useState(true);
  const [metadataExpanded, setMetadataExpanded] = useState(true);
  const [exportExpanded, setExportExpanded] = useState(true);

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
              <h2 className="text-sm font-semibold text-white">Filters</h2>
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
                <span>🔍 Search</span>
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
                    <label className="text-xs text-slate-400">Text Search</label>
                    <div className="flex gap-2">
                      <input
                        value={queryInput}
                        onChange={(e) => setQueryInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onApplyQuery()}
                        placeholder="Search reviews..."
                        className="flex-1 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                      />
                      <Button variant="secondary" size="sm" onClick={onApplyQuery}>
                        Go
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Language</label>
                    <input
                      value={languageFilter}
                      onChange={(e) => setLanguageFilter(e.target.value || 'all')}
                      placeholder="all"
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    />
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
                <span>🎮 Game</span>
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
                    <label className="text-xs text-slate-400">Game</label>
                    <select
                      value={selectedAppId ?? ''}
                      onChange={(e) => setSelectedAppId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="">All Games</option>
                      {games.map((game) => (
                        <option key={game.app_id} value={game.app_id}>
                          {game.name ? `${game.name} (${game.app_id})` : `App ${game.app_id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isAdmin && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Scope</label>
                      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 p-1">
                        <button
                          type="button"
                          onClick={() => setScope('me')}
                          className={`flex-1 rounded px-2 py-1 text-xs transition ${
                            scope === 'me'
                              ? 'bg-sky-500/20 text-sky-200'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          My Data
                        </button>
                        <button
                          type="button"
                          onClick={() => setScope('all')}
                          className={`flex-1 rounded px-2 py-1 text-xs transition ${
                            scope === 'all'
                              ? 'bg-amber-500/20 text-amber-200'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          All Users
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Categories Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setCategoryExpanded(!categoryExpanded)}
                className="flex w-full items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-400 hover:text-slate-300"
              >
                <span>📊 Categories</span>
                <svg
                  className={`h-4 w-4 transform transition-transform ${categoryExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {categoryExpanded && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Category</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setSelectedSubcategory('all');
                      }}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="all">All Categories</option>
                      {categoryOptions.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Subcategory</label>
                    <select
                      value={selectedSubcategory}
                      onChange={(e) => setSelectedSubcategory(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="all">All Subcategories</option>
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

            {/* Metadata Filters Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMetadataExpanded(!metadataExpanded)}
                className="flex w-full items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-400 hover:text-slate-300"
              >
                <span>⚙️ Metadata</span>
                <svg
                  className={`h-4 w-4 transform transition-transform ${metadataExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {metadataExpanded && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Sentiment</label>
                    <div className="flex flex-col gap-1">
                      {(['all', 'positive', 'negative'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setQuickSentiment(value)}
                          className={`rounded-lg border px-3 py-2 text-xs text-left transition ${
                            quickSentiment === value
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/40'
                          }`}
                        >
                          {value === 'all' ? 'All' : value === 'positive' ? 'Recommended' : 'Not Recommended'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Type</label>
                    <div className="flex flex-col gap-1">
                      {(['all', 'issue', 'request'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setQuickType(value)}
                          className={`rounded-lg border px-3 py-2 text-xs text-left transition ${
                            quickType === value
                              ? 'border-purple-400 bg-purple-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/40'
                          }`}
                        >
                          {value === 'all' ? 'All' : value === 'issue' ? 'Issues' : 'Requests'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Export Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setExportExpanded(!exportExpanded)}
                className="flex w-full items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-400 hover:text-slate-300"
              >
                <span>📤 Export</span>
                <svg
                  className={`h-4 w-4 transform transition-transform ${exportExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {exportExpanded && (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant="primary"
                    className="w-full"
                    disabled={downloadBusy}
                    onClick={onExportPreview}
                  >
                    {downloadBusy ? 'Preparing…' : 'Preview Export'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 p-4">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onClearAll}
              disabled={activeFilterCount === 0}
            >
              Clear All Filters
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
