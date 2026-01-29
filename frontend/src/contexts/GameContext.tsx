'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchStarredGames } from "@/lib/api";
import type { SearchResult, StarredGameDTO } from "@/types";

export type GameContextGame = {
  appId: number;
  name: string;
  headerImage?: string | null;
  source: "starred" | "temporary";
};

interface GameContextValue {
  games: StarredGameDTO[];
  selectedGameId: number | null;
  selectedGame: GameContextGame | null;
  selectedStarredGame: StarredGameDTO | null;
  loading: boolean;
  error: string | null;
  refreshGames: () => Promise<void>;
  selectGameById: (appId: number | null) => void;
  setTemporaryGame: (game: SearchResult | null) => void;
}

const STORAGE_KEY = "sentinext_selected_game_v1";

const GameContext = createContext<GameContextValue | null>(null);

function parseStoredGameId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function persistGameId(value: number | null): void {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = useState<StarredGameDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(() => parseStoredGameId());
  const [temporaryGame, setTemporaryGame] = useState<SearchResult | null>(null);

  const refreshGames = useCallback(async () => {
    try {
      setLoading(true);
      const entries = await fetchStarredGames();
      setGames(entries);
      setError(null);
    } catch (err) {
      console.error("Failed to load starred games", err);
      setError("Failed to load saved games.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGames();
  }, [refreshGames]);

  useEffect(() => {
    if (!selectedGameId) return;
    const hasStarred = games.some((game) => game.app_id === selectedGameId);
    if (hasStarred) {
      setTemporaryGame(null);
    }
  }, [games, selectedGameId]);

  useEffect(() => {
    persistGameId(selectedGameId);
  }, [selectedGameId]);

  const selectedStarredGame = useMemo(() => {
    if (!selectedGameId) return null;
    return games.find((game) => game.app_id === selectedGameId) || null;
  }, [games, selectedGameId]);

  const selectedGame = useMemo<GameContextGame | null>(() => {
    if (selectedStarredGame) {
      return {
        appId: selectedStarredGame.app_id,
        name: selectedStarredGame.name,
        headerImage: selectedStarredGame.metadata?.header_image ?? null,
        source: "starred",
      };
    }
    if (temporaryGame) {
      return {
        appId: temporaryGame.appid,
        name: temporaryGame.name,
        headerImage: temporaryGame.image_url ?? null,
        source: "temporary",
      };
    }
    return null;
  }, [selectedStarredGame, temporaryGame]);

  const selectGameById = useCallback((appId: number | null) => {
    setSelectedGameId(appId);
    setTemporaryGame(null);
  }, []);

  const setTemporary = useCallback((game: SearchResult | null) => {
    setTemporaryGame(game);
    setSelectedGameId(game ? game.appid : null);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      games,
      selectedGameId,
      selectedGame,
      selectedStarredGame,
      loading,
      error,
      refreshGames,
      selectGameById,
      setTemporaryGame: setTemporary,
    }),
    [
      games,
      selectedGameId,
      selectedGame,
      selectedStarredGame,
      loading,
      error,
      refreshGames,
      selectGameById,
      setTemporary,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error("useGameContext must be used within GameProvider");
  }
  return ctx;
}
