/**
 * Status rules for the Monthly Financial Summary. CRM statuses are free text (swagger: `status: string`, no enum; orgs can
 * customize order statuses via /api/OrderStatuses), so values are matched case- and punctuation-insensitively
 * ("Partially Paid" = "partially_paid" = "PartiallyPaid").
 *
 * PROVISIONAL until checked against the real values cached for the test org (see the review notes). Any status not
 * listed is NOT counted, and is reported in the Notes so it can be mapped instead of silently dropped.
 */

export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** Invoices counted as invoiced: approved and later (matches the CRM WIP report: an invoice must be approved). */
export const INVOICE_COUNTED = ["Approved", "Sent", "Viewed", "Partially Paid", "Paid", "Overdue"];
export const INVOICE_EXCLUDED = ["Draft", "Pending Approval", "Awaiting Approval", "Void", "Voided", "Declined", "Rejected", "Deleted", "Cancelled", "Canceled"];

/** POs counted as committed: approved/issued and later. */
export const PO_COUNTED = ["Approved", "Issued", "Sent", "Ordered", "Partially Received", "Received", "Billed", "Partially Billed", "Closed", "Completed"];
export const PO_EXCLUDED = ["Draft", "Pending Approval", "Awaiting Approval", "Cancelled", "Canceled", "Void", "Voided", "Declined", "Rejected", "Deleted"];

/** WOs counted as committed: approved and later. */
export const WO_COUNTED = ["Approved", "Signed", "Scheduled", "In Progress", "Started", "Completed", "Complete", "Closed", "Invoiced", "Billed"];
export const WO_EXCLUDED = ["Draft", "Pending", "Pending Approval", "Awaiting Approval", "Declined", "Rejected", "Cancelled", "Canceled", "Void", "Voided", "Deleted"];

const set = (xs: string[]) => new Set(xs.map(norm));
const RULES = {
  invoice: { counted: set(INVOICE_COUNTED), excluded: set(INVOICE_EXCLUDED) },
  po: { counted: set(PO_COUNTED), excluded: set(PO_EXCLUDED) },
  wo: { counted: set(WO_COUNTED), excluded: set(WO_EXCLUDED) },
};
export type RecordKind = keyof typeof RULES;

/** "counted" | "excluded" (known, not counted) | "unknown" (not in either list: not counted, reported). */
export function classifyStatus(kind: RecordKind, status: string | null | undefined): "counted" | "excluded" | "unknown" {
  const s = norm(status);
  if (RULES[kind].counted.has(s)) return "counted";
  if (RULES[kind].excluded.has(s) || s === "") return "excluded";
  return "unknown";
}

export const INVOICE_STATUS_NOTE = `Invoices counted: ${INVOICE_COUNTED.join(", ")}. Not counted: draft, pending approval, void/declined and deleted invoices.`;
export const COMMITTED_STATUS_NOTE = `Purchase orders counted: ${PO_COUNTED.join(", ")}. Work orders counted: ${WO_COUNTED.join(", ")}. Not counted: draft, pending, declined, cancelled and deleted orders.`;
