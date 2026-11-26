/**
 * Deep links back to MeasureSquare CRM (opened in a new tab). Formats confirmed by Jamie (2026-11-25):
 *   Job:            https://crm.measuresquare.com/crm/sales/deals/{dealId}
 *   Invoice:        https://crm.measuresquare.com/crm/sales/invoices/{invoiceId}
 *   Purchase order: https://crm.measuresquare.com/crm/purchases/purchaseOrders/{poId}
 * Invoice/PO links fall back to the job only when the record id is missing.
 */
export const CRM_WEB = "https://crm.measuresquare.com";

const link = (path: string, id: string | null | undefined) => (id ? `${CRM_WEB}${path}/${encodeURIComponent(id)}` : null);

export const jobUrl = (dealId: string | null | undefined) => link("/crm/sales/deals", dealId);

export const invoiceUrl = (invoiceId: string | null | undefined, dealId?: string | null) => link("/crm/sales/invoices", invoiceId) ?? jobUrl(dealId);

export const purchaseOrderUrl = (poId: string | null | undefined, dealId?: string | null) => link("/crm/purchases/purchaseOrders", poId) ?? jobUrl(dealId);
