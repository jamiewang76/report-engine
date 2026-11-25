-- Run in the Supabase SQL editor after migration 0004. Everything runs in a transaction and is rolled back.
-- Expected output: three NOTICE lines ending in "blocked as expected", and no rows left behind.
begin;
insert into organizations (org_id, name) values ('__test_org__', 'Test') on conflict do nothing;
insert into report_events (org_id, user_id, action) values ('__test_org__', '__test__', 'view');
do $$ begin
  begin update report_events set action = 'export_xlsx' where user_id = '__test__';
        raise exception 'UPDATE was allowed';
  exception when insufficient_privilege then raise notice 'UPDATE blocked as expected'; end;
  begin delete from report_events where user_id = '__test__';
        raise exception 'DELETE was allowed';
  exception when insufficient_privilege then raise notice 'DELETE blocked as expected'; end;
  begin truncate report_events;
        raise exception 'TRUNCATE was allowed';
  exception when insufficient_privilege then raise notice 'TRUNCATE blocked as expected'; end;
end $$;
rollback;
