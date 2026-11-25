import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/auth/session";
import { memoryStore } from "@/lib/access/memoryStore";

process.env.APP_URL = "https://app.example";
let current: Session | null = null;
let m = memoryStore();
const assignReports = vi.fn(async () => ({ done: ["A/R Aging"], failed: [] as string[] }));

vi.mock("@/lib/auth/session", () => ({ getSession: async () => current }));
vi.mock("@/lib/access/store", () => ({ get supabaseStore() { return m.store; } }));
vi.mock("@/lib/admin/data", () => ({ assignReports, AdminError: class extends Error {} }));
vi.mock("@/lib/admin/orgLookup", () => ({ resolveOrgForAdmin: async (_s: Session, id: string) => ({ org: { id, name: "Zeta Tile" }, inApp: false }) }));

const { POST } = await import("./route");
const post = () => {
  const body = new FormData();
  body.append("reportIds", "ar-aging");
  return POST(new NextRequest("https://app.example/api/admin/orgs/555000111/assign", { method: "POST", body }), { params: Promise.resolve({ orgId: "555000111" }) });
};
const staff: Session = { userId: "s1", orgId: "o1", homeOrgId: "o1", email: "jamie@measuresquare.com", name: "Jamie" };

beforeEach(() => { m = memoryStore(); current = null; assignReports.mockClear(); });

describe("POST /api/admin/orgs/[orgId]/assign", () => {
  it("401 when signed out", async () => {
    expect((await post()).status).toBe(401);
    expect(assignReports).not.toHaveBeenCalled();
  });

  it("403 for a customer org admin (role Admin, not a Super Admin)", async () => {
    current = { ...staff, email: "owner@customer.com", superClaim: true };
    expect((await post()).status).toBe(403);
    expect(assignReports).not.toHaveBeenCalled();
  });

  it("Super Admin can assign to an org nobody has signed in from yet (org resolved server-side)", async () => {
    m.superAdmins.add("s1");
    current = staff;
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/admin/orgs/555000111?ok=");
    expect(assignReports).toHaveBeenCalledWith(staff, { id: "555000111", name: "Zeta Tile" }, ["ar-aging"]);
  });
});
