import { db } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { logEvent } from "@/lib/access";
import { supabaseStore, type EventAction } from "@/lib/access/store";
import { getReport } from "@/lib/reports/registry";
import { validateConfig } from "@/lib/reports/schema";

/**
 * Admin console data. Reads ONLY organizations, org_users, report_assignments, report_events, sync_runs
 * (via admin_org_overview) and super_admins. It must never read cached CRM data (deals, invoices, ...):
 * Super Admins manage access, they do not see customers' business data. No "preview as org" in v1.
 */

const must = <T extends { error: unknown }>(r: T): T => {
  if (r.error) throw r.error;
  return r;
};

export type OrgOverview = {
  org_id: string; name: string; first_seen_at: string; last_seen_at: string;
  active_reports: number; last_sync_at: string | null; last_export_at: string | null; user_count: number;
};

export async function orgOverview(): Promise<OrgOverview[]> {
  const { data } = must(await db().from("admin_org_overview").select("*").order("name"));
  return (data ?? []) as OrgOverview[];
}

export type OrgUser = { org_id: string; user_id: string; email: string | null; name: string | null; first_seen_at: string; last_seen_at: string };

export async function usersByOrg(orgIds: string[]): Promise<Map<string, OrgUser[]>> {
  const out = new Map<string, OrgUser[]>();
  if (!orgIds.length) return out;
  const { data } = must(await db().from("org_users").select("*").in("org_id", orgIds).order("last_seen_at", { ascending: false }));
  for (const u of (data ?? []) as OrgUser[]) out.set(u.org_id, [...(out.get(u.org_id) ?? []), u]);
  return out;
}

export type Assignment = {
  id: number; org_id: string; report_id: string; config: Record<string, unknown>;
  assigned_by: string; assigned_at: string; revoked_at: string | null; revoked_by: string | null;
};

export async function orgDetail(orgId: string) {
  const [{ data: org }, { data: assignments }, users, events] = await Promise.all([
    db().from("admin_org_overview").select("*").eq("org_id", orgId).maybeSingle(),
    db().from("report_assignments").select("*").eq("org_id", orgId).order("assigned_at", { ascending: false }),
    usersByOrg([orgId]),
    activity({ orgId }, 1, 25),
  ]);
  if (!org) return null;
  return {
    org: org as OrgOverview,
    active: ((assignments ?? []) as Assignment[]).filter((a) => !a.revoked_at),
    history: (assignments ?? []) as Assignment[],
    users: users.get(orgId) ?? [],
    events,
  };
}

/** Active assignments with org names, for the Reports page. */
export async function activeAssignmentsWithOrgs() {
  const { data } = must(await db().from("report_assignments").select("*").is("revoked_at", null).order("assigned_at", { ascending: false }));
  const rows = (data ?? []) as Assignment[];
  const orgIds = [...new Set(rows.map((r) => r.org_id))];
  const { data: orgs } = orgIds.length
    ? must(await db().from("organizations").select("org_id, name").in("org_id", orgIds))
    : { data: [] };
  const names = new Map((orgs ?? []).map((o) => [o.org_id as string, o.name as string]));
  return rows.map((r) => ({ ...r, org_name: names.get(r.org_id) ?? r.org_id }));
}

/** Display names for user ids (assigned_by etc.), from org_users. */
export async function userLabels(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = must(await db().from("org_users").select("user_id, name, email").in("user_id", ids));
  return new Map((data ?? []).map((u) => [u.user_id as string, (u.name as string) || (u.email as string) || (u.user_id as string)]));
}

// ---------- Activity log ----------

export type ActivityFilters = { orgId?: string; reportId?: string; user?: string; action?: string; from?: string; to?: string };
export type ActivityRow = {
  id: number; org_id: string | null; user_id: string; user_email: string | null; report_id: string | null;
  action: EventAction; params: Record<string, unknown>; row_count: number | null; created_at: string;
};

const dateOk = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

