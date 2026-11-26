import { describe, expect, it } from "vitest";
import { sumMoney } from "../format";
import { parseFilters } from "../filters";
import { detailsOf, type ReportBody, type Row, type TableResult } from "../types";
import { build, orderDateOf, periodsOf, type FsConfig, type FsData } from "./build";
import { definition } from "./definition";
import { classifyStatus } from "./statuses";
import { AS_OF, DATA, ORDERS, ORG, TZ } from "./fixtures/data";

const run = (q: Record<string, string | string[]> = { year: "2026" }, config: FsConfig = {}, data: FsData = DATA): ReportBody => {
  const filters = parseFilters(definition.filters, q, AS_OF, { fiscalYearStartMonth: config.fiscalYearStartMonth ?? 1 });
  return build({ data, filters, config, asOf: AS_OF, grouping: definition.groupings[0], timeZone: TZ });
};
const main = (r: ReportBody) => r.main as TableResult;
const row = (r: ReportBody, label: string) => main(r).rows.find((x) => x.period === label)!;
const kpi = (r: ReportBody, key: string) => r.kpis!.find((k) => k.key === key)?.value;
const detail = (r: ReportBody, id: string) => detailsOf(r).find((d) => d.id === id)!;
const numbers = (rows: Row[], key = "invoiceNumber") => rows.map((x) => x[key]);
const MONEY = ["invoicedPreTax", "taxCharged", "creditsApplied", "invoiceTotal", "committedMaterials", "committedLabor", "committedTotal"];

