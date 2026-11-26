import { describe, expect, it, vi } from "vitest";

/** Fake cache: forOrg(orgId) only ever returns that org's rows, and records every org/table it was asked for. */
const calls: { orgId: string; table: string }[] = [];
const TABLES: Record<string, Record<string, unknown>[]> = {
  invoices: [
    { org_id: "org_demo", id: "i1", deal_id: "d1", number: "INV-1", status: "Approved", invoice_date: "2026-01-05T00:00:00+00:00", account_name: null, deal_name: null, job_number: null, amount: 108.25, pre_tax_total: 100, tax_amount: 8.25 },
    { org_id: "org_other", id: "i9", deal_id: "d1", number: "INV-9", status: "Approved", invoice_date: "2026-01-05T00:00:00+00:00", amount: 1 },
  ],
  purchase_orders: [{ org_id: "org_demo", id: "p1", number: "PO-1", status: "Approved", vendor_name: "Shaw", deal_id: "d1", deal_name: null, job_number: null, account_name: null, order_date: "2026-01-06T18:00:00Z", pre_tax_total: 40 }],
  work_orders: [{ org_id: "org_demo", id: "w1", number: "WO-1", status: "Approved", contractor_name: "Rivera", deal_id: "d1", deal_name: "Own name", job_number: "77", account_name: "Own acct", order_date: null, start_date_time: "2026-01-07T15:00:00Z", pre_tax_total: 30 }],
  deals: [
    { org_id: "org_demo", id: "d1", name: "Harbor Clinic", job_number: "102", account_name: "Beacon", pipeline_name: "Commercial", owner_name: "Ana Ruiz" },
    { org_id: "org_other", id: "d1", name: "Leak", job_number: "X", account_name: "Leak", pipeline_name: "Leak", owner_name: "Leak" },
  ],
};
vi.mock("@/lib/db", () => ({
  forOrg: (orgId: string) => ({
    selectAll: async (table: string) => {
      calls.push({ orgId, table });
      return (TABLES[table] ?? []).filter((r) => r.org_id === orgId);
    },
  }),
}));

const { load } = await import("./data");

describe("Financial Summary data.ts", () => {
  it("reads only the Supabase cache, only for the session's org; joins pipeline/owner/names from the job", async () => {
    const d = await load("org_demo");
    expect(calls.every((c) => c.orgId === "org_demo")).toBe(true);
    expect(calls.map((c) => c.table).sort()).toEqual(["deals", "invoices", "purchase_orders", "work_orders"]);
    expect(d.invoices).toHaveLength(1);
    expect(d.invoices[0]).toMatchObject({ account_name: "Beacon", deal_name: "Harbor Clinic", job_number: "102", pipeline_name: "Commercial", owner_name: "Ana Ruiz" });
    expect(d.orders.map((o) => [o.kind, o.vendor, o.deal_name, o.job_number, o.account_name])).toEqual([
      ["po", "Shaw", "Harbor Clinic", "102", "Beacon"],
      ["wo", "Rivera", "Own name", "77", "Own acct"],
    ]);
  });
});
