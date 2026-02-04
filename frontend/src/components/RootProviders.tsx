'use client';

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthGate } from "@/components/AuthGate";
import { ClerkTokenProvider } from "@/components/ClerkTokenProvider";
import { ClientProviders } from "@/components/ClientProviders";

export function RootProviders({ children }: { children: ReactNode }) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClerkProvider
      dynamic
      appearance={{
        variables: {
          colorPrimary: 'rgb(0, 255, 255)',
          colorBackground: 'rgb(5, 5, 15)',
          colorInputBackground: 'rgb(10, 10, 25)',
          colorInputText: 'rgb(200, 200, 210)',
          colorText: 'rgb(200, 200, 210)',
          colorTextSecondary: 'rgb(150, 150, 170)',
          colorTextOnPrimaryBackground: 'rgb(5, 5, 15)',
          colorDanger: 'rgb(239, 68, 68)',
          colorSuccess: 'rgb(34, 197, 94)',
          colorWarning: 'rgb(251, 146, 60)',
          borderRadius: '0px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        elements: {
          rootBox: 'mx-auto',
          card: 'bg-[rgb(5,5,15)] border border-[rgb(0,255,255)]/20 shadow-xl shadow-[rgb(0,255,255)]/5',
          headerTitle: 'text-white font-semibold',
          headerSubtitle: 'text-[rgb(150,150,170)] text-xs uppercase tracking-[0.2em]',
          socialButtonsBlockButton: 'border-[rgb(0,255,255)]/20 hover:border-[rgb(0,255,255)]/50 bg-[rgb(10,10,25)] hover:bg-[rgb(15,15,30)] text-[rgb(200,200,210)]',
          socialButtonsBlockButtonText: 'text-[rgb(200,200,210)] font-normal',
          dividerLine: 'bg-[rgb(0,255,255)]/20',
          dividerText: 'text-[rgb(150,150,170)] text-xs uppercase tracking-[0.2em]',
          formFieldLabel: 'text-[rgb(0,255,255)]/70 text-xs uppercase tracking-[0.15em] font-medium',
          formFieldInput: 'bg-[rgb(10,10,25)] border-[rgb(0,255,255)]/20 text-[rgb(200,200,210)] focus:border-[rgb(0,255,255)] focus:ring-[rgb(0,255,255)]/20',
          formButtonPrimary: 'bg-[rgb(0,255,255)] hover:bg-[rgb(0,230,230)] text-[rgb(5,5,15)] font-semibold text-xs uppercase tracking-[0.2em] shadow-lg shadow-[rgb(0,255,255)]/20',
          footerActionLink: 'text-[rgb(0,255,255)] hover:text-[rgb(0,230,230)]',
          footerActionText: 'text-[rgb(150,150,170)]',
          identityPreviewText: 'text-[rgb(200,200,210)]',
          identityPreviewEditButton: 'text-[rgb(0,255,255)] hover:text-[rgb(0,230,230)]',
          formResendCodeLink: 'text-[rgb(0,255,255)] hover:text-[rgb(0,230,230)]',
          otpCodeFieldInput: 'border-[rgb(0,255,255)]/30 text-[rgb(200,200,210)]',
          formFieldInfoText: 'text-[rgb(150,150,170)] text-xs',
          formFieldSuccessText: 'text-[rgb(34,197,94)]',
          formFieldErrorText: 'text-[rgb(239,68,68)]',
          alert: 'border-[rgb(0,255,255)]/20 bg-[rgb(10,10,25)]',
          alertText: 'text-[rgb(200,200,210)]',
          badge: 'bg-[rgb(0,255,255)]/10 text-[rgb(0,255,255)] border border-[rgb(0,255,255)]/30',
        },
      }}
    >
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
