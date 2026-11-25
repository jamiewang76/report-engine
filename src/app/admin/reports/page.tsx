import { requireSuperAdminPage } from "@/lib/admin/guard";
import { activeAssignmentsWithOrgs, userLabels } from "@/lib/admin/data";
import { REPORTS } from "@/lib/reports/registry";
import { AdminNav, Badge, card, fmt, muted, statusTone, table, td, th } from "../ui";

export const dynamic = "force-dynamic";

export default async function AdminReports() {
  await requireSuperAdminPage();
  const assignments = await activeAssignmentsWithOrgs();
  const labels = await userLabels(assignments.map((a) => a.assigned_by));

  return (
    <>
      <AdminNav active="reports" />
      <div style={{ display: "grid", gap: 16 }}>
        {REPORTS.map((r) => {
          const rows = assignments.filter((a) => a.report_id === r.id);
          return (
            <div key={r.id} style={card}>
              <strong>{r.name}</strong> <Badge tone={statusTone(r.status)}>{r.status}</Badge>{" "}
              <span style={muted}>{r.id}</span>
              <div style={{ ...muted, margin: "4px 0 12px" }}>{r.description}</div>
              {!rows.length ? (
                <div style={muted}>Not assigned to any organization.</div>
              ) : (
                <table style={table}>
                  <thead><tr><th style={th}>Organization</th><th style={th}>Assigned</th><th style={th}>By</th></tr></thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td style={td}><a href={`/admin/orgs/${encodeURIComponent(a.org_id)}#${r.id}`} style={{ color: "#1f4fd1" }}>{a.org_name}</a></td>
                        <td style={td}>{fmt(a.assigned_at)}</td>
                        <td style={td}>{labels.get(a.assigned_by) ?? a.assigned_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
