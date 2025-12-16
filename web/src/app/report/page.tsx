"use client";

import { useState } from "react";

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
    <main style={{ minHeight: "100vh", background: "#0b1120", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px" }}>
        <h1 style={{ fontSize: 34, margin: 0 }}>Buy a PDF report</h1>
        <p style={{ color: "#cbd5e1", marginTop: 10 }}>
          We’ll analyze up to <b>100</b> recent reviews for testing and email you the PDF.
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 22, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#cbd5e1" }}>Steam app id</span>
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e.g. 620"
              inputMode="numeric"
              style={{
                padding: "12px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
              }}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#cbd5e1" }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              type="email"
              style={{
                padding: "12px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
              }}
              required
            />
          </label>

          {error ? (
            <div style={{ color: "#fca5a5", fontSize: 13, marginTop: 4 }}>{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              background: "#2563eb",
              color: "white",
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? "Redirecting…" : "Pay €10 with Stripe"}
          </button>
        </form>

        <p style={{ marginTop: 14, fontSize: 12, color: "#94a3b8" }}>
          After payment, we start generating your report and email it to you automatically.
        </p>
      </div>
    </main>
  );
}

