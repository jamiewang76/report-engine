import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/guard";
import { activityForExport, logActivityExport, type ActivityFilters } from "@/lib/admin/data";

const LIMIT = 10_000;

const csvCell = (v: unknown) => {
  let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralize spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /api/admin/activity?format=csv&org=&report=&user=&action=&from=&to= — CSV of the filtered log (logged too). */
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdminApi();
  if (guard instanceof NextResponse) return guard;
  const q = req.nextUrl.searchParams;
  const f: ActivityFilters = {
    orgId: q.get("org") || undefined, reportId: q.get("report") || undefined, user: q.get("user") || undefined,
    action: q.get("action") || undefined, from: q.get("from") || undefined, to: q.get("to") || undefined,
  };
  const rows = await activityForExport(f, LIMIT);
  await logActivityExport(guard, f, rows.length);

  const header = ["created_at", "org_id", "user_id", "user_email", "report_id", "action", "row_count", "params"];
  const lines = [header.join(","), ...rows.map((r) => [r.created_at, r.org_id, r.user_id, r.user_email, r.report_id, r.action, r.row_count, r.params].map(csvCell).join(","))];
  if (rows.length === LIMIT) lines.push(csvCell(`Truncated at ${LIMIT} rows; narrow the filters.`));
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
