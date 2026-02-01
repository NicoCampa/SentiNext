import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="container" style={{ paddingTop: 56 }}>
      <span className="eyebrow">404</span>
      <h1 className="title" style={{ fontSize: "clamp(34px, 4.1vw, 54px)" }}>
        This page could not be found
      </h1>
      <p className="lead">Head back to the home page or jump straight to downloads.</p>

      <div className="heroActions" style={{ marginTop: 18 }}>
        <Link href="/" className="btn">
          Home
        </Link>
        <Link href="/download" className="btn btnPrimary">
          Download →
        </Link>
      </div>
    </div>
  );
}

