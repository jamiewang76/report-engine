import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: () => ({}), forOrg: () => ({}) }));
vi.mock("@/lib/crm/connection", () => ({ clientForOrg: async () => ({}) }));

const { invoiceRow, invoicesNeedingDetail, money, pick, purchaseOrderRow, workOrderRow } = await import("./sync");

describe("CRM money is integer cents", () => {
  it("converts cents to dollars exactly; null stays null", () => {
    expect(money(17781990)).toBe(177819.9);
    expect(money(1)).toBe(0.01);
    expect(money(-2550)).toBe(-25.5);
    expect([money(null), money(""), money("abc")]).toEqual([null, null, null]);
  });
});

describe("sync invoiceRow", () => {
  const summary = { id: "inv1", number: "INV-1", amount: 10000, preTaxTotal: 9000, paidAmount: 1000, status: "Approved", accountName: "Acme Builders", dealName: "Riverside Lofts", dealJobNumber: "101", createdOn: "2026-01-01" };

  it("fills customer and job names from the list item; money in dollars; new tax/deposit fields", () => {
    const r = invoiceRow(summary, {
      ...summary, accountName: null, dealName: null, dealJobNumber: null, dealId: "d1", retainageAmount: 500, taxAmount: 1000,
      taxName: "CA Sales Tax", taxRate: 8.25, isDeposit: false, depositInvoicedAmount: 2500, sovId: "s1", lastUpdatedOn: "2026-03-01T10:00:00Z",
    } as never);
    expect(r).toMatchObject({
      id: "inv1", deal_id: "d1", account_name: "Acme Builders", deal_name: "Riverside Lofts", job_number: "101",
      amount: 100, pre_tax_total: 90, tax_amount: 10, paid_amount: 10, retainage_amount: 5, deposit_invoiced_amount: 25,
      tax_name: "CA Sales Tax", tax_rate: 8.25, sov_id: "s1", last_updated_on: "2026-03-01T10:00:00Z",
    });
  });

  it("accepts nested shapes (account.name, deal.id)", () => {
    const detail = { id: "inv2", number: "INV-2", amount: 5000, preTaxTotal: 5000, paidAmount: 0, status: "Sent", createdOn: "x", account: { id: "a", name: "Beacon" }, deal: { id: "d2", name: "Harbor", jobNumber: "102" } } as never;
    expect(invoiceRow(undefined, detail)).toMatchObject({ account_name: "Beacon", deal_id: "d2", deal_name: "Harbor", job_number: "102", amount: 50 });
  });

  it("pick returns the first non-empty path", () => {
    expect(pick({ a: "", b: { c: "x" } }, "a", "b.c")).toBe("x");
    expect(pick({}, "a.b")).toBeNull();
  });
});

describe("invoicesNeedingDetail", () => {
  const li = (o: Record<string, unknown>) => ({ id: "i", number: "1", amount: 1000, preTaxTotal: 1000, paidAmount: 1000, status: "Paid", createdOn: "x", lastUpdatedOn: "2026-01-01T00:00:00Z", ...o }) as never;
  const cached = (o: Record<string, unknown> = {}) => ({ id: "i", paid_amount: 10, retainage_amount: 0, last_updated_on: "2026-01-01T00:00:00+00:00", ...o });

  it("skips a paid, unchanged invoice; refetches new, open, paid-changed, edited or retainage ones", () => {
    expect(invoicesNeedingDetail([li({})], [cached()])).toHaveLength(0);
    expect(invoicesNeedingDetail([li({})], [])).toHaveLength(1); // new
    expect(invoicesNeedingDetail([li({ paidAmount: 500 })], [cached({ paid_amount: 5 })])).toHaveLength(1); // open
    expect(invoicesNeedingDetail([li({})], [cached({ paid_amount: 9 })])).toHaveLength(1); // payment changed
    expect(invoicesNeedingDetail([li({ lastUpdatedOn: "2026-02-01T00:00:00Z" })], [cached()])).toHaveLength(1); // edited
    expect(invoicesNeedingDetail([li({})], [cached({ last_updated_on: null })])).toHaveLength(1); // never stored
    expect(invoicesNeedingDetail([li({})], [cached({ retainage_amount: 5 })])).toHaveLength(1); // retainage
  });
});

describe("purchase order / work order rows", () => {
  it("PO list item -> row (cents to dollars, order date, vendor, job)", () => {
    expect(purchaseOrderRow({ id: "p1", number: "PO-1", status: "Approved", category: "Material", vendorId: "v1", vendorName: "Shaw", vendorRefNumber: "R9", dealName: "Harbor", dealJobNumber: "102", orderDateTime: "2026-03-05T17:00:00Z", amount: 108250, preTaxTotal: 100000, lastUpdatedOn: "2026-03-06T00:00:00Z" }))
      .toMatchObject({ id: "p1", number: "PO-1", status: "Approved", vendor_name: "Shaw", job_number: "102", deal_name: "Harbor", order_date: "2026-03-05T17:00:00Z", amount: 1082.5, pre_tax_total: 1000 });
  });

  it("WO list item -> row (contractor name, order/start dates)", () => {
    expect(workOrderRow({ id: "w1", number: "WO-1", status: "Approved", type: "Install", contractorName: "Rivera Install", installerType: "Subcontractor", dealName: "Harbor", dealJobNumber: "102", orderDate: "2026-03-07", startDateTime: "2026-03-10T15:00:00Z", amount: 50000, preTaxTotal: 50000 }))
      .toMatchObject({ contractor_name: "Rivera Install", installer_type: "Subcontractor", order_date: "2026-03-07", start_date_time: "2026-03-10T15:00:00Z", pre_tax_total: 500 });
    expect(workOrderRow({ id: "w2", contractor: { businessName: "Acme Floors" } }).contractor_name).toBe("Acme Floors");
  });
});
