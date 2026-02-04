import Link from "next/link";

const FEATURE_CARDS: Array<{ title: string; text: string }> = [
  {
    title: "Reports & exports",
    text: "Generate PDF summaries and export review subsets to CSV for team sharing.",
  },
  {
    title: "Actionable dashboard",
    text: "Recommendation rate and volume by category/subcategory so you can spot what actually moves sentiment.",
  },
  {
    title: "Issues vs requests",
    text: "Separate bugs from feature requests, with subcategory counts and evidence you can paste into tickets.",
  },
  {
    title: "Chat with sources",
    text: "Ask questions like “what are players saying about AI?” and jump to the exact cited reviews.",
  },
  {
    title: "Cost + speed control",
    text: "Estimate LLM calls before you run. Reuse cache, apply rules for easy cases, and stay in control.",
  },
  {
    title: "Local-first storage",
    text: "Reviews, labels, evidence, and exports are stored locally in PostgreSQL. No accounts. No shared database.",
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Do you store my API key?",
    a: "The desktop app stores your settings locally. OpenAI keys are stored in the OS keychain; nothing is sent to SENTINEXT servers.",
  },
  {
    q: "Can I use it offline?",
    a: "Once reviews are fetched and stored, you can browse insights offline. New analyses and chat require your chosen model provider.",
  },
  {
    q: "What does “chat with sources” mean?",
    a: "Every answer includes citations. Click a citation to open the full review, so you can validate insights fast.",
  },
  {
    q: "Is this a vector database / embeddings system?",
    a: "No. Chat retrieval uses full‑text search and cites only evidence from your labeled reviews.",
  },
];

export default function HomePage() {
  return (
    <div className="container">
      <section className="hero">
        <div>
          <span className="eyebrow">Local desktop app · bring your own AI key</span>
          <h1 className="title">
            Turn Steam reviews into{" "}
            <span className="gradientText">decisions you can ship</span>.
          </h1>
          <p className="lead">
            SENTINEXT is a local-first Steam review intelligence app. It classifies reviews into a consistent taxonomy,
            surfaces issues and feature requests, and lets you chat with insights — with clickable sources.
          </p>

          <div className="heroActions">
            <Link href="/download" className="btn btnPrimary">
              Download the app →
            </Link>
            <Link href="/docs" className="btn">
              Read docs
            </Link>
            <a href="#features" className="btn">
              See features ↓
            </a>
          </div>

          <div className="chips" aria-label="Product highlights">
            <span className="chip">Chat with sources</span>
            <span className="chip">Reports</span>
            <span className="chip">Issues + requests</span>
            <span className="chip">Segmentation</span>
            <span className="chip">Compare games</span>
          </div>
        </div>

        <div className="heroMock" aria-label="SENTINEXT dashboard preview">
          <div className="mockHeader">
            <div className="mockTitle">Dashboard · Cyberpunk 2077</div>
            <div className="mockPills" aria-label="Filters preview">
              <span className="mockPill">Not recommended</span>
              <span className="mockPill">30d</span>
              <span className="mockPill">25+ helpful</span>
            </div>
          </div>

          <div className="mockGrid">
            <div className="mockCard">
              <div className="mockCardTitle">Top issues</div>
              <div className="mockList">
                {[
                  ["technical/performance", "24"],
                  ["ui_ux_accessibility/controls", "16"],
                  ["gameplay/ai_behavior", "12"],
                ].map(([label, count]) => (
                  <div className="mockListItem" key={label}>
                    <span className="mono">{label}</span>
                    <span className="mockListMeta">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mockCard">
              <div className="mockCardTitle">Top requests</div>
              <div className="mockList">
                {[
                  ["ui_ux_accessibility/key_remapping", "Top ask"],
                  ["content_design/more_content", "Top ask"],
                  ["presentation/photo_mode", "Top ask"],
                ].map(([label, meta]) => (
                  <div className="mockListItem" key={label}>
                    <span className="mono">{label}</span>
                    <span className="mockListMeta">{meta}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mockCard" style={{ marginTop: 12, position: "relative" }}>
            <div className="mockCardTitle">Chat with sources</div>
            <div className="mockList" aria-label="Chat preview">
              <div className="mockListItem">
                <span>“Why are players not recommending?”</span>
                <span className="mockListMeta">Ask →</span>
              </div>
              <div className="mockListItem">
                <span>Answer cites 6 reviews</span>
                <span className="mockListMeta">Click to open</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Built for action, not vanity charts</h2>
            <p className="sectionLead">
              Everything is evidence-backed. If the dashboard says “performance is killing sentiment”, you can click into
              the reviews that prove it.
            </p>
          </div>
        </div>

        <div className="grid3">
          {FEATURE_CARDS.map((item) => (
            <div key={item.title} className="card">
              <p className="cardTitle">{item.title}</p>
              <p className="cardText">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">How it works</h2>
            <p className="sectionLead">Download, add your provider, analyze, and explore — all on your machine.</p>
          </div>
        </div>

        <div className="steps">
          {[
            "Download the desktop app (macOS or Windows).",
            "Choose OpenAI or Ollama and set your model + key.",
            "Analyze a Steam game (estimate LLM calls first).",
            "Use dashboard + chat to create top actions and export.",
          ].map((text, index) => (
            <div key={text} className="step">
              <div className="stepNumber">{index + 1}</div>
              <div className="stepText">{text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Privacy and control</h2>
            <p className="sectionLead">
              You own your data and your costs. SENTINEXT is built to run locally and stay predictable.
            </p>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <p className="cardTitle">Local database</p>
            <p className="cardText">
              Reviews, labels, evidence, and logs are stored locally. The app works without accounts or hosted storage.
            </p>
          </div>
          <div className="card">
            <p className="cardTitle">Deterministic chat retrieval</p>
            <p className="cardText">
              Chat is grounded in your data. Retrieval uses local full-text search and citations always link back to real
              reviews.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">FAQ</h2>
            <p className="sectionLead">The most common questions from teams evaluating SENTINEXT.</p>
          </div>
        </div>

        <div className="faq">
          {FAQ.map((item) => (
            <div key={item.q} className="faqItem">
              <p className="faqQ">{item.q}</p>
              <p className="faqA">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta">
        <p className="ctaTitle">Ready to explore your Steam reviews locally?</p>
        <p className="ctaText">
          Download the app and run your first analysis. Use the dashboard + chat to turn feedback into a clear set of
          top actions.
        </p>
        <div className="ctaActions">
          <Link href="/download" className="btn btnPrimary">
            Download →
          </Link>
          <a className="btn" href="https://github.com/NicoCampa/SentiNext" target="_blank" rel="noreferrer">
            View GitHub →
          </a>
        </div>
      </section>
    </div>
  );
}
