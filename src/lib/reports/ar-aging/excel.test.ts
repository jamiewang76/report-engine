import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorkbook } from "../excel";
import { definition } from "./definition";
import { sampleArAging } from "./fixtures/sample";

let wb: ExcelJS.Workbook;
const text = (ws: ExcelJS.Worksheet, addr: string) => String(ws.getCell(addr).value ?? "");
const formulaOf = (c: ExcelJS.Cell) => (c.value && typeof c.value === "object" && "formula" in c.value ? (c.value as { formula: string }).formula : null);

beforeAll(async () => {
  const buf = await buildWorkbook(definition, sampleArAging());
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
});

/** Find the main table header row on the Report sheet (first row whose column A is the grouping label). */
const mainHeaderRow = (ws: ExcelJS.Worksheet) => {
  for (let r = 1; r <= ws.rowCount; r++) if (text(ws, `A${r}`) === "Customer/GC" && text(ws, `B${r}`) === "Invoice #") return r;
  throw new Error("main header row not found");
};

describe("A/R Aging Excel export (from fixtures)", () => {
  it("sheets in order: Report, Detail, Notes (no hidden sheets)", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Report", "Detail", "Notes"]);
    expect(wb.worksheets.every((w) => w.state !== "hidden" && w.state !== "veryHidden")).toBe(true);
  });

  it("header rows 1–6: title, description, company, reporter, report date, filters; row 7 blank", () => {
    const ws = wb.getWorksheet("Report")!;
    expect(text(ws, "A1")).toBe("A/R Aging");
    expect(ws.getCell("A1").font?.bold).toBe(true);
    expect(text(ws, "A2")).toBe("Open invoices by days past due, with retainage held separately.");
    expect(text(ws, "A3")).toBe("Company: Sample Flooring Co.");
    expect(text(ws, "A4")).toBe("Reporter: Pat Example");
    expect(text(ws, "A5")).toBe("Report date: Nov 25, 2026");
    expect(text(ws, "A6")).toBe("Filters: As of Nov 25, 2026; All customers; All jobs; All owners · Data as of Nov 25, 2026, 9:17 AM");
    expect(text(ws, "A7")).toBe("");
  });

  it("Summary block with typed KPI values", () => {
    const ws = wb.getWorksheet("Report")!;
    expect(text(ws, "A8")).toBe("Summary");
    expect(text(ws, "A9")).toBe("Total Open A/R");
    expect(ws.getCell("B9").value).toBe(55251);
    expect(ws.getCell("B9").numFmt).toBe('"$"#,##0.00;[Red]-"$"#,##0.00');
    expect(ws.getCell("B13").value).toBe(6); // # Open Invoices
  });

  it("main table: typed money cells, SUBTOTAL per group and grand total, frozen header, autofilter, no merges", () => {
    const ws = wb.getWorksheet("Report")!;
    const h = mainHeaderRow(ws);
    expect(ws.getRow(h).font?.bold).toBe(true);
    expect((ws.getRow(h).values as unknown[]).slice(1)).toEqual(["Customer/GC", "Invoice #", "Current", "1–30", "31–60", "61–90", "90+", "Retainage", "Total"]);
    // First data row: Beacon (largest total), INV-1003, 90+ = 29,500 as a number
    expect(text(ws, `A${h + 1}`)).toBe("Beacon Contracting");
    expect(ws.getCell(`G${h + 1}`).value).toBe(29500);
    expect(typeof ws.getCell(`I${h + 1}`).value).toBe("number");
    expect(ws.getCell(`C${h + 1}`).value).toBeNull(); // empty bucket = empty cell, not 0
    // Subtotal + grand total rows use SUBTOTAL(9, …)
    const formulas: string[] = [];
    let grandRow = 0;
    for (let r = h + 1; r <= ws.rowCount; r++) {
      const f = formulaOf(ws.getCell(`I${r}`));
      if (f) formulas.push(f);
      if (text(ws, `A${r}`) === "Grand Total") grandRow = r;
    }
    expect(formulas.length).toBe(4); // 3 groups + grand total
    expect(formulas.every((f) => f.startsWith("SUBTOTAL(9,"))).toBe(true);
    expect(formulaOf(ws.getCell(`I${grandRow}`))).toBe(`SUBTOTAL(9,I${h + 1}:I${grandRow - 1})`);
    expect((ws.getCell(`I${grandRow}`).value as { result: number }).result).toBe(55251);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: h });
    expect(ws.autoFilter).toBeTruthy();
    expect(Object.keys((ws as unknown as { _merges: Record<string, unknown> })._merges ?? {})).toEqual([]);
  });

  it("Detail sheet: every column typed (money numbers, real dates, hyperlinks), totals via SUBTOTAL", () => {
    const ws = wb.getWorksheet("Detail")!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(definition.views.detail!.columns.map((k) => definition.columns.find((c) => c.key === k)!.header));
    const col = (name: string) => headers.indexOf(name) + 1;
    const r2 = ws.getRow(2); // first row = most days past due = INV-1003
    expect(r2.getCell(col("Invoice #")).value).toMatchObject({ text: "INV-1003", hyperlink: "https://crm.measuresquare.com/crm/sales/invoices/i1003" });
    expect(r2.getCell(col("Invoice Date")).value).toBeInstanceOf(Date);
    expect((r2.getCell(col("Invoice Date")).value as Date).toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(r2.getCell(col("Days Past Due")).value).toBe(117);
    expect(r2.getCell(col("Open Balance")).value).toBe(29500);
    expect(ws.getColumn(col("Invoice Date")).numFmt).toBe("mmm d, yyyy");
    const totalRow = ws.getRow(ws.rowCount);
    expect(String(totalRow.getCell(1).value)).toBe("Total");
    expect(formulaOf(totalRow.getCell(col("Open Balance")))).toBe(`SUBTOTAL(9,L2:L7)`);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("Notes sheet: version, column definitions, notes and limitations", () => {
    const ws = wb.getWorksheet("Notes")!;
    const all = ws.getSheetValues().flat().filter(Boolean).map(String);
    expect(all).toContain(definition.version);
    expect(all).toContain("Open Balance = Invoice Amount − Paid − Credits − Retainage Held.");
    expect(all).toContain("Payment history by date will appear once payment data is available.");
    expect(all.some((v) => v.startsWith("High: 60+ days past due"))).toBe(true);
  });
});
