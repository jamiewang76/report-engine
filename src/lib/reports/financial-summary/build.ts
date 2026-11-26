import { dateInTimeZone, isoDate, sumMoney } from "../format";
import { fiscalYearOf, fiscalYearRange, optionsFrom, passesMulti, windowParam } from "../filters";
import { aggregate, sortRows } from "../grouping";
import { invoiceUrl, jobUrl, purchaseOrderUrl, workOrderUrl } from "../crmLinks";
import type { BuildInput, ColumnDef, DetailResult, FilterOption, KpiValue, ReportBody, Row } from "../types";
import { COLUMNS, COMMITTED_COLUMNS, definition, type DepositHandling } from "./definition";
import { classifyStatus, type RecordKind } from "./statuses";

/** One cached invoice, joined to its job (pipeline, owner, names). Shape returned by data.ts. */
export type FsInvoice = {
  org_id: string;
  id: string;
  deal_id: string | null;
  number: string | null;
  status: string | null;
  invoice_date: string | null; // CRM calendar date (stored as midnight UTC)
  account_name: string | null;
  deal_name: string | null;
  job_number: string | null;
  pipeline_name: string | null;
  owner_name: string | null;
  amount: number | null;
  pre_tax_total: number | null;
  tax_amount: number | null;
  credit_applied: number | null;
  is_deposit: boolean | null;
  deposit_invoiced_amount: number | null;
  tax_name: string | null;
  tax_rate: number | null; // CRM percent units (8.25 = 8.25%)
};

/** One cached PO or WO, joined to its job. */
export type FsOrder = {
  org_id: string;
  id: string;
  kind: "po" | "wo";
  number: string | null;
  status: string | null;
  vendor: string | null; // PO vendor / WO contractor or installer
  deal_id: string | null;
  deal_name: string | null;
  job_number: string | null;
  account_name: string | null;
  pipeline_name: string | null;
  owner_name: string | null;
  /** PO: orderDateTime (an instant). WO: orderDate (a calendar date). */
  order_date: string | null;
  /** WO only: start date-time (an instant), used when there's no order date. */
  start_date_time: string | null;
  pre_tax_total: number | null;
};

export type FsData = { orgId: string; invoices: FsInvoice[]; orders: FsOrder[] };
export type FsConfig = { fiscalYearStartMonth?: number; depositHandling?: DepositHandling; showCommittedCost?: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NO_CUSTOMER = "(No customer)";

/** Calendar date of a stored CRM date (no time-zone shift). */
const calendarDate = (v: string | null) => isoDate(v);
/** Org-local calendar date of a stored instant (timestamps with a time of day). */
const localDate = (v: string | null, timeZone: string) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? isoDate(v) : dateInTimeZone(d, timeZone);
};

/** Order date basis: PO orderDateTime (local); WO orderDate (calendar), else WO start date-time (local). */
export function orderDateOf(o: FsOrder, timeZone: string): string | null {
  if (o.kind === "po") return localDate(o.order_date, timeZone);
  return calendarDate(o.order_date) ?? localDate(o.start_date_time, timeZone);
}

export type Period = { key: string; label: string; from: string; to: string };