describe("Financial Summary: known totals (hand-calculated, see fixtures/data.ts)", () => {
  const r = run();

  it("period rows (months in order, empty months show –)", () => {
    expect(main(r).rows.map((x) => x.period)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026"]);
    expect(row(r, "Jan 2026")).toMatchObject({ invoiceCount: 2, invoicedPreTax: 15000, taxCharged: 1237.5, creditsApplied: 0, invoiceTotal: 16237.5, committedMaterials: 4000, committedLabor: 3000, committedTotal: 7000 });
    expect(row(r, "Feb 2026")).toMatchObject({ invoiceCount: 2, invoicedPreTax: 18300.33, taxCharged: 1509.78, creditsApplied: 300, invoiceTotal: 19810.11, committedMaterials: 2500.5, committedLabor: null, committedTotal: 2500.5 });
    expect(row(r, "Mar 2026")).toMatchObject({ invoiceCount: 1, invoicedPreTax: 1234.56, taxCharged: 101.85, invoiceTotal: 1336.41, committedMaterials: null, committedLabor: 1200.25, committedTotal: 1200.25 });
    expect(row(r, "Apr 2026")).toMatchObject({ invoiceCount: null, invoicedPreTax: null, taxCharged: null, invoiceTotal: null, committedTotal: null });
  });

  it("Year Total and KPIs", () => {
    expect(main(r).totals).toEqual({ invoiceCount: 6, invoicedPreTax: 35234.89, taxCharged: 2906.88, creditsApplied: 300, invoiceTotal: 38141.77, committedMaterials: 6500.5, committedLabor: 4200.25, committedTotal: 10700.75 });
    expect([kpi(r, "invoicedPreTax"), kpi(r, "taxCharged"), kpi(r, "invoiceTotal"), kpi(r, "invoiceCount"), kpi(r, "committedTotal")]).toEqual([35234.89, 2906.88, 38141.77, 6, 10700.75]);
    expect(r.kpis!.find((k) => k.key === "committedTotal")!.label).toBe("Committed cost — not COGS");
  });

  it("Year Total = Σ period rows = Σ detail rows, for every money column", () => {
    const t = main(r).totals;
    for (const k of MONEY) expect(sumMoney(main(r).rows.map((x) => x[k]))).toBe(t[k] ?? 0);
    const inv = detail(r, "invoices");
    expect(sumMoney(inv.rows.map((x) => x.preTax))).toBe(t.invoicedPreTax);
    expect(sumMoney(inv.rows.map((x) => x.tax))).toBe(t.taxCharged);
    expect(sumMoney(inv.rows.map((x) => x.credits))).toBe(t.creditsApplied);
    expect(sumMoney(inv.rows.map((x) => x.total))).toBe(t.invoiceTotal);
    expect(inv.totals).toMatchObject({ preTax: t.invoicedPreTax, tax: t.taxCharged, credits: t.creditsApplied, total: t.invoiceTotal });
    const com = detail(r, "committed");
    expect(sumMoney(com.rows.filter((x) => x.orderType === "PO").map((x) => x.preTaxAmount))).toBe(t.committedMaterials);
    expect(sumMoney(com.rows.filter((x) => x.orderType === "WO").map((x) => x.preTaxAmount))).toBe(t.committedLabor);
    expect(com.totals.preTaxAmount).toBe(t.committedTotal);
    expect(inv.rows.length).toBe(t.invoiceCount);
  });

  it("invoiced pre-tax + tax = invoice total in the fixtures", () => {
    for (const x of detail(r, "invoices").rows) expect(sumMoney([x.preTax, x.tax])).toBe(x.total);
  });

  it("invoice detail: columns, values, links, default sort invoice date ascending", () => {
    const d = detail(r, "invoices");
    expect(d.columns.map((c) => c.header)).toEqual(["Invoice #", "Invoice date", "Customer/GC", "Job #", "Job name", "Status", "Deposit", "Tax name", "Tax rate", "Pre-tax", "Tax", "Credits applied", "Total"]);
    expect(numbers(d.rows)).toEqual(["INV-2001", "INV-2002", "INV-2003", "INV-2004", "INV-2007", "INV-2010"]);
    expect(d.rows[1]).toMatchObject({ invoiceDate: "2026-01-15", customer: "Beacon Contracting", jobNumber: "102", jobName: "Harbor Clinic", status: "Sent", deposit: "Y", taxName: "Sales Tax", taxRate: 0.0825, preTax: 5000, tax: 412.5, total: 5412.5,
      invoiceHref: "https://crm.measuresquare.com/crm/sales/invoices/i2002", jobHref: "https://crm.measuresquare.com/crm/sales/deals/d1" });
  });

  it("committed detail: PO/WO rows, links, default sort order date ascending", () => {
    const d = detail(r, "committed");
    expect(d.columns.map((c) => c.header)).toEqual(["Type", "Number", "Order date", "Vendor / Subcontractor", "Job #", "Job name", "Status", "Pre-tax amount"]);
    expect(d.rows.map((x) => [x.orderType, x.orderNumber, x.orderDate])).toEqual([
      ["PO", "PO-3001", "2026-01-20"], ["WO", "WO-4001", "2026-01-25"], ["PO", "PO-3003", "2026-02-28"], ["WO", "WO-4003", "2026-03-10"],
    ]);
    expect(d.rows[0].orderHref).toBe("https://crm.measuresquare.com/crm/purchases/purchaseOrders/p3001");
  });
});

describe("Financial Summary: inclusion rules", () => {
  const r = run();
  const included = numbers(detail(r, "invoices").rows);

  it("draft, void and unrecognized-status invoices are excluded; unrecognized ones are reported in Notes", () => {
    expect(included).not.toContain("INV-2005"); // Draft
    expect(included).not.toContain("INV-2006"); // Void
    expect(included).not.toContain("INV-2008"); // "Weird Status"
    expect(r.notes.some((n) => n.includes('"Weird Status" (1)'))).toBe(true);
    expect(r.meta.params.unrecognizedStatuses).toMatchObject({ invoice: { "Weird Status": 1 } });
  });

  it("draft and cancelled POs/WOs are excluded; approved/received/completed are included", () => {
    const n = numbers(detail(r, "committed").rows, "orderNumber");
    expect(n).toEqual(["PO-3001", "WO-4001", "PO-3003", "WO-4003"]);
  });

  it("another org's rows are never included", () => {
    expect(included).not.toContain("INV-9001");
    expect(numbers(detail(r, "committed").rows, "orderNumber")).not.toContain("PO-9001");
    const other = run({ year: "2026" }, {}, { orgId: ORG, invoices: DATA.invoices.filter((i) => i.org_id !== ORG), orders: DATA.orders.filter((o) => o.org_id !== ORG) });
    expect(other.rowCount).toBe(0);
    expect(main(other).totals.invoicedPreTax).toBeNull();
  });

  it("deposits: deposit + final invoice count each dollar once (job total = 20,000 pre-tax)", () => {
    const harbor = detail(r, "invoices").rows.filter((x) => x.jobNumber === "102");
    expect(sumMoney(harbor.map((x) => x.preTax))).toBe(20000);
    const ex = run({ year: "2026" }, { depositHandling: "exclude_deposit_invoices" });
    expect(numbers(detail(ex, "invoices").rows)).not.toContain("INV-2002");
    expect(main(ex).totals.invoicedPreTax).toBe(30234.89);
    expect(r.notes.some((n) => n.startsWith("Deposit handling: deposit invoices are counted when invoiced"))).toBe(true);
    expect(ex.notes.some((n) => n.startsWith("Deposit handling: deposit invoices are not counted"))).toBe(true);
  });

  it("credits are listed separately and not subtracted from invoiced revenue", () => {
    expect(row(r, "Feb 2026")).toMatchObject({ creditsApplied: 300, invoicedPreTax: 18300.33 });
  });

  it("year boundary: Dec 31 belongs to the earlier year, Jan 1 to the later one", () => {
    expect(included).toContain("INV-2001");
    expect(included).not.toContain("INV-2000");
    const y2025 = run({ year: "2025" });
    expect(numbers(detail(y2025, "invoices").rows)).toEqual(["INV-2000"]);
    expect(row(y2025, "Dec 2025")).toMatchObject({ invoiceCount: 1, invoicedPreTax: 2000 });
  });

  it("PO order date-times use the org's local time zone; WOs fall back to the start date", () => {
    expect(orderDateOf(ORDERS.find((o) => o.id === "p3003")!, TZ)).toBe("2026-02-28");
    expect(orderDateOf(ORDERS.find((o) => o.id === "p3003")!, "UTC")).toBe("2026-03-01");
    expect(orderDateOf(ORDERS.find((o) => o.id === "w4003")!, TZ)).toBe("2026-03-10");
  });

  it("status matching ignores case and punctuation", () => {
    expect(["Partially Paid", "partially_paid", "PARTIALLYPAID"].map((s) => classifyStatus("invoice", s))).toEqual(["counted", "counted", "counted"]);
    expect([classifyStatus("invoice", "Draft"), classifyStatus("invoice", "Pending Approval"), classifyStatus("invoice", ""), classifyStatus("invoice", "Foo")]).toEqual(["excluded", "excluded", "excluded", "unknown"]);
  });
});

describe("Financial Summary: periods, fiscal year and filters", () => {
  it("quarter view equals the sum of its months", () => {
    const months = run({ year: "2026" });
    const quarters = run({ year: "2026", period: "quarter" });
    expect(main(quarters).rows.map((x) => x.period)).toEqual(["Q1 (Jan–Mar 2026)", "Q2 (Apr–Jun 2026)", "Q3 (Jul–Sep 2026)", "Q4 (Oct–Dec 2026)"]);
    main(quarters).rows.forEach((q, i) => {
      const ms = main(months).rows.slice(i * 3, i * 3 + 3);
      for (const k of [...MONEY, "invoiceCount"]) expect(q[k] ?? 0).toBe(sumMoney(ms.map((x) => x[k])));
    });
    expect(main(quarters).totals).toEqual(main(months).totals);
  });

  it("fiscalYearStartMonth = 7: FY2026 = Jul 2025 – Jun 2026, in fiscal order", () => {
    const r = run({ year: "2026" }, { fiscalYearStartMonth: 7 });
    expect(main(r).rows[0].period).toBe("Jul 2025");
    expect(main(r).rows[11].period).toBe("Jun 2026");
    expect(numbers(detail(r, "invoices").rows)).toEqual(["INV-2000", "INV-2001", "INV-2002", "INV-2003", "INV-2004", "INV-2007"]);
    expect(main(r).totals.invoicedPreTax).toBe(36534.89);
    const fy27 = run({ year: "2027" }, { fiscalYearStartMonth: 7 });
    expect(row(fy27, "Jul 2026")).toMatchObject({ invoiceCount: 1, invoicedPreTax: 700 });
    expect(periodsOf(2026, 7, "quarter").map((p) => p.label)).toEqual(["Q1 (Jul–Sep 2025)", "Q2 (Oct–Dec 2025)", "Q3 (Jan–Mar 2026)", "Q4 (Apr–Jun 2026)"]);
    expect(periodsOf(2026, 11, "quarter")[1].label).toBe("Q2 (Feb–Apr 2026)");
    expect(periodsOf(2026, 12, "quarter")[0].label).toBe("Q1 (Dec 2025–Feb 2026)");
  });

  it("Customer/GC, Pipeline and Owner filters apply to invoices and POs/WOs (via their job)", () => {
    const beacon = run({ year: "2026", customer: "Beacon Contracting" });
    expect(numbers(detail(beacon, "invoices").rows)).toEqual(["INV-2002", "INV-2003"]);
    expect(numbers(detail(beacon, "committed").rows, "orderNumber")).toEqual(["PO-3001", "WO-4001"]);
    const resi = run({ year: "2026", pipeline: "Residential" });
    expect(numbers(detail(resi, "invoices").rows)).toEqual(["INV-2004", "INV-2010"]);
    expect(numbers(detail(resi, "committed").rows, "orderNumber")).toEqual(["WO-4003"]);
    const ana = run({ year: "2026", owner: "Ana Ruiz" });
    expect(main(ana).totals.invoiceCount).toBe(4);
  });

  it("clicking a period narrows both details to it; the main table and KPIs stay the full year", () => {
    const r = run({ year: "2026", in: "2026-02-01_2026-02-28" });
    expect(numbers(detail(r, "invoices").rows)).toEqual(["INV-2003", "INV-2004"]);
    expect(numbers(detail(r, "committed").rows, "orderNumber")).toEqual(["PO-3003"]);
    expect(main(r).totals.invoicedPreTax).toBe(35234.89);
    expect(row(run(), "Feb 2026")._window).toBe("2026-02-01_2026-02-28");
    expect(main(r).drill).toEqual({ filterKey: "in", tab: "invoices" });
  });

  it("showCommittedCost = false hides committed columns, KPI and detail", () => {
    const r = run({ year: "2026" }, { showCommittedCost: false });
    expect(main(r).columns.map((c) => c.key)).toEqual(["invoiceCount", "invoicedPreTax", "taxCharged", "creditsApplied", "invoiceTotal"]);
    expect(r.kpis!.map((k) => k.key)).not.toContain("committedTotal");
    expect(detailsOf(r).map((d) => d.id)).toEqual(["invoices"]);
  });

  it("empty data: every period shows –, totals empty, KPIs zero", () => {
    const r = run({ year: "2026" }, {}, { orgId: ORG, invoices: [], orders: [] });
    expect(r.rowCount).toBe(0);
    expect(main(r).rows.every((x) => x.invoicedPreTax === null && x.committedTotal === null)).toBe(true);
    expect(main(r).totals.invoicedPreTax).toBeNull();
    expect(kpi(r, "invoicedPreTax")).toBe(0);
  });

  it("zero and negative invoices are counted as-is (a credit-style negative invoice reduces the period)", () => {
    const base = DATA.invoices[1];
    const r = run({ year: "2026" }, {}, { orgId: ORG, orders: [], invoices: [
      { ...base, id: "z", number: "Z-1", pre_tax_total: 0, tax_amount: 0, amount: 0 },
      { ...base, id: "n", number: "N-1", pre_tax_total: -250, tax_amount: -20.63, amount: -270.63 },
      { ...base, id: "p", number: "P-1", pre_tax_total: 1000, tax_amount: 82.5, amount: 1082.5 },
    ] });
    expect(row(r, "Jan 2026")).toMatchObject({ invoiceCount: 3, invoicedPreTax: 750, taxCharged: 61.87, invoiceTotal: 811.87 });
  });

  it("missing invoice date: not placed in any period", () => {
    const r = run({ year: "2026" }, {}, { orgId: ORG, orders: [], invoices: [{ ...DATA.invoices[1], invoice_date: null }] });
    expect(r.rowCount).toBe(0);
  });

  it("version, filters and config are recorded in meta params for the event log", () => {
    expect(run({ year: "2026", owner: "Sam Lee" }).meta).toMatchObject({ version: "1", params: { year: 2026, period: "month", owner: ["Sam Lee"], fiscalYearStartMonth: 1, depositHandling: "count_when_invoiced", showCommittedCost: true } });
  });

  it("definition: draft, overrides recorded with reasons", () => {
    expect(definition.status).toBe("draft");
    expect(definition.overrides.every((o) => o.reason.length > 10)).toBe(true);
    expect(definition.overrides.map((o) => o.section)).toEqual(["§1 Main view", "§1 Detail view", "§4 Filters", "§5 Sorting", "§6 Excel sheets"]);
  });
});
