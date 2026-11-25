import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchUserInfo, identityFromTokens } from "@/lib/auth/id4";
import { setSession } from "@/lib/auth/session";
import { saveConnection } from "@/lib/crm/connection";
import { fetchUserProfile } from "@/lib/crm/orgs";
import { env } from "@/lib/env";
import { isSuperAdmin, recordSignIn, superClaimFromToken } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";

/** IANA zone from the token, only if the runtime recognizes it (an invalid zone would break date formatting). */
function validTimeZone(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const verifier = req.cookies.get("pkce_verifier")?.value;
  if (!code || !verifier || state !== req.cookies.get("oauth_state")?.value) {
    return NextResponse.json({ error: "Invalid sign-in response" }, { status: 400 });
  }
  const tokens = await exchangeCode(code, verifier);
  const [userInfo, profile] = await Promise.all([fetchUserInfo(tokens.access_token), fetchUserProfile(tokens.access_token)]);
  const userOrgs = profile.orgs;
  const id = identityFromTokens(tokens, userInfo);
  // Reporter name: token claims first (fullName / firstName+lastName), else the CRM user profile. Stored in org_users.
  const who = { ...id, name: id.name ?? profile.name };
  const tz = validTimeZone(id.claims.access.timezone);
  if (!who.userId || !who.orgId) {
    console.error("[auth] no user/org in token; claim names:", Object.keys(who.claims.access));
    return NextResponse.json({ error: "Could not determine user/organization from token" }, { status: 500 });
  }
  const orgName = who.orgName ?? userOrgs?.find((o) => o.id === who.orgId)?.name ?? null;
  await saveConnection({ orgId: who.orgId, userId: who.userId, email: who.email, name: who.name, orgName }, tokens, userOrgs);
  await recordSignIn(supabaseStore, { orgId: who.orgId, orgName, userId: who.userId, email: who.email, name: who.name });
  const superClaim = superClaimFromToken(who.claims.access);
  const session = { userId: who.userId, orgId: who.orgId, orgName, homeOrgId: who.orgId, email: who.email, name: who.name, superClaim, timeZone: tz };
  await setSession({ ...session, isSuperAdmin: await isSuperAdmin(supabaseStore, session) });
  const res = NextResponse.redirect(`${env.appUrl}/`);
  res.cookies.delete("pkce_verifier");
  res.cookies.delete("oauth_state");
  return res;
}
