-- Run in the Supabase SQL editor after migration 0004. Returns one row per check; every row should say PASS.
-- The test rows are inserted inside a plpgsql sub-transaction that is always rolled back, so nothing is left behind
-- (which matters: report_events is insert-only, so a leftover test row could never be deleted).
create or replace function pg_temp.check_report_events_immutable()
returns table (check_name text, result text)
language plpgsql as $$
declare
  out text[] := '{}';
  op text;
begin
  begin
    insert into organizations (org_id, name) values ('__test_org__', 'Test') on conflict do nothing;
    insert into report_events (org_id, user_id, action) values ('__test_org__', '__test__', 'view');

    foreach op in array array['UPDATE', 'DELETE', 'TRUNCATE'] loop
      begin
        if op = 'UPDATE' then update report_events set action = 'export_xlsx' where user_id = '__test__';
        elsif op = 'DELETE' then delete from report_events where user_id = '__test__';
        else truncate report_events;
        end if;
        out := out || (op || '|FAIL: allowed');
      exception when insufficient_privilege then
        out := out || (op || '|PASS: blocked');
      end;
    end loop;

    raise exception 'rollback_test_rows';
  exception when others then
    if sqlerrm <> 'rollback_test_rows' then raise; end if;
  end;

  return query select split_part(x, '|', 1), split_part(x, '|', 2) from unnest(out) as x
    union all
    select 'no test rows left behind',
           case when exists (select 1 from report_events where user_id = '__test__')
                  or exists (select 1 from organizations where org_id = '__test_org__')
                then 'FAIL: test rows remain' else 'PASS' end;
end;
$$;

select * from pg_temp.check_report_events_immutable();
