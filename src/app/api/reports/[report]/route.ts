import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { checkReportAccess, logEvent } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";
import { buildWorkbook, workbookFileName } from "@/lib/reports/excel";
import { FilterError } from "@/lib/reports/filters";
import { runReport } from "@/lib/reports/runner";

/**
 * GET /api/reports/{id}?<filters>[&group=<grouping>][&format=xlsx]
 * 401 if not signed in; 403 unless the report is live AND actively assigned to the session's org (checked here, on
 * every request). The org always comes from the session, never the request. Every view/export is logged with the
 * report version, filters and row count.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const s = await getSession();
  const { report: reportId } = await params;
  const access = await checkReportAccess(supabaseStore, s, reportId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const session = s!;
  const xlsx = req.nextUrl.searchParams.get("format") === "xlsx";

  try {
    const run = await runReport({ report: access.report, session, config: access.config, params: req.nextUrl.searchParams });
    if (run.state === "preparing") {
      return NextResponse.json({ error: "Your data is still being prepared. Try again in a few minutes." }, { status: 409 });
    }
    const r = run.result;
    const params = { version: r.meta.version, grouping: r.meta.grouping, filters: r.header.filters, ...r.meta.params };
    if (xlsx) {
      const buffer = await buildWorkbook(access.report, r);
      await logEvent(supabaseStore, { orgId: session.orgId, userId: session.userId, userEmail: session.email, reportId, action: "export_xlsx", params, rowCount: r.rowCount });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${workbookFileName(reportId, r.header.company, r.header.reportDate)}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    await logEvent(supabaseStore, { orgId: session.orgId, userId: session.userId, userEmail: session.email, reportId, action: "view", params, rowCount: r.rowCount });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof FilterError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[reports]", reportId, session.orgId, e);
    return NextResponse.json({ error: "Report failed to build" }, { status: 500 });
  }
}
