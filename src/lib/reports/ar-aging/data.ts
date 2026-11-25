import { forOrg } from "@/lib/db";
import type { ArData, ArInvoice } from "./build";

/**
 * Reads only from the Supabase cache, only for this org (forOrg). No CRM API calls at render time.
 * Invoices are joined in memory to their job's owner (deals.owner_name).
 */
const INVOICE_COLUMNS =
  "org_id, id, deal_id, number, account_name, deal_name, job_number, invoice_date, due_date, payment_term, amount, paid_amount, credit_applied, retainage_amount, retainage_due_date, is_deposit";

export async function load(orgId: string): Promise<ArData> {
  const q = forOrg(orgId);
  const [invoices, deals] = await Promise.all([
    q.selectAll<Omit<ArInvoice, "owner_name">>("invoices", INVOICE_COLUMNS),
    q.selectAll<{ id: string; owner_name: string | null }>("deals", "id, owner_name"),
  ]);
  const owner = new Map(deals.map((d) => [d.id, d.owner_name]));
  return { orgId, invoices: invoices.map((i) => ({ ...i, owner_name: (i.deal_id && owner.get(i.deal_id)) || null })) };
}
