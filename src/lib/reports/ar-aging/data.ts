import { forOrg } from "@/lib/db";
import type { ArData, ArInvoice } from "./build";

/**
 * Reads only from the Supabase cache, only for this org (forOrg). No CRM API calls at render time.
 * Each invoice is joined in memory to its job (deals) for the owner, and for the job name/number and customer
 * when the invoice record itself doesn't carry them (the CRM invoice detail often has only the job id).
 */
const INVOICE_COLUMNS =
  "org_id, id, deal_id, number, account_name, deal_name, job_number, invoice_date, due_date, payment_term, amount, paid_amount, credit_applied, retainage_amount, retainage_due_date, is_deposit";

type DealRef = { id: string; name: string | null; job_number: string | null; account_name: string | null; owner_name: string | null };

export function joinDeals(invoices: Omit<ArInvoice, "owner_name">[], deals: DealRef[]): ArInvoice[] {
  const byId = new Map(deals.map((d) => [d.id, d]));
  return invoices.map((i) => {
    const d = i.deal_id ? byId.get(i.deal_id) : undefined;
    return {
      ...i,
      account_name: i.account_name || d?.account_name || null,
      deal_name: i.deal_name || d?.name || null,
      job_number: i.job_number || d?.job_number || null,
      owner_name: d?.owner_name || null,
    };
  });
}

export async function load(orgId: string): Promise<ArData> {
  const q = forOrg(orgId);
  const [invoices, deals] = await Promise.all([
    q.selectAll<Omit<ArInvoice, "owner_name">>("invoices", INVOICE_COLUMNS),
    q.selectAll<DealRef>("deals", "id, name, job_number, account_name, owner_name"),
  ]);
  return { orgId, invoices: joinDeals(invoices, deals) };
}
