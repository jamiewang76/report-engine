import type { ColumnDef, ReportDefinition } from "../types";
import { COMMITTED_STATUS_NOTE, INVOICE_STATUS_NOTE } from "./statuses";

/**
 * Monthly Financial Summary (M&P Flooring, requested Nov 24, 2026). Built to docs/report-standard.md with the overrides
 * recorded below. v1 covers what the CRM standard API provides: invoiced revenue and tax charged (by invoice date) and
 * committed cost from POs/WOs (by order date). Payments received, tax collected and COGS are added later as new columns
 * (same id, same layout) once payment and bill data is available.
 */

const money = (key: string, header: string, description: string, width = 16): ColumnDef => ({ key, header, type: "money", description, width });

export const DEPOSIT_HANDLING = [
  { value: "count_when_invoiced", label: "Count deposit invoices when invoiced (final invoices are net of deposits)" },
  { value: "exclude_deposit_invoices", label: "Exclude deposit invoices (final invoices bill the full amount)" },
] as const;
export type DepositHandling = (typeof DEPOSIT_HANDLING)[number]["value"];

export const COLUMNS: ColumnDef[] = [
  // Main view (one row per period)
  { key: "period", header: "Period", type: "text", width: 18, description: "Month or quarter of the selected (fiscal) year. Click a period to see its invoices." },
  { key: "invoiceCount", header: "# Invoices", type: "number", width: 11, description: "Approved invoices dated in the period." },
  money("invoicedPreTax", "Invoiced (pre-tax)", "Sum of approved invoice pre-tax totals by invoice date."),
  money("taxCharged", "Tax charged", "Sum of sales tax on approved invoices by invoice date (accrual basis: counted when invoiced, not when collected)."),
  money("creditsApplied", "Credits applied", "Credit notes applied to these invoices. Not subtracted from Invoiced (pre-tax) in this version."),
  money("invoiceTotal", "Invoice total (incl. tax)", "Invoice totals including tax, by invoice date."),
  money("committedMaterials", "Committed – Materials (POs)", "Approved purchase orders by order date, pre-tax. Committed cost is what's been ordered, not what's been billed or paid. Not COGS."),
  money("committedLabor", "Committed – Labor (WOs)", "Approved work orders by order date (start date if there's no order date), pre-tax. Not COGS."),
  money("committedTotal", "Committed total", "Committed – Materials + Committed – Labor. Not COGS."),

  // Invoices detail
  { key: "invoiceNumber", header: "Invoice #", type: "link", hrefKey: "invoiceHref", width: 14, description: "Invoice number. Opens the invoice in MeasureSquare CRM." },
  { key: "invoiceDate", header: "Invoice date", type: "date", width: 13, description: "Invoice date (the date basis for invoices)." },
  { key: "customer", header: "Customer/GC", type: "text", width: 28, description: "Account billed on the invoice." },
  { key: "jobNumber", header: "Job #", type: "text", width: 10, description: "Job number." },
  { key: "jobName", header: "Job name", type: "link", hrefKey: "jobHref", width: 30, description: "Job name. Opens the job in MeasureSquare CRM." },
  { key: "status", header: "Status", type: "text", width: 14, description: "Status in the CRM." },
  { key: "deposit", header: "Deposit", type: "text", align: "center", width: 9, description: "Y if this is a deposit invoice." },
  { key: "taxName", header: "Tax name", type: "text", width: 16, description: "Sales tax applied to the invoice." },
  { key: "taxRate", header: "Tax rate", type: "percent", decimals: 2, width: 9, aggregate: "none", description: "Sales tax rate on the invoice." },
  money("preTax", "Pre-tax", "Invoice pre-tax total.", 14),
  money("tax", "Tax", "Sales tax on the invoice.", 12),
  money("credits", "Credits applied", "Credit notes applied to the invoice.", 14),
  money("total", "Total", "Invoice total including tax.", 14),

  // Committed cost detail
  { key: "orderType", header: "Type", type: "text", align: "center", width: 7, description: "PO = purchase order (materials); WO = work order (labor)." },
  { key: "orderNumber", header: "Number", type: "link", hrefKey: "orderHref", width: 14, description: "PO or WO number. Opens it in MeasureSquare CRM." },
  { key: "orderDate", header: "Order date", type: "date", width: 13, description: "Order date (WOs without an order date use their start date). The date basis for committed cost." },
  { key: "vendor", header: "Vendor / Subcontractor", type: "text", width: 28, description: "PO vendor or WO contractor/installer." },
  money("preTaxAmount", "Pre-tax amount", "PO or WO pre-tax total.", 15),
];

export const COMMITTED_COLUMNS = ["committedMaterials", "committedLabor", "committedTotal"];

