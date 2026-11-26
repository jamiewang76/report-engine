import type { FsData, FsInvoice, FsOrder } from "../build";

/**
 * Anonymized fixtures with hand-calculated totals (no customer data). Org time zone: America/Los_Angeles.
 *
 * Jobs: d1 102 Harbor Clinic (Beacon Contracting, Commercial, Ana Ruiz) · d2 101 Riverside Lofts (Acme Builders,
 * Multifamily, Sam Lee) · d3 104 Cedar Model Home (Cedar Homes, Residential, Ana Ruiz)
 *
 * Invoices                         status          pre-tax      tax   credits     total
 *   INV-2000 Dec 31, 2025 d2       Paid           2,000.00   165.00        –   2,165.00   (year boundary: 2025)
 *   INV-2001 Jan  1, 2026 d2       Approved      10,000.00   825.00        –  10,825.00   (year boundary: 2026)
 *   INV-2002 Jan 15, 2026 d1       Sent           5,000.00   412.50        –   5,412.50   DEPOSIT
 *   INV-2003 Feb 10, 2026 d1       Partially Paid 15,000.00 1,237.50       –  16,237.50   final, net of the 5,000 deposit
 *   INV-2004 Feb 20, 2026 d3       Paid           3,300.33   272.28   300.00   3,572.61   credit applied
 *   INV-2005 Mar  5, 2026 d3       Draft          9,999.00      –          –   9,999.00   excluded
 *   INV-2006 Mar 12, 2026 d2       Void           4,000.00   330.00        –   4,330.00   excluded
 *   INV-2007 Mar 31, 2026 d2       Overdue        1,234.56   101.85        –   1,336.41
 *   INV-2008 Mar 20, 2026 d2       Weird Status      50.00      –          –      50.00   unknown status: excluded, reported
 *   INV-2010 Jul  1, 2026 d3       Approved         700.00    57.75        –     757.75   (fiscal-year test)
 *   INV-9001 Feb  1, 2026 OTHER ORG Paid         99,999.00      –          –  99,999.00   never included
 *
 * Calendar 2026 (counted: 2001, 2002, 2003, 2004, 2007, 2010)
 *   Jan: 2 invoices  pre 15,000.00  tax 1,237.50  credits    –    total 16,237.50
 *   Feb: 2 invoices  pre 18,300.33  tax 1,509.78  credits 300.00  total 19,810.11
 *   Mar: 1 invoice   pre  1,234.56  tax   101.85                  total  1,336.41
 *   Jul: 1 invoice   pre    700.00  tax    57.75                  total    757.75
 *   Year: 6          pre 35,234.89  tax 2,906.88  credits 300.00  total 38,141.77   (pre + tax = total)
 * Deposit, no double count: Harbor Clinic job = 5,000 deposit + 15,000 final = 20,000 pre-tax (the job's contract).
 *
 * Committed (pre-tax)
 *   PO-3001 Approved  d1 ordered 2026-01-20T18:00Z (Jan 20 local)   4,000.00
 *   PO-3002 Draft     d1 ordered 2026-02-02                            999.00   excluded
 *   PO-3003 Received  d2 ordered 2026-03-01T06:30Z = Feb 28 22:30 LA  2,500.50   counted in FEBRUARY (local time)
 *   PO-3005 Cancelled d2 ordered 2026-01-05                            700.00   excluded
 *   PO-9001 OTHER ORG                                                 8,888.00   never included
 *   WO-4001 Approved  d1 order date 2026-01-25                        3,000.00
 *   WO-4002 Draft     d2 order date 2026-02-05                          500.00   excluded
 *   WO-4003 Completed d3 no order date, start 2026-03-10T15:00Z       1,200.25   (start-date fallback: March)
 *   Jan: materials 4,000.00  labor 3,000.00  total 7,000.00
 *   Feb: materials 2,500.50  labor –         total 2,500.50
 *   Mar: materials –         labor 1,200.25  total 1,200.25
 *   Year: materials 6,500.50 labor 4,200.25  total 10,700.75
 */

export const ORG = "org_demo";
export const AS_OF = "2026-11-25";
export const TZ = "America/Los_Angeles";

