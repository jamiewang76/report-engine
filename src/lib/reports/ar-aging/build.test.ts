import { describe, expect, it } from "vitest";
import { parseFilters } from "../filters";
import { leafRows } from "../grouping";
import { sumMoney } from "../format";
import type { GroupedResult, ResolvedFilters, Row } from "../types";
import { build, bucketFor, invoiceRow, priorityFor, type ArConfig, type ArData, type ArInvoice } from "./build";
import { definition } from "./definition";
import { AS_OF, DATA, INVOICES, ORG } from "./fixtures/invoices";

const byCustomer = definition.groupings[0];
const byJob = definition.groupings[1];
const noFilters = (q: Record<string, string | string[]> = {}): ResolvedFilters => parseFilters(definition.filters, q, AS_OF);
const run = (opts: { data?: ArData; config?: ArConfig; filters?: ResolvedFilters; grouping?: typeof byCustomer } = {}) =>
  build({ data: opts.data ?? DATA, filters: opts.filters ?? noFilters(), config: opts.config ?? { priorityThreshold: 25000 }, asOf: AS_OF, grouping: opts.grouping ?? byCustomer });
const main = (r: ReturnType<typeof run>) => r.main as GroupedResult;
const kpi = (r: ReturnType<typeof run>, key: string) => r.kpis!.find((k) => k.key === key)!.value;
const inv = (o: Partial<ArInvoice>): ArInvoice => ({ ...INVOICES[0], id: "t", number: "T-1", retainage_amount: 0, paid_amount: 0, credit_applied: 0, ...o });

describe("A/R Aging: known totals (hand-calculated, see fixtures/invoices.ts)", () => {
  const r = run();

  it("grand total by bucket", () => {
    expect(main(r).grandTotal).toEqual({ current: 10800, d1_30: 1000, d31_60: 6900.95, d61_90: 5000, d90p: 29500, retainage: 2050.05, total: 55251 });
  });

  it("KPIs", () => {
    expect(kpi(r, "totalOpen")).toBe(55251);
    expect(kpi(r, "pastDue")).toBe(42400.95);
    expect(kpi(r, "over90")).toBe(29500);
    expect(kpi(r, "retainageHeld")).toBe(2050.05);
    expect(kpi(r, "openInvoices")).toBe(6);
    expect(r.rowCount).toBe(6);
  });

  it("groups by Customer/GC, sorted by Total desc, with subtotals", () => {
    expect(main(r).groups.map((g) => [g.label, g.subtotal.total, g.count])).toEqual([
      ["Beacon Contracting", 29500, 1],
      ["Acme Builders", 22500.25, 3],
      ["Cedar Homes", 3250.75, 2],
    ]);
  });

  it("invoices inside a group are sorted by Days Past Due desc", () => {
    const acme = main(r).groups.find((g) => g.label === "Acme Builders")!;
    expect(acme.rows.map((x) => x.number)).toEqual(["INV-1007", "INV-1002", "INV-1001"]);
  });

  it("grand total = sum of subtotals = sum of detail rows (every money column)", () => {
    for (const k of ["current", "d1_30", "d31_60", "d61_90", "d90p", "retainage", "total"]) {
      const g = main(r).grandTotal[k];
      expect(sumMoney(main(r).groups.map((x) => x.subtotal[k]))).toBe(g);
      expect(sumMoney(main(r).groups.flatMap(leafRows).map((x) => x[k]))).toBe(g);
    }
    const d = r.detail!;
    expect(d.totals.openBalance).toBe(sumMoney(d.rows.map((x) => x.openBalance)));
    expect(addOpenAndRetainage(d.totals)).toBe(main(r).grandTotal.total);
  });

  it("detail rows: columns, values, links, default sort Days Past Due desc", () => {
    const d = r.detail!;
    expect(d.columns.map((c) => c.header)).toEqual([
      "Invoice #", "Customer/GC", "Job", "Invoice Date", "Due Date", "Terms", "Days Past Due", "Bucket", "Invoice Amount",
      "Paid", "Credits", "Open Balance", "Retainage Held", "Retainage Due", "Priority",
    ]);
    expect(d.rows.map((x) => x.number)).toEqual(["INV-1003", "INV-1007", "INV-1005", "INV-1002", "INV-1006", "INV-1001"]);
    expect(d.rows.find((x) => x.number === "INV-1002")).toMatchObject({
      customer: "Acme Builders", job: "101 - Riverside Lofts", invoiceDate: "2026-09-15", dueDate: "2026-10-15", terms: "Net 30",
      daysPastDue: 41, bucket: "31–60", amount: 8500.5, paid: 3000.25, credits: 0, openBalance: 4650.2, retainageHeld: 850.05, priority: "Medium",
      jobHref: "https://crm.measuresquare.com/crm/sales/deals/d101",
      numberHref: "https://crm.measuresquare.com/crm/sales/invoices/i1002",
    });
    expect(d.rows.find((x) => x.number === "INV-1001")!.dueDate).toBe("2026-12-01"); // timestamp -> calendar date
  });

  it("By Job grouping", () => {
    const j = run({ grouping: byJob });
    expect(main(j).groups.map((g) => [g.label, g.subtotal.total])).toEqual([
      ["102 - Harbor Clinic", 29500],
      ["101 - Riverside Lofts", 17500.25],
      ["105 - Pine Ridge Retail", 5000],
      ["104 - Cedar Model Home", 3250.75],
    ]);
    expect(main(j).groups[0].href).toBe("https://crm.measuresquare.com/crm/sales/deals/d102");
    expect(main(j).grandTotal.total).toBe(55251);
  });
});

