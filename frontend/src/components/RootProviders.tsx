'use client';

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthGate } from "@/components/AuthGate";
import { ClerkTokenProvider } from "@/components/ClerkTokenProvider";
import { ClientProviders } from "@/components/ClientProviders";

export function RootProviders({ children }: { children: ReactNode }) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClerkProvider dynamic>
      {hasClerkKey ? (
        <>
          <ClerkTokenProvider />
          <AuthGate>
            <ClientProviders>{children}</ClientProviders>
          </AuthGate>
        </>
      ) : (
        <ClientProviders>{children}</ClientProviders>
      )}
    </ClerkProvider>
  );
}
