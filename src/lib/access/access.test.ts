import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/session";
import {
  checkReportAccess, isMeasureSquareEmail, isSuperAdmin, logViewEmpty, orgHasActiveReports, recordSignIn,
  superClaimFromToken, visibleReports,
} from "./index";
import { memoryStore } from "./memoryStore";

const session = (o: Partial<Session> = {}): Session => ({
  userId: "u1", orgId: "orgA", homeOrgId: "orgA", orgName: "Org A", email: "pat@customer.com", name: "Pat", ...o,
});

describe("report assignment check", () => {
  it("allows a live report assigned to the session's org and passes validated config", async () => {
    const m = memoryStore();
    m.assign("orgA", "ar-aging", { priorityThreshold: 5000 });
    const r = await checkReportAccess(m.store, session(), "ar-aging");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config).toEqual({ priorityThreshold: 5000, includeDeposits: true });
  });

  it("401 when not signed in", async () => {
    const r = await checkReportAccess(memoryStore().store, null, "ar-aging");
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("403 when never assigned", async () => {
    const r = await checkReportAccess(memoryStore().store, session(), "ar-aging");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("403 after the assignment is revoked", async () => {
    const m = memoryStore();
    m.assign("orgA", "ar-aging");
    m.revoke("orgA", "ar-aging");
    expect(await checkReportAccess(m.store, session(), "ar-aging")).toMatchObject({ ok: false, status: 403 });
  });

  it("403 when assigned to a different org only", async () => {
    const m = memoryStore();
    m.assign("orgB", "ar-aging");
    expect(await checkReportAccess(m.store, session(), "ar-aging")).toMatchObject({ ok: false, status: 403 });
    expect(await checkReportAccess(m.store, session({ orgId: "orgB" }), "ar-aging")).toMatchObject({ ok: true });
  });

  it("403 for a draft report even if an assignment row exists", async () => {
    const m = memoryStore();
    m.assign("orgA", "bid-timing");
    expect(await checkReportAccess(m.store, session(), "bid-timing")).toMatchObject({ ok: false, status: 403 });
    expect(await visibleReports(m.store, "orgA")).toEqual([]);
  });

  it("404 for an unknown report id", async () => {
    expect(await checkReportAccess(memoryStore().store, session(), "nope")).toMatchObject({ ok: false, status: 404 });
  });

  it("409 when the stored config no longer validates", async () => {
    const m = memoryStore();
    m.assign("orgA", "ar-aging", { includeDeposits: "yes" });
    expect(await checkReportAccess(m.store, session(), "ar-aging")).toMatchObject({ ok: false, status: 409 });
  });

  it("sync only runs for orgs with an active live report", async () => {
    const m = memoryStore();
    m.assign("orgA", "ar-aging");
    m.assign("orgC", "bid-timing"); // draft
    expect(await orgHasActiveReports(m.store, "orgA")).toBe(true);
    expect(await orgHasActiveReports(m.store, "orgB")).toBe(false);
    expect(await orgHasActiveReports(m.store, "orgC")).toBe(false);
  });
});

describe("Super Admin detection", () => {
  const staff = session({ userId: "s1", email: "jamie@measuresquare.com" });

  it("isSuper claim + @measuresquare.com email => super admin", async () => {
    expect(superClaimFromToken({ isSuper: "True", email: "jamie@measuresquare.com" })).toBe(true);
    expect(await isSuperAdmin(memoryStore().store, { ...staff, superClaim: true })).toBe(true);
  });

  it("isSuper claim with a customer email => never (customer owners)", async () => {
    expect(superClaimFromToken({ isSuper: "True", email: "owner@customer.com" })).toBe(false);
    expect(await isSuperAdmin(memoryStore().store, session({ superClaim: true }))).toBe(false);
  });

  it("role Admin is an org admin, not a super admin", () => {
    expect(superClaimFromToken({ role: "Admin", isSuper: "False", email: "jamie@measuresquare.com" })).toBe(false);
  });

  it("allowlist (super_admins) + @measuresquare.com email => super admin", async () => {
    const m = memoryStore();
    m.superAdmins.add("s1");
    expect(await isSuperAdmin(m.store, staff)).toBe(true);
  });

  it("allowlisted but non-MeasureSquare email => denied", async () => {
    const m = memoryStore();
    m.superAdmins.add("u1");
    expect(await isSuperAdmin(m.store, session())).toBe(false);
  });

  it("email domain alone is never enough", async () => {
    expect(await isSuperAdmin(memoryStore().store, staff)).toBe(false);
  });

  it("removed from the allowlist mid-session => denied on the next request", async () => {
    const m = memoryStore();
    m.superAdmins.add("s1");
    const s = { ...staff, isSuperAdmin: true }; // stale display hint in the cookie
    expect(await isSuperAdmin(m.store, s)).toBe(true);
    m.superAdmins.delete("s1");
    expect(await isSuperAdmin(m.store, s)).toBe(false);
  });

  it("domain check is exact", () => {
    expect(isMeasureSquareEmail("Jamie@MeasureSquare.com")).toBe(true);
    for (const e of ["x@measuresquare.com.evil.io", "x@evilmeasuresquare.com", "x@sub.measuresquare.com", "measuresquare.com", "a@b@measuresquare.com", null]) {
      expect(isMeasureSquareEmail(e)).toBe(false);
    }
  });

  it("not signed in => denied", async () => {
    expect(await isSuperAdmin(memoryStore().store, null)).toBe(false);
  });
});

describe("org auto-creation on sign-in", () => {
  it("inserts, then updates last_seen without touching first_seen, and refreshes the name", async () => {
    const m = memoryStore();
    const t1 = new Date("2026-11-01T10:00:00Z");
    const t2 = new Date("2026-11-20T10:00:00Z");
    await recordSignIn(m.store, { orgId: "orgA", orgName: "Acme Floors", userId: "u1", email: "pat@acme.com", name: "Pat" }, t1);
    expect(m.orgs.get("orgA")).toEqual({ name: "Acme Floors", first_seen_at: t1, last_seen_at: t1 });
    expect(m.users.get("orgA|u1")).toMatchObject({ email: "pat@acme.com", first_seen_at: t1, last_seen_at: t1 });

    await recordSignIn(m.store, { orgId: "orgA", orgName: "Acme Flooring Inc.", userId: "u1", email: "pat@acme.com", name: "Pat" }, t2);
    expect(m.orgs.get("orgA")).toEqual({ name: "Acme Flooring Inc.", first_seen_at: t1, last_seen_at: t2 });
    expect(m.users.get("orgA|u1")).toMatchObject({ first_seen_at: t1, last_seen_at: t2 });
  });

  it("falls back to the org id, and an unknown name never overwrites a known one", async () => {
    const m = memoryStore();
    await recordSignIn(m.store, { orgId: "org9", orgName: null, userId: "u1", email: null, name: null });
    expect(m.orgs.get("org9")?.name).toBe("org9");
    await recordSignIn(m.store, { orgId: "org9", orgName: "Real Name", userId: "u1", email: null, name: null });
    await recordSignIn(m.store, { orgId: "org9", orgName: "  ", userId: "u1", email: null, name: null });
    expect(m.orgs.get("org9")?.name).toBe("Real Name");
  });
});

describe("empty state", () => {
  it("customer with zero assignments sees no reports and gets one view_empty event per day", async () => {
    const m = memoryStore();
    const s = session();
    expect(await visibleReports(m.store, s.orgId)).toEqual([]);
    await logViewEmpty(m.store, s);
    await logViewEmpty(m.store, s);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ orgId: "orgA", userId: "u1", action: "view_empty", reportId: null });
  });
});

describe("report_events is insert-only (migration)", () => {
  // Behavioral proof runs in Postgres: supabase/tests/report_events_immutable.sql. This guards the migration itself.
  const sql = readFileSync("supabase/migrations/0004_report_access.sql", "utf8");
  it("has a trigger that raises on UPDATE/DELETE and on TRUNCATE, and RLS with no policies", () => {
    expect(sql).toMatch(/before update or delete on report_events\s+for each row execute function report_events_immutable/);
    expect(sql).toMatch(/before truncate on report_events\s+for each statement/);
    expect(sql).toMatch(/raise exception/);
    expect(sql).toMatch(/alter table report_events\s+enable row level security/);
    expect(sql).not.toMatch(/create policy[^;]*report_events/i);
  });
});

describe("org added by a Super Admin before anyone signs in", () => {
  it("first sign-in fills first_seen_at; name refreshes from the token", async () => {
    const m = memoryStore();
    m.addByAdmin("orgZ", "Zeta Tile (from CRM search)");
    expect(m.orgs.get("orgZ")).toEqual({ name: "Zeta Tile (from CRM search)", first_seen_at: null, last_seen_at: null });
    m.assign("orgZ", "ar-aging");
    const t = new Date("2026-12-01T09:00:00Z");
    await recordSignIn(m.store, { orgId: "orgZ", orgName: "Zeta Tile", userId: "u7", email: "a@zeta.com", name: "A" }, t);
    expect(m.orgs.get("orgZ")).toEqual({ name: "Zeta Tile", first_seen_at: t, last_seen_at: t });
    expect(await checkReportAccess(m.store, session({ orgId: "orgZ", userId: "u7" }), "ar-aging")).toMatchObject({ ok: true });
  });
});
