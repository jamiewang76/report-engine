import { db, forOrg } from "@/lib/db";
import { clientForOrg } from "@/lib/crm/connection";
import { mapLimit, type CrmClient } from "@/lib/crm/client";
import type { DealDetail, DealListItem, InvoiceDetail, InvoiceSummary } from "@/lib/crm/types";

const CONCURRENCY = 4; // per-org parallel detail calls; keep low to be kind to crm11api

const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
/**
 * CRM money is integer CENTS (swagger: int64 amount/preTaxTotal/taxAmount/...). Cache dollars.
 * Rates/percents (taxRate, retainagePercent, winProbability) are doubles and are NOT money: use n().
 */
export const money = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)) / 100);
const name = (v: unknown) => (v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : null);
/** Payment terms may come as text ("Net 30") or as a lookup object ({ id, name }). Not in the swagger InvoiceDto. */
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
/** Person/company display name from a CRM contact-like object (businessName/displayName/first+last). */
const personName = (v: unknown): string | null => {
  if (!v || typeof v !== "object") return str(v);
  const o = v as Record<string, unknown>;
  return str(o.businessName) ?? str(o.displayName) ?? ([o.firstName, o.lastName].filter(Boolean).join(" ") || null);
};
const now = () => new Date().toISOString();

/** Merge a list item with its detail: detail wins, the list item fills what the detail lacks. */
const merge = (summary: object | undefined, detail: object) =>
  ({ ...(summary ?? {}), ...Object.fromEntries(Object.entries(detail).filter(([, v]) => v != null && v !== "")) }) as Record<string, unknown>;

/** Invoice list item + detail -> cache row (the list carries customer/job names; the detail carries tax, deposit, ids). */
export function invoiceRow(summary: InvoiceSummary | undefined, detail: InvoiceDetail) {
  const i = merge(summary, detail);
  return {
    id: String(i.id),
    deal_id: str(pick(i, "dealId", "deal.id")),
    number: String(i.number ?? ""),
    deal_name: str(pick(i, "dealName", "deal.name")),
    job_number: str(pick(i, "dealJobNumber", "jobNumber", "deal.jobNumber")),
    account_name: str(pick(i, "accountName", "account.name", "customerName", "customer.name")),
    status: String(i.status ?? ""),
    invoice_date: str(pick(i, "date", "invoiceDate")),
    due_date: str(pick(i, "dueDate")),
    amount: money(pick(i, "amount", "total")),
    pre_tax_total: money(pick(i, "preTaxTotal")),
    tax_amount: money(pick(i, "taxAmount")),
    paid_amount: money(pick(i, "paidAmount")),
    credit_applied: money(pick(i, "appliedCreditNoteAmount")),
    retainage_amount: money(pick(i, "retainageAmount")),
    retainage_due_date: str(pick(i, "retainageDueDate")),
    payment_term: termText(pick(i, "paymentTerm", "paymentTerms", "paymentTermName")),
    is_deposit: (i.isDeposit as boolean | undefined) ?? null,
    deposit_invoiced_amount: money(pick(i, "depositInvoicedAmount")),
    tax_name: str(pick(i, "taxName", "defaultTax.name")),
    tax_rate: n(pick(i, "taxRate")),
    sov_id: str(pick(i, "sovId")),
    bid_id: str(pick(i, "bidId")),
    change_order_id: str(pick(i, "changeOrderId")),
    last_updated_on: str(pick(i, "lastUpdatedOn")),
    raw: i,
    synced_at: now(),
  };
}

/** Purchase order list item (GET /api/PurchaseOrders) -> cache row. The list carries every field the reports need. */
export function purchaseOrderRow(p: Record<string, unknown>) {
  return {
    id: String(p.id),
    number: str(p.number),
    status: str(p.status),
    category: str(p.category),
    vendor_id: str(pick(p, "vendorId", "vendor.id")),
    vendor_name: str(p.vendorName) ?? personName(p.vendor),
    vendor_ref_number: str(p.vendorRefNumber),
    deal_id: str(pick(p, "dealId", "deal.id")),
    deal_name: str(pick(p, "dealName", "deal.name")),
    job_number: str(pick(p, "dealJobNumber", "deal.jobNumber")),
    account_name: str(pick(p, "accountName", "account.name")),
    owner_name: str(p.ownerName),
    order_date: str(pick(p, "orderDateTime", "rawOrderDateTime")),
    ship_date: str(p.shipDate),
    po_date: str(p.date),
    amount: money(p.amount),
    pre_tax_total: money(p.preTaxTotal),
    created_on: str(p.createdOn),
    last_updated_on: str(p.lastUpdatedOn),
    raw: p,
    synced_at: now(),
  };
}

/** Work order list item (GET /api/WorkOrders) -> cache row. */
export function workOrderRow(w: Record<string, unknown>) {
  return {
    id: String(w.id),
    number: str(w.number),
    status: str(w.status),
    type: str(w.type),
    contractor_id: str(pick(w, "contractorId", "contractor.id", "installerId")),
    contractor_name: str(w.contractorName) ?? personName(w.contractor) ?? personName(w.installer),
    installer_type: str(pick(w, "installerType", "installer.type")),
    deal_id: str(pick(w, "dealId", "deal.id")),
    deal_name: str(pick(w, "dealName", "deal.name")),
    job_number: str(pick(w, "dealJobNumber", "deal.jobNumber")),
    account_name: str(pick(w, "accountName", "account.name")),
    owner_name: str(w.ownerName),
    order_date: str(w.orderDate),
    start_date_time: str(w.startDateTime),
    end_date_time: str(w.endDateTime),
    amount: money(w.amount),
    pre_tax_total: money(w.preTaxTotal),
    created_on: str(w.createdOn),
    last_updated_on: str(w.lastUpdatedOn),
    raw: w,
    synced_at: now(),
  };
}

