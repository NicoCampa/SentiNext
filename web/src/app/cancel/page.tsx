import Link from "next/link";

export default function CancelPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b1120", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px" }}>
        <h1 style={{ fontSize: 34, margin: 0 }}>Checkout canceled</h1>
        <p style={{ marginTop: 12, color: "#cbd5e1" }}>
          No payment was made.
        </p>
        <div style={{ marginTop: 18 }}>
          <Link href="/report" style={{ color: "#93c5fd", textDecoration: "none" }}>
            Try again →
          </Link>
        </div>
      </div>
    </main>
  );
}

