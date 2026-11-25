/** Subsets of CRM API DTOs (from crm11api swagger v1, 2026-11-25). Only fields the reports use. */

export type PageResult<T> = {
  data: T[];
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
};

/** GET /api/Deals -> DealPageResultDto.data (list fields) */
export type DealListItem = {
  id: string;
  name: string;
  jobNumber?: string | null;
  amount?: number | null;
  closingDateTime?: string | null;
  pipelineId?: string | null;
  pipeline?: { id: string; name: string } | null;
  stageId?: string | null;
  stage?: { id: string; name: string } | null;
  ownerId?: string | null;
  account?: { id: string; name: string } | null;
  createdOn: string;
  lastUpdatedOn?: string | null;
};

/** GET /api/Deals/{id} -> DealDto (detail fields used by reports) */
export type DealDetail = DealListItem & {
  wonDate?: string | null;
  lostDate?: string | null;
  closedDate?: string | null;
  isClosed?: boolean;
  expectedWinDate?: string | null;
  bidDueDateTime?: string | null;
  winProbability?: number | null;
  estimatorId?: string | null;
  estimatorName?: string | null;
  ownerName?: string | null;
  labels?: unknown[] | null;
  customFields?: unknown[] | null;
  contractPreTaxTotal?: number | null;
  contractTotal?: number | null;
  contractTotalWithChangeOrder?: number | null;
  materialCostAmount?: number | null;
  laborCostAmount?: number | null;
  otherCostAmount?: number | null;
};

/** GET /api/Invoices -> PageResultDto<InvoiceSummary> */
export type InvoiceSummary = {
  id: string;
  number: string;
  amount: number;
  preTaxTotal: number;
  paidAmount: number;
  status: string | number;
  dealName?: string | null;
  dealJobNumber?: string | null;
  accountName?: string | null;
  dueDate?: string | null;
  date?: string | null;
  createdOn: string;
  isDeposit?: boolean;
  appliedCreditNoteAmount?: number | null;
};

/** GET /api/Invoices/{id} -> InvoiceDto (extra fields needed for retainage + tax) */
export type InvoiceDetail = InvoiceSummary & {
  dealId?: string | null;
  taxAmount?: number | null;
  retainage?: number | boolean | null;
  retainageAmount?: number | null;
  retainagePercent?: number | null;
  retainageDueDate?: string | null;
  paymentTerm?: string | { id?: string; name?: string } | null;
  lastUpdatedOn?: string | null;
};
