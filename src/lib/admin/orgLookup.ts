import { db } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { accessTokenFor } from "@/lib/crm/connection";
import { getCrmOrg, OrgSearchUnavailable, searchCrmOrgs } from "@/lib/crm/adminOrgs";
import type { CrmOrg } from "@/lib/crm/orgs";
import { searchKnownOrgs, type OrgOverview } from "./data";

/** The Super Admin's own CRM token (their sign-in org), for CRM-wide org lookups. */
const adminToken = (s: Session) => accessTokenFor(s.homeOrgId!, s.userId);

/** An org by id: from the app if known, otherwise from the CRM. Null if neither knows it. */
export async function resolveOrgForAdmin(s: Session, orgId: string): Promise<{ org: CrmOrg; inApp: boolean } | null> {
  const { data } = await db().from("organizations").select("org_id, name").eq("org_id", orgId).maybeSingle();
  if (data) return { org: { id: data.org_id as string, name: data.name as string }, inApp: true };
  const crm = await getCrmOrg(await adminToken(s), orgId);
  return crm ? { org: crm, inApp: false } : null;
}

export type OrgSearchHit = { id: string; name: string; inApp: OrgOverview | null };

/**
 * Keyword search: orgs already in the app (instant) merged with CRM-wide results.
 * Runs only when the admin submits a search, never on page load.
 */
export async function searchOrgsForAdmin(s: Session, q: string) {
  const known = await searchKnownOrgs(q);
  let crm: CrmOrg[] = [];
  let crmNote: string | null = null;
  try {
    crm = await searchCrmOrgs(await adminToken(s), q);
  } catch (e) {
    if (e instanceof OrgSearchUnavailable) crmNote = e.message;
    else {
      console.error("[admin] CRM org search failed", e);
      crmNote = "CRM organization search failed. Showing organizations already in the app.";
    }
  }
  const byId = new Map<string, OrgSearchHit>();
  for (const k of known) byId.set(k.org_id, { id: k.org_id, name: k.name, inApp: k });
  for (const c of crm) if (!byId.has(c.id)) byId.set(c.id, { id: c.id, name: c.name, inApp: null });
  const hits = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { hits, crmNote };
}
