/**
 * Deep links back to MeasureSquare CRM (opened in a new tab).
 * Job URL format confirmed: https://crm.measuresquare.com/crm/sales/deals/{dealId}
 * TODO(crm-urls): invoice and PO detail routes in the CRM front end are not confirmed yet. Until they are, invoice and
 * PO numbers link to their job. Fill these in (and their tests) once the routes are known.
 */
export const CRM_WEB = "https://crm.measuresquare.com";

export const jobUrl = (dealId: string | null | undefined) => (dealId ? `${CRM_WEB}/crm/sales/deals/${encodeURIComponent(dealId)}` : null);

export const invoiceUrl = (_invoiceId: string | null | undefined, dealId: string | null | undefined) => jobUrl(dealId);

export const purchaseOrderUrl = (_poId: string | null | undefined, dealId: string | null | undefined) => jobUrl(dealId);
