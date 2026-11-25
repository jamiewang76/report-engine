export default function Forbidden() {
  return (
    <main style={{ maxWidth: 560, margin: "96px auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>403: Not allowed</h1>
      <p style={{ color: "#666" }}>You don&apos;t have access to this page.</p>
      <a href="/" style={{ color: "#1f4fd1" }}>Back to reports</a>
    </main>
  );
}
