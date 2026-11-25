import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/auth/session";
import { refreshTokens, type TokenSet } from "@/lib/auth/id4";
import { CrmClient } from "./client";

/**
 * One row per signed-in user per org in `connections`. Holds the encrypted refresh token so the
 * nightly sync can run without the user present. Access tokens are short-lived and kept in memory only.
 */
export async function saveConnection(orgId: string, userId: string, email: string | null, t: TokenSet) {
  if (!t.refresh_token) throw new Error("No refresh token returned — is offline_access granted to this client in id4?");
  const { error } = await db().from("connections").upsert(
    {
      org_id: orgId,
      user_id: userId,
      email,
      refresh_token_enc: encrypt(t.refresh_token),
      updated_at: new Date().toISOString(),
      revoked: false,
    },
    { onConflict: "org_id,user_id" },
  );
  if (error) throw error;
}

/** Get a fresh CRM client for an org using the most recently updated active connection. */
export async function clientForOrg(orgId: string): Promise<CrmClient> {
  const { data, error } = await db()
    .from("connections")
    .select("user_id, refresh_token_enc")
    .eq("org_id", orgId)
    .eq("revoked", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`No active connection for org ${orgId}`);

  const t = await refreshTokens(decrypt(data.refresh_token_enc));
  // Refresh tokens may rotate — store the new one.
  if (t.refresh_token) {
    await db()
      .from("connections")
      .update({ refresh_token_enc: encrypt(t.refresh_token), updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("user_id", data.user_id);
  }
  return new CrmClient(t.access_token);
}
