import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/auth/session";
import { listUserOrgs } from "@/lib/orgs";
import { env } from "@/lib/env";

/** Switch the session to another org the same user has already connected. Form POST from the user menu. */
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(`${env.appUrl}/`, 303);
  const target = String((await req.formData()).get("orgId") ?? "");
  const org = (await listUserOrgs(s.userId)).find((o) => o.orgId === target);
  if (!org) return NextResponse.json({ error: "Organization not available for this user" }, { status: 403 });
  await setSession({ ...s, orgId: org.orgId, orgName: org.orgName });
  return NextResponse.redirect(`${env.appUrl}/`, 303);
}
