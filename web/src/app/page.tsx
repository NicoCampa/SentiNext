import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b1120", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "56px 20px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>SentiNext</div>
          <Link href="/report" style={{ color: "#93c5fd", textDecoration: "none" }}>
            Get a report →
          </Link>
        </header>

        <section style={{ marginTop: 56 }}>
          <h1 style={{ fontSize: 44, margin: 0, lineHeight: 1.05 }}>
            Steam review insights PDF,
            <br />
            delivered by email.
          </h1>
          <p style={{ marginTop: 16, fontSize: 18, color: "#cbd5e1", maxWidth: 720 }}>
            Enter a Steam game, pay €10, and receive a detailed PDF report with aggregated insights and top issues.
          </p>

          <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/report"
              style={{
                background: "#2563eb",
                color: "white",
                padding: "12px 16px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Buy report (€10)
            </Link>
            <a
              href="https://store.steampowered.com"
              target="_blank"
              rel="noreferrer"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "#e5e7eb",
                padding: "12px 16px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              Find a Steam app id
            </a>
          </div>

          <div
            style={{
              marginTop: 40,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            {[
              ["Aggregated insights", "Top issues, feature requests, urgency, and key metrics."],
              ["Fast delivery", "A background job generates the report and emails it to you."],
              ["One-off payment", "€10 per game report, no subscription."],
            ].map(([title, desc]) => (
              <div
                key={title}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 700 }}>{title}</div>
                <div style={{ marginTop: 6, color: "#cbd5e1", fontSize: 14 }}>{desc}</div>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: 56, color: "#94a3b8", fontSize: 12 }}>
          This product summarizes public Steam reviews and may contain noise. Not affiliated with Valve.
        </footer>
      </div>
    </main>
  );
}

