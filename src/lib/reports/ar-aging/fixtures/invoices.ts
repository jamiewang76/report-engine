import type { ArData, ArInvoice } from "../build";

/**
 * Anonymized sample data (made-up companies, jobs and people). As of 2026-11-25.
 *
 * Hand-calculated expectations (deposits included, threshold 25,000):
 *   INV-1001 Acme       current  open 10,800.00 + ret 1,200.00 = 12,000.00   Low
 *   INV-1002 Acme       41 days  open  4,650.20 + ret   850.05 =  5,500.25   Medium
 *   INV-1003 Beacon     117 days open 29,500.00                 = 29,500.00   High
 *   INV-1004 Beacon     fully paid -> excluded
 *   INV-1005 Cedar      no due date -> ages from invoice date: 55 days, open 2,250.75   Medium
 *   INV-1006 Cedar      deposit, 5 days, open 1,000.00          Medium
 *   INV-1007 Acme       exactly 90 days -> 61–90, open 5,000.00 High (60+)
 *   INV-1009 Beacon     negative (credit) invoice -> excluded
 *   INV-1010 Cedar      zero amount -> excluded
 *   INV-9001 other org  -> must never appear
 *
 *   Buckets: Current 10,800.00 · 1–30 1,000.00 · 31–60 6,900.95 · 61–90 5,000.00 · 90+ 29,500.00
 *   Retainage 2,050.05 · Total 55,251.00 · Past Due 42,400.95 · # Open 6
 *   By customer (Total desc): Beacon 29,500.00 · Acme 22,500.25 · Cedar 3,250.75
 */

export const ORG = "org_demo";
export const AS_OF = "2026-11-25";

const base = (o: Partial<ArInvoice>): ArInvoice => ({
  org_id: ORG, id: "x", deal_id: null, number: "INV-0", account_name: null, deal_name: null, job_number: null,
  invoice_date: null, due_date: null, payment_term: null, amount: 0, paid_amount: 0, credit_applied: 0,
  retainage_amount: 0, retainage_due_date: null, is_deposit: false, owner_name: null, ...o,
});

const acme = { account_name: "Acme Builders" };
const beacon = { account_name: "Beacon Contracting" };
const cedar = { account_name: "Cedar Homes" };
const job101 = { deal_id: "d101", job_number: "101", deal_name: "Riverside Lofts", owner_name: "Sam Lee" };
const job102 = { deal_id: "d102", job_number: "102", deal_name: "Harbor Clinic", owner_name: "Ana Ruiz" };
const job103 = { deal_id: "d103", job_number: "103", deal_name: "Elm St School", owner_name: "Sam Lee" };
const job104 = { deal_id: "d104", job_number: "104", deal_name: "Cedar Model Home", owner_name: "Ana Ruiz" };
const job105 = { deal_id: "d105", job_number: "105", deal_name: "Pine Ridge Retail", owner_name: null };

export const INVOICES: ArInvoice[] = [
  base({ id: "i1001", number: "INV-1001", ...acme, ...job101, invoice_date: "2026-11-01", due_date: "2026-12-01T00:00:00+00:00", payment_term: "Net 30", amount: 12000, retainage_amount: 1200, retainage_due_date: "2027-03-01" }),
  base({ id: "i1002", number: "INV-1002", ...acme, ...job101, invoice_date: "2026-09-15", due_date: "2026-10-15", payment_term: "Net 30", amount: 8500.5, paid_amount: 3000.25, retainage_amount: 850.05 }),
  base({ id: "i1003", number: "INV-1003", ...beacon, ...job102, invoice_date: "2026-07-01", due_date: "2026-07-31", payment_term: "Net 30", amount: 30000, credit_applied: 500 }),
  base({ id: "i1004", number: "INV-1004", ...beacon, ...job103, invoice_date: "2026-10-20", amount: 4000, paid_amount: 4000 }),
  base({ id: "i1005", number: "INV-1005", ...cedar, ...job104, invoice_date: "2026-10-01", due_date: null, amount: 2250.75 }),
  base({ id: "i1006", number: "INV-1006", ...cedar, ...job104, invoice_date: "2026-11-20", due_date: "2026-11-20", payment_term: "Due on receipt", amount: 1000, is_deposit: true }),
  base({ id: "i1007", number: "INV-1007", ...acme, ...job105, invoice_date: "2026-08-01", due_date: "2026-08-27", payment_term: "Net 26", amount: 6000, paid_amount: 1000 }),
  base({ id: "i1009", number: "INV-1009", ...beacon, ...job102, invoice_date: "2026-10-01", due_date: "2026-10-31", amount: -500 }),
  base({ id: "i1010", number: "INV-1010", ...cedar, ...job104, invoice_date: "2026-10-01", due_date: "2026-10-31", amount: 0 }),
  base({ id: "i9001", org_id: "org_other", number: "INV-9001", account_name: "Other Org Customer", amount: 99999, due_date: "2026-01-01" }),
];

export const DATA: ArData = { orgId: ORG, invoices: INVOICES };