const addOpenAndRetainage = (t: Row) => sumMoney([t.openBalance, t.retainageHeld]);

describe("A/R Aging: edge cases", () => {
  it("empty data", () => {
    const r = run({ data: { orgId: ORG, invoices: [] } });
    expect(r.rowCount).toBe(0);
    expect(main(r).groups).toEqual([]);
    expect(main(r).grandTotal.total).toBeNull(); // shown as "–"
    expect(kpi(r, "totalOpen")).toBe(0);
    expect(kpi(r, "openInvoices")).toBe(0);
  });

  it("another org's rows are never included", () => {
    const r = run();
    expect(r.detail!.rows.some((x) => x.number === "INV-9001")).toBe(false);
    expect(main(r).groups.some((g) => g.label === "Other Org Customer")).toBe(false);
    const onlyOther = run({ data: { orgId: ORG, invoices: INVOICES.filter((i) => i.org_id !== ORG) } });
    expect(onlyOther.rowCount).toBe(0);
  });

  it("zero, negative, fully paid and over-credited invoices are not receivables", () => {
    expect(invoiceRow(inv({ amount: 0 }), AS_OF, {})).toBeNull();
    expect(invoiceRow(inv({ amount: -500 }), AS_OF, {})).toBeNull();
    expect(invoiceRow(inv({ amount: 100, paid_amount: 100 }), AS_OF, {})).toBeNull();
    expect(invoiceRow(inv({ amount: 100, paid_amount: 50, credit_applied: 60 }), AS_OF, {})).toBeNull();
  });

  it("missing due date ages from the invoice date", () => {
    const row = invoiceRow(inv({ invoice_date: "2026-10-01", due_date: null }), AS_OF, {})!;
    expect(row.dueDate).toBeNull();
    expect(row.daysPastDue).toBe(55);
    expect(row.bucket).toBe("31–60");
  });

  it("bucket boundaries: day 0/1, 30/31, 60/61, 90/91", () => {
    const due = (days: number) => new Date(Date.parse(`${AS_OF}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
    const b = (days: number) => invoiceRow(inv({ amount: 100, due_date: due(days) }), AS_OF, {})!.bucket;
    expect([b(0), b(1), b(30), b(31), b(60), b(61), b(90), b(91)]).toEqual(["Current", "1–30", "1–30", "31–60", "31–60", "61–90", "61–90", "90+"]);
    expect([bucketFor(-5), bucketFor(0)]).toEqual(["Current", "Current"]);
  });

  it("retainage: payments apply to the non-retainage portion first; retainage capped at the open amount", () => {
    const row = invoiceRow(inv({ amount: 1000, paid_amount: 600, retainage_amount: 100, due_date: "2026-10-01" }), AS_OF, {})!;
    expect([row.openBalance, row.retainageHeld, row.total, row.bucket]).toEqual([300, 100, 400, "31–60"]);
    const only = invoiceRow(inv({ amount: 1000, paid_amount: 950, retainage_amount: 100 }), AS_OF, {})!;
    expect([only.openBalance, only.retainageHeld, only.total]).toEqual([0, 50, 50]);
    expect([only.current, only.d1_30, only.d31_60, only.d61_90, only.d90p]).toEqual([null, null, null, null, null]);
  });

  it("money is rounded to cents (no floating-point drift)", () => {
    const rows = Array.from({ length: 10 }, (_, i) => inv({ id: `c${i}`, number: `C-${i}`, amount: 0.1, due_date: "2026-11-01" }));
    const r = run({ data: { orgId: ORG, invoices: rows } });
    expect(main(r).grandTotal.total).toBe(1);
  });

  it("include deposits = false drops deposit invoices", () => {
    const r = run({ config: { includeDeposits: false, priorityThreshold: 25000 } });
    expect(r.detail!.rows.some((x) => x.number === "INV-1006")).toBe(false);
    expect(main(r).grandTotal.total).toBe(54251);
    expect(kpi(r, "openInvoices")).toBe(5);
  });
});

describe("A/R Aging: priority", () => {
  it("High if 60+ days past due or open balance ≥ threshold; Medium 1–59 days; Low current", () => {
    expect(priorityFor(60, 10, null)).toBe("High");
    expect(priorityFor(59, 10, null)).toBe("Medium");
    expect(priorityFor(1, 10, null)).toBe("Medium");
    expect(priorityFor(0, 10, null)).toBe("Low");
    expect(priorityFor(0, 25000, 25000)).toBe("High");
    expect(priorityFor(0, 24999.99, 25000)).toBe("Low");
  });

  it("from fixtures with threshold 25,000 vs 10,000", () => {
    const p = (cfg: ArConfig) => Object.fromEntries(run({ config: cfg }).detail!.rows.map((x) => [x.number, x.priority]));
    expect(p({ priorityThreshold: 25000 })).toEqual({ "INV-1003": "High", "INV-1007": "High", "INV-1005": "Medium", "INV-1002": "Medium", "INV-1006": "Medium", "INV-1001": "Low" });
    expect(p({ priorityThreshold: 10000 })["INV-1001"]).toBe("High"); // current, but open balance 10,800 ≥ 10,000
    expect(p({ priorityThreshold: null })["INV-1001"]).toBe("Low");
  });
});

describe("A/R Aging: filters", () => {
  it("Customer/GC, Job and Owner multi-selects (empty = all)", () => {
    expect(run({ filters: noFilters({ customer: ["Cedar Homes"] }) }).rowCount).toBe(2);
    expect(run({ filters: noFilters({ customer: ["Cedar Homes", "Beacon Contracting"] }) }).rowCount).toBe(3);
    expect(run({ filters: noFilters({ job: "d101" }) }).detail!.rows.map((x) => x.number).sort()).toEqual(["INV-1001", "INV-1002"]);
    expect(run({ filters: noFilters({ owner: "Ana Ruiz" }) }).detail!.rows.map((x) => x.number).sort()).toEqual(["INV-1003", "INV-1005", "INV-1006"]);
  });

  it("filters + version are recorded in meta params for the event log", () => {
    const r = run({ filters: noFilters({ owner: "Sam Lee" }) });
    expect(r.meta).toMatchObject({ version: definition.version, grouping: "customer", params: { asOf: AS_OF, owner: ["Sam Lee"], includeDeposits: true, priorityThreshold: 25000 } });
  });

  it("definition has no overrides beyond the recorded column-order one", () => {
    expect(definition.overrides.map((o) => o.section)).toEqual(["§3 column order"]);
  });
});
