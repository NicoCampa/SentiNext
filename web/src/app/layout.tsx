import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SentiNext Reports",
  description: "Pay €10 and receive a Steam review insights PDF report by email.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" }}>
        {children}
      </body>
    </html>
  );
}

