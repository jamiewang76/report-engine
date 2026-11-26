import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorkbook } from "../excel";
import { definition } from "./definition";
import { sampleFinancialSummary } from "./fixtures/sample";

let wb: ExcelJS.Workbook;
const text = (ws: ExcelJS.Worksheet, addr: string) => String(ws.getCell(addr).value ?? "");
const formulaOf = (c: ExcelJS.Cell) => (c.value && typeof c.value === "object" && "formula" in c.value ? (c.value as { formula: string }).formula : null);
const resultOf = (c: ExcelJS.Cell) => (c.value && typeof c.value === "object" && "result" in c.value ? (c.value as { result: unknown }).result : c.value);
const findRow = (ws: ExcelJS.Worksheet, col: string, value: string) => {
  for (let r = 1; r <= ws.rowCount; r++) if (text(ws, `${col}${r}`) === value) return r;
  throw new Error(`${value} not found`);
};
const colOf = (ws: ExcelJS.Worksheet, headerRow: number, header: string) => {
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= row.cellCount; c++) if (String(row.getCell(c).value) === header) return c;
  throw new Error(`column ${header} not found`);
};

beforeAll(async () => {
  const buf = await buildWorkbook(definition, sampleFinancialSummary());
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
});

describe("Financial Summary Excel export (from fixtures)", () => {
  it("sheets in order: Report, Invoices, Committed Cost, Notes", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Report", "Invoices", "Committed Cost", "Notes"]);
  });

  it("header rows 1–6 (filters line names both date bases); row 7 blank", () => {
    const ws = wb.getWorksheet("Report")!;
    expect(text(ws, "A1")).toBe("Monthly Financial Summary");
    expect(text(ws, "A2")).toBe(definition.description);
    expect(text(ws, "A3")).toBe("Company: Sample Flooring Co.");
    expect(text(ws, "A4")).toBe("Reporter: Pat Example");
    expect(text(ws, "A5")).toBe("Report date: Nov 25, 2026");
    expect(text(ws, "A6")).toBe("Filters: Year: 2026; Period: Month; All customers; All pipelines; All owners; Dates: invoice date (invoices), order date (POs/WOs) · Data as of Nov 25, 2026, 9:17 AM");
    expect(text(ws, "A7")).toBe("");
  });

  it("KPIs, then the period table with typed money cells and a Year Total row using SUBTOTAL", () => {
    const ws = wb.getWorksheet("Report")!;
    expect(text(ws, "A8")).toBe("Summary");
    const kpiRow = findRow(ws, "A", "Committed cost — not COGS");
    expect(ws.getCell(`B${kpiRow}`).value).toBe(10700.75);
    const head = findRow(ws, "A", "Period");
    expect(ws.getRow(head).values).toEqual([undefined, "Period", "# Invoices", "Invoiced (pre-tax)", "Tax charged", "Credits applied", "Invoice total (incl. tax)", "Committed – Materials (POs)", "Committed – Labor (WOs)", "Committed total"]);
    expect(text(ws, `A${head + 1}`)).toBe("Jan 2026");
    expect(ws.getCell(head + 1, 3).value).toBe(15000);
    expect(typeof ws.getCell(head + 2, 3).value).toBe("number");
    expect(ws.getCell(head + 4, 3).value).toBeNull(); // Apr: no activity
    const total = head + 13;
    expect(text(ws, `A${total}`)).toBe("Year Total");
    const L = ws.getColumn(3).letter;
    expect(formulaOf(ws.getCell(total, 3))).toBe(`SUBTOTAL(9,${L}${head + 1}:${L}${head + 12})`);
    expect(resultOf(ws.getCell(total, 3))).toBe(35234.89);
    expect(resultOf(ws.getCell(total, 9))).toBe(10700.75);
    expect(ws.getRow(total).font?.bold).toBe(true);
  });

  it("Invoices sheet: dates are dates, money is numeric, links, SUBTOTAL total", () => {
    const ws = wb.getWorksheet("Invoices")!;
    expect(text(ws, "A1")).toBe("Invoice #");
    expect(ws.getCell("B2").value).toBeInstanceOf(Date);
    const pre = colOf(ws, 1, "Pre-tax");
    expect(ws.getCell(2, pre).value).toBe(10000);
    expect(ws.getCell("A2").value).toMatchObject({ text: "INV-2001", hyperlink: "https://crm.measuresquare.com/crm/sales/invoices/i2001" });
    const totalRow = findRow(ws, "A", "Total");
    expect(formulaOf(ws.getCell(totalRow, pre))).toMatch(/^SUBTOTAL\(9,/);
    expect(resultOf(ws.getCell(totalRow, pre))).toBe(35234.89);
    expect(ws.getCell(2, colOf(ws, 1, "Tax rate")).value).toBe(0.0825);
  });

  it("Committed Cost sheet: PO/WO rows with order dates and a SUBTOTAL total", () => {
    const ws = wb.getWorksheet("Committed Cost")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Type", "Number", "Order date", "Vendor / Subcontractor", "Job #", "Job name", "Status", "Pre-tax amount"]);
    expect(text(ws, "A2")).toBe("PO");
    expect(ws.getCell("C2").value).toBeInstanceOf(Date);
    const totalRow = findRow(ws, "A", "Total");
    expect(resultOf(ws.getCell(totalRow, 8))).toBe(10700.75);
    expect(formulaOf(ws.getCell(totalRow, 8))).toBe("SUBTOTAL(9,H2:H5)");
  });

  it("Notes sheet: definitions, limitation, version", () => {
    const ws = wb.getWorksheet("Notes")!;
    const all = ws.getSheetValues().flat().map(String).join("\n");
    expect(all).toContain("Report version");
    expect(all).toContain("Tax charged: sum of sales tax on approved invoices by invoice date (accrual basis");
    expect(all).toContain("Deposit handling: deposit invoices are counted when invoiced");
    expect(all).toContain("It is not COGS.");
    expect(all).toContain("Invoices counted: Approved");
  });
});
