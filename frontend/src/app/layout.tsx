import clsx from "clsx";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { RootProviders } from "@/components/RootProviders";

export const metadata: Metadata = {
  title: "SENTINEXT - Review Intelligence",
  description: "Modern Steam review analytics and insights platform",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.svg",
  },
};

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={clsx("dark", spaceGrotesk.className)}>
      <body
        className={clsx(
          spaceGrotesk.variable,
          "min-h-screen bg-slate-950 text-slate-100 antialiased"
        )}
      >
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
