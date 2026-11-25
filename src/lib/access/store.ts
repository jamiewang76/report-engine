import { db } from "@/lib/db";

/** Data access needed by the access-control logic. Supabase in the app; an in-memory fake in tests. */
export type EventAction =
  | "view" | "export_xlsx" | "view_empty"
  | "admin_assign" | "admin_revoke" | "admin_config_change" | "admin_export_activity";

export type NewEvent = {
  orgId: string | null;
  userId: string;
  userEmail: string | null;
  reportId: string | null;
  action: EventAction;
  params?: Record<string, unknown>;
  rowCount?: number | null;
};

export type ActiveAssignment = { id: number; orgId: string; reportId: string; config: Record<string, unknown> };

export interface AccessStore {
  activeAssignments(orgId: string): Promise<ActiveAssignment[]>;
  isListedSuperAdmin(userId: string): Promise<boolean>;
  /** name null = keep the existing name (insert uses the org id as a placeholder). */
  upsertOrganization(orgId: string, name: string | null, now: Date): Promise<void>;
  upsertOrgUser(u: { orgId: string; userId: string; email: string | null; name: string | null }, now: Date): Promise<void>;
  insertEvent(e: NewEvent): Promise<void>;
  hasEventSince(orgId: string, userId: string, action: EventAction, since: Date): Promise<boolean>;
}

const must = <T extends { error: unknown }>(r: T): T => {
  if (r.error) throw r.error;
  return r;
};

export const supabaseStore: AccessStore = {
  async activeAssignments(orgId) {
    if (!orgId) throw new Error("orgId required");
    const { data } = must(await db().from("report_assignments").select("id, org_id, report_id, config")
      .eq("org_id", orgId).is("revoked_at", null));
    return (data ?? []).map((r) => ({ id: r.id as number, orgId: r.org_id as string, reportId: r.report_id as string, config: (r.config ?? {}) as Record<string, unknown> }));
  },

  async isListedSuperAdmin(userId) {
    const { data } = must(await db().from("super_admins").select("user_id").eq("user_id", userId).maybeSingle());
    return !!data;
  },

  async upsertOrganization(orgId, name, now) {
    const ts = now.toISOString();
    if (name) {
      must(await db().from("organizations").upsert({ org_id: orgId, name, last_seen_at: ts }, { onConflict: "org_id" }));
    } else {
      must(await db().from("organizations").upsert({ org_id: orgId, name: orgId, first_seen_at: ts, last_seen_at: ts }, { onConflict: "org_id", ignoreDuplicates: true }));
      must(await db().from("organizations").update({ last_seen_at: ts }).eq("org_id", orgId));
    }
    // Orgs added from the admin console before anyone signed in have no first sign-in yet: this is it.
    must(await db().from("organizations").update({ first_seen_at: ts }).eq("org_id", orgId).is("first_seen_at", null));
  },

  async upsertOrgUser(u, now) {
    must(await db().from("org_users").upsert(
      { org_id: u.orgId, user_id: u.userId, email: u.email, name: u.name, last_seen_at: now.toISOString() },
      { onConflict: "org_id,user_id" },
    ));
  },

  async insertEvent(e) {
    must(await db().from("report_events").insert({
      org_id: e.orgId, user_id: e.userId, user_email: e.userEmail, report_id: e.reportId,
      action: e.action, params: e.params ?? {}, row_count: e.rowCount ?? null,
    }));
  },

  async hasEventSince(orgId, userId, action, since) {
    const { count } = must(await db().from("report_events").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("user_id", userId).eq("action", action).gte("created_at", since.toISOString()));
    return (count ?? 0) > 0;
  },
};
