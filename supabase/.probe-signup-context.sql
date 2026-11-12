-- Probe — what does the insert guard SEE during a real signup?
--
-- The signup path is: GoTrue inserts into `auth.users`, the
-- `handle_new_user` trigger fires, and that trigger inserts the profile row.
-- The insert guard then fires on that row.
--
-- The guard decides "client or server" from the `role` GUC. This probe
-- records what that GUC actually reads at that moment, by attaching a
-- recording trigger to `auth.users` — the same point in the flow.

begin;

create or replace function public.probe_record_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise notice 'SIGNUP CONTEXT: role_guc=[%] current_user=[%] session_user=[%] auth_uid=[%]',
    current_setting('role', true), current_user, session_user, auth.uid();
  return new;
end;
$$;

create trigger probe_signup_trg
  after insert on auth.users
  for each row execute function public.probe_record_signup();

\echo '--- the signup insert, exactly as GoTrue makes it ---'
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111401', 'ctx@test.local',
        json_build_object('phone', '+8801711000401'));

\echo ''
\echo '--- and the seed-style insert (a moderator grant, as migration 010 does) ---'
update public.profiles set role = 'moderator' where id = '11111111-1111-1111-1111-111111111401';

select 'the role was set to moderator' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-111111111401') = 'moderator' as passed;

rollback;
