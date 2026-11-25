import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/guard";
import { assignReports, AdminError } from "@/lib/admin/data";
import { resolveOrgForAdmin } from "@/lib/admin/orgLookup";
import { env } from "@/lib/env";

/**
 * POST (form) `reportIds` (repeated): assign several live reports to an org with default settings.
 * Works for orgs nobody has signed in from yet: the org is looked up server-side (app, else CRM) and added.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const guard = await requireSuperAdminApi();
  if (guard instanceof NextResponse) return guard;
  const { orgId } = await params;
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/admin/orgs/${encodeURIComponent(orgId)}?${q}`, 303);

  const reportIds = (await req.formData()).getAll("reportIds").map(String).filter(Boolean);
  try {
    const found = await resolveOrgForAdmin(guard, orgId);
    if (!found) return back(`error=${encodeURIComponent("Organization not found in the CRM")}`);
    const { done, failed } = await assignReports(guard, found.org, reportIds);
    const q = new URLSearchParams();
    if (done.length) q.set("ok", `Assigned: ${done.join(", ")}`);
    if (failed.length) q.set("error", failed.join("; "));
    return back(q.toString());
  } catch (e) {
    if (e instanceof AdminError) return back(`error=${encodeURIComponent(e.message)}`);
    console.error("[admin] assign", orgId, reportIds, e);
    return back(`error=${encodeURIComponent("Something went wrong")}`);
  }
}
