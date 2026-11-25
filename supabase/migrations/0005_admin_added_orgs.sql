-- Let Super Admins add an organization (found via CRM org search) and assign reports BEFORE anyone from it signs in.
-- first_seen_at / last_seen_at stay "first/last sign-in": null until the first sign-in.
-- Does not modify existing rows.
alter table organizations alter column first_seen_at drop not null;
alter table organizations alter column last_seen_at drop not null;
alter table organizations add column if not exists added_by text;        -- Super Admin user_id, when added from the console
alter table organizations add column if not exists added_at timestamptz;

-- Recreate the overview with the new columns (same security_invoker / no-anon rules as 0004).
drop view if exists admin_org_overview;
create view admin_org_overview with (security_invoker = true) as
select
  o.org_id,
  o.name,
  o.first_seen_at,
  o.last_seen_at,
  o.added_by,
  o.added_at,
  (select count(*) from report_assignments a where a.org_id = o.org_id and a.revoked_at is null) as active_reports,
  (select max(s.finished_at) from sync_runs s where s.org_id = o.org_id and s.status = 'ok')    as last_sync_at,
  (select max(e.created_at) from report_events e where e.org_id = o.org_id and e.action = 'export_xlsx') as last_export_at,
  (select count(*) from org_users u where u.org_id = o.org_id)                                   as user_count
from organizations o;
revoke all on admin_org_overview from anon, authenticated;
