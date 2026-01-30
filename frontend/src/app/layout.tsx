import clsx from "clsx";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { ClerkTokenProvider } from "@/components/ClerkTokenProvider";
import { ClientProviders } from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "SentiNext",
  description: "Steam sentiment intelligence dashboard",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="bg-slate-950">
        <body className={clsx(inter.variable, "min-h-screen bg-transparent text-slate-100 antialiased")}>
          <ClerkTokenProvider />
          <AuthGate>
            <ClientProviders>{children}</ClientProviders>
          </AuthGate>
        </body>
      </html>
    </ClerkProvider>
  );
}
