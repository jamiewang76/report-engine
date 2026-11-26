import ExcelJS from "exceljs";
import { aggregateOf, EXCEL_FORMAT, excelFormatOf, excelDate, formatDate, formatDateTime, isNumericType } from "./format";
import { leafRows } from "./grouping";
import { detailsOf, type ColumnDef, type DetailResult, type GroupNode, type ReportDefinition, type ReportResult, type Row } from "./types";

/**
 * Excel export per docs/report-standard.md §6. Sheets: Report (header block, Summary, main view), one sheet per detail
 * table (named by the report: "Detail", or e.g. "Invoices" and "Committed Cost"), Notes. Every value is typed (numbers, fractions for %, real dates); totals use SUBTOTAL(9, …)
 * so they keep working when the customer filters; header rows bold; frozen panes; autofilter; widths set; no merges.
 */

const BOLD = { bold: true };
const SUBTOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F7" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E7EC" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF4FF" } };

/** Typed cell value for a column (never text for numbers/dates). */
function cellValue(col: ColumnDef, row: Row): ExcelJS.CellValue {
  const v = row[col.key];
  if (v == null || v === "") return null;
  switch (col.type) {
    case "money":
    case "number":
    case "percent":
    case "days":
      return Number.isFinite(Number(v)) ? Number(v) : null;
    case "date":
      return excelDate(v);
    case "link": {
      const href = col.hrefKey ? (row[col.hrefKey] as string | null | undefined) : null;
      return href ? { text: String(v), hyperlink: href } : String(v);
    }
    default:
      return String(v);
  }
}

function styleColumns(ws: ExcelJS.Worksheet, cols: ColumnDef[], firstCol = 1) {
  cols.forEach((c, i) => {
    const col = ws.getColumn(firstCol + i);
    col.width = c.width ?? Math.max(12, c.header.length + 2);
    const fmt = excelFormatOf(c);
    if (fmt) col.numFmt = fmt;
    col.alignment = { horizontal: c.align ?? (isNumericType(c.type) ? "right" : "left") };
  });
}

const colLetter = (ws: ExcelJS.Worksheet, n: number) => ws.getColumn(n).letter;

/** SUBTOTAL(9, …) for summable columns. Percent totals are the computed weighted average (typed number). */
function totalCell(ws: ExcelJS.Worksheet, col: ColumnDef, colIndex: number, firstRow: number, lastRow: number, computed: unknown): ExcelJS.CellValue {
  const agg = aggregateOf(col);
  if (lastRow < firstRow) return agg === "sum" ? 0 : null;
  if (agg === "sum") {
    const L = colLetter(ws, colIndex);
    return { formula: `SUBTOTAL(9,${L}${firstRow}:${L}${lastRow})`, result: Number(computed ?? 0) };
  }
  if (agg === "count") {
    const L = colLetter(ws, colIndex);
    return { formula: `SUBTOTAL(3,${L}${firstRow}:${L}${lastRow})`, result: Number(computed ?? 0) };
  }
  return computed == null ? null : Number(computed);
}

/** Header block rows 1–6 (+ blank row 7). Returns the next free row. */
function headerBlock(ws: ExcelJS.Worksheet, r: ReportResult): number {
  const h = r.header;
  ws.getCell("A1").value = h.title;
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A2").value = h.description;
  ws.getCell("A3").value = `Company: ${h.company}`;
  ws.getCell("A4").value = `Reporter: ${h.reporter}`;
  ws.getCell("A5").value = `Report date: ${formatDate(h.reportDate)}`;
  ws.getCell("A6").value = `Filters: ${h.filters.join("; ")} · Data as of ${h.dataAsOf ? formatDateTime(h.dataAsOf, h.timeZone) : "not yet synced"}`;
  for (const a of ["A3", "A4", "A5", "A6"]) ws.getCell(a).font = { color: { argb: "FF444444" } };
  return 8;
}

function summaryBlock(ws: ExcelJS.Worksheet, r: ReportResult, start: number): number {
  if (!r.kpis?.length) return start;
  ws.getCell(start, 1).value = "Summary";
  ws.getCell(start, 1).font = { ...BOLD, size: 12 };
  let row = start + 1;
  for (const k of r.kpis) {
    ws.getCell(row, 1).value = k.label;
    const c = ws.getCell(row, 2);
    c.value = k.value;
    const fmt = EXCEL_FORMAT[k.type];
    if (fmt) c.numFmt = fmt;
    c.font = BOLD;
    row += 1;
  }
  return row + 1;
}

function writeHeaderRow(ws: ExcelJS.Worksheet, rowNo: number, headers: string[]) {
  const row = ws.getRow(rowNo);
  headers.forEach((h, i) => (row.getCell(i + 1).value = h));
  row.font = BOLD;
  row.eachCell((c) => (c.fill = HEADER_FILL));
}

