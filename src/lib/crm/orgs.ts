import { decodeJwt } from "jose";
import { env } from "@/lib/env";

/**
 * CRM organization membership + switching. Neither endpoint is in the public swagger; both are the calls the
 * CRM web app itself makes (captured 2026-08-21, already used by tm-tags and qk_turn_mf):
 *   GET  {crm}/ups/api/users/{userId}  -> { organizations: [{ id, name }] }   (userId = token's `userId` claim, not `sub`)
 *   POST {crm}/connect/token  grant_type=switch_organization  -> token scoped to the target org
 * Both are authorized by the user's own token, so the CRM itself enforces which orgs they may use.
 */

export type CrmOrg = { id: string; name: string };
type Json = Record<string, unknown>;
const str = (v: unknown) => (v == null || v === "" ? undefined : String(v));

export function claimsOf(accessToken: string) {
  const c = decodeJwt(accessToken) as Json;
  return {
    crmUserId: str(c.userId) ?? str(c.id),
    orgId: str(c.currentOrganizationId) ?? str(c.organizationId),
    orgName: str(c.currentOrganizationName) ?? str(c.organizationName),
  };
}

/** Orgs the user belongs to. Returns null if the list could not be read (caller falls back to what it knows). */
export async function fetchUserOrgs(accessToken: string): Promise<CrmOrg[] | null> {
  const { crmUserId } = claimsOf(accessToken);
  if (!crmUserId) return null;
  try {
    const res = await fetch(new URL(`/ups/api/users/${encodeURIComponent(crmUserId)}`, env.crmApiBase), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Json;
    const u = (body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : body) as Json;
    if (!Array.isArray(u.organizations)) return null;
    return (u.organizations as Json[])
      .map((o) => ({ id: str(o.id) ?? str(o.organizationId), name: str(o.name) ?? str(o.organizationName) }))
      .filter((o): o is CrmOrg => !!o.id)
      .map((o) => ({ id: o.id, name: o.name ?? o.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return null;
  }
}

/** Exchange the user's current token for one scoped to `organizationId`. The new token is used in memory only. */
export async function switchOrgToken(accessToken: string, organizationId: string): Promise<string> {
  const res = await fetch(new URL("/connect/token", env.crmApiBase), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ service: "pasasoft-crm", grant_type: "switch_organization", token: accessToken, organizationId }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || !str(body.access_token)) {
    throw new Error(str(body.error_description) ?? str(body.error) ?? `Organization switch failed (${res.status})`);
  }
  const token = String(body.access_token);
  if (claimsOf(token).orgId !== organizationId) throw new Error("CRM returned a token for a different organization");
  return token;
}
