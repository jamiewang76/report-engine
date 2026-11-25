-- Display names for the org switcher / profile menu.
alter table connections add column if not exists user_name text;
alter table connections add column if not exists org_name text;

create index if not exists connections_user on connections (user_id) where not revoked;
create index if not exists sync_runs_org_started on sync_runs (org_id, started_at desc);
