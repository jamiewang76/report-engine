-- 0007: Monthly Financial Summary data (invoice tax/deposit fields, purchase orders, work orders)
-- and a fix for CRM money scale: the CRM API returns money as integer CENTS (swagger: int64; confirmed by the
-- qk_turn_mf app, which divides WO amounts by 100). Cached money columns were stored 100x too large.
-- Cache only; nothing in the CRM changes. Safe to re-run: every backfill recomputes from the cached raw JSON.

-- ---------- 1. Money backfill: recompute cached money columns from raw (cents -> dollars) ----------
update invoices set
  amount           = (raw->>'amount')::numeric / 100,
  pre_tax_total    = (raw->>'preTaxTotal')::numeric / 100,
  tax_amount       = (raw->>'taxAmount')::numeric / 100,
  paid_amount      = (raw->>'paidAmount')::numeric / 100,
  credit_applied   = (raw->>'appliedCreditNoteAmount')::numeric / 100,
  retainage_amount = (raw->>'retainageAmount')::numeric / 100
where jsonb_typeof(raw->'amount') = 'number';

update deals set
  contract_total         = (raw->>'contractTotal')::numeric / 100,
  contract_total_with_co = (raw->>'contractTotalWithChangeOrder')::numeric / 100,
  material_cost          = (raw->>'materialCostAmount')::numeric / 100,
  labor_cost             = (raw->>'laborCostAmount')::numeric / 100,
  other_cost             = (raw->>'otherCostAmount')::numeric / 100
where raw ? 'contractTotal' or raw ? 'materialCostAmount';

-- ---------- 2. Invoices: new fields from the invoice detail ----------
alter table invoices add column if not exists last_updated_on timestamptz;
alter table invoices add column if not exists tax_name text;
alter table invoices add column if not exists tax_rate numeric;
alter table invoices add column if not exists deposit_invoiced_amount numeric;
alter table invoices add column if not exists sov_id text;
alter table invoices add column if not exists bid_id text;
alter table invoices add column if not exists change_order_id text;

update invoices set
  last_updated_on         = nullif(raw->>'lastUpdatedOn', '')::timestamptz,
  tax_name                = nullif(raw->>'taxName', ''),
  tax_rate                = (raw->>'taxRate')::numeric,
  deposit_invoiced_amount = (raw->>'depositInvoicedAmount')::numeric / 100,
  sov_id                  = nullif(raw->>'sovId', ''),
  bid_id                  = nullif(raw->>'bidId', ''),
  change_order_id         = nullif(raw->>'changeOrderId', '');

create index if not exists invoices_org_date on invoices (org_id, invoice_date);

-- ---------- 3. Purchase orders (GET /api/PurchaseOrders, list summary) ----------
create table if not exists purchase_orders (
  org_id text not null,
  id text not null,
  number text,
  status text,
  category text,
  vendor_id text,
  vendor_name text,
  vendor_ref_number text,
  deal_id text,
  deal_name text,
  job_number text,
  account_name text,
  owner_name text,
  order_date timestamptz,      -- orderDateTime
  ship_date date,
  po_date date,                -- "date"
  amount numeric,              -- dollars (API cents / 100)
  pre_tax_total numeric,
  created_on timestamptz,
  last_updated_on timestamptz,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (org_id, id)
);
create index if not exists purchase_orders_org_order_date on purchase_orders (org_id, order_date);

-- ---------- 4. Work orders (GET /api/WorkOrders, list summary) ----------
create table if not exists work_orders (
  org_id text not null,
  id text not null,
  number text,
  status text,
  type text,
  contractor_id text,
  contractor_name text,        -- contractor / installer
  installer_type text,
  deal_id text,
  deal_name text,
  job_number text,
  account_name text,
  owner_name text,
  order_date date,
  start_date_time timestamptz,
  end_date_time timestamptz,
  amount numeric,              -- dollars (API cents / 100)
  pre_tax_total numeric,
  created_on timestamptz,
  last_updated_on timestamptz,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (org_id, id)
);
create index if not exists work_orders_org_order_date on work_orders (org_id, order_date);

-- Same pattern as 0001: RLS on; the app reads with the service role and always filters by org_id (forOrg()).
alter table purchase_orders enable row level security;
alter table work_orders enable row level security;
drop policy if exists purchase_orders_same_org on purchase_orders;
drop policy if exists work_orders_same_org on work_orders;
create policy purchase_orders_same_org on purchase_orders for select using (org_id = (auth.jwt() ->> 'org_id'));
create policy work_orders_same_org on work_orders for select using (org_id = (auth.jwt() ->> 'org_id'));
