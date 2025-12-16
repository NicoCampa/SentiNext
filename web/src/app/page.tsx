import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <div className="pill pillPrimary">Steam review insights · PDF delivered to your inbox</div>

      <h1 className="headline" style={{ marginTop: 16 }}>
        Turn raw player feedback
        <br />
        into a <span className="gradientText">clear, actionable report</span>.
      </h1>
      <p className="subhead">
        Paste a Steam app id, pay €10, and we send you a beautiful PDF that surfaces sentiment, top issues, feature
        requests, and what to fix first. No dashboards, no noise—just the signal.
      </p>

      <div className="chipRow">
        <span className="pill pillGhost">Covers ~100 recent reviews</span>
        <span className="pill pillGhost">One-time purchase</span>
        <span className="pill pillGhost">Stripe checkout</span>
        <span className="pill pillGhost">Delivered by email</span>
      </div>

      <div className="ctaRow">
        <Link href="/report" className="btn btnPrimary">
          Buy report (€10) →
        </Link>
        <a className="btn" href="https://store.steampowered.com" target="_blank" rel="noreferrer">
          Find a Steam app id
        </a>
      </div>

      <div className="statGrid">
        {[
          ["4 minutes", "Typical checkout to delivery"],
          ["100+", "Recent reviews analyzed"],
          ["€10", "One-time, no subscription"],
          ["Email", "PDF delivered to your inbox"],
        ].map(([n, label]) => (
          <div key={n} className="stat">
            <div className="statNumber">{n}</div>
            <div className="statLabel">{label}</div>
          </div>
        ))}
      </div>

      <div className="heroGrid section">
        <div className="heroCard">
          <div className="heroCardInner">
            <div>
              <div className="sectionHeader">
                <span className="tag">What you get</span>
              </div>
              <div className="gridColumns">
                {[
                  ["Key themes", "Positive and negative drivers summarized so you know the real mood."],
                  ["Top issues", "Concrete pain points with severity cues and what to fix first."],
                  ["Feature requests", "Most requested improvements and ideas, organized by frequency."],
                  ["Opportunities", "Quick wins that boost reviews and reduce churn risk."],
                ].map(([title, desc]) => (
                  <div key={title} className="panel">
                    <div className="panelTitle">{title}</div>
                    <div className="panelDesc">{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="sectionHeader">
                <span className="tag">How it works</span>
              </div>
              <div className="panel">
                <ol className="list">
                  <li>Enter a Steam app id and your email.</li>
                  <li>Pay securely with Stripe.</li>
                  <li>We process recent reviews and build the PDF.</li>
                  <li>You get the report by email (plus a download link).</li>
                </ol>
              </div>
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panelTitle">No subscription</div>
                <div className="panelDesc">€10 per game report. Buy again anytime as the reviews change.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section gridColumns">
        <div className="panel">
          <div className="sectionHeader">
            <span className="tag">Sample excerpt</span>
          </div>
          <div className="panelDesc" style={{ lineHeight: 1.6 }}>
            <strong>Sentiment is mixed-positive</strong>. Players love the core loop and visuals, but highlight rough edges:
            matchmaking delays, UI friction, and unclear onboarding. Top feature asks: a cooperative mode variant and better
            controller support. Priority fixes: matchmaking reliability and tooltip clarity.
          </div>
        </div>

        <div className="panel">
          <div className="sectionHeader">
            <span className="tag">Inside the PDF</span>
          </div>
          <ul className="list">
            <li>Executive summary and sentiment trend</li>
            <li>Top 5 issues with severity and recurrence</li>
            <li>Most requested features, grouped by theme</li>
            <li>Positive highlights to double down on</li>
          </ul>
        </div>
      </div>

      <div className="section gridColumns">
        <div className="panel">
          <div className="panelTitle">Payments & delivery</div>
          <div className="panelDesc">Stripe checkout. We don’t store cards. PDF is emailed to you automatically.</div>
        </div>
        <div className="panel">
          <div className="panelTitle">Support</div>
          <div className="panelDesc">
            If something looks off in your report, reply to the email and we’ll regenerate it quickly.
          </div>
        </div>
      </div>

      <div className="ctaPanel">
        <div className="sectionHeader" style={{ marginBottom: 8, color: "var(--text)" }}>
          Ready to see your players clearly?
        </div>
        <div className="ctaRow" style={{ marginTop: 6 }}>
          <Link href="/report" className="btn btnPrimary">
            Buy a report (€10) →
          </Link>
          <a className="btn" href="https://store.steampowered.com" target="_blank" rel="noreferrer">
            Find a Steam app id
          </a>
        </div>
      </div>
    </div>
  );
}
