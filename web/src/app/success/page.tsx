import Link from "next/link";

export default function SuccessPage() {
  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="callout">
        <h1 className="calloutTitle">You are ready to launch</h1>
        <p className="calloutText">
          Download the desktop app and start exploring your local dashboard. If you already have it installed, open the
          app and set your provider in Settings.
        </p>
        <div className="ctaRow" style={{ marginTop: 6 }}>
          <Link href="/download" className="btn btnPrimary">
            Download the app →
          </Link>
          <Link href="/" className="btn">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
