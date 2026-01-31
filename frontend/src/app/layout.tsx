import clsx from "clsx";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { ClerkTokenProvider } from "@/components/ClerkTokenProvider";
import { ClientProviders } from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "SENTINEXT // Review Intelligence",
  description: "Cyberpunk Steam sentiment intelligence dashboard",
};

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClerkProvider>
      <html lang="en" className="bg-[rgb(5,5,15)]">
        <body
          className={clsx(
            jetbrainsMono.variable,
            "min-h-screen bg-transparent text-[rgb(224,224,224)] antialiased font-mono"
          )}
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
        </body>
      </html>
    </ClerkProvider>
  );
}
