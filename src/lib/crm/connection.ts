import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/auth/session";
import { refreshTokens, type TokenSet } from "@/lib/auth/id4";
import { CrmClient } from "./client";
import { switchOrgToken, type CrmOrg } from "./orgs";

/**
 * One row per user per org in `connections`.
 * - Sign-in row: the org id4 signed the user in to. Holds the encrypted refresh token so the nightly sync can run
 *   without the user present.
 * - Switched row: an org the user switched to in this app. Holds no token; points at the sign-in row via
 *   source_org_id. Its access token is minted on demand (refresh the source token, then switch_organization).
 * Access tokens are short-lived and kept in memory only.
 */
export async function saveConnection(
  who: { orgId: string; userId: string; email: string | null; name: string | null; orgName: string | null },
  t: TokenSet,
  userOrgs: CrmOrg[] | null,
) {
  if (!t.refresh_token) throw new Error("No refresh token returned — is offline_access granted to this client in id4?");
  const { error } = await db().from("connections").upsert(
    {
      org_id: who.orgId,
      user_id: who.userId,
      email: who.email,
      user_name: who.name,
      org_name: who.orgName,
      refresh_token_enc: encrypt(t.refresh_token),
      source_org_id: null,
      ...(userOrgs ? { user_orgs: userOrgs } : {}),
      updated_at: new Date().toISOString(),
      revoked: false,
    },
    { onConflict: "org_id,user_id" },
  );
  if (error) throw error;
}

/** Record that this user switched to `org` (no token stored). Leaves an existing sign-in row's token untouched. */
export async function saveSwitchedConnection(
  who: { userId: string; email: string | null; name: string | null },
  sourceOrgId: string,
  org: CrmOrg,
) {
  const { data: existing } = await db().from("connections").select("refresh_token_enc")
    .eq("org_id", org.id).eq("user_id", who.userId).maybeSingle();
  const row = { org_id: org.id, user_id: who.userId, email: who.email, user_name: who.name, org_name: org.name, revoked: false, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await db().from("connections").update(existing.refresh_token_enc ? row : { ...row, source_org_id: sourceOrgId })
        .eq("org_id", org.id).eq("user_id", who.userId)
    : await db().from("connections").insert({ ...row, source_org_id: sourceOrgId });
  if (error) throw error;
}

/**
 * Short-lived access tokens, cached per server instance until shortly before they expire, so repeated admin searches
 * or switches don't hit id4 (and rotate the refresh token) every time. Server memory only; never persisted.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Fresh access token from a sign-in row's refresh token (stores the rotated refresh token). */
async function accessTokenFromSignIn(orgId: string, userId: string): Promise<string> {
  const key = `${orgId}|${userId}`;
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.token;
  const { data, error } = await db().from("connections").select("refresh_token_enc")
    .eq("org_id", orgId).eq("user_id", userId).eq("revoked", false).maybeSingle();
  if (error || !data?.refresh_token_enc) throw new Error(`No active sign-in connection for org ${orgId}`);
  const t = await refreshTokens(decrypt(data.refresh_token_enc));
  if (t.refresh_token) {
    await db().from("connections")
      .update({ refresh_token_enc: encrypt(t.refresh_token), updated_at: new Date().toISOString() })
      .eq("org_id", orgId).eq("user_id", userId);
  }
  tokenCache.set(key, { token: t.access_token, expiresAt: Date.now() + Math.max(0, (t.expires_in ?? 0) - 120) * 1000 });
  return t.access_token;
}

/** Access token scoped to `orgId` for this user: via their own sign-in row, or by switching from its source org. */
export async function accessTokenFor(orgId: string, userId: string): Promise<string> {
  const { data, error } = await db().from("connections").select("refresh_token_enc, source_org_id")
    .eq("org_id", orgId).eq("user_id", userId).eq("revoked", false).maybeSingle();
  if (error || !data) throw new Error(`No active connection for org ${orgId}`);
  if (data.refresh_token_enc) return accessTokenFromSignIn(orgId, userId);
  return switchOrgToken(await accessTokenFromSignIn(data.source_org_id as string, userId), orgId);
}

/** Get a fresh CRM client for an org using the most recently updated active connection. */
export async function clientForOrg(orgId: string): Promise<CrmClient> {
  const { data, error } = await db()
    .from("connections")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("revoked", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`No active connection for org ${orgId}`);
  return new CrmClient(await accessTokenFor(orgId, data.user_id as string));
}
