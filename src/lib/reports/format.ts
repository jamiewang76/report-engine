import type { ColumnDef, ColumnType } from "./types";

/** Shown in empty matrix/grouped cells (standard §5: empty cells show "–", not 0). */
export const EMPTY = "–";

// ---------- Money math: integer cents, rounded at every sum (no floating-point drift) ----------

export const toCents = (x: unknown): number => {
  const n = typeof x === "number" ? x : x == null || x === "" ? 0 : Number(x);
  if (!Number.isFinite(n)) return 0;
  // Scale by decimal shift, not n * 100: 1.005 * 100 = 100.49999… would round down a cent.
  const s = String(Math.abs(n));
  const c = s.includes("e") ? Math.round(Math.abs(n) * 100) : Math.round(Number(`${s}e2`));
  return n < 0 ? -c : c;
};
export const fromCents = (c: number) => c / 100;
export const roundMoney = (x: unknown) => fromCents(toCents(x));
export const addMoney = (...xs: unknown[]) => fromCents(xs.reduce<number>((s, x) => s + toCents(x), 0));
export const subMoney = (a: unknown, ...bs: unknown[]) => fromCents(bs.reduce<number>((s, b) => s - toCents(b), toCents(a)));
export const sumMoney = (xs: unknown[]) => addMoney(...xs);

/** Weighted average for percent totals: Σ numerator / Σ denominator. Null when the denominator is 0. */
export function weightedAverage(rows: { numerator: unknown; denominator: unknown }[]): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += Number(r.numerator) || 0;
    den += Number(r.denominator) || 0;
  }
  return den === 0 ? null : num / den;
}

// ---------- Dates ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date "YYYY-MM-DD" from a stored value (date string or timestamp). Stored CRM dates are calendar dates. */
export function isoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  if (DATE_RE.test(s.slice(0, 10))) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Today (or any instant) as the org's local calendar date. */
export function dateInTimeZone(instant: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Whole days from `from` to `to` (calendar dates). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** "Nov 25, 2026" for a calendar date (no time-zone shifting). */
export function formatDate(v: unknown): string {
  const d = isoDate(v);
  if (!d) return "";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/** "Nov 25, 2026, 9:17 AM" for a timestamp, in the org's time zone. */
export const formatDateTime = (iso: string | null | undefined, timeZone: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

/** Excel needs a real date: UTC midnight of the calendar date. */
export const excelDate = (v: unknown) => {
  const d = isoDate(v);
  return d ? new Date(`${d}T00:00:00Z`) : null;
};

// ---------- Web formatting per column type ----------

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Formatted = { text: string; negative: boolean; empty: boolean };

export function formatValue(type: ColumnType, v: unknown, opts: { decimals?: number; emptyText?: string } = {}): Formatted {
  const empty = v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
  const emptyText = opts.emptyText ?? "";
  if (empty) return { text: emptyText, negative: false, empty: true };
  switch (type) {
    case "money": {
      const n = Number(v);
      return { text: n < 0 ? `-${usd.format(-n)}` : usd.format(n), negative: n < 0, empty: false };
    }
    case "number": {
      const n = Number(v);
      const d = opts.decimals ?? 0;
      return { text: n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }), negative: n < 0, empty: false };
    }
    case "percent": {
      const n = Number(v);
      return { text: `${(n * 100).toFixed(opts.decimals ?? 1)}%`, negative: n < 0, empty: false };
    }
    case "days": {
      const n = Math.round(Number(v));
      return { text: n.toLocaleString("en-US"), negative: n < 0, empty: false };
    }
    case "date":
      return { text: formatDate(v), negative: false, empty: false };
    default:
      return { text: String(v), negative: false, empty: false };
  }
}

export const formatCell = (col: ColumnDef, v: unknown, emptyText?: string) => formatValue(col.type, v, { decimals: col.decimals, emptyText });

export const isNumericType = (t: ColumnType) => t === "money" || t === "number" || t === "percent" || t === "days";
export const alignOf = (c: ColumnDef) => c.align ?? (isNumericType(c.type) ? "right" : "left");
export const aggregateOf = (c: ColumnDef) => c.aggregate ?? (c.type === "money" || c.type === "number" ? "sum" : c.type === "percent" && c.weightedBy ? "avg" : "none");

/** Excel number format for a column: the type default, with the column decimals when set (number, percent). */
export function excelFormatOf(c: Pick<ColumnDef, "type" | "decimals">): string | undefined {
  if (c.decimals && c.type === "number") return `#,##0.${"0".repeat(c.decimals)}`;
  if (c.decimals && c.type === "percent") return `0.${"0".repeat(c.decimals)}%`;
  return EXCEL_FORMAT[c.type];
}

// ---------- Excel number formats per column type (standard §3) ----------

export const EXCEL_FORMAT: Partial<Record<ColumnType, string>> = {
  money: '"$"#,##0.00;[Red]-"$"#,##0.00',
  number: "#,##0",
  percent: "0.0%",
  date: "mmm d, yyyy",
  days: "0",
};
