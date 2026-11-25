import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/auth/session";
import { accessTokenFor, saveSwitchedConnection } from "@/lib/crm/connection";
import { claimsOf, switchOrgToken } from "@/lib/crm/orgs";
import { listUserOrgs } from "@/lib/orgs";
import { env } from "@/lib/env";
import { recordSignIn } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";

/**
 * Switch the session to another org the user belongs to. Form POST from the user menu.
 * The CRM's own switch_organization grant is the authority: it only issues a token for orgs the user is a member of.
 */
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s?.homeOrgId) return NextResponse.redirect(`${env.appUrl}/api/auth/login`, 303);
  const target = String((await req.formData()).get("orgId") ?? "");
  const known = (await listUserOrgs(s.userId, s.homeOrgId)).find((o) => o.id === target);
  if (!known) return NextResponse.json({ error: "Organization not available for this user" }, { status: 403 });

  if (target !== s.homeOrgId) {
    try {
      const token = await switchOrgToken(await accessTokenFor(s.homeOrgId, s.userId), target);
      const org = { id: target, name: claimsOf(token).orgName ?? known.name };
      await saveSwitchedConnection({ userId: s.userId, email: s.email, name: s.name }, s.homeOrgId, org);
      // A successful switch proves membership, so it counts as a sign-in to that org.
      await recordSignIn(supabaseStore, { orgId: org.id, orgName: org.name, userId: s.userId, email: s.email, name: s.name });
      known.name = org.name;
    } catch (e) {
      console.error("[switch-org] failed", target, e);
      return NextResponse.redirect(`${env.appUrl}/?error=switch_failed`, 303);
    }
  }
  await setSession({ ...s, orgId: target, orgName: known.name });
  return NextResponse.redirect(`${env.appUrl}/`, 303);
}
