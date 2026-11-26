import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { dataStatus } from "@/lib/orgs";
import { isSuperAdmin, logViewEmpty, visibleReports } from "@/lib/access";
import { REPORTS } from "@/lib/reports/registry";
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
  // Super Admins also see built drafts, to preview on the current org without assigning them.
  const drafts = (await isSuperAdmin(supabaseStore, s)) ? REPORTS.filter((r) => r.status === "draft" && r.build) : [];
  const status = reports.length ? await dataStatus(s.orgId) : null;

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
                <div key={r.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <a href={`/reports/${r.id}`} style={{ fontWeight: 600, color: "#1a1a1a", textDecoration: "none", fontSize: 16 }}>{r.name}</a>
                    <div style={{ color: "#666", fontSize: 14, marginTop: 4 }}>{r.description}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={`/api/reports/${r.id}?format=xlsx`} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d0d5dd", color: "#1a1a1a", textDecoration: "none", fontSize: 13 }}>Download Excel</a>
                    <a href={`/reports/${r.id}`} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #1f4fd1", background: "#1f4fd1", color: "#fff", textDecoration: "none", fontSize: 13 }}>Open report</a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {drafts.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Draft previews <span style={{ color: "#666", fontWeight: 400, fontSize: 13 }}>(MeasureSquare staff only; not assigned, customers don&apos;t see these)</span></div>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {drafts.map((r) => (
                <div key={r.id} style={{ ...card, borderStyle: "dashed", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <a href={`/reports/${r.id}`} style={{ fontWeight: 600, color: "#1a1a1a", textDecoration: "none", fontSize: 16 }}>{r.name}</a>{" "}
                    <span style={{ fontSize: 12, color: "#b54708", background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 999, padding: "1px 8px" }}>draft</span>
                    <div style={{ color: "#666", fontSize: 14, marginTop: 4 }}>{r.description}</div>
                  </div>
                  <a href={`/reports/${r.id}`} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #d0d5dd", color: "#1a1a1a", textDecoration: "none", fontSize: 13 }}>Preview on {s.orgName ?? "this org"}</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
