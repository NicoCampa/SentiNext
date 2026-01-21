import Link from "next/link";

const DOWNLOAD_URL = "https://github.com/NicoCampa/SentiNext/releases";

export default function DownloadPage() {
  return (
    <div className="container" style={{ maxWidth: 980 }}>
      <div className="pill pillPrimary">Download SentiNext</div>
      <h1 className="headline" style={{ fontSize: "clamp(30px, 3.4vw, 46px)", marginTop: 16 }}>
        Get the local desktop app
      </h1>
      <p className="subhead">
        Pick your platform and run SentiNext locally. You control the data, you select the LLM provider, and the
        dashboard stays on your machine.
      </p>

      <div className="cardGrid sectionTight">
        {[
          ["macOS", "DMG installer", "Download for macOS"],
          ["Windows", "MSI installer", "Download for Windows"],
          ["Linux", "AppImage", "Download for Linux"],
        ].map(([title, meta, cta]) => (
          <div key={title} className="card">
            <div className="cardTitle">{title}</div>
            <div className="cardDesc">{meta}</div>
            <div className="ctaRow" style={{ marginTop: 12 }}>
              <a className="btn btnPrimary" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                {cta} →
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="sectionHeader">
          <span className="tag">Setup</span>
        </div>
        <div className="timeline stagger">
          {[
            ["Install the app and launch it."],
            ["Open Settings and choose Ollama or OpenAI."],
            ["Paste your API key and pick a model."],
            ["Analyze a Steam game and explore the dashboard."],
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
          <div className="panelTitle">Providers</div>
          <div className="panelDesc">
            Use Ollama for local models or OpenAI for hosted models. SentiNext stores the key locally and only uses it
            when you run an analysis.
          </div>
        </div>
        <div className="panel">
          <div className="panelTitle">Local data</div>
          <div className="panelDesc">
            Reviews, labels, and evidence live in a local database on your machine. Export when you need to share.
          </div>
        </div>
        <div className="panel">
          <div className="panelTitle">Need help?</div>
          <div className="panelDesc">
            Build instructions and release notes are available on GitHub. Use the Releases page for the latest builds.
          </div>
        </div>
      </div>

      <div className="ctaRow" style={{ marginTop: 18 }}>
        <Link href="/" className="btn">
          ← Back to home
        </Link>
        <a className="btn" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
          View releases →
        </a>
      </div>
    </div>
  );
}
