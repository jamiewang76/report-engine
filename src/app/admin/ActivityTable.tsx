import type { ActivityRow } from "@/lib/admin/data";
import { Badge, card, fmt, muted, table, td, th } from "./ui";

const tone = (a: string) => (a.startsWith("admin_") ? "amber" : a === "view_empty" ? "gray" : a === "export_xlsx" ? "blue" : "green") as "amber" | "gray" | "blue" | "green";

function summarize(params: Record<string, unknown>) {
  if (!params || !Object.keys(params).length) return "";
  if ("before" in params || "after" in params) {
    return `${params.before ? `before ${JSON.stringify(params.before)}` : ""}${params.before && params.after ? " → " : ""}${params.after ? `after ${JSON.stringify(params.after)}` : ""}`;
  }
  return Object.entries(params).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ");
}

export default function ActivityTable({ rows, hideOrg = false, orgNames }: { rows: ActivityRow[]; hideOrg?: boolean; orgNames?: Map<string, string> }) {
  return (
    <div style={{ ...card, padding: 0, overflowX: "auto" }}>
      {!rows.length ? (
        <div style={{ ...muted, padding: 16 }}>No activity.</div>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>When</th>{!hideOrg && <th style={th}>Organization</th>}<th style={th}>User</th>
              <th style={th}>Action</th><th style={th}>Report</th><th style={th}>Rows</th><th style={th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                {!hideOrg && <td style={td}>{r.org_id ? orgNames?.get(r.org_id) ?? r.org_id : "—"}</td>}
                <td style={td}>{r.user_email ?? r.user_id}</td>
                <td style={td}><Badge tone={tone(r.action)}>{r.action}</Badge></td>
                <td style={td}>{r.report_id ?? "—"}</td>
                <td style={td}>{r.row_count ?? ""}</td>
                <td style={{ ...td, ...muted, maxWidth: 380, wordBreak: "break-word" }}>{summarize(r.params)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
