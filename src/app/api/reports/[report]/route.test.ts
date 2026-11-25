import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/auth/session";
import { memoryStore } from "@/lib/access/memoryStore";

let currentSession: Session | null = null;
let m = memoryStore();

vi.mock("@/lib/auth/session", () => ({ getSession: async () => currentSession }));
vi.mock("@/lib/access/store", () => ({ get supabaseStore() { return m.store; } }));
// The handler's data source: invoices for whichever org the handler asks for (it must be the session's org).
const queriedOrgs: string[] = [];
vi.mock("@/lib/db", () => ({
  forOrg: (orgId: string) => ({
    select: async () => {
      queriedOrgs.push(orgId);
      return { data: [{ id: "i1", number: "INV-1", account_name: "GC", deal_name: "Job", job_number: "1", invoice_date: "2026-10-01", due_date: "2026-10-15", amount: 1000, paid_amount: 0, credit_applied: 0, retainage_amount: 0, retainage_due_date: null, is_deposit: false }], error: null };
    },
  }),
}));

const { GET } = await import("./route");
const call = (qs = "") => GET(new NextRequest(`http://localhost/api/reports/ar-aging${qs}`), { params: Promise.resolve({ report: "ar-aging" }) });
const s = (orgId: string): Session => ({ userId: "u1", orgId, homeOrgId: orgId, email: "pat@acme.com", name: "Pat" });

beforeEach(() => {
  m = memoryStore();
  currentSession = null;
  queriedOrgs.length = 0;
});

describe("GET /api/reports/[report]", () => {
  it("401 when not signed in", async () => {
    expect((await call()).status).toBe(401);
  });

  it("403 for an org without the assignment, and never touches its data", async () => {
    m.assign("orgA", "ar-aging");
    currentSession = s("orgB");
    expect((await call("?asOf=2026-11-25")).status).toBe(403);
    expect(queriedOrgs).toEqual([]);
    expect(m.events).toEqual([]);
  });

  it("200 for the assigned org; logs a view with params and row count", async () => {
    m.assign("orgA", "ar-aging", { priorityThreshold: 500 });
    currentSession = s("orgA");
    const res = await call("?asOf=2026-11-25");
    expect(res.status).toBe(200);
    expect(queriedOrgs).toEqual(["orgA"]);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({
      orgId: "orgA", userId: "u1", reportId: "ar-aging", action: "view", rowCount: 1,
      params: { asOf: "2026-11-25", priorityThreshold: 500, includeDeposits: true },
    });
  });

  it("xlsx export is logged as export_xlsx", async () => {
    m.assign("orgA", "ar-aging");
    currentSession = s("orgA");
    const res = await call("?asOf=2026-11-25&format=xlsx");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(m.events[0]).toMatchObject({ action: "export_xlsx", rowCount: 1 });
  });

  it("400 on a malformed asOf (no silent default)", async () => {
    m.assign("orgA", "ar-aging");
    currentSession = s("orgA");
    expect((await call("?asOf=yesterday")).status).toBe(400);
  });
});
