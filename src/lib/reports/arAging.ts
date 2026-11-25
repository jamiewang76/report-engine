/**
 * A/R Aging — pilot: Design Construct (Jude, Nov 2026).
 * Open balance per invoice bucketed by days past due as of a date, with retainage split out.
 *
 * Open balance = amount - paidAmount - appliedCreditNoteAmount.
 * Retainage held is reported separately (bucketed by retainage due date when present) because it is
 * not collectible until release.
 */
export type AgingInvoice = {
  id: string;
  number: string;
  account_name: string | null;
  deal_name: string | null;
  job_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  paid_amount: number | null;
  credit_applied: number | null;
  retainage_amount: number | null;
  retainage_due_date: string | null;
};

export const BUCKETS = ["Current", "1-30", "31-60", "61-90", "90+"] as const;
export type Bucket = (typeof BUCKETS)[number];

export type AgingRow = {
  invoiceId: string;
  number: string;
  customer: string;
  project: string;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number;
  paid: number;
  openBalance: number;        // excludes retainage
  retainageHeld: number;
  retainageDueDate: string | null;
  daysPastDue: number;
  bucket: Bucket;
  partiallyPaid: boolean;
};

const DAY = 86_400_000;
const round = (x: number) => Math.round(x * 100) / 100;

export function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

export function buildArAging(invoices: AgingInvoice[], asOf: Date = new Date()) {
  const rows: AgingRow[] = [];
  for (const i of invoices) {
    const amount = i.amount ?? 0;
    const paid = i.paid_amount ?? 0;
    const credit = i.credit_applied ?? 0;
    const retainage = i.retainage_amount ?? 0;
    const totalOpen = round(amount - paid - credit);
    if (totalOpen <= 0.005) continue;

    // Retainage is collected last, so payments apply to the non-retainage portion first.
    const retainageHeld = round(Math.min(retainage, totalOpen));
    const openBalance = round(totalOpen - retainageHeld);
    const due = i.due_date ? new Date(i.due_date) : i.invoice_date ? new Date(i.invoice_date) : asOf;
    const daysPastDue = Math.floor((asOf.getTime() - due.getTime()) / DAY);

    rows.push({
      invoiceId: i.id,
      number: i.number,
      customer: i.account_name ?? "",
      project: [i.job_number, i.deal_name].filter(Boolean).join(" - "),
      invoiceDate: i.invoice_date,
      dueDate: i.due_date,
      amount,
      paid,
      openBalance,
      retainageHeld,
      retainageDueDate: i.retainage_due_date,
      daysPastDue,
      bucket: bucketFor(daysPastDue),
      partiallyPaid: paid > 0,
    });
  }
  rows.sort((a, b) => b.daysPastDue - a.daysPastDue);

  const totals = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  const byCustomer = new Map<string, Record<Bucket, number> & { retainage: number; total: number }>();
  let retainageTotal = 0;
  for (const r of rows) {
    totals[r.bucket] = round(totals[r.bucket] + r.openBalance);
    retainageTotal = round(retainageTotal + r.retainageHeld);
    const c = byCustomer.get(r.customer) ?? { ...Object.fromEntries(BUCKETS.map((b) => [b, 0])), retainage: 0, total: 0 } as any;
    c[r.bucket] = round(c[r.bucket] + r.openBalance);
    c.retainage = round(c.retainage + r.retainageHeld);
    c.total = round(c.total + r.openBalance + r.retainageHeld);
    byCustomer.set(r.customer, c);
  }
  return {
    asOf: asOf.toISOString().slice(0, 10),
    rows,
    totals: { ...totals, retainage: retainageTotal, total: round(Object.values(totals).reduce((a, b) => a + b, 0) + retainageTotal) },
    byCustomer: [...byCustomer.entries()].map(([customer, v]) => ({ customer, ...v })).sort((a, b) => b.total - a.total),
  };
}
