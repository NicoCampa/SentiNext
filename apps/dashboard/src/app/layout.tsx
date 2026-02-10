import clsx from "clsx";
import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={clsx(
          "min-h-screen bg-slate-950 text-slate-100 antialiased"
        )}
      >
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
