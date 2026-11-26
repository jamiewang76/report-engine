import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: () => ({}), forOrg: () => ({}) }));
vi.mock("@/lib/crm/connection", () => ({ clientForOrg: async () => ({}) }));

const { invoiceRow, pick } = await import("./sync");

describe("sync invoiceRow", () => {
  const summary = { id: "inv1", number: "INV-1", amount: 100, preTaxTotal: 90, paidAmount: 10, status: "Open", accountName: "Acme Builders", dealName: "Riverside Lofts", dealJobNumber: "101", createdOn: "2026-01-01" };

  it("fills customer and job names from the list item when the detail lacks them", () => {
    const r = invoiceRow(summary, { ...summary, accountName: null, dealName: null, dealJobNumber: null, dealId: "d1", retainageAmount: 5, paymentTerm: { id: "t", name: "Net 30" } });
    expect(r).toMatchObject({ id: "inv1", deal_id: "d1", account_name: "Acme Builders", deal_name: "Riverside Lofts", job_number: "101", retainage_amount: 5, payment_term: "Net 30", paid_amount: 10 });
  });

  it("accepts nested shapes (account.name, deal.id) and text payment terms", () => {
    const detail = { id: "inv2", number: "INV-2", amount: 50, preTaxTotal: 50, paidAmount: 0, status: 1, createdOn: "x", account: { id: "a", name: "Beacon" }, deal: { id: "d2", name: "Harbor", jobNumber: "102" }, paymentTerm: "Net 15" } as never;
    expect(invoiceRow(undefined, detail)).toMatchObject({ account_name: "Beacon", deal_id: "d2", deal_name: "Harbor", job_number: "102", payment_term: "Net 15" });
  });

  it("pick returns the first non-empty path", () => {
    expect(pick({ a: "", b: { c: "x" } }, "a", "b.c")).toBe("x");
    expect(pick({}, "a.b")).toBeNull();
  });
});
