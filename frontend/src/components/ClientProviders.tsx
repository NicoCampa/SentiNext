'use client';

import type { ReactNode } from "react";
import { AnalysisProvider } from "@/contexts/AnalysisContext";
import { CreditsProvider } from "@/contexts/CreditsContext";
import { GameProvider } from "@/contexts/GameContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <UiPreferencesProvider>
        <CreditsProvider>
          <GameProvider>
            <AnalysisProvider>
              {children}
            </AnalysisProvider>
          </GameProvider>
        </CreditsProvider>
      </UiPreferencesProvider>
    </LanguageProvider>
  );
}
