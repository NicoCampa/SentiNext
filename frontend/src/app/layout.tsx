import clsx from "clsx";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { RootProviders } from "@/components/RootProviders";

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
  return (
    <html lang="en" className="bg-[rgb(5,5,15)]">
      <body
        className={clsx(
          jetbrainsMono.variable,
          "min-h-screen bg-transparent text-[rgb(224,224,224)] antialiased font-mono"
        )}
      >
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
