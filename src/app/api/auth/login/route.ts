import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, createPkce } from "@/lib/auth/id4";

/** `?prompt=login` forces the id4 login screen (used for "Sign in to another organization"). */
export async function GET(req: NextRequest) {
  const { verifier, challenge, state } = createPkce();
  const prompt = req.nextUrl.searchParams.get("prompt") === "login" ? "login" : undefined;
  const res = NextResponse.redirect(await authorizeUrl(challenge, state, prompt));
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/auth", maxAge: 600 };
  res.cookies.set("pkce_verifier", verifier, opts);
  res.cookies.set("oauth_state", state, opts);
  return res;
}
