import { getSession } from "@/lib/auth/session";
import { dataStatus, listUserOrgs } from "@/lib/orgs";
import UserMenu from "./components/UserMenu";
import RefreshPanel from "./components/RefreshPanel";

export const dynamic = "force-dynamic";

const REPORTS = [
  { id: "ar-aging", name: "A/R Aging", desc: "Open invoices by days past due, with retainage held." },
  { id: "bid-timing", name: "Bid Timing", desc: "Job created vs bid due vs takeoff done vs proposal sent." },
  { id: "financial-summary", name: "Financial Summary", desc: "Invoiced revenue and tax by month (payments & COGS pending API)." },
];

export default async function Home() {
  const s = await getSession();

  if (!s) {
    return (
      <main style={{ maxWidth: 880, margin: "48px auto", padding: "0 24px" }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Report Engine</h1>
        <p style={{ color: "#666", marginTop: 0 }}>Custom reports on your MeasureSquare CRM data.</p>
        <a href="/api/auth/login" style={{ display: "inline-block", padding: "10px 18px", background: "#1f4fd1", color: "#fff", borderRadius: 8, textDecoration: "none" }}>
          Sign in with MeasureSquare
        </a>
      </main>
    );
  }

  // Reads only: nothing here triggers a CRM sync. Data refreshes only via the button (or the nightly job).
  const [orgs, status] = await Promise.all([listUserOrgs(s.userId), dataStatus(s.orgId)]);
  const current = orgs.find((o) => o.orgId === s.orgId) ?? { orgId: s.orgId, orgName: s.orgName ?? null };
  const otherOrgs = orgs.filter((o) => o.orgId !== s.orgId);

  return (
    <>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <strong style={{ fontSize: 18 }}>Report Engine</strong>
          <UserMenu name={s.name} email={s.email} currentOrg={current} otherOrgs={otherOrgs} />
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 24px" }}>
        <p style={{ color: "#666", marginTop: 0 }}>Custom reports on your MeasureSquare CRM data.</p>
        <RefreshPanel status={status} />
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          {REPORTS.map((r) => (
            <div key={r.id} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, padding: 16 }}>
              <strong>{r.name}</strong>
              <div style={{ color: "#666", fontSize: 14, margin: "4px 0 10px" }}>{r.desc}</div>
              <span style={{ color: "#999", fontSize: 13 }}>Coming soon</span>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
