import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/auth/session";
import { memoryStore } from "@/lib/access/memoryStore";
import { sampleArAging } from "@/lib/reports/ar-aging/fixtures/sample";

let currentSession: Session | null = null;
let m = memoryStore();
const runReport = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSession: async () => currentSession }));
vi.mock("@/lib/access/store", () => ({ get supabaseStore() { return m.store; } }));
vi.mock("@/lib/reports/runner", () => ({ runReport: (...a: unknown[]) => runReport(...a) }));

const { GET } = await import("./route");
const call = (qs = "") => GET(new NextRequest(`http://localhost/api/reports/ar-aging${qs}`), { params: Promise.resolve({ report: "ar-aging" }) });
const s = (orgId: string): Session => ({ userId: "u1", orgId, homeOrgId: orgId, email: "pat@acme.com", name: "Pat" });

beforeEach(() => {
  m = memoryStore();
  currentSession = null;
  runReport.mockReset();
  runReport.mockImplementation(async () => ({ state: "ready", result: sampleArAging() }));
});

describe("GET /api/reports/[report]", () => {
  it("401 when not signed in", async () => {
    expect((await call()).status).toBe(401);
    expect(runReport).not.toHaveBeenCalled();
  });

  it("403 for an org without the assignment; the report never runs", async () => {
    m.assign("orgA", "ar-aging");
    currentSession = s("orgB");
    expect((await call("?asOf=2026-11-25")).status).toBe(403);
    expect(runReport).not.toHaveBeenCalled();
    expect(m.events).toEqual([]);
  });

  it("200 for the assigned org: runs with the session (not the request) org and the org's config; logs a view", async () => {
    m.assign("orgA", "ar-aging", { priorityThreshold: 500 });
    currentSession = s("orgA");
    const res = await call("?asOf=2026-11-25&orgId=orgB");
    expect(res.status).toBe(200);
    expect(runReport.mock.calls[0][0]).toMatchObject({ session: { orgId: "orgA" }, config: { priorityThreshold: 500, includeDeposits: true } });
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ orgId: "orgA", reportId: "ar-aging", action: "view", rowCount: 6, params: { version: "2.1.0", grouping: "customer" } });
  });

  it("xlsx export: standard file name, logged as export_xlsx with version and filters", async () => {
    m.assign("orgA", "ar-aging");
    currentSession = s("orgA");
    const res = await call("?asOf=2026-11-25&format=xlsx");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(res.headers.get("content-disposition")).toContain("ar-aging_Sample-Flooring_2026-11-25.xlsx");
    expect(m.events[0]).toMatchObject({ action: "export_xlsx", rowCount: 6, params: { version: "2.1.0", filters: ["As of Nov 25, 2026", "All customers", "All jobs", "All owners"] } });
  });

  it("409 while the org's first sync hasn't finished", async () => {
    m.assign("orgA", "ar-aging");
    currentSession = s("orgA");
    runReport.mockResolvedValueOnce({ state: "preparing", sync: { lastRefreshedAt: null, running: true, lastError: null } });
    expect((await call()).status).toBe(409);
  });
});
