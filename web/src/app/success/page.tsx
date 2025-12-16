export default function SuccessPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b1120", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px" }}>
        <h1 style={{ fontSize: 34, margin: 0 }}>Payment received</h1>
        <p style={{ marginTop: 12, color: "#cbd5e1" }}>
          We’re generating your report now. You’ll receive the PDF by email shortly.
        </p>
      </div>
    </main>
  );
}

