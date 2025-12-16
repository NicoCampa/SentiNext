import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <div className="badge">
        <span className="gradientText" style={{ fontWeight: 700 }}>
          New
        </span>
        Steam review insights — delivered as a PDF by email
      </div>

      <h1 className="headline" style={{ marginTop: 18 }}>
        Understand your players in
        <br />
        <span className="gradientText">one clear report</span>.
      </h1>
      <p className="subhead">
        Paste a Steam app id, pay €10, and receive a polished PDF summarizing sentiment, top issues, feature requests,
        and actionable insights.
      </p>

      <div className="ctaRow">
        <Link href="/report" className="btn btnPrimary">
          Buy report (€10) →
        </Link>
        <a className="btn" href="https://store.steampowered.com" target="_blank" rel="noreferrer">
          Find a Steam app id
        </a>
      </div>

      <div className="heroGrid">
        <div className="heroCard">
          <div className="heroCardInner">
            <div>
              <div className="sectionTitle" style={{ marginTop: 0 }}>
                What you get
              </div>
              <div className="cardGrid">
                {[
                  ["Key themes", "The biggest drivers of positive and negative sentiment across reviews."],
                  ["Top issues", "Concrete pain points, severity signals, and what to fix first."],
                  ["Feature requests", "Most requested features and improvement ideas from players."],
                ].map(([title, desc]) => (
                  <div key={title} className="card">
                    <div className="cardTitle">{title}</div>
                    <div className="cardDesc">{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="sectionTitle" style={{ marginTop: 0 }}>
                How it works
              </div>
              <div className="card" style={{ background: "var(--card)" }}>
                <div className="cardDesc" style={{ marginTop: 0 }}>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                    <li>Enter a Steam app id and your email.</li>
                    <li>Pay securely with Stripe.</li>
                    <li>We generate the report and email the PDF.</li>
                  </ol>
                </div>
              </div>

              <div className="card" style={{ marginTop: 14, background: "var(--card)" }}>
                <div className="cardTitle">One-time payment</div>
                <div className="cardDesc">€10 per game report, no subscription. You can buy again anytime.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
