"use client";

import { useState } from "react";
import Link from "next/link";

export default function ReportPage() {
  const [appId, setAppId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const payload = (await response.json()) as { url?: string; error?: string };
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
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="badge">
        <span>€10</span>
        One-time payment • Secure checkout via Stripe
      </div>

      <h1 className="headline" style={{ fontSize: "clamp(30px, 3.4vw, 44px)", marginTop: 18 }}>
        Buy a PDF report
      </h1>
      <p className="subhead">
        We analyze recent Steam reviews and email you a PDF with key themes, top issues, and feature requests.
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

      <div className="ctaRow" style={{ marginTop: 18 }}>
        <Link href="/" className="btn">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
