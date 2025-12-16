import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="callout">
        <h1 className="calloutTitle">Checkout canceled</h1>
        <p className="calloutText">No payment was made. You can try again whenever you’re ready.</p>
        <div className="ctaRow" style={{ marginTop: 6 }}>
          <Link href="/report" className="btn btnPrimary">
            Try again →
          </Link>
          <Link href="/" className="btn">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
