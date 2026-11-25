import { describe, expect, it } from "vitest";
import { addMoney, dateInTimeZone, EMPTY, formatDate, formatValue, subMoney, sumMoney, weightedAverage } from "./format";
import { describeFilters, FilterError, filtersToQuery, parseFilters, resolvePreset } from "./filters";
import { aggregate, buildMatrix, groupRows, monthColumns, resortGroups, sortRows } from "./grouping";
import { workbookFileName } from "./excel";
import type { ColumnDef, FilterDef, Row } from "./types";

describe("money math", () => {
  it("rounds to cents at each sum (no floating-point drift)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
    expect(subMoney(8500.5, 3000.25, 850.05)).toBe(4650.2);
    expect(sumMoney([1.005, 1.005])).toBe(2.02); // each value rounded to cents first
    expect(sumMoney([null, undefined, "", "12.30"])).toBe(12.3);
  });
});

describe("web formatting", () => {
  it("formats per column type, negatives flagged, empty cells", () => {
    expect(formatValue("money", 12345.67).text).toBe("$12,345.67");
    expect(formatValue("money", -45.5)).toMatchObject({ text: "-$45.50", negative: true });
    expect(formatValue("number", 1234).text).toBe("1,234");
    expect(formatValue("percent", 0.235).text).toBe("23.5%");
    expect(formatValue("days", -3)).toMatchObject({ text: "-3", negative: true });
    expect(formatValue("date", "2026-11-25T00:00:00+00:00").text).toBe("Nov 25, 2026");
    expect(formatValue("money", null, { emptyText: EMPTY }).text).toBe("–");
  });

  it("calendar dates never shift with time zones; report date uses the org's zone", () => {
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    const instant = new Date("2026-11-26T05:30:00Z"); // still Nov 25 in Los Angeles
    expect(dateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-11-25");
    expect(dateInTimeZone(instant, "America/New_York")).toBe("2026-11-26");
  });
});

const cols: ColumnDef[] = [
  { key: "revenue", header: "Revenue", type: "money" },
  { key: "profit", header: "Profit", type: "money" },
  { key: "margin", header: "Margin %", type: "percent", aggregate: "avg", weightedBy: { numerator: "profit", denominator: "revenue" } },
  { key: "jobs", header: "Jobs", type: "number" },
  { key: "name", header: "Name", type: "text" },
];
const rows: Row[] = [
  { region: "East", rep: "Ann", name: "a", revenue: 1000, profit: 100, margin: 0.1, jobs: 1 },
  { region: "East", rep: "Bob", name: "b", revenue: 3000, profit: 900, margin: 0.3, jobs: 2 },
  { region: "West", rep: "Cy", name: "c", revenue: 1000.1, profit: 500.05, margin: 0.5, jobs: 3 },
];

describe("grouping and totals", () => {
  it("percent totals are weighted (Σ profit / Σ revenue), never a sum or simple average", () => {
    const t = aggregate(rows.slice(0, 2), cols);
    expect(t.margin).toBeCloseTo(1000 / 4000);
    expect(t.margin).not.toBeCloseTo((0.1 + 0.3) / 2);
    expect(weightedAverage([{ numerator: 0, denominator: 0 }])).toBeNull();
  });

  it("money/number columns sum; text columns are not totaled", () => {
    expect(aggregate(rows, cols)).toEqual({ revenue: 5000.1, profit: 1500.05, margin: 1500.05 / 5000.1, jobs: 6 });
  });

  it("one level: subtotal per group + grand total; grand = Σ subtotals", () => {
    const { groups, grandTotal } = groupRows(rows, [(r) => ({ key: r.region as string, label: r.region as string })], cols, { groupSort: { key: "revenue", dir: "desc" } });
    expect(groups.map((g) => [g.label, g.subtotal.revenue, g.count])).toEqual([["East", 4000, 2], ["West", 1000.1, 1]]);
    expect(sumMoney(groups.map((g) => g.subtotal.revenue))).toBe(grandTotal.revenue);
  });

  it("two levels: nested groups with their own subtotals; three levels rejected", () => {
    const lv = (k: string) => (r: Row) => ({ key: r[k] as string, label: r[k] as string });
    const { groups } = groupRows(rows, [lv("region"), lv("rep")], cols);
    const east = groups.find((g) => g.label === "East")!;
    expect(east.children.map((c) => [c.label, c.subtotal.revenue])).toEqual([["Ann", 1000], ["Bob", 3000]]);
    expect(east.rows).toEqual([]);
    expect(east.children[0].rows).toHaveLength(1);
    expect(() => groupRows(rows, [lv("region"), lv("rep"), lv("name")], cols)).toThrow();
    expect(resortGroups(groups, { key: "revenue", dir: "asc" }).map((g) => g.label)).toEqual(["West", "East"]);
  });

  it("sorts numbers numerically, text case-insensitively, nulls last", () => {
    const data = [{ v: 10 }, { v: null }, { v: 2 }, { v: 33 }];
    expect(sortRows(data, { key: "v", dir: "desc" }).map((r) => r.v)).toEqual([33, 10, 2, null]);
    expect(sortRows(data, { key: "v", dir: "asc" }).map((r) => r.v)).toEqual([2, 10, 33, null]);
  });
});

describe("matrix", () => {
  const months = monthColumns("2026-01", "2026-03");
  const recs = [
    { pipeline: "Commercial", month: "2026-01", amount: 100.1 },
    { pipeline: "Commercial", month: "2026-01", amount: 0.2 },
    { pipeline: "Commercial", month: "2026-03", amount: 50 },
    { pipeline: "Residential", month: "2026-02", amount: 25 },
    { pipeline: "Residential", month: "2027-01", amount: 999 }, // outside columns: ignored
  ];
  const m = buildMatrix(recs, {
    row: (r) => ({ key: r.pipeline, label: r.pipeline }), column: (r) => r.month, value: (r) => r.amount,
    columnOrder: months, money: true, rowLabel: "Pipeline",
  });

  it("months in calendar order", () => {
    expect(months.map((c) => c.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
  });

  it("row totals, column totals, grand total; empty cells are null (shown as –)", () => {
    expect(m.rows.map((r) => [r.label, r.cells, r.total])).toEqual([
      ["Commercial", { "2026-01": 100.3, "2026-02": null, "2026-03": 50 }, 150.3],
      ["Residential", { "2026-01": null, "2026-02": 25, "2026-03": null }, 25],
    ]);
    expect(m.columnTotals).toEqual({ "2026-01": 100.3, "2026-02": 25, "2026-03": 50 });
    expect(m.grandTotal).toBe(175.3);
    expect(sumMoney(Object.values(m.columnTotals))).toBe(m.grandTotal);
  });
});

describe("filters (URL query string)", () => {
  const defs: FilterDef[] = [
    { key: "asOf", label: "As of", kind: "asOf" },
    { key: "invoiced", label: "Invoice date", kind: "dateRange", dateField: "invoiceDate", defaultPreset: "this_month" },
    { key: "owner", label: "Owner", kind: "multi", allLabel: "All owners" },
  ];
  const today = "2026-11-25";

  it("date presets", () => {
    expect(resolvePreset("this_month", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(resolvePreset("last_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePreset("this_quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(resolvePreset("last_quarter", today)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(resolvePreset("ytd", today)).toEqual({ from: "2026-01-01", to: "2026-11-25" });
    expect(resolvePreset("last_year", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(resolvePreset("last_quarter", "2026-02-10")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(resolvePreset("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("defaults need no clicks; values round-trip through the URL; invalid input rejected", () => {
    const d = parseFilters(defs, new URLSearchParams(), today);
    expect(d).toEqual({ asOf: today, ranges: { invoiced: { preset: "this_month", from: "2026-11-01", to: "2026-11-30" } }, multi: { owner: [] } });
    expect(filtersToQuery(defs, d, today).toString()).toBe("");
    const q = new URLSearchParams("asOf=2026-10-31&invoiced=custom&invoicedFrom=2026-01-01&invoicedTo=2026-03-31&owner=Ann&owner=Bob");
    const f = parseFilters(defs, q, today);
    expect(filtersToQuery(defs, f, today).toString()).toBe(q.toString());
    expect(describeFilters(defs, f)).toEqual(["As of Oct 31, 2026", "Invoice date: Jan 1, 2026 – Mar 31, 2026", "Owner: Ann, Bob"]);
    expect(() => parseFilters(defs, new URLSearchParams("asOf=yesterday"), today)).toThrow(FilterError);
    expect(() => parseFilters(defs, new URLSearchParams("invoiced=custom&invoicedFrom=2026-05-01&invoicedTo=2026-01-01"), today)).toThrow(FilterError);
  });
});

describe("Excel file name", () => {
  it("{report-id}_{company-short-name}_{YYYY-MM-DD}.xlsx", () => {
    expect(workbookFileName("ar-aging", "Design Construct Flooring LLC", "2026-11-25")).toBe("ar-aging_Design-Construct-Flooring_2026-11-25.xlsx");
    expect(workbookFileName("ar-aging", "M&P Flooring, Inc.", "2026-11-25")).toBe("ar-aging_MP-Flooring_2026-11-25.xlsx");
    expect(workbookFileName("ar-aging", "", "2026-11-25")).toBe("ar-aging_company_2026-11-25.xlsx");
  });
});
