import crypto from "node:crypto";
import { decodeJwt } from "jose";
import { env } from "@/lib/env";

/**
 * id4 (IdentityServer) OAuth 2.0: authorization code + PKCE, refresh tokens via offline_access.
 * Supported per https://id4.measuresquare.com/.well-known/openid-configuration (checked 2026-11-25):
 * grants authorization_code + refresh_token, PKCE S256, scopes openid/profile/email/crm-api/offline_access.
 */

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
};

let discoveryCache: Discovery | null = null;

export async function discovery(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache;
  const res = await fetch(`${env.id4Issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`id4 discovery failed: ${res.status}`);
  discoveryCache = (await res.json()) as Discovery;
  return discoveryCache;
}

export const redirectUri = () => `${env.appUrl}/api/auth/callback`;

export function createPkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

export async function authorizeUrl(challenge: string, state: string, prompt?: "login") {
  const d = await discovery();
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("client_id", env.id4ClientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("scope", env.id4Scopes);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  if (prompt) u.searchParams.set("prompt", prompt);
  return u.toString();
}

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const d = await discovery();
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.id4ClientId,
      client_secret: env.id4ClientSecret,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`id4 token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenSet;
}

export const exchangeCode = (code: string, verifier: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier });

export const refreshTokens = (refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

/** OIDC userinfo: name/email usually live here rather than in the access token. Best-effort. */
export async function fetchUserInfo(accessToken: string): Promise<Record<string, unknown>> {
  try {
    const d = (await discovery()) as Discovery & { userinfo_endpoint?: string };
    const url = d.userinfo_endpoint ?? `${env.id4Issuer}/connect/userinfo`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Identify user + organization from the token claims (access token, then id_token, then userinfo).
 * PHASE 0 TODO: confirm the actual claim names in a real id4 token (see "[claims-probe]" in the
 * Vercel logs after sign-in). Candidates below are guesses.
 */
export function identityFromTokens(t: TokenSet, userInfo: Record<string, unknown> = {}) {
  const access = decodeJwt(t.access_token) as Record<string, unknown>;
  const idToken = t.id_token ? (decodeJwt(t.id_token) as Record<string, unknown>) : {};
  const sources = [access, idToken, userInfo];
  const pick = (...keys: string[]) => {
    for (const src of sources) for (const k of keys) if (src[k] != null && src[k] !== "") return String(src[k]);
    return null;
  };
  // id4 claim names confirmed from a real CRM token (2026-11-25): the token carries only the user's
  // *current* org (currentOrganizationId/Name, mirrored in organizationId/Name); there is no org list.
  const given = pick("firstName", "given_name");
  const family = pick("lastName", "family_name");
  return {
    userId: pick("sub"),
    email: pick("email", "loginAccount"),
    name: pick("fullName", "name") ?? ([given, family].filter(Boolean).join(" ") || pick("preferred_username")),
    orgId: pick("currentOrganizationId", "organizationId"),
    orgName: pick("currentOrganizationName", "organizationName"),
    claims: { access, idToken, userInfo },
  };
}
