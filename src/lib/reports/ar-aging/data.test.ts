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

describe("A/R Aging joinDeals", () => {
  const base = { org_id: "o", id: "x", number: "INV-1", invoice_date: null, due_date: null, payment_term: null, amount: 100, paid_amount: 0, credit_applied: 0, retainage_amount: 0, retainage_due_date: null, is_deposit: false };
  const deal = { id: "d1", name: "Riverside Lofts", job_number: "101", account_name: "Acme Builders", owner_name: "Sam Lee" };

  it("fills customer, job name and job number from the job when the invoice has only the job id", async () => {
    const { joinDeals } = await import("./data");
    const [r] = joinDeals([{ ...base, deal_id: "d1", account_name: null, deal_name: null, job_number: null }], [deal]);
    expect(r).toMatchObject({ account_name: "Acme Builders", deal_name: "Riverside Lofts", job_number: "101", owner_name: "Sam Lee" });
  });

  it("keeps the invoice's own names when present, and leaves blanks when there is no job", async () => {
    const { joinDeals } = await import("./data");
    const [a, b] = joinDeals([
      { ...base, deal_id: "d1", account_name: "Billed To Co", deal_name: "Own Name", job_number: "9" },
      { ...base, id: "y", deal_id: null, account_name: null, deal_name: null, job_number: null },
    ], [deal]);
    expect(a).toMatchObject({ account_name: "Billed To Co", deal_name: "Own Name", job_number: "9" });
    expect(b).toMatchObject({ account_name: null, deal_name: null, owner_name: null });
  });
});
