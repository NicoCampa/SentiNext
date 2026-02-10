'use client';

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type DensityMode = "comfortable" | "compact";

interface UiPreferencesContextValue {
  density: DensityMode;
  setDensity: (value: DensityMode) => void;
}

const STORAGE_KEY = "sentinext_density_v1";

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

function loadDensity(): DensityMode {
  if (typeof window === "undefined") return "comfortable";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "compact" ? "compact" : "comfortable";
}

function persistDensity(value: DensityMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value);
}

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensity] = useState<DensityMode>(() => loadDensity());

  useEffect(() => {
    persistDensity(density);
    if (typeof document !== "undefined") {
      document.body.dataset.density = density;
    }
  }, [density]);

  const value = useMemo<UiPreferencesContextValue>(
    () => ({
      density,
      setDensity,
    }),
    [density],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences(): UiPreferencesContextValue {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) {
    throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  }
  return ctx;
}

