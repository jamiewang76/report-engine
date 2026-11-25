import { env } from "@/lib/env";
import type { CrmOrg } from "./orgs";

/**
 * CRM-wide organization lookup for the admin console. Always called with the Super Admin's OWN token (their
 * isSuper CRM account), so the CRM decides what they may see. Only org id + name are read; never customer data.
 */

type Json = Record<string, unknown>;
const str = (v: unknown) => (v == null || v === "" ? undefined : String(v));

export class OrgSearchUnavailable extends Error {}

async function get(token: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(path, env.crmApiBase);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
}

const toOrg = (o: Json | null | undefined): CrmOrg | null => {
  const id = str(o?.id) ?? str(o?.organizationId);
  return id ? { id, name: str(o?.name) ?? str(o?.organizationName) ?? id } : null;
};

/** One org by id: GET /ups/api/Organizations/{id} (already used by product_sot). Null if not found / not visible. */
export async function getCrmOrg(token: string, orgId: string): Promise<CrmOrg | null> {
  const res = await get(token, `/ups/api/Organizations/${encodeURIComponent(orgId)}`);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`CRM organization lookup failed (${res.status})`);
  const body = (await res.json()) as Json;
  return toOrg((body.data && typeof body.data === "object" ? body.data : body) as Json);
}

/**
 * Keyword search across ALL CRM organizations.
 * TODO(endpoint): the org-list endpoint the CRM's own admin screen uses is not documented. Wire it here once captured
 * (path, query param names, paging, response shape). Until then, an exact org id still works via getCrmOrg.
 */
export async function searchCrmOrgs(token: string, query: string, limit = 25): Promise<CrmOrg[]> {
  const q = query.trim();
  if (!q) return [];
  if (/^\d{6,}$/.test(q)) {
    const one = await getCrmOrg(token, q);
    return one ? [one] : [];
  }
  void limit;
  throw new OrgSearchUnavailable("Keyword search across all CRM organizations isn't connected yet. Search by exact org ID, or by name for orgs already in the app.");
}