/** Grouped main view: one row per record (group labels repeated so filtering works, no merges), a SUBTOTAL row per group, grand total. */
function groupedBlock(ws: ExcelJS.Worksheet, r: ReportResult, start: number) {
  if (r.main.kind !== "grouped") return;
  const m = r.main;
  const labelCols = m.levelLabels.length; // group level label columns
  const valueStart = labelCols + 2; // + leaf column
  const headers = [...m.levelLabels, m.leafColumn.header, ...m.columns.map((c) => c.header)];
  writeHeaderRow(ws, start, headers);
  const firstData = start + 1;
  let rowNo = firstData;

  const writeGroup = (g: GroupNode, path: string[]) => {
    const groupFirst = rowNo;
    if (g.children.length) for (const c of g.children) writeGroup(c, [...path, c.label]);
    else {
      for (const rec of g.rows) {
        const row = ws.getRow(rowNo);
        path.forEach((p, i) => (row.getCell(i + 1).value = p));
        row.getCell(labelCols + 1).value = cellValue(m.leafColumn, rec);
        m.columns.forEach((c, i) => (row.getCell(valueStart + i).value = cellValue(c, rec)));
        row.outlineLevel = path.length;
        rowNo += 1;
      }
    }
    const groupLast = rowNo - 1;
    const sub = ws.getRow(rowNo);
    path.slice(0, -1).forEach((p, i) => (sub.getCell(i + 1).value = p));
    sub.getCell(path.length).value = `${g.label} Subtotal`;
    m.columns.forEach((c, i) => (sub.getCell(valueStart + i).value = totalCell(ws, c, valueStart + i, groupFirst, groupLast, g.subtotal[c.key])));
    sub.font = BOLD;
    sub.eachCell((cell) => (cell.fill = SUBTOTAL_FILL));
    sub.outlineLevel = path.length - 1;
    rowNo += 1;
  };
  for (const g of m.groups) writeGroup(g, [g.label]);

  const lastData = rowNo - 1;
  const gt = ws.getRow(rowNo);
  gt.getCell(1).value = "Grand Total";
  m.columns.forEach((c, i) => (gt.getCell(valueStart + i).value = totalCell(ws, c, valueStart + i, firstData, lastData, m.grandTotal[c.key])));
  gt.font = BOLD;
  gt.eachCell((cell) => (cell.fill = TOTAL_FILL));

  styleColumns(ws, m.columns, valueStart);
  for (let i = 1; i <= labelCols; i++) ws.getColumn(i).width = Math.max(ws.getColumn(i).width ?? 0, 30);
  ws.getColumn(labelCols + 1).width = Math.max(ws.getColumn(labelCols + 1).width ?? 0, m.leafColumn.width ?? 16);
  ws.autoFilter = { from: { row: start, column: 1 }, to: { row: lastData, column: headers.length } };
  ws.views = [{ state: "frozen", ySplit: start }];
  ws.properties.outlineProperties = { summaryBelow: true, summaryRight: false };
}

/** Flat main table (e.g. one row per period) + a bold total row (SUBTOTAL formulas). */
function tableBlock(ws: ExcelJS.Worksheet, r: ReportResult, start: number) {
  if (r.main.kind !== "table") return;
  const t = r.main;
  const cols = [t.labelColumn, ...t.columns];
  writeHeaderRow(ws, start, cols.map((c) => c.header));
  t.rows.forEach((rec, i) => {
    const row = ws.getRow(start + 1 + i);
    cols.forEach((c, j) => (row.getCell(j + 1).value = cellValue(c, rec)));
  });
  const lastData = start + t.rows.length;
  const tr = ws.getRow(lastData + 1);
  tr.getCell(1).value = t.totalLabel;
  t.columns.forEach((c, j) => (tr.getCell(j + 2).value = totalCell(ws, c, j + 2, start + 1, lastData, t.totals[c.key])));
  tr.font = BOLD;
  tr.eachCell((cell) => (cell.fill = TOTAL_FILL));
  styleColumns(ws, t.columns, 2);
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 0, t.labelColumn.width ?? 24);
  ws.autoFilter = { from: { row: start, column: 1 }, to: { row: Math.max(lastData, start), column: cols.length } };
  ws.views = [{ state: "frozen", ySplit: start, xSplit: 1 }];
}

