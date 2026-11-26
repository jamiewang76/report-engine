import { formatDate } from "./format";
import type { DatePreset, FilterDef, FilterOption, ResolvedFilters } from "./types";

/**
 * Shared filters (standard §4). Filters live only in the URL query string:
 *   asOf=YYYY-MM-DD · <key>=<preset>&<key>From=YYYY-MM-DD&<key>To=YYYY-MM-DD · <key>=a&<key>=b (multi-select)
 *   year=2026 · <choice>=<option> · <window>=YYYY-MM-DD_YYYY-MM-DD (drill-down)
 * Fiscal years are named by the calendar year they END in (fiscalYearStartMonth = 7: FY2026 = Jul 2025 – Jun 2026).
 */

/** Context some filters need (from the org's report config). */
export type FilterContext = { fiscalYearStartMonth?: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fiscal year containing a date. */
export function fiscalYearOf(date: string, startMonth = 1): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return startMonth === 1 || m < startMonth ? y : y + 1;
}

/** Inclusive date range of a fiscal year. */
export function fiscalYearRange(fy: number, startMonth = 1): { from: string; to: string } {
  const startYear = startMonth === 1 ? fy : fy - 1;
  return { from: ymd(startYear, startMonth, 1), to: ymd(startYear + 1, startMonth, 0) };
}

export function fiscalYearLabel(fy: number, startMonth = 1): string {
  if (startMonth === 1) return String(fy);
  const r = fiscalYearRange(fy, startMonth);
  return `FY${fy} (${MONTHS[Number(r.from.slice(5, 7)) - 1]} ${r.from.slice(0, 4)} – ${MONTHS[Number(r.to.slice(5, 7)) - 1]} ${r.to.slice(0, 4)})`;
}

const WINDOW_RE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;
export const windowParam = (from: string, to: string) => `${from}_${to}`;

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "last_quarter", label: "Last quarter" },
  { id: "ytd", label: "Year to date" },
  { id: "last_year", label: "Last year" },
  { id: "custom", label: "Custom" },
];

export class FilterError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string | null | undefined): s is string => !!s && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** Resolve a preset to an inclusive from/to range relative to `today` (org local date). */
export function resolvePreset(preset: Exclude<DatePreset, "custom">, today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const q = Math.floor((m - 1) / 3); // 0..3
  switch (preset) {
    case "this_month": return { from: ymd(y, m, 1), to: ymd(y, m + 1, 0) };
    case "last_month": return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
    case "this_quarter": return { from: ymd(y, q * 3 + 1, 1), to: ymd(y, q * 3 + 4, 0) };
    case "last_quarter": return { from: ymd(y, q * 3 - 2, 1), to: ymd(y, q * 3 + 1, 0) };
    case "ytd": return { from: ymd(y, 1, 1), to: today };
    case "last_year": return { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) };
  }
}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const getAll = (p: Params, k: string): string[] => {
  if (p instanceof URLSearchParams) return p.getAll(k);
  const v = p[k];
  return v == null ? [] : Array.isArray(v) ? v : [v];
};
const get = (p: Params, k: string) => getAll(p, k)[0] ?? null;

/** Parse + validate filters from the query string. Defaults: as-of today, each range its default preset, multi = all. */
export function parseFilters(defs: FilterDef[], params: Params, today: string, ctx: FilterContext = {}): ResolvedFilters {
  const out: ResolvedFilters = { asOf: null, ranges: {}, multi: {}, choice: {}, windows: {} };
  for (const f of defs) {
    if (f.kind === "asOf") {
      const v = get(params, f.key);
      if (v && !validDate(v)) throw new FilterError(`${f.label} must be a date (YYYY-MM-DD)`);
      out.asOf = v || today;
    } else if (f.kind === "dateRange") {
      const preset = (get(params, f.key) as DatePreset | null) ?? f.defaultPreset;
      if (!DATE_PRESETS.some((p) => p.id === preset)) throw new FilterError(`Unknown date range for ${f.label}`);
      if (preset === "custom") {
        const from = get(params, `${f.key}From`);
        const to = get(params, `${f.key}To`);
        if (!validDate(from) || !validDate(to) || from > to) throw new FilterError(`${f.label}: choose a valid from/to date`);
        out.ranges[f.key] = { preset, from, to };
      } else out.ranges[f.key] = { preset, ...resolvePreset(preset, today) };
    } else if (f.kind === "year") {
      const v = get(params, f.key);
      if (v && !/^\d{4}$/.test(v)) throw new FilterError(`${f.label} must be a year`);
      out.choice[f.key] = v || String(fiscalYearOf(today, ctx.fiscalYearStartMonth));
    } else if (f.kind === "choice") {
      const v = get(params, f.key);
      if (v && !f.options.some((o) => o.value === v)) throw new FilterError(`Unknown ${f.label.toLowerCase()}`);
      out.choice[f.key] = v || f.default;
    } else if (f.kind === "window") {
      const v = get(params, f.key);
      const m = v ? WINDOW_RE.exec(v) : null;
      if (v && (!m || !validDate(m[1]) || !validDate(m[2]) || m[1] > m[2])) throw new FilterError(`${f.label}: invalid period`);
      out.windows[f.key] = m ? { from: m[1], to: m[2] } : null;
    } else {
      out.multi[f.key] = [...new Set(getAll(params, f.key).filter(Boolean))];
    }
  }
  return out;
}

