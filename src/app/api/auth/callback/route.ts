import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, identityFromTokens } from "@/lib/auth/id4";
import { setSession } from "@/lib/auth/session";
import { saveConnection } from "@/lib/crm/connection";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const verifier = req.cookies.get("pkce_verifier")?.value;
  if (!code || !verifier || state !== req.cookies.get("oauth_state")?.value) {
    return NextResponse.json({ error: "Invalid sign-in response" }, { status: 400 });
  }
  const tokens = await exchangeCode(code, verifier);
  const who = identityFromTokens(tokens);
  if (!who.userId || !who.orgId) {
    // Phase 0: if this fires, look at `claims` and update identityFromTokens() with the real org claim name.
    return NextResponse.json({ error: "Could not determine user/organization from token", claims: Object.keys(who.claims) }, { status: 500 });
  }
  await saveConnection(who.orgId, who.userId, who.email, tokens);
  await setSession({ userId: who.userId, orgId: who.orgId, email: who.email, name: who.name });
  const res = NextResponse.redirect(`${env.appUrl}/`);
  res.cookies.delete("pkce_verifier");
  res.cookies.delete("oauth_state");
  return res;
}
