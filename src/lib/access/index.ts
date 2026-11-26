import type { Session } from "@/lib/auth/session";
import { getReport, REPORTS, type ReportModule } from "@/lib/reports/registry";
import { validateConfig } from "@/lib/reports/schema";
import type { AccessStore, NewEvent } from "./store";

/**
 * Report access control. Every customer-facing report path goes through checkReportAccess();
 * every admin path goes through isSuperAdmin(). Both run server-side on each request.
 */

// ---------- Super Admin ----------

const SUPER_ADMIN_DOMAIN = "measuresquare.com";

/** Exact domain match on a well-formed address (rejects sub/look-alike domains like x@measuresquare.com.evil). */
export function isMeasureSquareEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const m = email.trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return m?.[1] === SUPER_ADMIN_DOMAIN;
}

const truthy = (v: unknown) => v === true || (typeof v === "string" && v.toLowerCase() === "true");

/**
 * From the id4 access token at sign-in: CRM global super user (`isSuper`) AND a @measuresquare.com email.
 * Customer org owners/admins have role "Admin" but never this combination.
 */
export function superClaimFromToken(accessClaims: Record<string, unknown>): boolean {
  const email = typeof accessClaims.email === "string" ? accessClaims.email : null;
  return truthy(accessClaims.isSuper) && isMeasureSquareEmail(email);
}

/**
 * Re-checked on every admin request. Always requires a @measuresquare.com email (domain alone is never enough), plus
 * either the token claim captured at sign-in (lasts for the 12h session) or a row in super_admins (checked live,
 * so removing a row revokes access immediately).
 */
export async function isSuperAdmin(store: AccessStore, s: Session | null): Promise<boolean> {
  if (!s || !isMeasureSquareEmail(s.email)) return false;
  if (s.superClaim) return true;
  return store.isListedSuperAdmin(s.userId);
}

// ---------- Report access ----------

export type AccessResult =
  /** preview: a Super Admin viewing a built draft report on their current org (default config, not assigned). */
  | { ok: true; report: ReportModule; config: Record<string, unknown>; assignmentId: number | null; preview?: boolean }
  | { ok: false; status: 401 | 403 | 404 | 409; error: string };

export async function checkReportAccess(store: AccessStore, s: Session | null, reportId: string): Promise<AccessResult> {
  if (!s) return { ok: false, status: 401, error: "Not signed in" };
  const report = getReport(reportId);
  if (!report) return { ok: false, status: 404, error: "Unknown report" };
  const forbidden = { ok: false as const, status: 403 as const, error: "This report is not available for your organization" };
  if (report.status === "draft") {
    // Draft preview for MeasureSquare staff only (re-checked every request), so drafts can be reviewed on a test org
    // without assigning them. Customers never see drafts, even with an assignment row.
    if (!report.build || !(await isSuperAdmin(store, s))) return forbidden;
    const cfg = validateConfig(report.configSchema, {});
    if (!cfg.ok) return forbidden;
    return { ok: true, report, config: cfg.value, assignmentId: null, preview: true };
  }
  if (report.status !== "live") return forbidden;
  const a = (await store.activeAssignments(s.orgId)).find((x) => x.reportId === reportId && x.orgId === s.orgId);
  if (!a) return forbidden;
  const cfg = validateConfig(report.configSchema, a.config);
  if (!cfg.ok) return { ok: false, status: 409, error: "This report's settings need attention. Contact your MeasureSquare account manager." };
  return { ok: true, report, config: cfg.value, assignmentId: a.id };
}

/** Live reports with an active assignment for the org, in catalog order. */
export async function visibleReports(store: AccessStore, orgId: string): Promise<ReportModule[]> {
  const assigned = new Set((await store.activeAssignments(orgId)).map((a) => a.reportId));
  return REPORTS.filter((r) => r.status === "live" && assigned.has(r.id));
}

/**
 * Optional cache tables an org's sync must include: the dataSources of its assigned live reports, plus (for a Super Admin
 * previewing drafts) those of built draft reports. Deals and invoices always sync.
 */
export async function syncTablesForOrg(store: AccessStore, orgId: string, opts: { includeDrafts?: boolean } = {}): Promise<string[]> {
  const reports = [...(await visibleReports(store, orgId)), ...(opts.includeDrafts ? REPORTS.filter((r) => r.status === "draft" && r.build) : [])];
  return [...new Set(reports.flatMap((r) => r.dataSources.tables))];
}

/** Sync only orgs that can actually see a report. */
export async function orgHasActiveReports(store: AccessStore, orgId: string): Promise<boolean> {
  return (await visibleReports(store, orgId)).length > 0;
}

// ---------- Sign-in bookkeeping ----------

/** Upsert the org (name refreshed when known) and the user. Runs on every sign-in and every successful org switch. */
export async function recordSignIn(
  store: AccessStore,
  who: { orgId: string; orgName: string | null; userId: string; email: string | null; name: string | null },
  now = new Date(),
) {
  await store.upsertOrganization(who.orgId, who.orgName?.trim() || null, now);
  await store.upsertOrgUser({ orgId: who.orgId, userId: who.userId, email: who.email, name: who.name }, now);
}

// ---------- Activity log ----------

export const logEvent = (store: AccessStore, e: NewEvent) => store.insertEvent(e);

/** "view_empty" at most once per user per org per day, so the log stays readable. */
export async function logViewEmpty(store: AccessStore, s: Session, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000);
  if (await store.hasEventSince(s.orgId, s.userId, "view_empty", since)) return;
  await store.insertEvent({ orgId: s.orgId, userId: s.userId, userEmail: s.email, reportId: null, action: "view_empty" });
}
