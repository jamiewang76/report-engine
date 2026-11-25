import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { dataStatus } from "@/lib/orgs";
import { logViewEmpty, visibleReports } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";
import AppHeader from "./components/AppHeader";
import RefreshPanel from "./components/RefreshPanel";

export const dynamic = "force-dynamic";

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, padding: 16 };

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await getSession();
  // Sessions from before org switching lack homeOrgId/names: re-run sign-in (silent if the id4 session is alive).
  if (s && !s.homeOrgId) redirect("/api/auth/login");
  const { error } = await searchParams;

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

  // Only live reports actively assigned to this org. Reads only: nothing here triggers a CRM sync.
  const reports = await visibleReports(supabaseStore, s.orgId);
  if (!reports.length) await logViewEmpty(supabaseStore, s);
  const status = reports.length ? await dataStatus(s.orgId) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <AppHeader session={s} />
      <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 24px" }}>
        {error === "switch_failed" && (
          <div style={{ background: "#fef3f2", border: "1px solid #fecdca", color: "#b42318", borderRadius: 10, padding: "10px 16px", marginBottom: 12, fontSize: 14 }}>
            Couldn&apos;t switch organization. Please try again.
          </div>
        )}

        {!reports.length ? (
          <div style={{ ...card, padding: 32, textAlign: "center" }}>
            <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 6 }}>No reports are set up for your company yet.</div>
            <div style={{ color: "#666" }}>Contact your MeasureSquare account manager.</div>
          </div>
        ) : (
          <>
            <p style={{ color: "#666", marginTop: 0 }}>Custom reports on your MeasureSquare CRM data.</p>
            {status && <RefreshPanel status={status} />}
            <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
              {reports.map((r) => (
                <div key={r.id} style={card}>
                  <strong>{r.name}</strong>
                  <div style={{ color: "#666", fontSize: 14, margin: "4px 0 12px" }}>{r.description}</div>
                  <form action={`/api/reports/${r.id}`} method="get" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: 0 }}>
                    <input type="hidden" name="format" value="xlsx" />
                    <label style={{ fontSize: 13, color: "#444" }}>
                      As of{" "}
                      <input type="date" name="asOf" defaultValue={today} required style={{ font: "inherit", fontSize: 13, padding: "4px 6px", border: "1px solid #ddd", borderRadius: 6 }} />
                    </label>
                    <button type="submit" style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #1f4fd1", background: "#fff", color: "#1f4fd1", cursor: "pointer", fontSize: 13 }}>
                      Download Excel
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
