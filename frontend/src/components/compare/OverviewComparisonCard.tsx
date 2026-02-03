'use client';

import { useState, useMemo } from 'react';
import { StarredGameDTO, GameComparisonData, ComparisonSummary } from '@/types';
import { generateComparisonSummary } from '@/lib/api';
import { ComparisonSummaryDisplay } from './ComparisonSummaryDisplay';

interface OverviewComparisonCardProps {
  selectedGames: StarredGameDTO[];
}

export function OverviewComparisonCard({ selectedGames }: OverviewComparisonCardProps) {
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const gamesData: GameComparisonData[] = selectedGames.map(game => ({
        app_id: game.app_id,
        name: game.name,
        reviews: game.sample.slice(0, 20), // Limit reviews
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

  const gameNames = useMemo(
    () => Object.fromEntries(selectedGames.map(g => [g.app_id, g.name])),
    [selectedGames]
  );

  return (
    <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-700/50 rounded-lg p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-100">Overall Comparison</h3>
        {!summary && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {loading ? 'Analyzing...' : '✨ Compare (5 credits)'}
          </button>
        )}
        {summary && (
          <button
            onClick={() => setSummary(null)}
            className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-2 p-2 bg-red-900/20 border border-red-700/50 rounded">
          ⚠️ {error}
        </div>
      )}

      {summary && (
        <ComparisonSummaryDisplay
          summary={summary}
          gameNames={gameNames}
          onClose={() => setSummary(null)}
        />
      )}

      {!summary && !loading && !error && (
        <p className="text-xs text-gray-500">
          Generate an AI-powered comparison to see what makes each game unique and who they're best for.
        </p>
      )}
    </div>
  );
}
