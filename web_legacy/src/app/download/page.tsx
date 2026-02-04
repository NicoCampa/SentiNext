import Link from "next/link";

const RELEASES_URL = "https://github.com/NicoCampa/SentiNext/releases/latest";

export default function DownloadPage() {
  return (
    <div className="container">
      <span className="eyebrow">Download</span>
      <h1 className="title" style={{ fontSize: "clamp(34px, 4.1vw, 54px)" }}>
        Get the SENTINEXT desktop app
      </h1>
      <p className="lead">
        Install SENTINEXT locally and bring your own model provider (OpenAI or Ollama). Your insights database stays on
        your machine.
      </p>

      <section className="section" style={{ marginTop: 34 }}>
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Choose your platform</h2>
            <p className="sectionLead">
              Downloads are published on GitHub Releases. Pick the installer for your OS and architecture.
            </p>
          </div>
        </div>

        <div className="grid3">
          <div className="card">
            <p className="cardTitle">macOS (Apple Silicon)</p>
            <p className="cardText">
              Look for a <span className="mono">.dmg</span> with{" "}
              <span className="mono">aarch64</span> in the name.
            </p>
            <div className="heroActions" style={{ marginTop: 14 }}>
              <a className="btn btnPrimary" href={RELEASES_URL} target="_blank" rel="noreferrer">
                Open Releases →
              </a>
            </div>
          </div>

          <div className="card">
            <p className="cardTitle">macOS (Intel)</p>
            <p className="cardText">
              Look for a <span className="mono">.dmg</span> with <span className="mono">x64</span> in the name.
            </p>
            <div className="heroActions" style={{ marginTop: 14 }}>
              <a className="btn btnPrimary" href={RELEASES_URL} target="_blank" rel="noreferrer">
                Open Releases →
              </a>
            </div>
          </div>

          <div className="card">
            <p className="cardTitle">Windows</p>
            <p className="cardText">
              Use the installer (<span className="mono">.msi</span>) or setup (<span className="mono">.exe</span>) from
              the latest release.
            </p>
            <div className="heroActions" style={{ marginTop: 14 }}>
              <a className="btn btnPrimary" href={RELEASES_URL} target="_blank" rel="noreferrer">
                Open Releases →
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">Quick setup</h2>
            <p className="sectionLead">From download to insights in a couple of minutes.</p>
          </div>
        </div>

        <div className="steps">
          {[
            "Install and launch the app.",
            "Open Settings and choose OpenAI or Ollama.",
            "Paste your API key / host and pick a model.",
            "Analyze a game and explore dashboard + chat.",
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
            <h2 className="sectionTitle">Need help?</h2>
            <p className="sectionLead">Docs cover providers, where data is stored, exports, and troubleshooting.</p>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <p className="cardTitle">Docs</p>
            <p className="cardText">Quickstart, providers, chat sources, and common troubleshooting steps.</p>
            <div className="heroActions" style={{ marginTop: 14 }}>
              <Link href="/docs" className="btn">
                Open docs →
              </Link>
            </div>
          </div>
          <div className="card">
            <p className="cardTitle">Release notes</p>
            <p className="cardText">See what changed in the latest build and download older versions if needed.</p>
            <div className="heroActions" style={{ marginTop: 14 }}>
              <a className="btn" href={RELEASES_URL} target="_blank" rel="noreferrer">
                View releases →
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="cta" style={{ marginTop: 62 }}>
        <p className="ctaTitle">After installing, head to Settings first</p>
        <p className="ctaText">
          Pick your provider (OpenAI or Ollama). Then run an analysis and use chat to answer questions with citations.
        </p>
        <div className="ctaActions">
          <a className="btn btnPrimary" href={RELEASES_URL} target="_blank" rel="noreferrer">
            Download from Releases →
          </a>
          <Link className="btn" href="/">
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
