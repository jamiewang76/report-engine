import ExcelJS from "exceljs";

export type Column<T> = { header: string; value: (r: T) => string | number | Date | null; money?: boolean; width?: number };

/** Builds an .xlsx with real numbers (not text), money formatting, totals row, and autofilter. */
export async function toXlsx<T>(title: string, sheets: { name: string; rows: T[]; columns: Column<T>[]; totals?: boolean }[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MeasureSquare Report Engine";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([]);
    const header = ws.addRow(s.columns.map((c) => c.header));
    header.font = { bold: true };
    s.columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 2)));
    for (const r of s.rows) ws.addRow(s.columns.map((c) => c.value(r)));
    const first = header.number + 1;
    const last = ws.rowCount;
    if (s.totals && s.rows.length) {
      const t = ws.addRow(
        s.columns.map((c, i) => {
          if (i === 0) return "Total";
          if (!c.money) return null;
          const col = ws.getColumn(i + 1).letter;
          return { formula: `SUBTOTAL(9,${col}${first}:${col}${last})` };
        }),
      );
      t.font = { bold: true };
    }
    s.columns.forEach((c, i) => {
      if (c.money) ws.getColumn(i + 1).numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    });
    ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: last, column: s.columns.length } };
    ws.views = [{ state: "frozen", ySplit: header.number }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
