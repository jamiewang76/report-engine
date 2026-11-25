import { notFound } from "next/navigation";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { orgDetail, userLabels } from "@/lib/admin/data";
import { REPORTS } from "@/lib/reports/registry";
import { defaultConfig } from "@/lib/reports/schema";
import ActivityTable from "../../ActivityTable";
import { AdminNav, Badge, ConfigFields, Flash, button, card, fmt, fmtDate, muted, statusTone, table, td, th } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AdminOrgDetail({ params, searchParams }: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperAdminPage();
  const { orgId } = await params;
  const { ok, error } = await searchParams;
  const d = await orgDetail(orgId);
  if (!d) notFound();
  const active = new Map(d.active.map((a) => [a.report_id, a]));
  const labels = await userLabels(d.history.flatMap((a) => [a.assigned_by, a.revoked_by ?? ""]));
  const action = (reportId: string) => `/api/admin/orgs/${encodeURIComponent(orgId)}/reports/${encodeURIComponent(reportId)}`;
  const visible = REPORTS.filter((r) => r.status !== "retired" || active.has(r.id));

  return (
    <>
      <AdminNav active="orgs" />
      <a href="/admin" style={{ ...muted, textDecoration: "none" }}>← Organizations</a>
      <h1 style={{ fontSize: 22, margin: "6px 0 2px" }}>{d.org.name}</h1>
      <div style={{ ...muted, marginBottom: 20 }}>
        Org ID {d.org.org_id} · first seen {fmtDate(d.org.first_seen_at)} · last seen {fmt(d.org.last_seen_at)} · last sync {fmt(d.org.last_sync_at)}
      </div>
      <Flash ok={ok} error={error} />

      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Reports</h2>
      <div style={{ display: "grid", gap: 12, marginBottom: 28 }}>
        {visible.map((r) => {
          const a = active.get(r.id);
          const assignable = r.status === "live";
          return (
            <div key={r.id} id={r.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <strong>{r.name}</strong> <Badge tone={statusTone(r.status)}>{r.status}</Badge>{" "}
                  {a ? <Badge tone="blue">Assigned</Badge> : null}
                  <div style={{ ...muted, marginTop: 4 }}>{r.description}</div>
                  {a && <div style={{ ...muted, marginTop: 4 }}>Assigned {fmt(a.assigned_at)} by {labels.get(a.assigned_by) ?? a.assigned_by}</div>}
                </div>
                {a ? (
                  <form action={action(r.id)} method="post" style={{ margin: 0 }}>
                    <input type="hidden" name="op" value="revoke" />
                    <button type="submit" style={{ ...button(), color: "#b42318", borderColor: "#fecdca" }}>Revoke</button>
                  </form>
                ) : !assignable ? (
                  <span style={muted}>Only live reports can be assigned</span>
                ) : null}
              </div>

              {(a || assignable) && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "#1f4fd1" }}>{a ? "Settings" : "Assign with settings"}</summary>
                  <form action={action(r.id)} method="post" style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <input type="hidden" name="op" value={a ? "config" : "assign"} />
                    <ConfigFields schema={r.configSchema} value={a ? a.config : defaultConfig(r.configSchema)} />
                    <div><button type="submit" style={button(true)}>{a ? "Save settings" : `Assign ${r.name}`}</button></div>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Users <span style={muted}>({d.users.length})</span></h2>
      <div style={{ ...card, padding: 0, marginBottom: 28, overflowX: "auto" }}>
        <table style={table}>
          <thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>First seen</th><th style={th}>Last seen</th></tr></thead>
          <tbody>
            {d.users.map((u) => (
              <tr key={u.user_id}>
                <td style={td}>{u.name ?? "—"}</td><td style={td}>{u.email ?? "—"}</td>
                <td style={td}>{fmtDate(u.first_seen_at)}</td><td style={td}>{fmt(u.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>
        Recent activity <a href={`/admin/activity?org=${encodeURIComponent(orgId)}`} style={{ fontSize: 13, fontWeight: 400, color: "#1f4fd1" }}>View all</a>
      </h2>
      <ActivityTable rows={d.events.rows} hideOrg />
    </>
  );
}
