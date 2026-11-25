import { notFound } from "next/navigation";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { orgDetail, userLabels } from "@/lib/admin/data";
import { resolveOrgForAdmin } from "@/lib/admin/orgLookup";
import { REPORTS } from "@/lib/reports/registry";
import ActivityTable from "../../ActivityTable";
import { AdminNav, Badge, ConfigFields, Flash, button, card, fmt, fmtDate, muted, statusTone, table, td, th } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AdminOrgDetail({ params, searchParams }: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const s = await requireSuperAdminPage();
  const { orgId } = await params;
  const { ok, error } = await searchParams;

  const d = await orgDetail(orgId);
  // Not in the app yet (nobody has signed in and no reports assigned): look it up in the CRM.
  const crmOnly = d ? null : await resolveOrgForAdmin(s, orgId);
  if (!d && !crmOnly) notFound();

  const name = d?.org.name ?? crmOnly!.org.name;
  const active = new Map((d?.active ?? []).map((a) => [a.report_id, a]));
  const labels = await userLabels((d?.history ?? []).flatMap((a) => [a.assigned_by, a.revoked_by ?? ""]));
  const reportAction = (reportId: string) => `/api/admin/orgs/${encodeURIComponent(orgId)}/reports/${encodeURIComponent(reportId)}`;
  const assignable = REPORTS.filter((r) => r.status === "live" && !active.has(r.id));
  const notYet = REPORTS.filter((r) => r.status === "draft");
  const assigned = REPORTS.filter((r) => active.has(r.id));

  return (
    <>
      <AdminNav active="orgs" />
      <a href="/admin" style={{ ...muted, textDecoration: "none" }}>← Organizations</a>
      <h1 style={{ fontSize: 22, margin: "6px 0 2px" }}>{name}</h1>
      <div style={{ ...muted, marginBottom: 20 }}>
        Org ID {orgId}
        {d?.org.first_seen_at
          ? <> · first sign-in {fmtDate(d.org.first_seen_at)} · last seen {fmt(d.org.last_seen_at)} · last sync {fmt(d.org.last_sync_at)}</>
          : <> · <Badge tone="amber">Nobody has signed in yet</Badge></>}
        {d?.org.added_at && <> · added {fmtDate(d.org.added_at)} by {(await userLabels([d.org.added_by ?? ""])).get(d.org.added_by ?? "") ?? d.org.added_by}</>}
      </div>
      <Flash ok={ok} error={error} />

      {/* Multi-select assign */}
      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Assign reports</h2>
      <div style={{ ...card, marginBottom: 28 }}>
        {!assignable.length ? (
          <div style={muted}>Every live report is already assigned to this organization.</div>
        ) : (
          <form action={`/api/admin/orgs/${encodeURIComponent(orgId)}/assign`} method="post" style={{ display: "grid", gap: 10, margin: 0 }}>
            {assignable.map((r) => (
              <label key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" name="reportIds" value={r.id} style={{ marginTop: 3 }} />
                <span><strong>{r.name}</strong><div style={muted}>{r.description}</div></span>
              </label>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <button type="submit" style={button(true)}>Assign selected</button>
              <span style={muted}>Assigned with default settings; adjust settings below afterwards.</span>
            </div>
          </form>
        )}
        {notYet.length > 0 && (
          <div style={{ ...muted, marginTop: 12 }}>Not assignable yet (draft): {notYet.map((r) => r.name).join(", ")}</div>
        )}
      </div>

      {/* Assigned reports: settings + revoke */}
      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Assigned reports <span style={muted}>({assigned.length})</span></h2>
      <div style={{ display: "grid", gap: 12, marginBottom: 28 }}>
        {!assigned.length && <div style={{ ...card, ...muted }}>No reports assigned. This organization sees the &quot;No reports are set up&quot; message.</div>}
        {assigned.map((r) => {
          const a = active.get(r.id)!;
          return (
            <div key={r.id} id={r.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <strong>{r.name}</strong> <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  <div style={{ ...muted, marginTop: 4 }}>Assigned {fmt(a.assigned_at)} by {labels.get(a.assigned_by) ?? a.assigned_by}</div>
                </div>
                <form action={reportAction(r.id)} method="post" style={{ margin: 0 }}>
                  <input type="hidden" name="op" value="revoke" />
                  <button type="submit" style={{ ...button(), color: "#b42318", borderColor: "#fecdca" }}>Revoke</button>
                </form>
              </div>
              {Object.keys(r.configSchema).length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "#1f4fd1" }}>Settings</summary>
                  <form action={reportAction(r.id)} method="post" style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <input type="hidden" name="op" value="config" />
                    <ConfigFields schema={r.configSchema} value={a.config} />
                    <div><button type="submit" style={button(true)}>Save settings</button></div>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {d && (
        <>
          <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Users <span style={muted}>({d.users.length})</span></h2>
          <div style={{ ...card, padding: 0, marginBottom: 28, overflowX: "auto" }}>
            {!d.users.length ? <div style={{ ...muted, padding: 16 }}>Nobody from this organization has signed in yet.</div> : (
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
            )}
          </div>

          <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>
            Recent activity <a href={`/admin/activity?org=${encodeURIComponent(orgId)}`} style={{ fontSize: 13, fontWeight: 400, color: "#1f4fd1" }}>View all</a>
          </h2>
          <ActivityTable rows={d.events.rows} hideOrg />
        </>
      )}
    </>
  );
}