async function upsertAll(orgId: string, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await forOrg(orgId).upsert(table, rows.slice(i, i + 500));
    if (error) throw error;
  }
}

/**
 * Remove cached rows the CRM no longer lists (deleted records). Only after a complete, non-empty list; an empty list is
 * treated as suspicious (API hiccup) and never wipes the cache.
 */
async function pruneMissing(orgId: string, table: string, listedIds: string[]) {
  if (!listedIds.length) return 0;
  const listed = new Set(listedIds);
  const cached = await forOrg(orgId).selectAll<{ id: string }>(table, "id");
  const gone = cached.map((r) => r.id).filter((id) => !listed.has(id));
  if (gone.length) await forOrg(orgId).deleteIds(table, gone);
  return gone.length;
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
    contract_total: money(d.contractTotal),
    contract_total_with_co: money(d.contractTotalWithChangeOrder),
    material_cost: money(d.materialCostAmount),
    labor_cost: money(d.laborCostAmount),
    other_cost: money(d.otherCostAmount),
    raw: d,
    synced_at: now(),
  }));
  await upsertAll(orgId, "deals", rows);
  return rows.length;
}

type CachedInvoice = { id: string; paid_amount: number | null; retainage_amount: number | null; last_updated_on: string | null };

/** Which listed invoices need their detail (re)fetched: new, open, payment changed, retainage, or edited since cached. */
export function invoicesNeedingDetail(list: InvoiceSummary[], cached: CachedInvoice[]): InvoiceSummary[] {
  const known = new Map(cached.map((r) => [r.id, r]));
  return list.filter((i) => {
    const k = known.get(i.id);
    if (!k) return true;
    const open = Number(i.amount ?? 0) - Number(i.paidAmount ?? 0) > 0; // cents
    const paidChanged = money(i.paidAmount) !== (k.paid_amount == null ? null : Number(k.paid_amount));
    const edited = !!i.lastUpdatedOn && (!k.last_updated_on || Date.parse(i.lastUpdatedOn) !== Date.parse(k.last_updated_on));
    return open || paidChanged || edited || Number(k.retainage_amount ?? 0) > 0;
  });
}

/**
 * Invoices: the list endpoint has no "updated since" filter, so we pull the full list and fetch detail only where needed
 * (invoicesNeedingDetail). Invoices no longer listed (deleted in the CRM) are removed from the cache.
 */
async function syncInvoices(crm: CrmClient, orgId: string) {
  const list = await crm.all<InvoiceSummary>("/api/Invoices", {});
  const cached = await forOrg(orgId).selectAll<CachedInvoice>("invoices", "id, paid_amount, retainage_amount, last_updated_on");
  const needsDetail = invoicesNeedingDetail(list, cached);
  const details = await mapLimit(needsDetail, CONCURRENCY, (i) => crm.get<InvoiceDetail>(`/api/Invoices/${i.id}`));
  const byId = new Map(list.map((i) => [i.id, i]));
  await upsertAll(orgId, "invoices", details.map((d) => invoiceRow(byId.get(d.id), d)));
  const removed = await pruneMissing(orgId, "invoices", list.map((i) => i.id));
  return { listed: list.length, detailed: details.length, removed };
}

/**
 * Purchase orders / work orders: the list summary has everything the reports use (amounts, status, dates, vendor, job),
 * so no per-record detail calls. Full list each sync (POs/WOs are light); deleted records are pruned.
 */
async function syncOrders(crm: CrmClient, orgId: string, path: string, table: string, toRow: (r: Record<string, unknown>) => Record<string, unknown>) {
  const list = await crm.all<Record<string, unknown>>(path, {});
  await upsertAll(orgId, table, list.map(toRow));
  const removed = await pruneMissing(orgId, table, list.map((r) => String(r.id)));
  return { listed: list.length, removed };
}

/** Cache tables that are synced on demand (only when an org's reports need them). Deals and invoices always sync. */
export const OPTIONAL_TABLES = ["purchase_orders", "work_orders"] as const;

export async function syncOrg(orgId: string, opts: { tables?: Iterable<string> } = {}) {
  const tables = new Set(opts.tables ?? []);
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
    const counts: Record<string, unknown> = {};
    counts.deals = await syncDeals(crm, orgId, last?.started_at ?? null);
    counts.invoices = await syncInvoices(crm, orgId);
    if (tables.has("purchase_orders")) counts.purchase_orders = await syncOrders(crm, orgId, "/api/PurchaseOrders", "purchase_orders", purchaseOrderRow);
    if (tables.has("work_orders")) counts.work_orders = await syncOrders(crm, orgId, "/api/WorkOrders", "work_orders", workOrderRow);
    await db().from("sync_runs").update({ status: "ok", finished_at: now(), counts }).eq("id", run!.id);
    return counts;
  } catch (e) {
    await db().from("sync_runs").update({ status: "error", finished_at: now(), error: String(e) }).eq("id", run!.id);
    throw e;
  }
}
