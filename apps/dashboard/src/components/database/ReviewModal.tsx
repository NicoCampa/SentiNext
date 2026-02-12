'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatTaxonomyLabel } from '@/lib/taxonomyLabels';
import { languageLabelFor } from '@/lib/languageOptions';
import { translateText } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Portal } from '@/components/Portal';
import type { DatabaseReviewItem } from '@/types';

// Map Steam language codes to our app language codes
const STEAM_TO_APP_LANGUAGE: Record<string, string> = {
  english: 'en',
  italian: 'it',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  portuguese: 'pt',
  brazilian: 'pt',
  russian: 'ru',
  japanese: 'ja',
  koreana: 'ko',
  schinese: 'zh',
  tchinese: 'zh',
  polish: 'pl',
  turkish: 'tr',
  dutch: 'nl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  ukrainian: 'uk',
  thai: 'th',
  vietnamese: 'vi',
  arabic: 'ar',
  indonesian: 'id',
  greek: 'el',
};

interface ReviewModalProps {
  review: DatabaseReviewItem;
  currentIndex: number;
  totalCount: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  t: (key: string) => string;
}

function formatReviewDate(value?: string | null): string {
  if (!value) return 'Date unknown';
  const parsed = Number(value);
  const date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleDateString();
}

interface EvidenceSectionProps {
  evidence: Record<string, string[]>;
}

