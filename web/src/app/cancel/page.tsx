import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="callout">
        <h1 className="calloutTitle">Download paused</h1>
        <p className="calloutText">No worries. You can download the app whenever you are ready.</p>
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
