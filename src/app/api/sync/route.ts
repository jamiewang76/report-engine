import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { syncOrg } from "@/lib/sync";
import { env } from "@/lib/env";
import { isSuperAdmin, orgHasActiveReports, syncTablesForOrg } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";

export const maxDuration = 300;

/**
 * GET  (Vercel cron, Bearer CRON_SECRET): sync every connected org that has at least one active report, one at a time.
 * POST (signed-in user): sync only the user's own org ("Refresh now").
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data } = await db().from("connections").select("org_id").eq("revoked", false);
  const orgs = [...new Set((data ?? []).map((r) => r.org_id as string))];
  const results: Record<string, unknown> = {};
  for (const org of orgs) {
    if (!(await orgHasActiveReports(supabaseStore, org))) { results[org] = { skipped: "no active reports" }; continue; }
    try { results[org] = await syncOrg(org, { tables: await syncTablesForOrg(supabaseStore, org) }); } catch (e) { results[org] = { error: String(e) }; }
  }
  return NextResponse.json(results);
}

export async function POST() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const staff = await isSuperAdmin(supabaseStore, s); // staff may refresh to preview draft reports
  if (!staff && !(await orgHasActiveReports(supabaseStore, s.orgId))) {
    return NextResponse.json({ error: "No reports are set up for your company yet." }, { status: 403 });
  }
  // Simple per-org rate limit: one manual refresh per 15 minutes.
  const { data: recent } = await db().from("sync_runs").select("started_at").eq("org_id", s.orgId)
    .gte("started_at", new Date(Date.now() - 15 * 60_000).toISOString()).limit(1);
  if (recent?.length) return NextResponse.json({ error: "Data was refreshed less than 15 minutes ago. Try again later." }, { status: 429 });
  try {
    return NextResponse.json(await syncOrg(s.orgId, { tables: await syncTablesForOrg(supabaseStore, s.orgId, { includeDrafts: staff }) }));
  } catch (e) {
    console.error("[sync] manual refresh failed", s.orgId, e);
    return NextResponse.json({ error: "Refresh failed. Please try again later." }, { status: 502 });
  }
}