const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** The 12 months or 4 quarters of a fiscal year, in fiscal order. */
export function periodsOf(fy: number, startMonth: number, kind: "month" | "quarter"): Period[] {
  const { from } = fiscalYearRange(fy, startMonth);
  const y0 = Number(from.slice(0, 4));
  const month = (i: number) => ({ y: y0 + Math.floor((startMonth - 1 + i) / 12), m: ((startMonth - 1 + i) % 12) + 1 });
  if (kind === "month") {
    return Array.from({ length: 12 }, (_, i) => {
      const { y, m } = month(i);
      return { key: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${y}`, from: ymd(y, m, 1), to: ymd(y, m + 1, 0) };
    });
  }
  return Array.from({ length: 4 }, (_, q) => {
    const a = month(q * 3);
    const b = month(q * 3 + 2);
    const span = a.y === b.y ? `${MONTHS[a.m - 1]}–${MONTHS[b.m - 1]} ${b.y}` : `${MONTHS[a.m - 1]} ${a.y}–${MONTHS[b.m - 1]} ${b.y}`;
    return { key: `Q${q + 1}`, label: `Q${q + 1} (${span})`, from: ymd(a.y, a.m, 1), to: ymd(b.y, b.m + 1, 0) };
  });
}

const col = (key: string): ColumnDef => {
  const c = COLUMNS.find((x) => x.key === key);
  if (!c) throw new Error(`financial-summary: unknown column ${key}`);
  return c;
};

const customerOf = (x: { account_name: string | null }) => x.account_name || NO_CUSTOMER;

export function filterOptions(data: FsData, config: Record<string, unknown> = {}): Record<string, FilterOption[]> {
  const inv = data.invoices.filter((i) => i.org_id === data.orgId);
  const ord = data.orders.filter((o) => o.org_id === data.orgId);
  const start = Number(config.fiscalYearStartMonth) || 1;
  const all = [...inv, ...ord];
  const years = new Set<string>();
  for (const i of inv) { const d = calendarDate(i.invoice_date); if (d) years.add(String(fiscalYearOf(d, start))); }
  for (const o of ord) { const d = orderDateOf(o, "UTC"); if (d) years.add(String(fiscalYearOf(d, start))); }
  return {
    year: [...years].sort().reverse().map((y) => ({ value: y, label: y })),
    customer: optionsFrom(all, (x) => ({ value: customerOf(x), label: customerOf(x) })),
    pipeline: optionsFrom(all, (x) => (x.pipeline_name ? { value: x.pipeline_name, label: x.pipeline_name } : null)),
    owner: optionsFrom(all, (x) => (x.owner_name ? { value: x.owner_name, label: x.owner_name } : null)),
  };
}

/** CRM tax rate (percent units, 8.25) -> fraction for percent columns (0.0825). */
const taxFraction = (r: number | null) => (r == null || !Number.isFinite(Number(r)) ? null : Number(r) / 100);

const inWindow = (d: string | null, w: { from: string; to: string } | null) => !w || (!!d && d >= w.from && d <= w.to);

/** Pure: (data, filters, config, asOf, grouping, timeZone) -> ReportBody. No I/O, no clock. */
export function build({ data, filters, config, timeZone }: BuildInput<FsData, FsConfig>): ReportBody {
  const cfg = {
    fiscalYearStartMonth: config.fiscalYearStartMonth ?? 1,
    depositHandling: config.depositHandling ?? "count_when_invoiced",
    showCommittedCost: config.showCommittedCost ?? true,
  };
  const fy = Number(filters.choice.year);
  const periodKind = filters.choice.period === "quarter" ? "quarter" : "month";
  const periods = periodsOf(fy, cfg.fiscalYearStartMonth, periodKind);
  const year = fiscalYearRange(fy, cfg.fiscalYearStartMonth);
  const periodOf = (d: string | null) => (d ? periods.find((p) => d >= p.from && d <= p.to) ?? null : null);
  const m = filters.multi;
  const passes = (x: { account_name: string | null; pipeline_name: string | null; owner_name: string | null }) =>
    passesMulti(m.customer, customerOf(x)) && passesMulti(m.pipeline, x.pipeline_name) && passesMulti(m.owner, x.owner_name);

  // Statuses not in the mapping: not counted, but reported (Notes + event log) so they get mapped, not silently lost.
  const unknown: Record<RecordKind, Map<string, number>> = { invoice: new Map(), po: new Map(), wo: new Map() };
  const counted = (kind: RecordKind, status: string | null) => {
    const c = classifyStatus(kind, status);
    if (c === "unknown") unknown[kind].set(status ?? "", (unknown[kind].get(status ?? "") ?? 0) + 1);
    return c === "counted";
  };

  // ---- Invoices in the selected year ----
  const invoiceRows: Row[] = [];
  for (const i of data.invoices) {
    if (i.org_id !== data.orgId) continue; // belt and braces: data.ts already reads only this org via forOrg()
    const date = calendarDate(i.invoice_date);
    if (!date || date < year.from || date > year.to) continue;
    if (!passes(i)) continue;
    if (!counted("invoice", i.status)) continue;
    if (cfg.depositHandling === "exclude_deposit_invoices" && i.is_deposit) continue;
    invoiceRows.push({
      id: i.id,
      invoiceNumber: i.number,
      invoiceHref: invoiceUrl(i.id, i.deal_id),
      invoiceDate: date,
      customer: customerOf(i),
      jobNumber: i.job_number,
      jobName: i.deal_name,
      jobHref: jobUrl(i.deal_id),
      status: i.status,
      deposit: i.is_deposit ? "Y" : "N",
      taxName: i.tax_name,
      taxRate: taxFraction(i.tax_rate),
      preTax: i.pre_tax_total ?? 0,
      tax: i.tax_amount ?? 0,
      credits: i.credit_applied ?? 0,
      total: i.amount ?? 0,
    });
  }

  // ---- POs / WOs in the selected year ----
  const orderRows: Row[] = [];
  if (cfg.showCommittedCost) {
    for (const o of data.orders) {
      if (o.org_id !== data.orgId) continue;
      const date = orderDateOf(o, timeZone);
      if (!date || date < year.from || date > year.to) continue;
      if (!passes(o)) continue;
      if (!counted(o.kind, o.status)) continue;
      orderRows.push({
        id: `${o.kind}:${o.id}`,
        kind: o.kind,
        orderType: o.kind === "po" ? "PO" : "WO",
        orderNumber: o.number,
        orderHref: o.kind === "po" ? purchaseOrderUrl(o.id, o.deal_id) : workOrderUrl(o.id, o.deal_id),
        orderDate: date,
        vendor: o.vendor,
        jobNumber: o.job_number,
        jobName: o.deal_name,
        jobHref: jobUrl(o.deal_id),
        status: o.status,
        preTaxAmount: o.pre_tax_total ?? 0,
      });
    }
  }

  // ---- Main view: one row per period ----
  const mainKeys = definition.views.main.kind === "table" ? definition.views.main.columns : [];
  const mainCols = mainKeys.filter((k) => cfg.showCommittedCost || !COMMITTED_COLUMNS.includes(k)).map(col);
  const nullIfNone = (n: number, v: number) => (n === 0 ? null : v);
  const periodRows: Row[] = periods.map((p) => {
    const inv = invoiceRows.filter((r) => periodOf(r.invoiceDate as string) === p);
    const pos = orderRows.filter((r) => r.kind === "po" && periodOf(r.orderDate as string) === p);
    const wos = orderRows.filter((r) => r.kind === "wo" && periodOf(r.orderDate as string) === p);
    const row: Row = {
      period: p.label,
      _window: windowParam(p.from, p.to),
      invoiceCount: nullIfNone(inv.length, inv.length),
      invoicedPreTax: nullIfNone(inv.length, sumMoney(inv.map((r) => r.preTax))),
      taxCharged: nullIfNone(inv.length, sumMoney(inv.map((r) => r.tax))),
      creditsApplied: nullIfNone(inv.length, sumMoney(inv.map((r) => r.credits))),
      invoiceTotal: nullIfNone(inv.length, sumMoney(inv.map((r) => r.total))),
    };
    if (cfg.showCommittedCost) {
      row.committedMaterials = nullIfNone(pos.length, sumMoney(pos.map((r) => r.preTaxAmount)));
      row.committedLabor = nullIfNone(wos.length, sumMoney(wos.map((r) => r.preTaxAmount)));
      row.committedTotal = nullIfNone(pos.length + wos.length, sumMoney([...pos, ...wos].map((r) => r.preTaxAmount)));
    }
    return row;
  });
  const yearTotal = aggregate(periodRows, mainCols);

  // ---- Details (optionally narrowed to one period by a row click) ----
  const w = filters.windows.in ?? null;
  const detailSpec = (id: string) => definition.views.details!.find((d) => d.id === id)!;
  const detail = (id: string, rows: Row[]): DetailResult => {
    const spec = detailSpec(id);
    const cols = spec.columns.map(col);
    const sorted = sortRows(rows, spec.defaultSort);
    return { id, title: spec.title, sheetName: spec.sheetName, rowNoun: spec.rowNoun, columns: cols, rows: sorted, totals: aggregate(sorted, cols) };
  };
  const details = [detail("invoices", invoiceRows.filter((r) => inWindow(r.invoiceDate as string, w)))];
  if (cfg.showCommittedCost) details.push(detail("committed", orderRows.filter((r) => inWindow(r.orderDate as string, w))));

  // ---- KPIs: the selected year ----
  const kpiValues: Record<string, number | null> = {
    invoicedPreTax: sumMoney(invoiceRows.map((r) => r.preTax)),
    taxCharged: sumMoney(invoiceRows.map((r) => r.tax)),
    invoiceTotal: sumMoney(invoiceRows.map((r) => r.total)),
    invoiceCount: invoiceRows.length,
    committedTotal: sumMoney(orderRows.map((r) => r.preTaxAmount)),
  };
  const kpis: KpiValue[] = definition.kpis!.filter((k) => cfg.showCommittedCost || k.key !== "committedTotal").map((k) => ({ ...k, value: kpiValues[k.key] ?? null }));

  // ---- Notes: deposit handling as configured, and any statuses that need mapping ----
  const notes = [...definition.notes];
  notes.splice(3, 0, cfg.depositHandling === "exclude_deposit_invoices"
    ? "Deposit handling: deposit invoices are not counted; the final invoice bills the full amount, so revenue and tax are counted once, when the final invoice is dated."
    : "Deposit handling: deposit invoices are counted when invoiced; the CRM deducts invoiced deposits from the final invoice's totals, so each dollar is counted once.");
  const unknownText = (["invoice", "po", "wo"] as const)
    .filter((k) => unknown[k].size)
    .map((k) => `${{ invoice: "Invoices", po: "Purchase orders", wo: "Work orders" }[k]}: ${[...unknown[k]].map(([s, n]) => `"${s}" (${n})`).join(", ")}`);
  if (unknownText.length) notes.push(`Not counted (status not recognized; ask MeasureSquare to map it): ${unknownText.join("; ")}.`);

  return {
    kpis,
    main: {
      kind: "table",
      labelColumn: col("period"),
      columns: mainCols,
      rows: periodRows,
      totals: yearTotal,
      totalLabel: "Year Total",
      drill: { filterKey: "in", tab: "invoices" },
    },
    details,
    totals: yearTotal,
    notes,
    limitations: definition.limitations,
    rowCount: invoiceRows.length + orderRows.length,
    meta: {
      version: definition.version,
      grouping: "period",
      params: {
        year: fy, period: periodKind, ...cfg, ...m, window: w,
        ...(unknownText.length ? { unrecognizedStatuses: Object.fromEntries((["invoice", "po", "wo"] as const).map((k) => [k, Object.fromEntries(unknown[k])])) } : {}),
      },
    },
  };
}