export const definition: ReportDefinition = {
  id: "financial-summary",
  name: "Monthly Financial Summary",
  description: "Invoiced revenue and sales tax charged by month and year, with committed material and labor cost from purchase orders and work orders.",
  status: "draft",
  version: "1",
  requestedBy: ["M&P Flooring"],
  dataSources: {
    tables: ["invoices", "deals", "purchase_orders", "work_orders"],
    endpoints: ["/api/Invoices", "/api/Invoices/{id}", "/api/Deals/{id}", "/api/PurchaseOrders", "/api/WorkOrders"],
  },
  columns: COLUMNS,
  filters: [
    { key: "year", label: "Year", kind: "year" },
    { key: "period", label: "Period", kind: "choice", options: [{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }], default: "month" },
    { key: "customer", label: "Customer/GC", kind: "multi", searchable: true, allLabel: "All customers" },
    { key: "pipeline", label: "Pipeline", kind: "multi", allLabel: "All pipelines" },
    { key: "owner", label: "Owner", kind: "multi", allLabel: "All owners" },
    { key: "in", label: "Showing", kind: "window" },
  ],
  headerNote: "Dates: invoice date (invoices), order date (POs/WOs)",
  views: {
    main: {
      kind: "table",
      labelKey: "period",
      columns: ["invoiceCount", "invoicedPreTax", "taxCharged", "creditsApplied", "invoiceTotal", ...COMMITTED_COLUMNS],
      totalLabel: "Year Total",
    },
    details: [
      {
        id: "invoices", title: "Invoices", sheetName: "Invoices", rowNoun: { one: "invoice", many: "invoices" },
        columns: ["invoiceNumber", "invoiceDate", "customer", "jobNumber", "jobName", "status", "deposit", "taxName", "taxRate", "preTax", "tax", "credits", "total"],
        defaultSort: { key: "invoiceDate", dir: "asc" },
      },
      {
        id: "committed", title: "Committed cost", sheetName: "Committed Cost", rowNoun: { one: "order", many: "orders" },
        columns: ["orderType", "orderNumber", "orderDate", "vendor", "jobNumber", "jobName", "status", "preTaxAmount"],
        defaultSort: { key: "orderDate", dir: "asc" },
      },
    ],
  },
  kpis: [
    { key: "invoicedPreTax", label: "Invoiced (pre-tax)", type: "money", description: "Approved invoice pre-tax totals in the selected year, by invoice date." },
    { key: "taxCharged", label: "Tax charged", type: "money", description: "Sales tax on approved invoices in the selected year (accrual basis)." },
    { key: "invoiceTotal", label: "Invoice total (incl. tax)", type: "money", description: "Approved invoice totals including tax in the selected year." },
    { key: "invoiceCount", label: "# Invoices", type: "number", description: "Approved invoices dated in the selected year." },
    { key: "committedTotal", label: "Committed cost — not COGS", type: "money", description: "Approved POs + WOs by order date in the selected year, pre-tax. What's been ordered, not what's been billed or paid." },
  ],
  groupings: [{ id: "period", label: "By period", default: true, levels: [] }],
  configSchema: {
    fiscalYearStartMonth: { type: "number", label: "Fiscal year start month (1–12)", default: 1, min: 1, max: 12, integer: true, help: "1 = calendar year. Fiscal years are named by the year they end in (start 7: FY2026 = Jul 2025 – Jun 2026)." },
    depositHandling: {
      type: "string", label: "Deposit invoices", default: "count_when_invoiced", options: DEPOSIT_HANDLING.map((d) => ({ ...d })),
      help: "How deposit invoices are counted so each dollar is counted once. See the report's Notes.",
    },
    showCommittedCost: { type: "boolean", label: "Show committed cost (POs/WOs)", default: true },
  },
  notes: [
    "Invoiced (pre-tax): sum of approved invoice pre-tax totals by invoice date.",
    "Tax charged: sum of sales tax on approved invoices by invoice date (accrual basis: tax is counted when invoiced, not when collected).",
    "Credits applied: credit notes applied to these invoices; not subtracted from Invoiced in this version.",
    // Deposit handling note is added by build() for the org's setting.
    "Committed – Materials / Labor: approved purchase orders / work orders by order date, pre-tax. Committed cost is what's been ordered, not what's been billed or paid.",
    "Dates: invoices use the invoice date; purchase orders use the order date; work orders use the order date (the start date if there's no order date). Months and quarters use the company's local time zone.",
    INVOICE_STATUS_NOTE,
    COMMITTED_STATUS_NOTE,
  ],
  limitations: [
    {
      id: "payments-cogs",
      message: "Payments received, tax collected, and cost of goods sold (COGS) will be added once payment and bill data is available from the CRM. Committed cost shows approved purchase orders and work orders by order date. It is not COGS.",
    },
  ],
  overrides: [
    { section: "§1 Main view", reason: "Spec: a period table (one row per month or quarter, fiscal order, Year Total row) instead of a grouped table or matrix." },
    { section: "§1 Detail view", reason: "Spec: two detail tables (Invoices; Committed cost from POs/WOs), each its own tab and Excel sheet." },
    { section: "§4 Filters", reason: "Spec: Year + Period (Month/Quarter) instead of a date-range preset; clicking a period row narrows the details to that period." },
    { section: "§5 Sorting", reason: "Main period table stays in fiscal order (not sortable); the detail tables are sortable." },
    { section: "§6 Excel sheets", reason: "Spec: sheets Report, Invoices, Committed Cost, Notes (instead of a single Detail sheet)." },
  ],
  rowNoun: { one: "record", many: "records" }, // invoices + POs/WOs in the selected year
};
