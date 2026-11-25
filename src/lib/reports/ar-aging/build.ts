import { addMoney, daysBetween, isoDate, roundMoney, subMoney, sumMoney } from "../format";
import { optionsFrom, passesMulti } from "../filters";
import { aggregate, groupRows, sortRows, type LevelKey } from "../grouping";
import { invoiceUrl, jobUrl } from "../crmLinks";
import type { BuildInput, ColumnDef, FilterOption, ReportBody, Row } from "../types";
import { COLUMNS, definition } from "./definition";

/** One invoice as cached (invoices joined to its job's owner). Shape returned by data.ts. */
export type ArInvoice = {
  org_id: string;
  id: string;
  deal_id: string | null;
  number: string;
  account_name: string | null;
  deal_name: string | null;
  job_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_term: string | null;
  amount: number | null;
  paid_amount: number | null;
  credit_applied: number | null;
  retainage_amount: number | null;
  retainage_due_date: string | null;
  is_deposit: boolean | null;
  owner_name: string | null;
};

export type ArData = { orgId: string; invoices: ArInvoice[] };
export type ArConfig = { priorityThreshold?: number | null; includeDeposits?: boolean };

export const BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;
export type Bucket = (typeof BUCKETS)[number];
const BUCKET_KEY: Record<Bucket, string> = { Current: "current", "1–30": "d1_30", "31–60": "d31_60", "61–90": "d61_90", "90+": "d90p" };

export function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1–30";
  if (daysPastDue <= 60) return "31–60";
  if (daysPastDue <= 90) return "61–90";
  return "90+";
}

/** High: 60+ days past due OR open balance ≥ threshold. Medium: 1–59 days. Low: current. */
export function priorityFor(daysPastDue: number, openBalance: number, threshold: number | null | undefined): "High" | "Medium" | "Low" {
  if (daysPastDue >= 60 || (threshold != null && openBalance >= threshold)) return "High";
  if (daysPastDue >= 1) return "Medium";
  return "Low";
}

const NO_CUSTOMER = "(No customer)";
const NO_JOB = "(No job)";
const jobLabel = (i: ArInvoice) => [i.job_number, i.deal_name].filter(Boolean).join(" - ") || NO_JOB;
const jobKey = (i: ArInvoice) => i.deal_id ?? `label:${jobLabel(i)}`;

/** Record row per open invoice (null if it has no balance due or is an excluded deposit). */
export function invoiceRow(i: ArInvoice, asOf: string, cfg: ArConfig): Row | null {
  if (cfg.includeDeposits === false && i.is_deposit) return null;
  const amount = roundMoney(i.amount);
  const paid = roundMoney(i.paid_amount);
  const credits = roundMoney(i.credit_applied);
  const totalOpen = subMoney(amount, paid, credits);
  if (totalOpen <= 0) return null; // fully paid, credited, or a negative (credit) invoice: not receivable

  // Retainage is collected last: payments apply to the non-retainage portion first.
  const retainageHeld = roundMoney(Math.min(Math.max(roundMoney(i.retainage_amount), 0), totalOpen));
  const openBalance = subMoney(totalOpen, retainageHeld);
  const dueDate = isoDate(i.due_date);
  const invoiceDate = isoDate(i.invoice_date);
  const agingFrom = dueDate ?? invoiceDate ?? asOf;
  const daysPastDue = daysBetween(agingFrom, asOf);
  const bucket = bucketFor(daysPastDue);

  const row: Row = {
    id: i.id,
    number: i.number,
    numberHref: invoiceUrl(i.id, i.deal_id),
    customer: i.account_name || NO_CUSTOMER,
    job: jobLabel(i),
    jobKey: jobKey(i),
    jobHref: jobUrl(i.deal_id),
    owner: i.owner_name,
    invoiceDate,
    dueDate,
    terms: i.payment_term,
    daysPastDue,
    bucket,
    amount,
    paid,
    credits,
    openBalance,
    retainageHeld,
    retainageDueDate: isoDate(i.retainage_due_date),
    priority: priorityFor(daysPastDue, openBalance, cfg.priorityThreshold),
    retainage: retainageHeld || null,
    total: addMoney(openBalance, retainageHeld),
  };
  for (const b of BUCKETS) row[BUCKET_KEY[b]] = b === bucket && openBalance !== 0 ? openBalance : null;
  return row;
}

