'use client';

import type { ReactNode } from "react";
import { AnalysisProvider } from "@/contexts/AnalysisContext";
import { CreditsProvider } from "@/contexts/CreditsContext";
import { GameProvider } from "@/contexts/GameContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { StarredGamesProvider } from "@/contexts/StarredGamesContext";
import { SupportNotificationProvider } from "@/contexts/SupportNotificationContext";
import { Onboarding } from "@/components/Onboarding";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <OnboardingProvider>
        <UiPreferencesProvider>
          <CreditsProvider>
            <StarredGamesProvider>
              <GameProvider>
                <AnalysisProvider>
                  <SupportNotificationProvider>
                    {children}
                    <Onboarding />
                  </SupportNotificationProvider>
                </AnalysisProvider>
              </GameProvider>
            </StarredGamesProvider>
          </CreditsProvider>
        </UiPreferencesProvider>
      </OnboardingProvider>
    </LanguageProvider>
  );
}
