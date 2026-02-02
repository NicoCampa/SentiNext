'use client';

import type { ReactNode } from "react";
import { AnalysisProvider } from "@/contexts/AnalysisContext";
import { GameProvider } from "@/contexts/GameContext";
import { GlobalFiltersProvider } from "@/contexts/GlobalFiltersContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <UiPreferencesProvider>
        <GlobalFiltersProvider>
          <GameProvider>
            <AnalysisProvider>
              {children}
            </AnalysisProvider>
          </GameProvider>
        </GlobalFiltersProvider>
      </UiPreferencesProvider>
    </LanguageProvider>
  );
}
