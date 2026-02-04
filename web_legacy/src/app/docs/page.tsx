import Link from "next/link";

const RELEASES_URL = "https://github.com/NicoCampa/SentiNext/releases/latest";

export default function DocsPage() {
  return (
    <div className="container">
      <span className="eyebrow">Docs</span>
      <h1 className="title" style={{ fontSize: "clamp(34px, 4.1vw, 54px)" }}>
        Quickstart + product notes
      </h1>
      <p className="lead">
        SENTINEXT is a local-first desktop app. This page explains the basic workflow, what “chat with sources” means,
        and how to keep cost and speed predictable.
      </p>

      <section className="section" style={{ marginTop: 34 }}>
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Quickstart</h2>
            <p className="sectionLead">From zero to insights.</p>
          </div>
          <Link href="/download" className="btn btnSmall btnPrimary">
            Download →
          </Link>
        </div>

        <div className="steps">
          {[
            "Install and launch SENTINEXT.",
            "Open Settings → choose OpenAI or Ollama, set model + key/host.",
            "Analyze a game (use Estimate to preview LLM calls).",
            "Use the dashboard + chat to create top actions and export what you need.",
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
            <h2 className="sectionTitle">Providers</h2>
            <p className="sectionLead">Bring your own key — choose what fits your workflow.</p>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <p className="cardTitle">OpenAI</p>
            <p className="cardText">
              Use hosted models (e.g. <span className="mono">gpt-5-mini</span>). Keys are stored locally in the OS
              keychain. You pay OpenAI directly.
            </p>
          </div>
          <div className="card">
            <p className="cardTitle">Ollama</p>
            <p className="cardText">
              Use a local model via an Ollama host (e.g. <span className="mono">http://127.0.0.1:11434</span>). Great
              for privacy and cost control.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Chat with sources</h2>
            <p className="sectionLead">Answers are grounded in your labeled reviews.</p>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <p className="cardTitle">What you see</p>
            <p className="cardText">
              Chat responses include citations. Clicking a citation opens the full review and highlights the quoted
              snippet.
            </p>
          </div>
          <div className="card">
            <p className="cardTitle">How retrieval works</p>
            <p className="cardText">
              Retrieval uses full-text search and then cites evidence stored during labeling. No embeddings database
              required.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Cost + speed control</h2>
            <p className="sectionLead">Keep runs predictable.</p>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <p className="cardTitle">Estimate before you run</p>
            <p className="cardText">
              The dashboard includes an Estimate button that predicts how many reviews will use cache/rules vs require
              new LLM calls.
            </p>
          </div>
          <div className="card">
            <p className="cardTitle">Keep runs small</p>
            <p className="cardText">
              Start with 100–200 reviews, validate the output, then scale up only when it’s worth the cost.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Troubleshooting</h2>
            <p className="sectionLead">If something feels “stuck”, here’s what to check.</p>
          </div>
        </div>

        <div className="faq">
          <div className="faqItem">
            <p className="faqQ">The app says the backend is offline</p>
            <p className="faqA">
              Open Settings → Diagnostics to check backend status and logs. If it still fails, restart the app.
            </p>
          </div>
          <div className="faqItem">
            <p className="faqQ">Chat answers are too generic</p>
            <p className="faqA">
              Run an analysis first so reviews are labeled with evidence. Then narrow down the review set with sentiment
              or category filters before asking again.
            </p>
          </div>
          <div className="faqItem">
            <p className="faqQ">macOS won’t open the app</p>
            <p className="faqA">
              Download the latest signed build from Releases. If Gatekeeper blocks it, right‑click → Open once.
            </p>
          </div>
          <div className="faqItem">
            <p className="faqQ">Where do downloads live?</p>
            <p className="faqA">
              Builds are published on GitHub Releases. Grab the installer that matches your OS and architecture.
            </p>
          </div>
        </div>

        <div className="codeBlock" aria-label="Download link">
          <code>{`Latest builds: ${RELEASES_URL}`}</code>
        </div>
      </section>
    </div>
  );
}