/** Back to a query string (for links: sort, grouping, clear one filter...). */
export function filtersToQuery(defs: FilterDef[], r: ResolvedFilters, today: string, ctx: FilterContext = {}): URLSearchParams {
  const q = new URLSearchParams();
  for (const f of defs) {
    if (f.kind === "asOf" && r.asOf && r.asOf !== today) q.set(f.key, r.asOf);
    if (f.kind === "dateRange") {
      const v = r.ranges[f.key];
      if (!v || v.preset === f.defaultPreset) continue;
      q.set(f.key, v.preset);
      if (v.preset === "custom") { q.set(`${f.key}From`, v.from); q.set(`${f.key}To`, v.to); }
    }
    if (f.kind === "multi") for (const v of r.multi[f.key] ?? []) q.append(f.key, v);
    if (f.kind === "year" && r.choice[f.key] && r.choice[f.key] !== String(fiscalYearOf(today, ctx.fiscalYearStartMonth))) q.set(f.key, r.choice[f.key]);
    if (f.kind === "choice" && r.choice[f.key] && r.choice[f.key] !== f.default) q.set(f.key, r.choice[f.key]);
    if (f.kind === "window" && r.windows[f.key]) q.set(f.key, windowParam(r.windows[f.key]!.from, r.windows[f.key]!.to));
  }
  return q;
}

export const hasActiveFilters = (defs: FilterDef[], r: ResolvedFilters, today: string, ctx: FilterContext = {}) => [...filtersToQuery(defs, r, today, ctx).keys()].length > 0;

/** Human-readable active filters for the header, Excel row 6 and the event log. */
export function describeFilters(defs: FilterDef[], r: ResolvedFilters, options: Record<string, FilterOption[]> = {}, ctx: FilterContext = {}): string[] {
  const out: string[] = [];
  for (const f of defs) {
    if (f.kind === "asOf") out.push(`${f.label} ${formatDate(r.asOf)}`);
    else if (f.kind === "dateRange") {
      const v = r.ranges[f.key];
      const preset = DATE_PRESETS.find((p) => p.id === v.preset)!.label;
      out.push(`${f.label}: ${v.preset === "custom" ? "" : `${preset}, `}${formatDate(v.from)} – ${formatDate(v.to)}`);
    } else if (f.kind === "year") {
      out.push(`${f.label}: ${fiscalYearLabel(Number(r.choice[f.key]), ctx.fiscalYearStartMonth)}`);
    } else if (f.kind === "choice") {
      out.push(`${f.label}: ${f.options.find((o) => o.value === r.choice[f.key])?.label ?? r.choice[f.key]}`);
    } else if (f.kind === "window") {
      const w = r.windows[f.key];
      if (w) out.push(`${f.label}: ${formatDate(w.from)} – ${formatDate(w.to)}`);
    } else {
      const sel = r.multi[f.key] ?? [];
      if (!sel.length) { out.push(f.allLabel); continue; }
      const labels = sel.map((v) => options[f.key]?.find((o) => o.value === v)?.label ?? v);
      out.push(`${f.label}: ${labels.length > 3 ? `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more` : labels.join(", ")}`);
    }
  }
  return out;
}

/** True if the row passes a multi-select (empty selection = all). */
export const passesMulti = (selected: string[] | undefined, value: string | null | undefined) =>
  !selected?.length || (value != null && selected.includes(value));

/** Distinct, sorted options from rows. */
export function optionsFrom<T>(rows: T[], pick: (r: T) => { value: string; label: string } | null): FilterOption[] {
  const m = new Map<string, string>();
  for (const r of rows) {
    const o = pick(r);
    if (o && o.value) m.set(o.value, o.label || o.value);
  }
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true }));
}
