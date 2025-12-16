import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SentiNext Reports",
  description: "Pay €10 and receive a Steam review insights PDF report by email.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <header className="siteHeader">
            <div className="container siteHeaderInner">
              <Link href="/" className="logo" aria-label="SentiNext home">
                <span className="logoMark" aria-hidden="true" />
                SentiNext
              </Link>
              <nav className="nav" aria-label="Primary">
                <Link href="/report" className="btn btnSmall">
                  Get a report →
                </Link>
              </nav>
            </div>
          </header>

          <main className="siteMain">{children}</main>

          <footer className="siteFooter">
            <div className="container">
              SentiNext summarizes public Steam reviews and may contain noise. Not affiliated with Valve.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
