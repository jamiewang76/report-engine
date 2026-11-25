import { db } from "@/lib/db";
import type { CrmOrg } from "@/lib/crm/orgs";

/**
 * Orgs this user belongs to, as the CRM reported at sign-in (stored on their sign-in connection row).
 * Falls back to the orgs they have connected in this app. Never selects refresh_token_enc.
 */
export async function listUserOrgs(userId: string, homeOrgId: string): Promise<CrmOrg[]> {
  const { data: home } = await db().from("connections").select("user_orgs")
    .eq("org_id", homeOrgId).eq("user_id", userId).eq("revoked", false).maybeSingle();
  if (Array.isArray(home?.user_orgs) && home.user_orgs.length) return home.user_orgs as CrmOrg[];

  const { data, error } = await db().from("connections").select("org_id, org_name")
    .eq("user_id", userId).eq("revoked", false);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.org_id as string, name: (r.org_name as string | null) ?? (r.org_id as string) }));
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
