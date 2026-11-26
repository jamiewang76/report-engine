import type { ConfigSchema } from "./schema";

/**
 * Shared report types. See docs/report-standard.md (§2 definition, §3 columns, §4 filters, §5 grouping/totals).
 * A report = a ReportDefinition (metadata) + load() (cache reads) + build() (pure calculation).
 */

export type ReportStatus = "draft" | "live" | "retired";
export type ColumnType = "money" | "number" | "percent" | "date" | "days" | "text" | "flag" | "link";
export type Aggregate = "sum" | "avg" | "count" | "min" | "max" | "none";
export type Tone = "red" | "amber" | "green" | "gray" | "blue";

/** A record-level or aggregated row. Dates are calendar dates "YYYY-MM-DD"; percents are fractions (0.235). */
export type Row = Record<string, unknown>;

export type ColumnDef = {
  key: string;
  header: string;
  type: ColumnType;
  align?: "left" | "right" | "center"; // default: right for numeric types, left otherwise
  /** Default: "sum" for money and number columns, "none" for everything else. */
  aggregate?: Aggregate;
  /** Percent totals: Σ numerator / Σ denominator (weighted), never a sum or simple average. */
  weightedBy?: { numerator: string; denominator: string };
  description?: string; // tooltip + Notes sheet
  width?: number; // Excel column width (characters)
  decimals?: number; // number columns
  flags?: { value: string; tone: Tone }[]; // flag columns: fixed value list
  hrefKey?: string; // link columns: row[hrefKey] is the URL (opens the CRM in a new tab)
};

export type DatePreset = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "ytd" | "last_year" | "custom";

export type FilterDef =
  | { key: string; label: string; kind: "asOf" }
  | { key: string; label: string; kind: "dateRange"; dateField: string; defaultPreset: DatePreset }
  | { key: string; label: string; kind: "multi"; searchable?: boolean; allLabel: string }
  /** Fiscal/calendar year; default = the year containing today. Options come from filterOptions(data)[key]. */
  | { key: string; label: string; kind: "year" }
  /** One of a fixed list (e.g. Period: Month | Quarter). */
  | { key: string; label: string; kind: "choice"; options: FilterOption[]; default: string }
  /** Drill-down date window set by clicking a row (not shown in the filter bar): "<from>_<to>" (YYYY-MM-DD). */
  | { key: string; label: string; kind: "window" };

export type FilterOption = { value: string; label: string };

/** Filters resolved from the URL query string (the only place filters live). */
export type ResolvedFilters = {
  asOf: string | null; // YYYY-MM-DD
  ranges: Record<string, { preset: DatePreset; from: string; to: string }>;
  multi: Record<string, string[]>;
  /** year (as "2026") and choice filters */
  choice: Record<string, string>;
  /** window filters: null = not set */
  windows: Record<string, { from: string; to: string } | null>;
};

export type GroupingOption = {
  id: string;
  label: string;
  default?: boolean;
  /** 1–2 grouping levels above the record rows (standard §5: at most two levels incl. e.g. Customer → Invoice). */
  levels: { key: string; label: string }[];
};

export type KpiDef = { key: string; label: string; type: ColumnType; description: string };
export type KpiValue = KpiDef & { value: number | null };

export type Limitation = { id: string; message: string };
export type Override = { section: string; reason: string };

export type GroupedViewSpec = {
  kind: "grouped";
  /** Label column for record rows inside a group (e.g. the invoice number). */
  leafKey: string;
  /** Columns shown on group/subtotal rows and record rows (aggregated per group). */
  columns: string[];
  defaultSort: { key: string; dir: "asc" | "desc" };
};
export type MatrixViewSpec = {
  kind: "matrix";
  rowLabel: string;
  valueType: ColumnType;
  defaultSort?: { key: string; dir: "asc" | "desc" };
};

/** Main view as a flat table (e.g. one row per period) with a bold total row. */
export type TableViewSpec = {
  kind: "table";
  labelKey: string; // first column (e.g. "period")
  columns: string[];
  totalLabel: string; // "Year Total"
};

