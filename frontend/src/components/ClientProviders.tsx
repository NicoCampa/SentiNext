'use client';

import type { ReactNode } from "react";
import { AnalysisProvider } from "@/contexts/AnalysisContext";
import { CreditsProvider } from "@/contexts/CreditsContext";
import { GameProvider } from "@/contexts/GameContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StarredGamesProvider } from "@/contexts/StarredGamesContext";
import { SupportNotificationProvider } from "@/contexts/SupportNotificationContext";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <UiPreferencesProvider>
        <CreditsProvider>
          <StarredGamesProvider>
            <GameProvider>
              <AnalysisProvider>
                <SupportNotificationProvider>
                  {children}
                </SupportNotificationProvider>
              </AnalysisProvider>
            </GameProvider>
          </StarredGamesProvider>
        </CreditsProvider>
      </UiPreferencesProvider>
    </LanguageProvider>
  );
}
