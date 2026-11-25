import { forOrg } from "@/lib/db";
import { buildArAging, type AgingInvoice, type AgingRow } from "./arAging";
import { toXlsx } from "./excel";
import type { ConfigSchema } from "./schema";

/**
 * Report catalog. Only "live" reports can be assigned to customers; "draft" reports appear only in the
 * admin console; "retired" reports are hidden everywhere and their assignments stop working.
 * Handlers always receive the org id from the session (never from the request) plus the org's assignment config.
 */

export type ReportStatus = "draft" | "live" | "retired";

export type ReportContext = {
  orgId: string;
  config: Record<string, unknown>; // validated against configSchema
  params: URLSearchParams; // request query (asOf, from, to, filters)
};

/** `params` is what gets logged to report_events: the as-of date, date range and filters actually used. */
export type JsonResult = { data: unknown; rowCount: number; params: Record<string, unknown> };
export type XlsxResult = { buffer: Buffer; filename: string; rowCount: number; params: Record<string, unknown> };

export type ReportDef = {
  id: string;
  name: string;
  description: string;
  status: ReportStatus;
  configSchema: ConfigSchema;
  buildJson: (ctx: ReportContext) => Promise<JsonResult>;
  buildXlsx: (ctx: ReportContext) => Promise<XlsxResult>;
};

export class ReportInputError extends Error {}

const notBuilt = (id: string) => async (): Promise<never> => {
  throw new Error(`Report ${id} is not built yet`);
};

/** YYYY-MM-DD from ?asOf=, defaulting to today (UTC). Rejects garbage instead of silently using "now". */
export function asOfParam(params: URLSearchParams): Date {
  const raw = params.get("asOf");
  if (!raw) return new Date(new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) throw new ReportInputError("asOf must be YYYY-MM-DD");
  return new Date(raw);
}

// ---------- A/R Aging (live) ----------

async function arAgingData(ctx: ReportContext) {
  const asOf = asOfParam(ctx.params);
  const { data, error } = await forOrg(ctx.orgId).select(
    "invoices",
    "id, number, account_name, deal_name, job_number, invoice_date, due_date, amount, paid_amount, credit_applied, retainage_amount, retainage_due_date, is_deposit",
  );
  if (error) throw error;
  const opts = {
    includeDeposits: ctx.config.includeDeposits as boolean,
    priorityThreshold: (ctx.config.priorityThreshold as number | null) ?? null,
  };
  const result = buildArAging((data ?? []) as unknown as AgingInvoice[], asOf, opts);
  return { result, params: { asOf: result.asOf, ...opts } };
}

const arAging: ReportDef = {
  id: "ar-aging",
  name: "A/R Aging",
  description: "Open invoices by days past due, with retainage held.",
  status: "live",
  configSchema: {
    priorityThreshold: { type: "number", label: "Priority threshold ($)", optional: true, min: 0, help: "Invoices with an open balance (incl. retainage) at or above this amount are flagged as priority." },
    includeDeposits: { type: "boolean", label: "Include deposit invoices", default: true },
  },
  async buildJson(ctx) {
    const { result, params } = await arAgingData(ctx);
    return { data: result, rowCount: result.rows.length, params };
  },
  async buildXlsx(ctx) {
    const { result, params } = await arAgingData(ctx);
    const hasPriority = params.priorityThreshold != null;
    const buffer = await toXlsx<AgingRow>(`A/R Aging as of ${result.asOf}`, [{
      name: "A/R Aging", totals: true, rows: result.rows,
      columns: [
        { header: "Invoice #", value: (r) => r.number },
        { header: "Customer / GC", value: (r) => r.customer, width: 28 },
        { header: "Project", value: (r) => r.project, width: 32 },
        { header: "Invoice Date", value: (r) => (r.invoiceDate ? new Date(r.invoiceDate) : null) },
        { header: "Due Date", value: (r) => (r.dueDate ? new Date(r.dueDate) : null) },
        { header: "Days Past Due", value: (r) => r.daysPastDue },
        { header: "Bucket", value: (r) => r.bucket },
        ...(hasPriority ? [{ header: "Priority", value: (r: AgingRow) => (r.priority ? "Yes" : "") }] : []),
        { header: "Invoice Amount", value: (r) => r.amount, money: true },
        { header: "Paid", value: (r) => r.paid, money: true },
        { header: "Open Balance", value: (r) => r.openBalance, money: true },
        { header: "Retainage Held", value: (r) => r.retainageHeld, money: true },
        { header: "Retainage Due", value: (r) => (r.retainageDueDate ? new Date(r.retainageDueDate) : null) },
      ],
    }]);
    return { buffer, filename: `ar-aging-${result.asOf}.xlsx`, rowCount: result.rows.length, params };
  },
};

// ---------- Drafts (config captured now; handlers built later) ----------

const draft = (d: Omit<ReportDef, "status" | "buildJson" | "buildXlsx">): ReportDef => ({
  ...d, status: "draft", buildJson: notBuilt(d.id), buildXlsx: notBuilt(d.id),
});

const bidTiming = draft({
  id: "bid-timing",
  name: "Bid Timing",
  description: "Job created vs bid due vs takeoff completed vs proposal submitted (Select Interiors).",
  configSchema: {
    takeoffCompletedField: { type: "string", label: "Custom field: takeoff completed", optional: true, help: "Deal custom field holding the takeoff-completed date." },
    proposalSubmittedField: { type: "string", label: "Custom field: proposal submitted", optional: true, help: "Deal custom field holding the proposal-submitted date." },
  },
});

const provincialForecast = draft({
  id: "provincial-forecast",
  name: "Sales Forecast",
  description: "Pipeline awaiting PO (incl. probability-weighted) and forecast by expected invoice month, split by product type (Provincial Tiles).",
  configSchema: {
    pipelines: {
      type: "records",
      label: "Pipelines",
      help: "One row per pipeline.",
      fields: {
        pipeline: { type: "string", label: "Pipeline name" },
        awaitingPoStages: { type: "stringList", label: "\"Awaiting PO\" stages" },
        forecastableStages: { type: "stringList", label: "Forecastable stages" },
      },
    },
    productTypeTags: { type: "stringList", label: "Product-type tags", help: "Deal tags used to split the forecast by product type." },
  },
});

const wipByStage = draft({
  id: "wip-by-stage",
  name: "WIP by Stage",
  description: "Work in progress defined by a list of stages (Design Floors).",
  configSchema: {
    wipStages: { type: "stringList", label: "Stages counted as WIP" },
  },
});

const financialSummary = draft({
  id: "financial-summary",
  name: "Financial Summary",
  description: "Invoiced revenue and tax by month; committed PO/WO cost labeled \"committed cost, not COGS\" (M&P Flooring).",
  configSchema: {},
});

export const REPORTS: readonly ReportDef[] = [arAging, bidTiming, financialSummary, provincialForecast, wipByStage];

export const getReport = (id: string) => REPORTS.find((r) => r.id === id);
