import { db } from "@/lib/db";

export type OrgOption = { orgId: string; orgName: string | null };

/**
 * Orgs this user has connected (signed in to) and not revoked. Only these can be switched to:
 * each one has its own refresh token issued by id4 for that org, so syncs stay scoped to it.
 * Never selects refresh_token_enc.
 */
export async function listUserOrgs(userId: string): Promise<OrgOption[]> {
  const { data, error } = await db()
    .from("connections")
    .select("org_id, org_name")
    .eq("user_id", userId)
    .eq("revoked", false)
    .order("org_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ orgId: r.org_id as string, orgName: (r.org_name as string | null) ?? null }));
}

export type DataStatus = {
  lastRefreshedAt: string | null; // finished_at of the latest successful sync
  running: boolean; // a sync started in the last 15 minutes is still running
  lastError: string | null; // set if the most recent sync failed
};

export async function dataStatus(orgId: string): Promise<DataStatus> {
  if (!orgId) throw new Error("orgId required");
  const [{ data: ok }, { data: latest }] = await Promise.all([
    db().from("sync_runs").select("finished_at").eq("org_id", orgId).eq("status", "ok")
      .order("finished_at", { ascending: false }).limit(1),
    db().from("sync_runs").select("status, started_at, error").eq("org_id", orgId)
      .order("started_at", { ascending: false }).limit(1),
  ]);
  const last = latest?.[0];
  const recent = last && Date.now() - new Date(last.started_at as string).getTime() < 15 * 60_000;
  return {
    lastRefreshedAt: (ok?.[0]?.finished_at as string | undefined) ?? null,
    running: Boolean(recent && last.status === "running"),
    lastError: last?.status === "error" ? "The last refresh failed." : null,
  };
}
