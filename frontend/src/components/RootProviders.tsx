'use client';

import type { ReactNode } from "react";
import { ClientProviders } from "@/components/ClientProviders";

export function RootProviders({ children }: { children: ReactNode }) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // Local development without Clerk
  if (!hasClerkKey) {
    return <ClientProviders>{children}</ClientProviders>;
  }

  // Production with Clerk authentication
  // Lazy load Clerk components only when needed
  const { ClerkProvider } = require("@clerk/nextjs");
  const { AuthGate } = require("@/components/AuthGate");
  const { ClerkTokenProvider } = require("@/components/ClerkTokenProvider");

  return (
    <ClerkProvider dynamic>
      <ClerkTokenProvider />
      <AuthGate>
        <ClientProviders>{children}</ClientProviders>
      </AuthGate>
    </ClerkProvider>
  );
}
