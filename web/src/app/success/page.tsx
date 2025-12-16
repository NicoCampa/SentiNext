import Link from "next/link";

export default function SuccessPage() {
  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="callout">
        <h1 className="calloutTitle">Payment received</h1>
        <p className="calloutText">
          We’re generating your report now. You’ll receive the PDF by email shortly—keep an eye on your inbox.
        </p>
        <div className="ctaRow" style={{ marginTop: 6 }}>
          <Link href="/" className="btn btnPrimary">
            Back to home →
          </Link>
          <Link href="/report" className="btn">
            Buy another report
          </Link>
        </div>
      </div>
    </div>
  );
}
