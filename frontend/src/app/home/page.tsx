'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchStarredGames, deleteGame } from "@/lib/api";
import { StarredGameDTO } from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SteamImage } from "@/components/SteamImage";
import { formatSavedLabel } from "@/utils/format";
import { getRecommendationBackground, getRecommendationColor } from "@/utils/colors";

export default function HomePage() {
  const [starredGames, setStarredGames] = useState<StarredGameDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadStarredGames() {
      try {
        const games = await fetchStarredGames();
        setStarredGames(games);
        setBackendError(false);
      } catch (error) {
        console.error("Failed to load starred games:", error);
        setBackendError(true);
      } finally {
        setLoading(false);
      }
    }
    loadStarredGames();
  }, []);

  async function handleDelete(appId: number, gameName: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Delete all data for "${gameName}"? This cannot be undone.`)) {
      return;
    }

    setDeletingIds(prev => new Set(prev).add(appId));
    try {
      await deleteGame(appId);
      setStarredGames(games => games.filter(g => g.app_id !== appId));
    } catch (error) {
      console.error("Failed to delete game:", error);
      alert("Failed to delete game data");
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(appId);
        return next;
      });
    }
  }

  return (
    <AppLayout showSidebar>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
        {/* Hero Section */}
        <div className="mb-12 rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-900/30 via-slate-900/40 to-slate-950/50 p-12 shadow-2xl backdrop-blur">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-300">
              <span>▶</span>
              <span>Steam Intelligence Platform</span>
            </div>
            <h1 className="text-5xl font-bold text-white">
              Welcome to SentiNext
            </h1>
            <p className="max-w-2xl text-lg text-slate-300">
              Analyze Steam reviews with AI-powered sentiment analysis. Track player sentiment,
              identify pain points, and discover actionable insights to improve your game.
            </p>
            <div className="flex gap-4 pt-4">
              <Link href="/dashboard">
                <Button variant="primary" size="lg">
                  Start Analyzing →
                </Button>
              </Link>
              <Link href="/compare">
                <Button variant="secondary" size="lg">
                  Compare Games
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Starred Games */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Recent Analyses</h2>
            {starredGames.length > 0 && (
              <Link href="/compare" className="text-sm text-sky-400 hover:text-sky-300">
                View all →
              </Link>
            )}
          </div>

          {backendError ? (
            <Card variant="glass" className="p-8">
              <div className="text-center space-y-4">
                <div className="text-5xl">⚠️</div>
                <h3 className="text-xl font-semibold text-white">Backend Not Running</h3>
                <p className="text-slate-300 max-w-md mx-auto">
                  The Python backend server is not responding. Please start it in a terminal:
                </p>
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4 font-mono text-sm text-left text-slate-300 max-w-xl mx-auto">
                  <div className="text-slate-500"># In your project directory:</div>
                  <div className="text-cyan-400">cd /path/to/SentiNext/backend</div>
                  <div className="text-cyan-400 mt-1">PYTHONPATH=. uvicorn backend.main:app --reload --port 8000 --app-dir .</div>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
                >
                  Retry Connection
                </button>
              </div>
            </Card>
          ) : loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} variant="glass" className="h-48 animate-pulse"><div /></Card>
              ))}
            </div>
          ) : starredGames.length === 0 ? (
            <EmptyState
              title="No analyses yet"
              description="Star a game after analyzing it to see your recent work here."
              icon="▣"
              variant="info"
              action={
                <Link href="/dashboard">
                  <Button variant="primary">Analyze Your First Game</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {starredGames.map((game) => (
                <Card
                  key={game.app_id}
                  variant="glass"
                  className="group relative overflow-hidden transition-all hover:scale-105 hover:border-indigo-400/50"
                >
                  <Link href={`/dashboard?game=${game.app_id}`}>
                    <div className="aspect-video overflow-hidden rounded-lg">
                      <SteamImage
                        appId={game.app_id}
                        variant="header"
                        alt={game.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-110"
                        imageUrl={game.metadata.header_image}
                      />
                    </div>
                    <div className="mt-4 space-y-2">
                      <h3 className="font-semibold text-white group-hover:text-indigo-300">
                        {game.name}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{game.metadata.retrieved} reviews</span>
                        <span>{formatSavedLabel(game.updated_at)}</span>
                      </div>
                      {game.insights && (
                        <div className="flex gap-2 text-xs">
                          <span
                            className="rounded-full px-2 py-1"
                            style={{
                              color: getRecommendationColor(game.insights.recommendation),
                              backgroundColor: getRecommendationBackground(game.insights.recommendation, 0.2),
                            }}
                          >
                            {(game.insights.recommendation * 100).toFixed(0)}% recommended
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>

                  <button
                    onClick={(e) => handleDelete(game.app_id, game.name, e)}
                    disabled={deletingIds.has(game.app_id)}
                    className="absolute right-2 top-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-400 opacity-0 backdrop-blur transition-opacity hover:bg-rose-500/20 group-hover:opacity-100 disabled:opacity-50"
                    title="Delete all game data"
                  >
                    {deletingIds.has(game.app_id) ? "..." : "×"}
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Features */}
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <Card variant="glass">
            <div className="space-y-3">
              <div className="text-3xl font-bold text-sky-400">⚡</div>
              <h3 className="text-lg font-semibold text-white">AI-Powered Analysis</h3>
              <p className="text-sm text-slate-300">
                Local LLM classifies sentiment, extracts topics, and identifies pain points automatically.
              </p>
            </div>
          </Card>
          <Card variant="glass">
            <div className="space-y-3">
              <div className="text-3xl font-bold text-indigo-400">▣</div>
              <h3 className="text-lg font-semibold text-white">Actionable Insights</h3>
              <p className="text-sm text-slate-300">
                Track trends over time, identify risk metrics, and segment your audience cohorts.
              </p>
            </div>
          </Card>
          <Card variant="glass">
            <div className="space-y-3">
              <div className="text-3xl font-bold text-purple-400">≈</div>
              <h3 className="text-lg font-semibold text-white">Game Comparison</h3>
              <p className="text-sm text-slate-300">
                Compare multiple games side-by-side to benchmark performance and sentiment.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
