import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "../globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SentiNext | Steam Review Intelligence & AI Analytics",
  description: "Turn 2,000+ Steam reviews into a prioritized bug backlog in minutes. Autonomous LLM classification for game developers and publishers.",
  openGraph: {
    title: "SentiNext | Steam Review Intelligence",
    description: "Autonomous LLM classification for game feedback.",
    url: "https://sentinext.com",
    siteName: "SentiNext",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SentiNext | Steam Review Intelligence",
    description: "Autonomous LLM classification for game feedback.",
  },
};

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

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

  return (
    <html lang={lang} className="dark">
      <body
        className={`${spaceGrotesk.variable} antialiased bg-background text-foreground font-sans flex flex-col min-h-screen relative overflow-x-hidden`}
      >
        {/* Global Background Effects */}
        <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse-soft" />
          <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-secondary/10 rounded-full blur-[100px] animate-pulse-soft" style={{ animationDelay: '2s' }} />
          <div className="absolute top-[30%] right-[10%] w-[20%] h-[20%] bg-primary/5 rounded-full blur-[80px] animate-pulse-soft" style={{ animationDelay: '4s' }} />
        </div>

        <Header lang={lang} />
        <main className="flex-1">{children}</main>
        <Footer lang={lang} />
      </body>
    </html>
  );
}
