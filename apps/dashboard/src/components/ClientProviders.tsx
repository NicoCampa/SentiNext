'use client';

import type { ReactNode } from "react";
import { AnalysisProvider } from "@/contexts/AnalysisContext";
import { GameProvider } from "@/contexts/GameContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { StarredGamesProvider } from "@/contexts/StarredGamesContext";
import { Onboarding } from "@/components/Onboarding";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <OnboardingProvider>
        <UiPreferencesProvider>
            <StarredGamesProvider>
              <GameProvider>
                <AnalysisProvider>
                  {children}
                  <Onboarding />
                </AnalysisProvider>
              </GameProvider>
            </StarredGamesProvider>
        </UiPreferencesProvider>
      </OnboardingProvider>
    </LanguageProvider>
  );
}
