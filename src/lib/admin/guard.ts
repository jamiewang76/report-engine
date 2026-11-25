import { forbidden, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";

/** Call at the top of EVERY admin page (layouts alone are not a security boundary). 403 for non-admins. */
export async function requireSuperAdminPage(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/api/auth/login");
  if (!(await isSuperAdmin(supabaseStore, s))) forbidden();
  return s;
}

/** Call at the top of EVERY admin API route. Returns the session, or a 401/403 response to return as-is. */
export async function requireSuperAdminApi(): Promise<Session | NextResponse> {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await isSuperAdmin(supabaseStore, s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return s;
}
