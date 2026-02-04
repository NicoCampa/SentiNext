'use client';

import { useState, useMemo } from 'react';
import { StarredGameDTO, GameComparisonData, ComparisonSummary } from '@/types';
import { generateComparisonSummary } from '@/lib/api';
import { ComparisonSummaryDisplay } from './ComparisonSummaryDisplay';

interface OverviewComparisonCardProps {
  selectedGames: StarredGameDTO[];
}

export function OverviewComparisonCard({ selectedGames }: OverviewComparisonCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setIsModalOpen(true);

    try {
      const gamesData: GameComparisonData[] = selectedGames.map(game => ({
        app_id: game.app_id,
        name: game.name,
        reviews: game.sample.slice(0, 50), // Limit reviews
        metrics: {
          recommendation_rate: game.insights?.recommendation || 0,
          total_reviews: game.metadata.retrieved,
        },
      }));

      const result = await generateComparisonSummary({
        games: gamesData,
        comparison_type: 'overview',
      });

      setSummary(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate comparison');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setSummary(null);
    setError(null);
  };

  const gameNames = useMemo(
    () => Object.fromEntries(selectedGames.map(g => [g.app_id, g.name])),
    [selectedGames]
  );

  return (
    <>
      {/* Compact Button */}
      <button
        onClick={handleGenerate}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 text-white rounded-xl transition-all"
      >
        <span className="text-lg">✨</span>
        <span>AI Comparison</span>
        <span className="text-xs opacity-80">(5 credits)</span>
      </button>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">AI-Powered Game Comparison</h2>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              {loading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
                  <p className="text-sm text-gray-400">Analyzing games with AI...</p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
                  <p className="text-sm text-red-400">⚠️ {error}</p>
                </div>
              )}

              {summary && !loading && (
                <ComparisonSummaryDisplay
                  summary={summary}
                  gameNames={gameNames}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