/** A detail table (one row per record). A report may have several (standard §1 allows one; override to add more). */
export type DetailSpec = {
  id: string; // URL tab id
  title: string; // tab label
  sheetName: string; // Excel sheet
  columns: string[];
  defaultSort: { key: string; dir: "asc" | "desc" };
  rowNoun: { one: string; many: string };
};

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  status: ReportStatus;
  version: string;
  requestedBy: string[]; // internal only
  dataSources: { tables: string[]; endpoints?: string[] };
  columns: ColumnDef[];
  filters: FilterDef[];
  views: {
    main: GroupedViewSpec | MatrixViewSpec | TableViewSpec;
    detail?: { columns: string[]; defaultSort: { key: string; dir: "asc" | "desc" } };
    /** Several detail tables instead of one (used instead of `detail`). */
    details?: DetailSpec[];
  };
  kpis?: KpiDef[];
  groupings: GroupingOption[];
  configSchema: ConfigSchema;
  notes: string[];
  limitations: Limitation[];
  overrides: Override[];
  rowNoun: { one: string; many: string }; // "invoice" / "invoices"
  /** Always-on line for the header filters (e.g. which date each table uses). */
  headerNote?: string;
};

// ---------- Results ----------

export type GroupNode = {
  key: string;
  label: string;
  level: number; // 0 = top
  href?: string | null;
  subtotal: Row;
  count: number; // record rows inside
  children: GroupNode[]; // next grouping level (if any)
  rows: Row[]; // record rows (only on the deepest group level)
};

export type GroupedResult = {
  kind: "grouped";
  levelLabels: string[]; // e.g. ["Customer/GC"]
  leafColumn: ColumnDef;
  columns: ColumnDef[];
  groups: GroupNode[];
  grandTotal: Row;
};

export type MatrixResult = {
  kind: "matrix";
  rowLabel: string;
  valueType: ColumnType;
  columnKeys: { key: string; label: string }[];
  rows: { key: string; label: string; cells: Record<string, number | null>; total: number }[];
  columnTotals: Record<string, number | null>;
  grandTotal: number;
};

export type TableResult = {
  kind: "table";
  labelColumn: ColumnDef;
  columns: ColumnDef[];
  rows: Row[]; // each may carry `_window` ("from_to") to drill into the details for that row
  totals: Row;
  totalLabel: string;
  /** Window filter key + detail tab that a row click sets/opens. */
  drill?: { filterKey: string; tab: string };
};

export type DetailResult = { id: string; title: string; sheetName: string; rowNoun: { one: string; many: string }; columns: ColumnDef[]; rows: Row[]; totals: Row };

export type ReportBody = {
  kpis?: KpiValue[];
  main: GroupedResult | MatrixResult | TableResult;
  detail?: { columns: ColumnDef[]; rows: Row[]; totals: Row };
  /** Several detail tables (see DetailSpec). */
  details?: DetailResult[];
  totals: Row;
  notes: string[];
  limitations: Limitation[];
  rowCount: number;
  meta: { version: string; grouping: string; params: Record<string, unknown> };
};

export type ReportHeader = {
  title: string;
  description: string;
  company: string;
  reporter: string;
  reportDate: string; // YYYY-MM-DD, org local date
  filters: string[]; // human-readable active filters
  dataAsOf: string | null; // ISO timestamp of last successful sync
  syncWarning: string | null; // last sync failed / older than 36h
  timeZone: string;
};

export type ReportResult = ReportBody & { header: ReportHeader };

export type BuildInput<D, C = Record<string, unknown>> = {
  data: D;
  filters: ResolvedFilters;
  config: C;
  asOf: string; // YYYY-MM-DD; build() never reads the clock
  grouping: GroupingOption;
  /** Org time zone (IANA), for bucketing timestamps into local calendar dates. */
  timeZone: string;
};

/** A registered report: definition + (for built reports) data loader, option lister and pure build. */
export type ReportModule<D = unknown> = ReportDefinition & {
  load?: (orgId: string, filters: ResolvedFilters) => Promise<D>;
  filterOptions?: (data: D, config: Record<string, unknown>) => Record<string, FilterOption[]>;
  build?: (input: BuildInput<D>) => ReportBody;
};

/** All detail tables of a result, whether the report uses `detail` (one) or `details` (several). */
export function detailsOf(r: Pick<ReportBody, "detail" | "details">, rowNoun?: { one: string; many: string }): DetailResult[] {
  if (r.details) return r.details;
  return r.detail ? [{ id: "detail", title: "Detail", sheetName: "Detail", rowNoun: rowNoun ?? { one: "row", many: "rows" }, ...r.detail }] : [];
}

/** Detail specs of a definition, same normalization as detailsOf. */
export function detailSpecsOf(def: ReportDefinition): DetailSpec[] {
  if (def.views.details) return def.views.details;
  return def.views.detail ? [{ id: "detail", title: "Detail", sheetName: "Detail", rowNoun: def.rowNoun, ...def.views.detail }] : [];
}
