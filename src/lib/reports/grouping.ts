import { aggregateOf, sumMoney, weightedAverage } from "./format";
import type { ColumnDef, GroupNode, MatrixResult, Row } from "./types";

/**
 * Totals for a set of rows (a column with no values totals to null, shown as "–"): money sums in cents, numbers sum, percents are weighted averages
 * (Σ numerator / Σ denominator), count/min/max as declared. Columns with aggregate "none" are omitted.
 */
export function aggregate(rows: Row[], columns: ColumnDef[]): Row {
  const out: Row = {};
  for (const c of columns) {
    const agg = aggregateOf(c);
    const vals = rows.map((r) => r[c.key]).filter((v) => v != null && v !== "" && Number.isFinite(Number(v))).map(Number);
    switch (agg) {
      case "sum": // nothing to sum = empty ("–"), not 0
        out[c.key] = !vals.length ? null : c.type === "money" ? sumMoney(vals) : vals.reduce((a, b) => a + b, 0);
        break;
      case "avg":
        if (c.type === "percent") {
          if (!c.weightedBy) throw new Error(`Percent column ${c.key} needs weightedBy for totals`);
          const { numerator, denominator } = c.weightedBy;
          out[c.key] = weightedAverage(rows.map((r) => ({ numerator: r[numerator], denominator: r[denominator] })));
        } else out[c.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        break;
      case "count":
        out[c.key] = rows.length;
        break;
      case "min":
        out[c.key] = vals.length ? Math.min(...vals) : null;
        break;
      case "max":
        out[c.key] = vals.length ? Math.max(...vals) : null;
        break;
    }
  }
  return out;
}

export type SortSpec = { key: string; dir: "asc" | "desc" };

/** Stable sort; nulls last regardless of direction; numbers numerically, text case-insensitively. */
export function sortRows<T extends Row>(rows: T[], sort: SortSpec | null | undefined): T[] {
  if (!sort) return [...rows];
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = a.r[sort.key];
      const y = b.r[sort.key];
      const xe = x == null || x === "";
      const ye = y == null || y === "";
      if (xe || ye) return xe && ye ? a.i - b.i : xe ? 1 : -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { sensitivity: "base", numeric: true });
      return cmp === 0 ? a.i - b.i : sign * cmp;
    })
    .map((x) => x.r);
}

export type LevelKey = (r: Row) => { key: string; label: string; href?: string | null };

/**
 * Group record rows by up to two levels, with a subtotal per group (aggregate()), a grand total, groups sorted by
 * `groupSort` (on their subtotals; label asc as tie-break) and record rows sorted by `rowSort`.
 */
export function groupRows(
  rows: Row[],
  levels: LevelKey[],
  columns: ColumnDef[],
  opts: { groupSort?: SortSpec; rowSort?: SortSpec } = {},
): { groups: GroupNode[]; grandTotal: Row } {
  if (levels.length < 1 || levels.length > 2) throw new Error("Grouping supports 1 or 2 levels");
  const build = (subset: Row[], level: number): GroupNode[] => {
    const by = new Map<string, { label: string; href?: string | null; rows: Row[] }>();
    for (const r of subset) {
      const k = levels[level](r);
      const g = by.get(k.key) ?? { label: k.label, href: k.href, rows: [] };
      g.rows.push(r);
      by.set(k.key, g);
    }
    const nodes: GroupNode[] = [...by.entries()].map(([key, g]) => {
      const deeper = level + 1 < levels.length;
      return {
        key, label: g.label, level, href: g.href ?? null,
        subtotal: aggregate(g.rows, columns),
        count: g.rows.length,
        children: deeper ? build(g.rows, level + 1) : [],
        rows: deeper ? [] : sortRows(g.rows, opts.rowSort),
      };
    });
    const byLabel = [...nodes].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true }));
    if (!opts.groupSort) return byLabel;
    return sortRows(byLabel.map((n) => ({ ...n.subtotal, __node: n })), opts.groupSort).map((x) => x.__node as GroupNode);
  };
  return { groups: build(rows, 0), grandTotal: aggregate(rows, columns) };
}

/** Every record row under a group node (any depth). */
export const leafRows = (g: GroupNode): Row[] => (g.children.length ? g.children.flatMap(leafRows) : g.rows);

/**
 * Rows × columns matrix (e.g. pipeline × month). Cells with no records are null (shown as "–"), row totals on the
 * right, column totals at the bottom, money summed in cents. `columnOrder` fixes column order (e.g. calendar months).
 */
export function buildMatrix<T>(
  records: T[],
  spec: {
    row: (r: T) => { key: string; label: string };
    column: (r: T) => string;
    value: (r: T) => number;
    columnOrder: { key: string; label: string }[];
    money?: boolean;
    rowLabel: string;
    valueType?: MatrixResult["valueType"];
  },
): MatrixResult {
  const sum = (xs: number[]) => (spec.money ? sumMoney(xs) : xs.reduce((a, b) => a + b, 0));
  const cells = new Map<string, { label: string; values: Map<string, number[]> }>();
  for (const r of records) {
    const row = spec.row(r);
    const col = spec.column(r);
    if (!spec.columnOrder.some((c) => c.key === col)) continue;
    const entry = cells.get(row.key) ?? { label: row.label, values: new Map() };
    entry.values.set(col, [...(entry.values.get(col) ?? []), spec.value(r)]);
    cells.set(row.key, entry);
  }
  const rows = [...cells.entries()]
    .map(([key, e]) => {
      const c: Record<string, number | null> = {};
      for (const col of spec.columnOrder) c[col.key] = e.values.has(col.key) ? sum(e.values.get(col.key)!) : null;
      return { key, label: e.label, cells: c, total: sum(Object.values(c).filter((v): v is number => v != null)) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true }));
  const columnTotals: Record<string, number | null> = {};
  for (const col of spec.columnOrder) {
    const vals = rows.map((r) => r.cells[col.key]).filter((v): v is number => v != null);
    columnTotals[col.key] = vals.length ? sum(vals) : null;
  }
  return {
    kind: "matrix", rowLabel: spec.rowLabel, valueType: spec.valueType ?? (spec.money ? "money" : "number"),
    columnKeys: spec.columnOrder, rows, columnTotals, grandTotal: sum(rows.map((r) => r.total)),
  };
}

/** Calendar months from..to inclusive, as matrix columns ("2026-01" / "Jan 2026"). */
export function monthColumns(from: string, to: string): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key, label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" }) });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Re-sort groups (each level) by a subtotal column, e.g. when the customer clicks a column header. */
export function resortGroups(groups: GroupNode[], sort: SortSpec): GroupNode[] {
  const sorted = sortRows(groups.map((g) => ({ ...g.subtotal, __node: g })), sort).map((x) => x.__node as GroupNode);
  return sorted.map((g) => ({ ...g, children: g.children.length ? resortGroups(g.children, sort) : g.children }));
}
