import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { checkReportAccess, logEvent } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";
import { ReportInputError } from "@/lib/reports/registry";

/**
 * GET /api/reports/{id}?asOf=YYYY-MM-DD[&format=xlsx]
 * 401 if not signed in; 403 unless the report is live AND actively assigned to the session's org.
 * The org always comes from the session, never the request. Every view/export is logged.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const s = await getSession();
  const { report: reportId } = await params;
  const access = await checkReportAccess(supabaseStore, s, reportId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const session = s!;
  const ctx = { orgId: session.orgId, config: access.config, params: req.nextUrl.searchParams };
  const xlsx = req.nextUrl.searchParams.get("format") === "xlsx";
  try {
    if (xlsx) {
      const r = await access.report.buildXlsx(ctx);
      await logEvent(supabaseStore, { orgId: session.orgId, userId: session.userId, userEmail: session.email, reportId, action: "export_xlsx", params: r.params, rowCount: r.rowCount });
      return new NextResponse(new Uint8Array(r.buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${r.filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const r = await access.report.buildJson(ctx);
    await logEvent(supabaseStore, { orgId: session.orgId, userId: session.userId, userEmail: session.email, reportId, action: "view", params: r.params, rowCount: r.rowCount });
    return NextResponse.json(r.data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ReportInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[reports]", reportId, session.orgId, e);
    return NextResponse.json({ error: "Report failed to build" }, { status: 500 });
  }
}
