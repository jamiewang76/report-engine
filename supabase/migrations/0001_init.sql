-- Report Engine: cache of CRM data per customer organization.
-- Every table carries org_id. RLS is ON everywhere; the app's server uses the service role and
-- always filters by org_id (see src/lib/db.ts forOrg). The policies below are the second wall,
-- in case anything ever queries Supabase with a user-scoped JWT carrying an `org_id` claim.

create table if not exists connections (
  org_id text not null,
  user_id text not null,
  email text,
  refresh_token_enc text not null,          -- AES-256-GCM, key in TOKEN_ENCRYPTION_KEY (never stored here)
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists deals (
  org_id text not null,
  id text not null,
  name text,
  job_number text,
  pipeline_name text,
  stage_name text,
  owner_name text,
  estimator_name text,
  account_name text,
  created_on timestamptz,
  bid_due_at timestamptz,
  closing_date timestamptz,
  expected_win_date timestamptz,
  won_date timestamptz,
  lost_date timestamptz,
  closed_date timestamptz,
  is_closed boolean,
  win_probability numeric,
  contract_total numeric,
  contract_total_with_co numeric,
  material_cost numeric,
  labor_cost numeric,
  other_cost numeric,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table if not exists invoices (
  org_id text not null,
  id text not null,
  deal_id text,
  number text,
  deal_name text,
  job_number text,
  account_name text,
  status text,
  invoice_date timestamptz,
  due_date timestamptz,
  amount numeric,
  pre_tax_total numeric,
  tax_amount numeric,
  paid_amount numeric,
  credit_applied numeric,
  retainage_amount numeric,
  retainage_due_date timestamptz,
  is_deposit boolean,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table if not exists sync_runs (
  id bigserial primary key,
  org_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',   -- running | ok | error
  counts jsonb,
  error text
);

create index if not exists deals_org_won on deals (org_id, won_date);
create index if not exists invoices_org_due on invoices (org_id, due_date);

alter table connections enable row level security;
alter table deals enable row level security;
alter table invoices enable row level security;
alter table sync_runs enable row level security;

-- connections: no policy at all => only the service role can read (refresh tokens never leave the server).
create policy deals_same_org on deals for select using (org_id = (auth.jwt() ->> 'org_id'));
create policy invoices_same_org on invoices for select using (org_id = (auth.jwt() ->> 'org_id'));
create policy sync_runs_same_org on sync_runs for select using (org_id = (auth.jwt() ->> 'org_id'));
