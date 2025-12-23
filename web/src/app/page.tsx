import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <section className="hero">
        <div className="heroIntro stagger">
          <div className="pill pillPrimary">Steam review insights · PDF delivered to your inbox</div>
          <h1 className="headline heroTitle">
            Turn raw player feedback
            <br />
            into a <span className="gradientText">clear, actionable report</span>.
          </h1>
          <p className="subhead heroSubhead">
            Paste a Steam app id, pay €10, and we send you a polished PDF that surfaces sentiment, top issues, feature
            requests, and what to fix first. No dashboards, no noise - just the signal.
          </p>
          <div className="ctaRow heroActions">
            <Link href="/report" className="btn btnPrimary">
              Buy report (€10) →
            </Link>
            <a className="btn" href="https://store.steampowered.com" target="_blank" rel="noreferrer">
              Find a Steam app id
            </a>
          </div>
          <div className="chipRow heroMeta">
            <span className="pill pillGhost">Covers ~100 recent reviews</span>
            <span className="pill pillGhost">One-time purchase</span>
            <span className="pill pillGhost">Stripe checkout</span>
            <span className="pill pillGhost">Delivered by email</span>
          </div>
        </div>

        <div className="heroVisual reveal">
          <div className="previewCard">
            <div className="previewHeader">
              <span className="tag">Report preview</span>
              <span className="previewMeta">PDF · 9 pages</span>
            </div>
            <div className="previewSection">
              <div className="previewTitle">Sentiment split</div>
              <div className="sentimentBar">
                <span className="sentimentPositive">62% positive</span>
                <span className="sentimentNeutral">23% neutral</span>
                <span className="sentimentNegative">15% negative</span>
              </div>
            </div>
            <div className="previewSection">
              <div className="previewTitle">Top issues</div>
              <div className="previewList">
                {[
                  ["Matchmaking drops", "High"],
                  ["UI friction in menus", "Medium"],
                  ["Onboarding clarity", "Medium"],
                ].map(([issue, level]) => (
                  <div key={issue} className="previewItem">
                    <span>{issue}</span>
                    <span className="previewScore">{level}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="previewSection">
              <div className="previewTitle">Feature requests</div>
              <div className="previewList">
                {["Co-op variant", "Controller support", "Photo mode"].map((feature) => (
                  <div key={feature} className="previewItem">
                    <span>{feature}</span>
                    <span className="previewScore">Top ask</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="previewCallout">Priority fix: matchmaking reliability and retry logic.</div>
          </div>
        </div>
      </section>

      <div className="statGrid stagger sectionTight">
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

      <div className="section">
        <div className="sectionHeader">
          <span className="tag">What you get</span>
        </div>
        <div className="gridColumns stagger">
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

      <div className="section">
        <div className="sectionHeader">
          <span className="tag">How it works</span>
        </div>
        <div className="timeline stagger">
          {[
            ["Enter a Steam app id and your email."],
            ["Pay securely with Stripe checkout."],
            ["We analyze recent reviews and build the PDF."],
            ["You get the report by email and a download link."],
          ].map(([text], index) => (
            <div key={text} className="timelineStep">
              <div className="stepNumber">{index + 1}</div>
              <div className="stepText">{text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section gridColumns">
        <div className="panel">
          <div className="sectionHeader">
            <span className="tag">Sample excerpt</span>
          </div>
          <div className="panelDesc" style={{ lineHeight: 1.6 }}>
            <strong>Sentiment is mixed-positive</strong>. Players love the core loop and visuals, but highlight rough
            edges: matchmaking delays, UI friction, and unclear onboarding. Top feature asks: a cooperative mode variant
            and better controller support. Priority fixes: matchmaking reliability and tooltip clarity.
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
          <div className="panelDesc">Stripe checkout. We do not store cards. PDF is emailed to you automatically.</div>
        </div>
        <div className="panel">
          <div className="panelTitle">Support</div>
          <div className="panelDesc">
            If something looks off in your report, reply to the email and we will regenerate it quickly.
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
