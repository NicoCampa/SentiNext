import type { Metadata } from "next";
import Link from "next/link";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "SENTINEXT // Review Intelligence",
    template: "%s // SENTINEXT",
  },
  description:
    "Local-first Steam review intelligence: actionable dashboard + chat with sources. Bring your own AI key (OpenAI or Ollama).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <div className="shell">
          <header className="siteHeader">
            <div className="container headerInner">
              <Link href="/" className="brand" aria-label="SENTINEXT home">
                <span className="brandMark" aria-hidden="true">
                  <span className="brandMarkInner" />
                </span>
                <span className="brandName">SENTINEXT</span>
              </Link>

              <nav className="nav" aria-label="Primary">
                <Link href="/#features" className="navLink">
                  Features
                </Link>
                <Link href="/#workflow" className="navLink">
                  How it works
                </Link>
                <Link href="/docs" className="navLink">
                  Docs
                </Link>
                <Link href="/download" className="btn btnPrimary btnSmall">
                  Download
                </Link>
              </nav>
            </div>
          </header>

          <main className="siteMain">{children}</main>

          <footer className="siteFooter">
            <div className="container footerInner">
              <div className="footerMeta">
                <p className="footerTitle">SENTINEXT</p>
                <p className="footerText">
                  Local-first Steam review intelligence for game teams. Data stays on your machine.
                </p>
              </div>
              <div className="footerLinks">
                <Link href="/download" className="footerLink">
                  Download
                </Link>
                <Link href="/docs" className="footerLink">
                  Docs
                </Link>
                <a
                  className="footerLink"
                  href="https://github.com/NicoCampa/SentiNext"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
              </div>
            </div>
            <div className="container footerFineprint">
              SENTINEXT analyzes public Steam reviews. Not affiliated with Valve.{" "}
              <span className="footerMuted">{"//"} {new Date().getFullYear()} SENTINEXT</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
