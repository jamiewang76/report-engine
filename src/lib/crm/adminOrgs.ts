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

/** Rows from a list response, whatever the wrapper: [..], { data: [..] }, { data: { data|items|list: [..] } }, ... */
function listRows(body: unknown): Json[] | null {
  if (Array.isArray(body)) return body as Json[];
  if (!body || typeof body !== "object") return null;
  const b = body as Json;
  for (const k of ["data", "items", "list", "records", "result"]) {
    const v = b[k];
    if (Array.isArray(v)) return v as Json[];
    if (v && typeof v === "object") {
      const inner = listRows(v);
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * Keyword search across ALL CRM organizations: the call the CRM's own admin screen makes (captured 2026-11-25):
 *   GET /ups/api/admin/organizations?pageIndex=1&pageSize=20&orderBy=lastActiveTime DESC&name=<keyword>
 * Requires a CRM super user's token (the CRM enforces it). An all-digits query is also tried as an exact org id.
 */
export async function searchCrmOrgs(token: string, query: string, limit = 25): Promise<CrmOrg[]> {
  const q = query.trim();
  if (!q) return [];
  const [byName, byId] = await Promise.all([
    get(token, "/ups/api/admin/organizations", { pageIndex: "1", pageSize: String(limit), orderBy: "lastActiveTime DESC", name: q }),
    /^\d{6,}$/.test(q) ? getCrmOrg(token, q).catch(() => null) : Promise.resolve(null),
  ]);
  if (byName.status === 401 || byName.status === 403) {
    throw new OrgSearchUnavailable("Your CRM account isn't allowed to list all organizations (needs a CRM super user).");
  }
  if (!byName.ok) throw new Error(`CRM organization search failed (${byName.status})`);
  const body = await byName.json();
  const rows = listRows(body);
  if (!rows) {
    // Shape check without logging any values.
    console.error("[admin] unexpected org search response; keys:", body && typeof body === "object" ? Object.keys(body) : typeof body);
    throw new Error("Unexpected CRM organization search response");
  }
  const out = rows.map(toOrg).filter((o): o is CrmOrg => !!o);
  if (byId && !out.some((o) => o.id === byId.id)) out.unshift(byId);
  return out;
}
