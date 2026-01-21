import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <section className="hero">
        <div className="heroIntro stagger">
          <div className="pill pillPrimary">Local desktop app · bring your own API key</div>
          <h1 className="headline heroTitle">
            Turn Steam reviews into a <span className="gradientText">living dashboard</span>.
            <br />
            Run it locally, act faster.
          </h1>
          <p className="subhead heroSubhead">
            SentiNext is a downloadable app that analyzes Steam reviews and highlights issues, feature requests,
            segmentation, and evidence-backed insights. Your data stays on your machine, and you pick the model provider.
          </p>
          <div className="ctaRow heroActions">
            <Link href="/download" className="btn btnPrimary">
              Download app →
            </Link>
            <a className="btn" href="#dashboard">
              See dashboard tour
            </a>
          </div>
          <div className="chipRow heroMeta">
            <span className="pill pillGhost">Ollama + OpenAI</span>
            <span className="pill pillGhost">Issues + requests tracking</span>
            <span className="pill pillGhost">Evidence per tag</span>
            <span className="pill pillGhost">Compare games</span>
          </div>
        </div>

        <div className="heroVisual reveal">
          <div className="previewCard">
            <div className="previewHeader">
              <span className="tag">Dashboard preview</span>
              <span className="previewMeta">Local insights</span>
            </div>
            <div className="previewSection">
              <div className="previewTitle">Issue hotspots</div>
              <div className="previewList">
                {[
                  ["Technical/performance", "24 mentions"],
                  ["UI/UX/menus", "18 mentions"],
                  ["Onboarding/clarity", "12 mentions"],
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
                {["Controller support", "Photo mode", "More difficulty options"].map((feature) => (
                  <div key={feature} className="previewItem">
                    <span>{feature}</span>
                    <span className="previewScore">Top ask</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="previewSection">
              <div className="previewTitle">User segments</div>
              <div className="previewList">
                {[
                  ["Newcomers", "Onboarding friction"],
                  ["Veterans", "Balance concerns"],
                ].map(([segment, insight]) => (
                  <div key={segment} className="previewItem">
                    <span>{segment}</span>
                    <span className="previewScore">{insight}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="previewCallout">
              Priority action: stabilize performance spikes and simplify early missions.
            </div>
          </div>
        </div>
      </section>

      <div className="statGrid stagger sectionTight">
        {[
          ["Local-first", "Runs on your machine, keeps data private"],
          ["Bring your key", "Use Ollama or OpenAI"],
          ["Issue tracker", "Issues + requests by subcategory"],
          ["Evidence", "Every tag has quotes"],
        ].map(([n, label]) => (
          <div key={n} className="stat">
            <div className="statNumber">{n}</div>
            <div className="statLabel">{label}</div>
          </div>
        ))}
      </div>

      <div className="section" id="dashboard">
        <div className="sectionHeader">
          <span className="tag">Dashboard tour</span>
        </div>
        <div className="gridColumns stagger">
          {[
            ["Category heatmap", "See recommendation rates and volume by category and subcategory."],
            ["Issue + request tracking", "Split complaints and requests, with evidence and counts."],
            ["Userbase segmentation", "Surface pain points for newcomers, veterans, and playtime segments."],
            ["Chat with insights", "Ask questions and jump to the cited reviews."],
            ["Filters everywhere", "Slice by sentiment, helpful votes, and recency across the dashboard."],
            ["Compare games", "Benchmark two titles with side-by-side metrics."],
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
            ["Download the desktop app."],
            ["Choose Ollama or OpenAI and paste your API key."],
            ["Analyze a Steam game and build the local dashboard."],
            ["Review issues, requests, and evidence. Export what you need."],
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
            <span className="tag">Why local?</span>
          </div>
          <div className="panelDesc" style={{ lineHeight: 1.6 }}>
            Keep your data and keys on your machine. Run offline after reviews are fetched, and keep full control over
            storage and export.
          </div>
        </div>

        <div className="panel">
          <div className="sectionHeader">
            <span className="tag">Built for action</span>
          </div>
          <ul className="list">
            <li>Evidence quotes per tag to validate insights</li>
            <li>Issue vs request separation for clear prioritization</li>
            <li>Segments to tailor fixes by player group</li>
            <li>Chat to answer product questions fast</li>
          </ul>
        </div>
      </div>

      <div className="ctaPanel">
        <div className="sectionHeader" style={{ marginBottom: 8, color: "var(--text)" }}>
          Ready to run SentiNext locally?
        </div>
        <div className="ctaRow" style={{ marginTop: 6 }}>
          <Link href="/download" className="btn btnPrimary">
            Download the app →
          </Link>
          <a className="btn" href="https://github.com/NicoCampa/SentiNext" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
