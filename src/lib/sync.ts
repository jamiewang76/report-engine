import { db, forOrg } from "@/lib/db";
import { clientForOrg } from "@/lib/crm/connection";
import { mapLimit, type CrmClient } from "@/lib/crm/client";
import type { DealDetail, DealListItem, InvoiceDetail, InvoiceSummary } from "@/lib/crm/types";

const CONCURRENCY = 4; // per-org parallel detail calls; keep low to be kind to crm11api

const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const name = (v: unknown) => (v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : null);

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
  const { data: existing } = await forOrg(orgId).select("invoices", "id, paid_amount, amount, retainage_amount");
  const known = new Map((existing ?? []).map((r: any) => [r.id, r]));
  const needsDetail = list.filter((i) => {
    const k = known.get(i.id);
    const open = Number(i.amount ?? 0) - Number(i.paidAmount ?? 0) > 0.005;
    return !k || open || Number(k.paid_amount) !== Number(i.paidAmount) || Number(k.retainage_amount ?? 0) > 0;
  });
  const details = await mapLimit(needsDetail, CONCURRENCY, (i) => crm.get<InvoiceDetail>(`/api/Invoices/${i.id}`));
  const rows = details.map((i) => ({
    id: i.id,
    deal_id: i.dealId ?? null,
    number: i.number,
    deal_name: i.dealName ?? null,
    job_number: i.dealJobNumber ?? null,
    account_name: i.accountName ?? null,
    status: String(i.status),
    invoice_date: i.date ?? null,
    due_date: i.dueDate ?? null,
    amount: n(i.amount),
    pre_tax_total: n(i.preTaxTotal),
    tax_amount: n(i.taxAmount),
    paid_amount: n(i.paidAmount),
    credit_applied: n(i.appliedCreditNoteAmount),
    retainage_amount: n(i.retainageAmount),
    retainage_due_date: i.retainageDueDate ?? null,
    is_deposit: i.isDeposit ?? null,
    raw: i,
    synced_at: new Date().toISOString(),
  }));
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
