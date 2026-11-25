import { describe, expect, it, vi } from "vitest";
import { INVOICES } from "./fixtures/invoices";

/** Fake cache: forOrg(orgId) only ever returns that org's rows, and records every org/table it was asked for. */
const calls: { orgId: string; table: string }[] = [];
const DEALS = [
  { org_id: "org_demo", id: "d101", owner_name: "Sam Lee" },
  { org_id: "org_other", id: "d101", owner_name: "Someone Else" }, // same id in another org must not leak
];
vi.mock("@/lib/db", () => ({
  forOrg: (orgId: string) => ({
    selectAll: async (table: string) => {
      calls.push({ orgId, table });
      const rows = table === "invoices" ? INVOICES.map(({ owner_name: _o, ...i }) => i) : DEALS;
      return rows.filter((r) => r.org_id === orgId);
    },
  }),
}));

const { load } = await import("./data");

describe("A/R Aging data.ts", () => {
  it("reads only the Supabase cache, only for the session's org, and joins the job owner", async () => {
    const d = await load("org_demo");
    expect(calls).toEqual([{ orgId: "org_demo", table: "invoices" }, { orgId: "org_demo", table: "deals" }]);
    expect(d.invoices.every((i) => i.org_id === "org_demo")).toBe(true);
    expect(d.invoices.find((i) => i.number === "INV-1001")!.owner_name).toBe("Sam Lee");
    expect(d.invoices.find((i) => i.number === "INV-1005")!.owner_name).toBeNull(); // its deal isn't in this org's cache
  });
});
