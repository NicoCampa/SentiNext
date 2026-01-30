import clsx from "clsx";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";
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
          <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 px-4 py-3 text-xs uppercase tracking-[0.25em] text-slate-300 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
              <SignedOut>
                <div className="flex items-center gap-3">
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="rounded-full border border-white/20 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-slate-200 transition hover:border-sky-400/60 hover:text-white"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button
                      type="button"
                      className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-slate-100 transition hover:border-sky-400/60 hover:text-white"
                    >
                      Sign up
                    </button>
                  </SignUpButton>
                </div>
              </SignedOut>
              <SignedIn>
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox: "h-8 w-8",
                    },
                  }}
                />
              </SignedIn>
            </div>
          </header>
          <ClientProviders>{children}</ClientProviders>
        </body>
      </html>
    </ClerkProvider>
  );
}