function EvidenceSection({ evidence }: EvidenceSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Group evidence by main category
  const groupedEvidence = Object.entries(evidence).reduce((acc, [subcategory, snippets]) => {
    const [mainCategory] = subcategory.split('/', 1);
    const main = mainCategory.toLowerCase();
    if (!acc[main]) {
      acc[main] = [];
    }
    acc[main].push({ subcategory, snippets });
    return acc;
  }, {} as Record<string, { subcategory: string; snippets: string[] }[]>);

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }

  return (
    <div className="mt-3 space-y-2">
      {Object.entries(groupedEvidence).map(([mainCategory, items]) => {
        const isExpanded = expandedCategories[mainCategory] ?? true;
        return (
          <div key={mainCategory} className="rounded-xl border border-white/5 bg-white/5">
            <button
              type="button"
              onClick={() => toggleCategory(mainCategory)}
              className="flex w-full items-center justify-between p-3 text-left transition hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  {formatTaxonomyLabel(mainCategory)}
                </span>
                <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">
                  {items.length} {items.length === 1 ? 'subcategory' : 'subcategories'}
                </span>
              </div>
              <svg
                className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExpanded && (
              <div className="space-y-3 px-3 pb-3">
                {items.map(({ subcategory, snippets }) => (
                  <div key={subcategory} className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      {formatTaxonomyLabel(subcategory)}
                    </p>
                    <div className="space-y-2">
                      {snippets.map((snippet, idx) => (
                        <p
                          key={`${subcategory}-${idx}`}
                          className="rounded-lg border border-white/5 bg-slate-950/40 px-3 py-2 text-xs text-slate-200"
                        >
                          {snippet}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ReviewModal({
  review,
  currentIndex,
  totalCount,
  onClose,
  onPrevious,
  onNext,
  t,
}: ReviewModalProps) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const { language: userLanguage } = useLanguage();

  // Check if the review is in a different language than the user's preference
  const reviewLangCode = STEAM_TO_APP_LANGUAGE[review.language?.toLowerCase() || ''] || review.language?.toLowerCase();
  const needsTranslation = reviewLangCode !== userLanguage && review.language;
  const playtimeHours = review.author_playtime_hours ?? (review.author_playtime_forever || 0) / 60;
  const reviewLanguage = review.language
    ? languageLabelFor(review.language.toLowerCase())
    : 'Unknown';

  // Reset translation state when review changes
  useEffect(() => {
    setTranslatedText(null);
    setShowTranslation(false);
  }, [review.review_id]);

  useEffect(() => {
    if (copyToast) {
      const timeout = setTimeout(() => setCopyToast(null), 2000);
      return () => clearTimeout(timeout);
    }
  }, [copyToast]);

  async function handleTranslate() {
    if (translatedText) {
      // Toggle visibility if already translated
      setShowTranslation(!showTranslation);
      return;
    }

    setIsTranslating(true);
    try {
      const result = await translateText({
        text: review.review,
        target_language: userLanguage,
      });
      setTranslatedText(result.translated_text);
      setShowTranslation(true);
    } catch (error) {
      console.error('Translation failed:', error);
      setCopyToast('Translation failed. Please try again.');
    } finally {
      setIsTranslating(false);
    }
  }

  function handleCopyText() {
    navigator.clipboard.writeText(review.review);
    setCopyToast('Review text copied!');
  }

  function handleCopyEvidence() {
    if (!review.llm_subcategory_evidence) {
      setCopyToast('No evidence to copy');
      return;
    }
    const evidenceText = Object.entries(review.llm_subcategory_evidence)
      .map(([subcategory, snippets]) => {
        return `${formatTaxonomyLabel(subcategory)}:\n${snippets.map((s) => `- ${s}`).join('\n')}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(evidenceText);
    setCopyToast('Evidence copied!');
  }

  function handleShareLink() {
    const url = new URL(window.location.href);
    if (review.review_id !== null && review.review_id !== undefined) {
      url.searchParams.set('review', String(review.review_id));
    }
    navigator.clipboard.writeText(url.toString());
    setCopyToast('Link copied to clipboard!');
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.isContentEditable) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrevious, onNext]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md overflow-y-auto animate-modal-overlay"
        onClick={onClose}
        style={{ WebkitBackdropFilter: 'blur(12px)' }}
      >
        {/* Toast notification */}
        {copyToast && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-2 fade-in">
            <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
              {copyToast}
            </div>
          </div>
        )}
        <div className="min-h-screen flex items-start sm:items-center justify-center p-2 sm:p-4">
          <div
            className="w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-xl sm:rounded-2xl border border-white/20 bg-slate-900 p-4 sm:p-6 shadow-2xl my-2 sm:my-8 animate-modal-content"
            onClick={(event) => event.stopPropagation()}
          >
        {/* Navigation header */}
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onPrevious}
              disabled={currentIndex === 0}
              className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-slate-300 transition hover:bg-slate-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              title="Previous review (Left arrow)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs text-slate-400">
              Review {currentIndex + 1} of {totalCount}
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={currentIndex === totalCount - 1}
              className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-slate-300 transition hover:bg-slate-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              title="Next review (Right arrow)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-slate-400 transition hover:bg-slate-900/60 hover:text-white"
            title="Close (Escape)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{t('database.reviewDetails')}</h2>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                review.voted_up ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'
              }`}
            >
              {review.voted_up ? t('common.recommended') : t('common.notRecommended')}
            </span>
            {review.llm_main_category ? (
              <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs text-indigo-200">
                {formatTaxonomyLabel(review.llm_main_category)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-slate-950/45 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Date</p>
            <p className="mt-1 text-slate-200">{formatReviewDate(review.created_at)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/45 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Helpful</p>
            <p className="mt-1 text-slate-200">{(review.votes_up || 0).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/45 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Language</p>
            <p className="mt-1 text-slate-200">{reviewLanguage}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/45 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Playtime</p>
            <p className="mt-1 text-slate-200">{playtimeHours.toFixed(1)}h</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyText}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-900/60 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Text
          </button>
          <button
            type="button"
            onClick={handleCopyEvidence}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-900/60 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Copy Evidence
          </button>
          <button
            type="button"
            onClick={handleShareLink}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-900/60 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Link
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
          {/* Translate button for foreign language reviews */}
          {needsTranslation && (
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs text-slate-400">
                Original language: {review.language}
              </span>
              <button
                type="button"
                onClick={handleTranslate}
                disabled={isTranslating}
                className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
              >
                {isTranslating ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Translating...
                  </>
                ) : translatedText ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    {showTranslation ? 'Show Original' : 'Show Translation'}
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    Translate
                  </>
                )}
              </button>
            </div>
          )}

          {/* Translated text */}
          {showTranslation && translatedText && (
            <div className="mb-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-sky-400">Translated</p>
              <p className="whitespace-pre-line text-slate-200">{translatedText}</p>
            </div>
          )}

          {/* Original text */}
          <div className={showTranslation && translatedText ? 'opacity-60' : ''}>
            {showTranslation && translatedText && (
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Original</p>
            )}
            <p className="whitespace-pre-line">{review.review}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('common.labels')}</p>
            {review.llm_subcategories?.length ? (
              <div className="flex flex-wrap gap-2">
                {review.llm_subcategories.map((value, idx) => (
                  <span key={`${value}-${idx}`} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                    {formatTaxonomyLabel(value)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No subcategories tagged.</p>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('common.issues')} & {t('common.requests')}</p>
            <div className="space-y-3 text-xs text-slate-300">
              {review.llm_issue_subcategories?.length ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">{t('common.issues')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {review.llm_issue_subcategories.map((value, idx) => (
                      <span key={`${value}-${idx}`} className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-200">
                        {formatTaxonomyLabel(value)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No issues tagged.</p>
              )}
              {review.llm_request_subcategories?.length ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">{t('common.requests')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {review.llm_request_subcategories.map((value, idx) => (
                      <span key={`${value}-${idx}`} className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs text-cyan-200">
                        {formatTaxonomyLabel(value)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('common.evidence')}</p>
          {review.llm_subcategory_evidence && Object.keys(review.llm_subcategory_evidence).length ? (
            <EvidenceSection evidence={review.llm_subcategory_evidence} />
          ) : (
            <p className="mt-2 text-sm text-slate-500">No evidence snippets saved for this review.</p>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
