"use client";

import { useState } from "react";
import Link from "next/link";

export default function ReportPage() {
  const [appId, setAppId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ appId: number; name: string; image: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function searchGames(term: string) {
    if (term.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/games?q=${encodeURIComponent(term.trim())}`);
      const data = (await res.json()) as { items?: typeof results };
      setResults(data.items || []);
    } catch (err) {
      setSearchError((err as Error).message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId, email }),
      });
      const contentType = response.headers.get("content-type") || "";
      const payload =
        contentType.includes("application/json")
          ? ((await response.json()) as { url?: string; error?: string })
          : { error: await response.text() };
      if (!response.ok) {
        throw new Error(payload.error || "Checkout failed");
      }
      if (!payload.url) {
        throw new Error("Missing Stripe Checkout URL");
      }
      window.location.href = payload.url;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="pill pillPrimary">€10 · One-time · Stripe checkout</div>

      <h1 className="headline" style={{ fontSize: "clamp(30px, 3.4vw, 44px)", marginTop: 16 }}>
        Buy a PDF report for your Steam game
      </h1>
      <p className="subhead">
        We analyze recent reviews, surface sentiment, issues, and feature requests, and email you a polished PDF.
      </p>

      <div className="formCard">
        <form onSubmit={onSubmit} className="fieldGrid">
          <label className="label">
            Steam app id
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e.g. 620"
              inputMode="numeric"
              className="input"
              required
            />
          </label>

          <label className="label">
            Or search by name
            <input
              value={query}
              onChange={(e) => {
                const val = e.target.value;
                setQuery(val);
                void searchGames(val);
              }}
              placeholder="e.g. Counter-Strike 2"
              className="input"
            />
          </label>

          {results.length > 0 ? (
            <div className="panel" style={{ marginTop: 4 }}>
              <div className="panelTitle" style={{ marginBottom: 8 }}>Select a game</div>
              <div style={{ display: "grid", gap: 8 }}>
                {results.map((item) => (
                  <button
                    key={item.appId}
                    type="button"
                    className="btn"
                    style={{
                      justifyContent: "flex-start",
                      background: "rgba(255,255,255,0.05)",
                      borderColor: "rgba(255,255,255,0.12)",
                    }}
                    onClick={() => {
                      setAppId(String(item.appId));
                      setQuery(item.name);
                      setResults([]);
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{item.name}</span>
                    <span style={{ color: "var(--muted-2)", marginLeft: "auto" }}>#{item.appId}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {searching ? <div className="muted">Searching…</div> : null}
          {searchError ? <div className="error">{searchError}</div> : null}

          <label className="label">
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              type="email"
              className="input"
              required
            />
          </label>

          <div className="helperRow">
            <span>
              Need help finding it?{" "}
              <a href="https://store.steampowered.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                Open Steam →
              </a>
            </span>
            <span>We’ll email the report after payment.</span>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button type="submit" disabled={loading} className="btn btnPrimary" style={{ width: "100%", marginTop: 4 }}>
            {loading ? "Redirecting…" : "Pay €10 with Stripe"}
          </button>

          <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            By continuing, you agree that we’ll process public Steam review text to generate the report. Not affiliated with
            Valve.
          </div>
        </form>
      </div>

      <div className="gridColumns section">
        <div className="panel">
          <div className="panelTitle">What happens next?</div>
          <div className="panelDesc">
            We process ~100 recent reviews, extract themes and issues, and send you a PDF. If something looks off, reply to
            the email and we’ll regenerate it.
          </div>
        </div>
        <div className="panel">
          <div className="panelTitle">Payment & security</div>
          <div className="panelDesc">Stripe handles the payment. We never store card details.</div>
        </div>
      </div>

      <div className="ctaRow" style={{ marginTop: 18 }}>
        <Link href="/" className="btn">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
