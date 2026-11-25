-- Report access control, Super Admins, and activity log.
-- Adds new tables only; does not modify or delete existing data.
-- All access goes through the app server (service role). RLS is enabled with NO policies on every table below,
-- so nothing is readable or writable with anon/user-scoped keys. The service role bypasses RLS, so the
-- insert-only guarantee on report_events is enforced by triggers (which the service role cannot bypass).

-- Organizations: created automatically on id4 sign-in (and on a successful org switch). Never added by hand.
create table if not exists organizations (
  org_id        text primary key,                 -- CRM org id from the token (currentOrganizationId)
  name          text not null,                    -- token claim, else CRM org list, else org id; refreshed on sign-in
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists org_users (
  org_id        text not null references organizations (org_id),
  user_id       text not null,                    -- id4 `sub`
  email         text,
  name          text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Which reports each org can see. Rows are never deleted: revoking sets revoked_at, re-assigning inserts a new row.
create table if not exists report_assignments (
  id          bigint generated always as identity primary key,
  org_id      text not null references organizations (org_id),
  report_id   text not null,                      -- id from src/lib/reports/registry.ts
  config      jsonb not null default '{}'::jsonb, -- validated against the report's configSchema by the app
  assigned_by text not null,                      -- Super Admin user_id
  assigned_at timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  text,
  constraint report_assignments_revoked_pair check ((revoked_at is null) = (revoked_by is null))
);
-- At most one active assignment per (org, report).
create unique index if not exists report_assignments_active_uniq
  on report_assignments (org_id, report_id) where revoked_at is null;
create index if not exists report_assignments_org_active
  on report_assignments (org_id) where revoked_at is null;

-- Activity log. Insert-only.
create table if not exists report_events (
  id         bigint generated always as identity primary key,
  org_id     text,                                -- null for admin-console-wide actions (e.g. activity CSV export)
  user_id    text not null,
  user_email text,
  report_id  text,
  action     text not null check (action in (
               'view', 'export_xlsx', 'view_empty',
               'admin_assign', 'admin_revoke', 'admin_config_change', 'admin_export_activity')),
  params     jsonb not null default '{}'::jsonb,  -- as-of / date range / filters; before/after config for admin_*
  row_count  integer,
  created_at timestamptz not null default now()
);
create index if not exists report_events_org_created    on report_events (org_id, created_at desc);
create index if not exists report_events_report_created on report_events (report_id, created_at desc);
create index if not exists report_events_created        on report_events (created_at desc);

create or replace function report_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'report_events is insert-only (% blocked)', tg_op using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists report_events_no_update_delete on report_events;
create trigger report_events_no_update_delete
  before update or delete on report_events
  for each row execute function report_events_immutable();

drop trigger if exists report_events_no_truncate on report_events;
create trigger report_events_no_truncate
  before truncate on report_events
  for each statement execute function report_events_immutable();

-- Super Admins: source of truth. Email domain alone never grants access.
create table if not exists super_admins (
  user_id  text primary key,                      -- id4 `sub`
  email    text,
  added_by text not null,
  added_at timestamptz not null default now()
);

alter table organizations      enable row level security;
alter table org_users          enable row level security;
alter table report_assignments enable row level security;
alter table report_events      enable row level security;
alter table super_admins       enable row level security;
-- Intentionally no policies: deny all for non-service-role access (including any update/delete on report_events).

-- Admin console overview: one row per org. security_invoker so it never widens access beyond the caller's own
-- rights (only the service role can see anything, since the tables above have RLS with no policies).
create or replace view admin_org_overview with (security_invoker = true) as
select
  o.org_id,
  o.name,
  o.first_seen_at,
  o.last_seen_at,
  (select count(*) from report_assignments a where a.org_id = o.org_id and a.revoked_at is null) as active_reports,
  (select max(s.finished_at) from sync_runs s where s.org_id = o.org_id and s.status = 'ok')    as last_sync_at,
  (select max(e.created_at) from report_events e where e.org_id = o.org_id and e.action = 'export_xlsx') as last_export_at,
  (select count(*) from org_users u where u.org_id = o.org_id)                                   as user_count
from organizations o;
revoke all on admin_org_overview from anon, authenticated;
