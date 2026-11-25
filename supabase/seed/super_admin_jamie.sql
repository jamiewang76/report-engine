-- One-off: make Jamie a Super Admin. Run AFTER Jamie has signed in once (so org_users has the user_id).
-- Looks the user up by email in org_users; fails loudly if not found or ambiguous.
do $$
declare
  uid text;
  n int;
begin
  select count(distinct user_id) into n from org_users where lower(email) = 'jamie@measuresquare.com';
  if n = 0 then raise exception 'jamie@measuresquare.com has not signed in yet'; end if;
  if n > 1 then raise exception 'multiple user_ids for jamie@measuresquare.com; insert manually'; end if;
  select distinct user_id into uid from org_users where lower(email) = 'jamie@measuresquare.com';
  insert into super_admins (user_id, email, added_by) values (uid, 'jamie@measuresquare.com', 'seed')
  on conflict (user_id) do nothing;
  raise notice 'super admin: % (%)', uid, 'jamie@measuresquare.com';
end $$;
