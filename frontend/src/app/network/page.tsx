'use client';

import { useEffect, useState } from "react";
import { fetchStarredGames } from "@/lib/api";
import type { StarredGameDTO, SubcategoryCount } from "@/types";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { SteamImage } from "@/components/SteamImage";
import Link from "next/link";

interface GenreCluster {
  genre: string;
  games: StarredGameDTO[];
  topIssueSubcategories: SubcategoryCount[];
  topRequestSubcategories: SubcategoryCount[];
  color: string;
}

export default function NetworkPage() {
  const [games, setGames] = useState<StarredGameDTO[]>([]);
  const [clusters, setClusters] = useState<GenreCluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<GenreCluster | null>(null);
  const [hoveredGame, setHoveredGame] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGames() {
      try {
        const starred = await fetchStarredGames();
        setGames(starred);

        // Group games by PRIMARY genre only (first genre)
        const genreMap = new Map<string, StarredGameDTO[]>();
        starred.forEach(game => {
          const primaryGenre = (game.genres && game.genres.length > 0)
            ? game.genres[0]
            : 'Other';

          if (!genreMap.has(primaryGenre)) {
            genreMap.set(primaryGenre, []);
          }
          genreMap.get(primaryGenre)!.push(game);
        });

        // Create clusters with aggregated issues/features
        const clusterList: GenreCluster[] = [];
        let hueIndex = 0;
        genreMap.forEach((gamesInGenre, genre) => {
          const issueMap = new Map<string, number>();
          const requestMap = new Map<string, number>();

          gamesInGenre.forEach(game => {
            const subcats = game.insights?.subcategory_insights ?? [];
            subcats.forEach(entry => {
              const issueCount = Number(entry.issue_count ?? 0);
              const requestCount = Number(entry.request_count ?? 0);
              if (issueCount > 0) {
                issueMap.set(entry.subcategory, (issueMap.get(entry.subcategory) ?? 0) + issueCount);
              }
              if (requestCount > 0) {
                requestMap.set(entry.subcategory, (requestMap.get(entry.subcategory) ?? 0) + requestCount);
              }
            });
          });

          const topIssueSubcategories = Array.from(issueMap.entries())
            .map(([subcategory, count]) => ({ subcategory, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

          const topRequestSubcategories = Array.from(requestMap.entries())
            .map(([subcategory, count]) => ({ subcategory, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

          const hue = (hueIndex * 360 / genreMap.size) % 360;
          clusterList.push({
            genre,
            games: gamesInGenre,
            topIssueSubcategories,
            topRequestSubcategories,
            color: `hsl(${hue}, 70%, 60%)`,
          });
          hueIndex++;
        });

        // Sort by number of games
        clusterList.sort((a, b) => b.games.length - a.games.length);
        setClusters(clusterList);

      } catch (error) {
        console.error("Failed to load games:", error);
      } finally {
        setLoading(false);
      }
    }
    loadGames();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-sky-400"></div>
            <div className="text-lg text-slate-400">Loading network...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (games.length === 0) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl px-4 py-6">
          <Card variant="glass" className="p-5 text-center">
            <p className="text-lg text-slate-400">No games analyzed yet. Analyze some games to see the network!</p>
            <Link href="/dashboard" className="mt-4 inline-block text-sky-400 hover:text-sky-300">
              Analyze a game →
            </Link>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white">Genre Network</h1>
          <p className="text-sm text-slate-400">Games organized by genre with aggregated insights</p>
        </div>

        {/* Network Visualization - Static Grid by Genre */}
        <Card variant="glass" className="p-5">
          <div className="space-y-8">
            {clusters.map((cluster) => (
              <div key={cluster.genre} className="space-y-4">
                {/* Genre Header */}
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: cluster.color }}
                  />
                  <h3 className="text-base font-semibold text-white">{cluster.genre}</h3>
                  <span className="text-xs text-slate-500">
                    {cluster.games.length} {cluster.games.length === 1 ? 'game' : 'games'}
                  </span>
                  <button
                    onClick={() => setSelectedCluster(cluster)}
                    className="ml-auto text-xs text-sky-400 hover:text-sky-300"
                  >
                    View Insights →
                  </button>
                </div>

                {/* Games in Genre */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {cluster.games.map((game) => (
                    <Link
                      key={game.app_id}
                      href={`/dashboard?game=${game.app_id}`}
                      className="group relative"
                      onMouseEnter={() => setHoveredGame(game.app_id)}
                      onMouseLeave={() => setHoveredGame(null)}
                    >
                      <div className="relative aspect-[460/215] overflow-hidden rounded-lg border border-white/10 transition-all duration-200 group-hover:scale-105 group-hover:border-sky-400/50 group-hover:shadow-xl group-hover:shadow-sky-500/20">
                        <SteamImage
                          appId={game.app_id}
                          variant="header"
                          alt={game.name}
                          className="h-full w-full object-cover"
                        />
                        {/* Genre badge */}
                        <div
                          className="absolute left-2 top-2 rounded px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm"
                          style={{
                            backgroundColor: cluster.color + '40',
                            color: cluster.color,
                            border: `1px solid ${cluster.color}60`,
                          }}
                        >
                          {cluster.genre}
                        </div>
                      </div>

                      {/* Game name on hover */}
                      {hoveredGame === game.app_id && (
                        <div className="absolute -bottom-8 left-0 right-0 z-10 rounded-lg border border-white/20 bg-slate-900/95 p-2 text-center text-xs text-white shadow-xl backdrop-blur">
                          {game.name}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>

                {/* Divider */}
                <div className="border-t border-white/5" />
              </div>
            ))}
          </div>
        </Card>

        {/* Genre Cluster Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clusters.map((cluster) => (
            <Card
              key={cluster.genre}
              variant="glass"
              className={`p-4 cursor-pointer transition-all ${
                selectedCluster?.genre === cluster.genre
                  ? 'ring-2 ring-sky-400 scale-105'
                  : 'hover:scale-102'
              }`}
              onClick={() => setSelectedCluster(cluster)}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: cluster.color }}
                />
                <h3 className="text-base font-semibold text-white">{cluster.genre}</h3>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                {cluster.games.length} {cluster.games.length === 1 ? 'game' : 'games'}
              </p>
              <div className="text-xs text-slate-500">
                {cluster.games.slice(0, 3).map(g => g.name).join(', ')}
                {cluster.games.length > 3 && '...'}
              </div>
            </Card>
          ))}
        </div>

        {/* Selected Cluster Details */}
        {selectedCluster && (
          <Card variant="glass" className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-3">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: selectedCluster.color }}
                />
                {selectedCluster.genre} - Aggregated Insights
              </h2>
              <button
                onClick={() => setSelectedCluster(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Top Issue Subcategories */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">🚨 Top Issue Subcategories</h3>
                {selectedCluster.topIssueSubcategories.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCluster.topIssueSubcategories.map((issue, idx) => (
                      <div key={idx} className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                        <p className="text-sm font-medium text-white capitalize">{issue.subcategory.replace(/_/g, " ").replace("/", " / ")}</p>
                        <p className="text-xs text-slate-400 mt-1">{issue.count} mentions</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No issues reported</p>
                )}
              </div>

              {/* Top Request Subcategories */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">✨ Top Request Subcategories</h3>
                {selectedCluster.topRequestSubcategories.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCluster.topRequestSubcategories.map((feature, idx) => (
                      <div key={idx} className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3">
                        <p className="text-sm font-medium text-white capitalize">{feature.subcategory.replace(/_/g, " ").replace("/", " / ")}</p>
                        <p className="text-xs text-slate-400 mt-1">{feature.count} mentions</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No requests reported</p>
                )}
              </div>
            </div>

            {/* Games in cluster */}
            <div className="mt-5 pt-5 border-t border-white/10">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Games in this genre:</h3>
              <div className="flex flex-wrap gap-2">
                {selectedCluster.games.map(game => (
                  <Link
                    key={game.app_id}
                    href={`/dashboard?game=${game.app_id}`}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10 transition"
                  >
                    {game.name}
                  </Link>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