const JOBS = {
  d1: { deal_id: "d1", job_number: "102", deal_name: "Harbor Clinic", account_name: "Beacon Contracting", pipeline_name: "Commercial", owner_name: "Ana Ruiz" },
  d2: { deal_id: "d2", job_number: "101", deal_name: "Riverside Lofts", account_name: "Acme Builders", pipeline_name: "Multifamily", owner_name: "Sam Lee" },
  d3: { deal_id: "d3", job_number: "104", deal_name: "Cedar Model Home", account_name: "Cedar Homes", pipeline_name: "Residential", owner_name: "Ana Ruiz" },
};

const inv = (id: string, number: string, date: string, job: keyof typeof JOBS, status: string, pre: number, tax: number, total: number, o: Partial<FsInvoice> = {}): FsInvoice => ({
  org_id: ORG, id, number, status, invoice_date: `${date}T00:00:00+00:00`, ...JOBS[job],
  pre_tax_total: pre, tax_amount: tax, amount: total, credit_applied: 0, is_deposit: false, deposit_invoiced_amount: 0,
  tax_name: tax ? "Sales Tax" : null, tax_rate: tax ? 8.25 : null, ...o,
});

export const INVOICES: FsInvoice[] = [
  inv("i2000", "INV-2000", "2025-12-31", "d2", "Paid", 2000, 165, 2165),
  inv("i2001", "INV-2001", "2026-01-01", "d2", "Approved", 10000, 825, 10825),
  inv("i2002", "INV-2002", "2026-01-15", "d1", "Sent", 5000, 412.5, 5412.5, { is_deposit: true }),
  inv("i2003", "INV-2003", "2026-02-10", "d1", "Partially Paid", 15000, 1237.5, 16237.5, { deposit_invoiced_amount: 5000 }),
  inv("i2004", "INV-2004", "2026-02-20", "d3", "Paid", 3300.33, 272.28, 3572.61, { credit_applied: 300 }),
  inv("i2005", "INV-2005", "2026-03-05", "d3", "Draft", 9999, 0, 9999),
  inv("i2006", "INV-2006", "2026-03-12", "d2", "Void", 4000, 330, 4330),
  inv("i2007", "INV-2007", "2026-03-31", "d2", "Overdue", 1234.56, 101.85, 1336.41),
  inv("i2008", "INV-2008", "2026-03-20", "d2", "Weird Status", 50, 0, 50),
  inv("i2010", "INV-2010", "2026-07-01", "d3", "Approved", 700, 57.75, 757.75),
  inv("i9001", "INV-9001", "2026-02-01", "d2", "Paid", 99999, 0, 99999, { org_id: "org_other", account_name: "Other Org Customer" }),
];

const order = (kind: "po" | "wo", id: string, number: string, job: keyof typeof JOBS, status: string, order_date: string | null, pre: number, o: Partial<FsOrder> = {}): FsOrder => {
  const { deal_id, job_number, deal_name, account_name, pipeline_name, owner_name } = JOBS[job];
  return {
    org_id: ORG, id, kind, number, status, vendor: kind === "po" ? "Shaw Industries" : "Rivera Install Co.", deal_id, deal_name, job_number, account_name, pipeline_name, owner_name,
    order_date, start_date_time: null, pre_tax_total: pre, ...o,
  };
};

export const ORDERS: FsOrder[] = [
  order("po", "p3001", "PO-3001", "d1", "Approved", "2026-01-20T18:00:00Z", 4000),
  order("po", "p3002", "PO-3002", "d1", "Draft", "2026-02-02T18:00:00Z", 999),
  order("po", "p3003", "PO-3003", "d2", "Received", "2026-03-01T06:30:00Z", 2500.5, { vendor: "Mohawk" }),
  order("po", "p3005", "PO-3005", "d2", "Cancelled", "2026-01-05T18:00:00Z", 700),
  order("po", "p9001", "PO-9001", "d2", "Approved", "2026-01-10T18:00:00Z", 8888, { org_id: "org_other" }),
  order("wo", "w4001", "WO-4001", "d1", "Approved", "2026-01-25", 3000),
  order("wo", "w4002", "WO-4002", "d2", "Draft", "2026-02-05", 500),
  order("wo", "w4003", "WO-4003", "d3", "Completed", null, 1200.25, { start_date_time: "2026-03-10T15:00:00Z", vendor: "Precision Floors" }),
];

export const DATA: FsData = { orgId: ORG, invoices: INVOICES, orders: ORDERS };