function filtered(f: ActivityFilters, opts: { count?: boolean } = {}) {
  let q = db().from("report_events").select("*", opts.count ? { count: "exact" } : undefined);
  if (f.orgId) q = q.eq("org_id", f.orgId);
  if (f.reportId) q = q.eq("report_id", f.reportId);
  if (f.action) q = q.eq("action", f.action);
  if (f.user) {
    const u = f.user.replace(/[%,()"\*:]/g, "").trim();
    q = q.or(`user_email.ilike.%${u}%,user_id.eq.${u}`);
  }
  if (dateOk(f.from)) q = q.gte("created_at", `${f.from}T00:00:00Z`);
  if (dateOk(f.to)) q = q.lt("created_at", new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000).toISOString());
  return q.order("created_at", { ascending: false }).order("id", { ascending: false });
}

export async function activity(f: ActivityFilters, page = 1, pageSize = 50) {
  const from = (Math.max(1, page) - 1) * pageSize;
  const { data, count } = must(await filtered(f, { count: true }).range(from, from + pageSize - 1));
  return { rows: (data ?? []) as ActivityRow[], total: count ?? 0, page: Math.max(1, page), pageSize };
}

export async function activityForExport(f: ActivityFilters, limit = 10_000) {
  const { data } = must(await filtered(f).range(0, limit - 1));
  return (data ?? []) as ActivityRow[];
}

// ---------- Mutations (each one is logged as admin_*) ----------

export class AdminError extends Error {}

const actor = (s: Session) => ({ userId: s.userId, userEmail: s.email });

export async function assignReport(s: Session, orgId: string, reportId: string, configInput: unknown) {
  const report = getReport(reportId);
  if (!report) throw new AdminError("Unknown report");
  if (report.status !== "live") throw new AdminError(`${report.name} is ${report.status}; only live reports can be assigned`);
  const v = validateConfig(report.configSchema, configInput);
  if (!v.ok) throw new AdminError(`Invalid settings: ${Object.entries(v.errors).map(([k, e]) => `${k}: ${e}`).join("; ")}`);
  const { data: org } = must(await db().from("organizations").select("org_id").eq("org_id", orgId).maybeSingle());
  if (!org) throw new AdminError("Unknown organization");

  const { error } = await db().from("report_assignments").insert({ org_id: orgId, report_id: reportId, config: v.value, assigned_by: s.userId });
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new AdminError("Already assigned");
    throw error;
  }
  await logEvent(supabaseStore, { ...actor(s), orgId, reportId, action: "admin_assign", params: { after: v.value } });
}

export async function revokeReport(s: Session, orgId: string, reportId: string) {
  const { data } = must(await db().from("report_assignments")
    .update({ revoked_at: new Date().toISOString(), revoked_by: s.userId })
    .eq("org_id", orgId).eq("report_id", reportId).is("revoked_at", null)
    .select("config"));
  if (!data?.length) throw new AdminError("Not currently assigned");
  await logEvent(supabaseStore, { ...actor(s), orgId, reportId, action: "admin_revoke", params: { before: data[0].config } });
}

export async function updateReportConfig(s: Session, orgId: string, reportId: string, configInput: unknown) {
  const report = getReport(reportId);
  if (!report) throw new AdminError("Unknown report");
  const v = validateConfig(report.configSchema, configInput);
  if (!v.ok) throw new AdminError(`Invalid settings: ${Object.entries(v.errors).map(([k, e]) => `${k}: ${e}`).join("; ")}`);
  const { data: current } = must(await db().from("report_assignments").select("id, config")
    .eq("org_id", orgId).eq("report_id", reportId).is("revoked_at", null).maybeSingle());
  if (!current) throw new AdminError("Not currently assigned");
  if (JSON.stringify(current.config) === JSON.stringify(v.value)) return;
  must(await db().from("report_assignments").update({ config: v.value }).eq("id", current.id).is("revoked_at", null));
  await logEvent(supabaseStore, { ...actor(s), orgId, reportId, action: "admin_config_change", params: { before: current.config, after: v.value } });
}

export async function logActivityExport(s: Session, filters: ActivityFilters, rowCount: number) {
  await logEvent(supabaseStore, { ...actor(s), orgId: filters.orgId ?? null, reportId: filters.reportId ?? null, action: "admin_export_activity", params: { filters }, rowCount });
}
