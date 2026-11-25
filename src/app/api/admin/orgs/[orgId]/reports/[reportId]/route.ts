import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/guard";
import { AdminError, assignReport, revokeReport, updateReportConfig } from "@/lib/admin/data";
import { getReport } from "@/lib/reports/registry";
import { configFromForm } from "@/lib/reports/schema";
import { env } from "@/lib/env";

/**
 * POST (form) from the org detail page. Field `op`: assign | revoke | config.
 * Super Admin only (re-checked here, not just on the page). Redirects back with ?ok= or ?error=.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string; reportId: string }> }) {
  const guard = await requireSuperAdminApi();
  if (guard instanceof NextResponse) return guard;
  const { orgId, reportId } = await params;
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/admin/orgs/${encodeURIComponent(orgId)}?${q}#${reportId}`, 303);

  const report = getReport(reportId);
  if (!report) return back(`error=${encodeURIComponent("Unknown report")}`);
  const form = await req.formData();
  const op = String(form.get("op") ?? "");
  try {
    if (op === "assign") await assignReport(guard, orgId, reportId, configFromForm(report.configSchema, form));
    else if (op === "revoke") await revokeReport(guard, orgId, reportId);
    else if (op === "config") await updateReportConfig(guard, orgId, reportId, configFromForm(report.configSchema, form));
    else return back(`error=${encodeURIComponent("Unknown action")}`);
  } catch (e) {
    if (e instanceof AdminError) return back(`error=${encodeURIComponent(e.message)}`);
    console.error("[admin]", op, orgId, reportId, e);
    return back(`error=${encodeURIComponent("Something went wrong")}`);
  }
  const done = { assign: "Assigned", revoke: "Revoked", config: "Settings saved" }[op];
  return back(`ok=${encodeURIComponent(`${report.name}: ${done}`)}`);
}
