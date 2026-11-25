import { NextResponse } from "next/server";
import { authorizeUrl, createPkce } from "@/lib/auth/id4";

export async function GET() {
  const { verifier, challenge, state } = createPkce();
  const res = NextResponse.redirect(await authorizeUrl(challenge, state));
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/auth", maxAge: 600 };
  res.cookies.set("pkce_verifier", verifier, opts);
  res.cookies.set("oauth_state", state, opts);
  return res;
}
