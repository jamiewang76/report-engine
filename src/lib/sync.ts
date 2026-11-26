import { db, forOrg } from "@/lib/db";
import { clientForOrg } from "@/lib/crm/connection";
import { mapLimit, type CrmClient } from "@/lib/crm/client";
import type { DealDetail, DealListItem, InvoiceDetail, InvoiceSummary } from "@/lib/crm/types";

const CONCURRENCY = 4; // per-org parallel detail calls; keep low to be kind to crm11api

const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const name = (v: unknown) => (v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : null);
/** Payment terms may come as text ("Net 30") or as a lookup object ({ id, name }). */
const termText = (v: unknown) => (v == null || v === "" ? null : typeof v === "object" ? name(v) : String(v));

/** First non-empty value among candidate paths ("a.b") of a CRM record; tolerant of DTO shape differences. */
export function pick(o: Record<string, unknown>, ...paths: string[]): unknown {
  for (const path of paths) {
    let v: unknown = o;
    for (const k of path.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
    if (v != null && v !== "") return v;
  }
  return null;
}
const str = (v: unknown) => (v == null || v === "" ? null : typeof v === "object" ? name(v) : String(v));

/**
 * Invoice list item + detail -> cache row. Detail wins; the list item fills anything the detail lacks
 * (the list carries the customer and job names, the detail may only carry ids).
 */
export function invoiceRow(summary: InvoiceSummary | undefined, detail: InvoiceDetail) {
  const i = { ...(summary ?? {}), ...Object.fromEntries(Object.entries(detail).filter(([, v]) => v != null && v !== "")) } as Record<string, unknown>;
  return {
    id: String(i.id),
    deal_id: str(pick(i, "dealId", "deal.id")),
    number: String(i.number ?? ""),
    deal_name: str(pick(i, "dealName", "deal.name")),
    job_number: str(pick(i, "dealJobNumber", "jobNumber", "deal.jobNumber")),
    account_name: str(pick(i, "accountName", "account.name", "customerName", "customer.name", "billToName", "billTo.name")),
    status: String(i.status ?? ""),
    invoice_date: str(pick(i, "date", "invoiceDate")),
    due_date: str(pick(i, "dueDate")),
    amount: n(pick(i, "amount", "total")),
    pre_tax_total: n(pick(i, "preTaxTotal")),
    tax_amount: n(pick(i, "taxAmount")),
    paid_amount: n(pick(i, "paidAmount")),
    credit_applied: n(pick(i, "appliedCreditNoteAmount")),
    retainage_amount: n(pick(i, "retainageAmount")),
    retainage_due_date: str(pick(i, "retainageDueDate")),
    payment_term: termText(pick(i, "paymentTerm", "paymentTerms", "paymentTermName", "term", "terms")),
    is_deposit: (i.isDeposit as boolean | undefined) ?? null,
    raw: i,
    synced_at: new Date().toISOString(),
  };
}

/** Deals: list filtered by UpdatedStart (incremental), then fetch detail for dates/financial fields. */
async function syncDeals(crm: CrmClient, orgId: string, since: string | null) {
  const list = await crm.all<DealListItem>("/api/Deals", { IsViewAll: true, UpdatedStart: since ?? undefined });
  const details = await mapLimit(list, CONCURRENCY, (d) => crm.get<DealDetail>(`/api/Deals/${d.id}`));
  const rows = details.map((d) => ({
    id: d.id,
    name: d.name,
    job_number: d.jobNumber ?? null,
    pipeline_name: name(d.pipeline),
    stage_name: name(d.stage),
    owner_name: d.ownerName ?? null,
    estimator_name: d.estimatorName ?? null,
    account_name: name(d.account),
    created_on: d.createdOn,
    bid_due_at: d.bidDueDateTime ?? null,
    closing_date: d.closingDateTime ?? null,
    expected_win_date: d.expectedWinDate ?? null,
    won_date: d.wonDate ?? null,
    lost_date: d.lostDate ?? null,
    closed_date: d.closedDate ?? null,
    is_closed: d.isClosed ?? null,
    win_probability: n(d.winProbability),
    contract_total: n(d.contractTotal),
    contract_total_with_co: n(d.contractTotalWithChangeOrder),
    material_cost: n(d.materialCostAmount),
    labor_cost: n(d.laborCostAmount),
    other_cost: n(d.otherCostAmount),
    raw: d,
    synced_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await forOrg(orgId).upsert("deals", rows.slice(i, i + 500));
    if (error) throw error;
  }
  return rows.length;
}

/**
 * Invoices: the list endpoint has no "updated since" filter (only CreatedStart), so we pull the full list
 * and only fetch detail (retainage, tax, dealId) for invoices that are new, open, or have retainage.
 * PHASE 0: check whether `Filter` accepts lastUpdatedOn to make this incremental.
 */
async function syncInvoices(crm: CrmClient, orgId: string) {
  const list = await crm.all<InvoiceSummary>("/api/Invoices", {});
  const existing = await forOrg(orgId).selectAll<{ id: string; paid_amount: number | null; amount: number | null; retainage_amount: number | null }>("invoices", "id, paid_amount, amount, retainage_amount");
  const known = new Map(existing.map((r) => [r.id, r]));
  const needsDetail = list.filter((i) => {
    const k = known.get(i.id);
    const open = Number(i.amount ?? 0) - Number(i.paidAmount ?? 0) > 0.005;
    return !k || open || Number(k.paid_amount) !== Number(i.paidAmount) || Number(k.retainage_amount ?? 0) > 0;
  });
  const details = await mapLimit(needsDetail, CONCURRENCY, (i) => crm.get<InvoiceDetail>(`/api/Invoices/${i.id}`));
  const byId = new Map(list.map((i) => [i.id, i]));
  const rows = details.map((d) => invoiceRow(byId.get(d.id), d));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await forOrg(orgId).upsert("invoices", rows.slice(i, i + 500));
    if (error) throw error;
  }
  return { listed: list.length, detailed: rows.length };
}

export async function syncOrg(orgId: string) {
  const { data: last } = await db()
    .from("sync_runs")
    .select("started_at")
    .eq("org_id", orgId)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: run } = await db().from("sync_runs").insert({ org_id: orgId }).select("id").single();
  try {
    const crm = await clientForOrg(orgId);
    const deals = await syncDeals(crm, orgId, last?.started_at ?? null);
    const invoices = await syncInvoices(crm, orgId);
    await db().from("sync_runs").update({ status: "ok", finished_at: new Date().toISOString(), counts: { deals, invoices } }).eq("id", run!.id);
    return { deals, invoices };
  } catch (e) {
    await db().from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error: String(e) }).eq("id", run!.id);
    throw e;
  }
}
