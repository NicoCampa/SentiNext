import clsx from "clsx";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { RootProviders } from "@/components/RootProviders";

export const metadata: Metadata = {
  title: "SentiNext - Review Intelligence",
  description: "Modern Steam review analytics and insights platform",
};

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={clsx(
          spaceGrotesk.variable,
          "min-h-screen bg-slate-950 text-slate-100 antialiased font-sans"
        )}
      >
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
