import { describe, expect, it } from "vitest";
import { buildArAging, bucketFor, type AgingInvoice } from "./arAging";

const inv = (o: Partial<AgingInvoice>): AgingInvoice => ({
  id: "i", number: "INV-1", account_name: "GC A", deal_name: "Job", job_number: "100",
  invoice_date: "2026-09-01", due_date: "2026-10-01", amount: 1000, paid_amount: 0,
  credit_applied: 0, retainage_amount: 0, retainage_due_date: null, ...o,
});

const asOf = new Date("2026-11-25T00:00:00Z");

describe("bucketFor", () => {
  it("buckets by days past due", () => {
    expect(bucketFor(0)).toBe("Current");
    expect(bucketFor(1)).toBe("1-30");
    expect(bucketFor(45)).toBe("31-60");
    expect(bucketFor(90)).toBe("61-90");
    expect(bucketFor(91)).toBe("90+");
  });
});

describe("buildArAging", () => {
  it("skips fully paid invoices", () => {
    expect(buildArAging([inv({ paid_amount: 1000 })], asOf).rows).toHaveLength(0);
  });

  it("separates retainage from the collectible balance", () => {
    const r = buildArAging([inv({ amount: 1000, paid_amount: 600, retainage_amount: 100 })], asOf);
    expect(r.rows[0].openBalance).toBe(300);
    expect(r.rows[0].retainageHeld).toBe(100);
    expect(r.rows[0].partiallyPaid).toBe(true);
    expect(r.rows[0].bucket).toBe("31-60"); // due Oct 1 -> 55 days
    expect(r.totals.total).toBe(400);
  });

  it("applies credits and rolls up by customer", () => {
    const r = buildArAging(
      [inv({ id: "a", credit_applied: 200 }), inv({ id: "b", account_name: "GC B", due_date: "2026-12-10" })],
      asOf,
    );
    expect(r.totals["31-60"]).toBe(800);
    expect(r.totals.Current).toBe(1000);
    expect(r.byCustomer.map((c) => c.customer)).toEqual(["GC B", "GC A"]);
  });
});