export function filterOptions(data: ArData): Record<string, FilterOption[]> {
  const inv = data.invoices.filter((i) => i.org_id === data.orgId);
  return {
    customer: optionsFrom(inv, (i) => ({ value: i.account_name || NO_CUSTOMER, label: i.account_name || NO_CUSTOMER })),
    job: optionsFrom(inv, (i) => ({ value: jobKey(i), label: jobLabel(i) })),
    owner: optionsFrom(inv, (i) => (i.owner_name ? { value: i.owner_name, label: i.owner_name } : null)),
  };
}

const col = (key: string): ColumnDef => {
  const c = COLUMNS.find((x) => x.key === key);
  if (!c) throw new Error(`ar-aging: unknown column ${key}`);
  return c;
};

/** Pure: (data, filters, config, asOf, grouping) -> ReportBody. No I/O, no clock. */
export function build({ data, filters, config, asOf, grouping }: BuildInput<ArData, ArConfig>): ReportBody {
  const cfg: ArConfig = { includeDeposits: config.includeDeposits ?? true, priorityThreshold: config.priorityThreshold ?? null };
  const m = filters.multi;
  const rows = data.invoices
    .filter((i) => i.org_id === data.orgId) // belt and braces: data.ts already reads only this org via forOrg()
    .map((i) => invoiceRow(i, asOf, cfg))
    .filter((r): r is Row => !!r)
    .filter((r) => passesMulti(m.customer, r.customer as string) && passesMulti(m.job, r.jobKey as string) && passesMulti(m.owner, r.owner as string | null));

  const main = definition.views.main;
  if (main.kind !== "grouped") throw new Error("ar-aging main view is grouped");
  const mainCols = main.columns.map(col);
  const level: LevelKey = grouping.id === "job"
    ? (r) => ({ key: r.jobKey as string, label: r.job as string, href: r.jobHref as string | null })
    : (r) => ({ key: r.customer as string, label: r.customer as string });
  const { groups, grandTotal } = groupRows(rows, [level], mainCols, {
    groupSort: main.defaultSort,
    rowSort: definition.views.detail!.defaultSort,
  });

  const detailCols = definition.views.detail!.columns.map(col);
  const detailRows = sortRows(rows, definition.views.detail!.defaultSort);
  const detailTotals = aggregate(detailRows, detailCols);

  const pastDue = sumMoney(rows.filter((r) => (r.daysPastDue as number) > 0).map((r) => r.openBalance));
  const over90 = sumMoney(rows.map((r) => r.d90p));
  const kpiValues: Record<string, number> = {
    totalOpen: (grandTotal.total as number | null) ?? 0,
    pastDue,
    over90,
    retainageHeld: (grandTotal.retainage as number | null) ?? 0,
    openInvoices: rows.length,
  };

  return {
    kpis: definition.kpis!.map((k) => ({ ...k, value: kpiValues[k.key] ?? null })),
    main: { kind: "grouped", levelLabels: grouping.levels.map((l) => l.label), leafColumn: col(main.leafKey), columns: mainCols, groups, grandTotal },
    detail: { columns: detailCols, rows: detailRows, totals: detailTotals },
    totals: grandTotal,
    notes: definition.notes,
    limitations: definition.limitations,
    rowCount: rows.length,
    meta: { version: definition.version, grouping: grouping.id, params: { asOf, ...cfg, grouping: grouping.id, ...m } },
  };
}
