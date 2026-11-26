import { forOrg } from "@/lib/db";
import type { FsData, FsInvoice, FsOrder } from "./build";

/**
 * Reads only from the Supabase cache, only for this org (forOrg). No CRM API calls at render time.
 * Invoices, POs and WOs are joined in memory to their job (deals) for pipeline and owner (the Pipeline/Owner filters),
 * and for customer/job names when the record itself lacks them.
 */
type DealRef = { id: string; name: string | null; job_number: string | null; account_name: string | null; pipeline_name: string | null; owner_name: string | null };
type InvoiceRow = Omit<FsInvoice, "pipeline_name" | "owner_name">;
type PoRow = { org_id: string; id: string; number: string | null; status: string | null; vendor_name: string | null; deal_id: string | null; deal_name: string | null; job_number: string | null; account_name: string | null; order_date: string | null; pre_tax_total: number | null };
type WoRow = Omit<PoRow, "vendor_name"> & { contractor_name: string | null; start_date_time: string | null };

const INVOICE_COLUMNS =
  "org_id, id, deal_id, number, status, invoice_date, account_name, deal_name, job_number, amount, pre_tax_total, tax_amount, credit_applied, is_deposit, deposit_invoiced_amount, tax_name, tax_rate";

export function joinJobs(invoices: InvoiceRow[], pos: PoRow[], wos: WoRow[], deals: DealRef[]): Omit<FsData, "orgId"> {
  const byId = new Map(deals.map((d) => [d.id, d]));
  const job = (x: { deal_id: string | null; account_name: string | null; deal_name: string | null; job_number: string | null }) => {
    const d = x.deal_id ? byId.get(x.deal_id) : undefined;
    return {
      account_name: x.account_name || d?.account_name || null,
      deal_name: x.deal_name || d?.name || null,
      job_number: x.job_number || d?.job_number || null,
      pipeline_name: d?.pipeline_name ?? null,
      owner_name: d?.owner_name ?? null,
    };
  };
  const orders: FsOrder[] = [
    ...pos.map((p) => ({ org_id: p.org_id, id: p.id, kind: "po" as const, number: p.number, status: p.status, vendor: p.vendor_name, deal_id: p.deal_id, order_date: p.order_date, start_date_time: null, pre_tax_total: p.pre_tax_total, ...job(p) })),
    ...wos.map((w) => ({ org_id: w.org_id, id: w.id, kind: "wo" as const, number: w.number, status: w.status, vendor: w.contractor_name, deal_id: w.deal_id, order_date: w.order_date, start_date_time: w.start_date_time, pre_tax_total: w.pre_tax_total, ...job(w) })),
  ];
  return { invoices: invoices.map((i) => ({ ...i, ...job(i) })), orders };
}

export async function load(orgId: string): Promise<FsData> {
  const q = forOrg(orgId);
  const [invoices, pos, wos, deals] = await Promise.all([
    q.selectAll<InvoiceRow>("invoices", INVOICE_COLUMNS),
    q.selectAll<PoRow>("purchase_orders", "org_id, id, number, status, vendor_name, deal_id, deal_name, job_number, account_name, order_date, pre_tax_total"),
    q.selectAll<WoRow>("work_orders", "org_id, id, number, status, contractor_name, deal_id, deal_name, job_number, account_name, order_date, start_date_time, pre_tax_total"),
    q.selectAll<DealRef>("deals", "id, name, job_number, account_name, pipeline_name, owner_name"),
  ]);
  return { orgId, ...joinJobs(invoices, pos, wos, deals) };
}
