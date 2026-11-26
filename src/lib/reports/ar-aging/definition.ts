import type { ColumnDef, ReportDefinition } from "../types";

/** A/R Aging, built to docs/report-standard.md §10. */

const money = (key: string, header: string, description: string, width = 14): ColumnDef => ({ key, header, type: "money", description, width });

export const COLUMNS: ColumnDef[] = [
  // Detail (record) columns
  { key: "number", header: "Invoice #", type: "link", hrefKey: "numberHref", width: 14, description: "Invoice number. Opens the invoice's job in MeasureSquare CRM." },
  { key: "customer", header: "Customer/GC", type: "text", width: 28, description: "Account billed on the invoice." },
  { key: "job", header: "Job", type: "link", hrefKey: "jobHref", width: 32, description: "Job number and name. Opens the job in MeasureSquare CRM." },
  { key: "invoiceDate", header: "Invoice Date", type: "date", width: 13, description: "Invoice date." },
  { key: "dueDate", header: "Due Date", type: "date", width: 13, description: "Invoice due date. Blank when the invoice has none (aging then uses the invoice date)." },
  { key: "terms", header: "Terms", type: "text", width: 12, description: "Payment terms: days from invoice date to due date (\"Net 30\"; \"Due on receipt\" when due the same day). The CRM API has no separate payment-term field." },
  { key: "daysPastDue", header: "Days Past Due", type: "days", width: 13, description: "As-of date minus Due Date (Invoice Date if no due date). Zero or negative = not yet due." },
  { key: "bucket", header: "Bucket", type: "text", width: 10, description: "Current (not yet due), 1–30, 31–60, 61–90 or 90+ days past due." },
  money("amount", "Invoice Amount", "Invoice total including tax."),
  money("paid", "Paid", "Payments applied to the invoice so far."),
  money("credits", "Credits", "Credit notes applied to the invoice."),
  money("openBalance", "Open Balance", "Invoice Amount − Paid − Credits − Retainage Held. The collectible amount, excluding retainage."),
  money("retainageHeld", "Retainage Held", "Retainage withheld and still unpaid. Payments are applied to the non-retainage portion first."),
  { key: "retainageDueDate", header: "Retainage Due", type: "date", width: 13, description: "When the retainage is due to be released, if recorded." },
  {
    key: "priority", header: "Priority", type: "flag", width: 10,
    flags: [{ value: "High", tone: "red" }, { value: "Medium", tone: "amber" }, { value: "Low", tone: "gray" }],
    description: "High: 60+ days past due, or Open Balance at or above your priority threshold. Medium: 1–59 days past due. Low: current.",
  },
  // Main view (aging buckets per group / invoice)
  money("current", "Current", "Open Balance not yet past due."),
  money("d1_30", "1–30", "Open Balance 1–30 days past due."),
  money("d31_60", "31–60", "Open Balance 31–60 days past due."),
  money("d61_90", "61–90", "Open Balance 61–90 days past due."),
  money("d90p", "90+", "Open Balance more than 90 days past due."),
  money("retainage", "Retainage", "Retainage Held (not bucketed: not collectible until released)."),
  money("total", "Total", "Open Balance + Retainage Held."),
];

export const definition: ReportDefinition = {
  id: "ar-aging",
  name: "A/R Aging",
  description: "Open invoices by days past due, with retainage held separately.",
  status: "live",
  version: "2.1.0",
  requestedBy: ["Design Construct"],
  dataSources: { tables: ["invoices", "deals"], endpoints: ["/api/Invoices", "/api/Invoices/{id}", "/api/Deals/{id}"] },
  columns: COLUMNS,
  filters: [
    { key: "asOf", label: "As of", kind: "asOf" },
    { key: "customer", label: "Customer/GC", kind: "multi", searchable: true, allLabel: "All customers" },
    { key: "job", label: "Job", kind: "multi", searchable: true, allLabel: "All jobs" },
    { key: "owner", label: "Owner", kind: "multi", allLabel: "All owners" },
  ],
  views: {
    main: { kind: "grouped", leafKey: "number", columns: ["current", "d1_30", "d31_60", "d61_90", "d90p", "retainage", "total"], defaultSort: { key: "total", dir: "desc" } },
    detail: {
      columns: ["number", "customer", "job", "invoiceDate", "dueDate", "terms", "daysPastDue", "bucket", "amount", "paid", "credits", "openBalance", "retainageHeld", "retainageDueDate", "priority"],
      defaultSort: { key: "daysPastDue", dir: "desc" },
    },
  },
  kpis: [
    { key: "totalOpen", label: "Total Open A/R", type: "money", description: "Open Balance + Retainage Held across all open invoices." },
    { key: "pastDue", label: "Past Due", type: "money", description: "Open Balance more than 0 days past due (excludes retainage)." },
    { key: "over90", label: "90+ Days", type: "money", description: "Open Balance more than 90 days past due (excludes retainage)." },
    { key: "retainageHeld", label: "Retainage Held", type: "money", description: "Retainage withheld and still unpaid." },
    { key: "openInvoices", label: "# Open Invoices", type: "number", description: "Invoices with a balance due (Open Balance or Retainage Held above zero)." },
  ],
  groupings: [
    { id: "customer", label: "By Customer/GC", default: true, levels: [{ key: "customer", label: "Customer/GC" }] },
    { id: "job", label: "By Job", levels: [{ key: "job", label: "Job" }] },
  ],
  configSchema: {
    priorityThreshold: { type: "number", label: "Priority threshold ($)", optional: true, min: 0, help: "Invoices with an Open Balance at or above this amount are High priority." },
    includeDeposits: { type: "boolean", label: "Include deposit invoices", default: true },
  },
  notes: [
    "Open Balance = Invoice Amount − Paid − Credits − Retainage Held.",
    "Buckets use the Due Date (the Invoice Date if there is no due date), counted to the as-of date.",
    "Retainage is shown separately because it isn't collectible until released.",
    "Invoices with no balance due (fully paid or credited) are not shown.",
    "Amounts reflect the latest synced invoice balances (see \"Data as of\").",
  ],
  limitations: [{ id: "payment-history", message: "Payment history by date will appear once payment data is available." }],
  overrides: [
    { section: "§3 column order", reason: "Detail columns follow the A/R Aging spec's order (Days Past Due and Bucket after Terms, Priority last)." },
  ],
  rowNoun: { one: "invoice", many: "invoices" },
};