function matrixBlock(ws: ExcelJS.Worksheet, r: ReportResult, start: number) {
  if (r.main.kind !== "matrix") return;
  const m = r.main;
  const headers = [m.rowLabel, ...m.columnKeys.map((c) => c.label), "Total"];
  writeHeaderRow(ws, start, headers);
  const fmt = EXCEL_FORMAT[m.valueType];
  let rowNo = start + 1;
  for (const row of m.rows) {
    const xr = ws.getRow(rowNo);
    xr.getCell(1).value = row.label;
    m.columnKeys.forEach((c, i) => (xr.getCell(i + 2).value = row.cells[c.key])); // null = empty cell
    const first = colLetter(ws, 2);
    const last = colLetter(ws, m.columnKeys.length + 1);
    xr.getCell(m.columnKeys.length + 2).value = { formula: `SUM(${first}${rowNo}:${last}${rowNo})`, result: row.total };
    rowNo += 1;
  }
  const lastData = rowNo - 1;
  const tr = ws.getRow(rowNo);
  tr.getCell(1).value = "Total";
  for (let i = 0; i <= m.columnKeys.length; i++) {
    const L = colLetter(ws, i + 2);
    const result = i < m.columnKeys.length ? m.columnTotals[m.columnKeys[i].key] ?? 0 : m.grandTotal;
    tr.getCell(i + 2).value = lastData >= start + 1 ? { formula: `SUBTOTAL(9,${L}${start + 1}:${L}${lastData})`, result } : 0;
  }
  tr.font = BOLD;
  tr.eachCell((cell) => (cell.fill = TOTAL_FILL));
  ws.getColumn(1).width = 30;
  for (let i = 2; i <= headers.length; i++) {
    ws.getColumn(i).width = 14;
    if (fmt) ws.getColumn(i).numFmt = fmt;
    ws.getColumn(i).alignment = { horizontal: "right" };
  }
  ws.autoFilter = { from: { row: start, column: 1 }, to: { row: Math.max(lastData, start), column: headers.length } };
  ws.views = [{ state: "frozen", ySplit: start, xSplit: 1 }];
}

function detailSheet(wb: ExcelJS.Workbook, d: DetailResult) {
  const ws = wb.addWorksheet(d.sheetName);
  const cols = d.columns;
  writeHeaderRow(ws, 1, cols.map((c) => c.header));
  d.rows.forEach((rec, i) => {
    const row = ws.getRow(i + 2);
    cols.forEach((c, j) => (row.getCell(j + 1).value = cellValue(c, rec)));
  });
  const last = d.rows.length + 1;
  const tr = ws.getRow(last + 1);
  tr.getCell(1).value = "Total";
  cols.forEach((c, j) => {
    if (j === 0 || aggregateOf(c) === "none") return;
    tr.getCell(j + 1).value = totalCell(ws, c, j + 1, 2, last, d.totals[c.key]);
  });
  tr.font = BOLD;
  tr.eachCell((cell) => (cell.fill = TOTAL_FILL));
  styleColumns(ws, cols);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(last, 1), column: cols.length } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function notesSheet(wb: ExcelJS.Workbook, def: ReportDefinition, r: ReportResult) {
  const ws = wb.addWorksheet("Notes");
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 100;
  ws.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  let row = 1;
  const line = (a: string, b = "", bold = false) => {
    ws.getCell(row, 1).value = a;
    ws.getCell(row, 2).value = b;
    if (bold) ws.getRow(row).font = BOLD;
    row += 1;
  };
  line(def.name, "", true);
  line("Report version", r.meta.version);
  line("Generated", `${formatDate(r.header.reportDate)} by ${r.header.reporter}`);
  row += 1;
  line("Column", "Definition", true);
  const shown = new Map<string, ColumnDef>();
  const add = (c: ColumnDef) => shown.set(c.key, c);
  if (r.main.kind === "grouped") { add(r.main.leafColumn); r.main.columns.forEach(add); }
  if (r.main.kind === "table") r.main.columns.forEach(add);
  detailsOf(r).forEach((d) => d.columns.forEach(add));
  for (const c of shown.values()) line(c.header, c.description ?? "");
  for (const k of r.kpis ?? []) line(k.label, k.description);
  row += 1;
  line("Notes", "", true);
  for (const n of r.notes) line("", n);
  if (r.limitations.length) {
    row += 1;
    line("Limitations", "", true);
    for (const l of r.limitations) line("", l.message);
  }
}

/** Build the workbook for a report result. Same ReportResult as the web view, so they always agree. */
export async function buildWorkbook(def: ReportDefinition, r: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MeasureSquare Report Engine";
  wb.created = new Date(`${r.header.reportDate}T12:00:00Z`);
  const ws = wb.addWorksheet("Report");
  ws.getColumn(1).width = 30;
  let next = headerBlock(ws, r);
  next = summaryBlock(ws, r, next);
  if (r.main.kind === "grouped") groupedBlock(ws, r, next);
  else if (r.main.kind === "table") tableBlock(ws, r, next);
  else matrixBlock(ws, r, next);
  for (const d of detailsOf(r)) detailSheet(wb, d);
  notesSheet(wb, def, r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** "{report-id}_{company-short-name}_{YYYY-MM-DD}.xlsx" */
export function workbookFileName(reportId: string, company: string, date: string) {
  const short = company
    .replace(/[,.]/g, " ")
    .replace(/\b(llc|inc|incorporated|ltd|limited|co|corp|corporation|company|l\.?l\.?c)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 30) || "company";
  return `${reportId}_${short}_${date}.xlsx`;
}
