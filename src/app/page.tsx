import { getSession } from "@/lib/auth/session";

const REPORTS = [
  { id: "ar-aging", name: "A/R Aging", desc: "Open invoices by days past due, with retainage held.", ready: true },
  { id: "bid-timing", name: "Bid Timing", desc: "Job created vs bid due vs takeoff done vs proposal sent.", ready: false },
  { id: "financial-summary", name: "Financial Summary", desc: "Invoiced revenue and tax by month (payments & COGS pending API).", ready: false },
];

export default async function Home() {
  const s = await getSession();
  return (
    <main style={{ maxWidth: 880, margin: "48px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Report Engine</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Custom reports on your MeasureSquare CRM data.</p>
      {!s ? (
        <a href="/api/auth/login" style={{ display: "inline-block", padding: "10px 18px", background: "#1f4fd1", color: "#fff", borderRadius: 8, textDecoration: "none" }}>
          Sign in with MeasureSquare
        </a>
      ) : (
        <>
          <p>Signed in as {s.name ?? s.email} · <a href="/api/auth/logout">Sign out</a></p>
          <form action="/api/sync" method="post"><button type="submit">Refresh data now</button></form>
          <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
            {REPORTS.map((r) => (
              <div key={r.id} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, padding: 16 }}>
                <strong>{r.name}</strong>
                <div style={{ color: "#666", fontSize: 14, margin: "4px 0 10px" }}>{r.desc}</div>
                {r.ready ? (
                  <a href={`/api/reports/${r.id}?format=xlsx`}>Download Excel</a>
                ) : (
                  <span style={{ color: "#999", fontSize: 13 }}>Coming soon</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
