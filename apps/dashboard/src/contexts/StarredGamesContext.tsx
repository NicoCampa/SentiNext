'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { fetchStarredGames as apiFetchStarredGames } from '@/lib/api';
import type { StarredGameDTO } from '@/types';

interface StarredGamesContextValue {
  games: StarredGameDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  invalidate: () => void;
  getGame: (appId: number) => StarredGameDTO | undefined;
  updateGame: (appId: number, updater: (game: StarredGameDTO) => StarredGameDTO) => void;
  removeGame: (appId: number) => void;
  addGame: (game: StarredGameDTO) => void;
}

const StarredGamesContext = createContext<StarredGamesContextValue | null>(null);

export function StarredGamesProvider({ children }: { children: ReactNode }) {
  const [games, setGames] = useState<StarredGameDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const gamesRef = useRef(games);
  gamesRef.current = games;

  const refresh = useCallback(async () => {
    // Only show loading spinner on initial fetch (no data yet).
    // Subsequent refreshes keep existing data visible while fetching.
    if (gamesRef.current.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await apiFetchStarredGames();
      setGames(data);
      setInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
      console.error('Failed to fetch starred games:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    if (!initialized) {
      refresh();
    }
  }, [initialized, refresh]);

  const invalidate = useCallback(() => {
    setInitialized(false);
  }, []);

  const getGame = useCallback((appId: number) => {
    return games.find(g => g.app_id === appId);
  }, [games]);

  const updateGame = useCallback((appId: number, updater: (game: StarredGameDTO) => StarredGameDTO) => {
    setGames(prev => prev.map(g => g.app_id === appId ? updater(g) : g));
  }, []);

  const removeGame = useCallback((appId: number) => {
    setGames(prev => prev.filter(g => g.app_id !== appId));
  }, []);

  const addGame = useCallback((game: StarredGameDTO) => {
    setGames(prev => {
      // Replace if exists, otherwise add to front
      const exists = prev.some(g => g.app_id === game.app_id);
      if (exists) {
        return prev.map(g => g.app_id === game.app_id ? game : g);
      }
      return [game, ...prev];
    });
  }, []);

  return (
    <StarredGamesContext.Provider
      value={{
        games,
        loading,
        error,
        refresh,
        invalidate,
        getGame,
        updateGame,
        removeGame,
        addGame,
      }}
    >
      {children}
    </StarredGamesContext.Provider>
  );
}

export function useStarredGames() {
  const context = useContext(StarredGamesContext);
  if (!context) {
    throw new Error('useStarredGames must be used within StarredGamesProvider');
  }
  return context;
}
