import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "../globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SENTINEXT | Steam Review Intelligence",
  description: "Analyze Steam reviews with AI: label issues and feature requests, extract evidence quotes, and track what to fix next.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.svg",
  },
  openGraph: {
    title: "SENTINEXT | Steam Review Intelligence",
    description: "AI-assisted review analysis for Steam game teams.",
    url: "https://sentinext.com",
    siteName: "SENTINEXT",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SENTINEXT | Steam Review Intelligence",
    description: "AI-assisted review analysis for Steam game teams.",
  },
};

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { normalizeLocale } from "@/lib/i18n";

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'it' }, { lang: 'fr' }, { lang: 'de' }];
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);

  return (
    <html lang={locale} className="dark">
      <body
        className={`${spaceGrotesk.variable} antialiased bg-background text-foreground font-sans flex flex-col min-h-screen relative overflow-x-hidden`}
      >
        {/* Global Background Effects */}
        <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse-soft" />
          <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-secondary/10 rounded-full blur-[100px] animate-pulse-soft" style={{ animationDelay: '2s' }} />
          <div className="absolute top-[30%] right-[10%] w-[20%] h-[20%] bg-primary/5 rounded-full blur-[80px] animate-pulse-soft" style={{ animationDelay: '4s' }} />
        </div>

        <Header lang={locale} />
        <main className="flex-1">{children}</main>
        <Footer lang={locale} />
      </body>
    </html>
  );
}
