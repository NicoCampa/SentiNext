import clsx from "clsx";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
    <html lang="en" className="bg-slate-950">
      <body className={clsx(inter.variable, "min-h-screen bg-transparent text-slate-100 antialiased")}>{children}</body>
    </html>
  );
}
