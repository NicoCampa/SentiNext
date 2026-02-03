import { ComparisonSummary } from '@/types';

interface ComparisonSummaryDisplayProps {
  summary: ComparisonSummary;
  gameNames: Record<number, string>;
  onClose?: () => void;
}

export function ComparisonSummaryDisplay({
  summary,
  gameNames,
  onClose
}: ComparisonSummaryDisplayProps) {
  return (
    <div className="space-y-4">
      {/* Summary text */}
      <p className="text-sm text-gray-300 leading-relaxed">{summary.summary}</p>

      {/* Key differences */}
      {summary.key_differences && summary.key_differences.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-200 mb-2">Key Differences</h4>
          <ul className="space-y-1">
            {summary.key_differences.map((diff, i) => (
              <li key={i} className="text-xs text-gray-400 pl-4 relative before:content-['•'] before:absolute before:left-0">
                {diff}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-game strengths/weaknesses */}
      {summary.strengths_per_game && Object.keys(summary.strengths_per_game).length > 0 && (
        <div className="grid gap-3">
          {Object.entries(summary.strengths_per_game).map(([appIdStr, strengths]) => {
            const appId = Number(appIdStr);
            const weaknesses = summary.weaknesses_per_game?.[appId] || [];

            return (
              <div key={appId} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                <h5 className="text-xs font-semibold text-gray-100 mb-2">
                  {gameNames[appId] || `Game ${appId}`}
                </h5>

                {strengths && strengths.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs text-green-400 space-y-1">
                      {strengths.map((strength, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <span className="text-green-500 mt-0.5">✓</span>
                          <span>{strength}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {weaknesses && weaknesses.length > 0 && (
                  <div className="text-xs text-red-400 space-y-1">
                    {weaknesses.map((weakness, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className="text-red-500 mt-0.5">✗</span>
                        <span>{weakness}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recommendations */}
      {summary.recommendations && Object.keys(summary.recommendations).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-200 mb-2">Best For</h4>
          <div className="space-y-2">
            {Object.entries(summary.recommendations).map(([appIdStr, rec]) => {
              const appId = Number(appIdStr);
              return (
                <p key={appId} className="text-xs text-gray-400">
                  <span className="font-medium text-gray-300">{gameNames[appId]}:</span> {rec}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Cache indicator */}
      <div className="pt-2 border-t border-gray-700/50">
        {summary.cached ? (
          <p className="text-xs text-gray-500">✓ Cached result (0 credits)</p>
        ) : (
          <p className="text-xs text-gray-500">Credits used: {summary.credits_charged}</p>
        )}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-300 underline"
        >
          Clear comparison
        </button>
      )}
    </div>
  );
}
