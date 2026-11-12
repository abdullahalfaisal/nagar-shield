-- Probe 5 — the remaining interactions that decide the shape of the fix.
--
-- Q1: does a server_side_write-mediated UPDATE fire the row trigger at depth
--     2 (like an FK referential action)? If so, `pg_trigger_depth() > 1`
--     alone is too loose as an append-only discriminator.
--
-- Q2: can an anon / authenticated client create a trigger (which would let
--     somebody fake a deeper trigger depth)?
--
-- Q3: does the purge job's profile write get refused by the
--     `profiles_update_guard` when the account is DISABLED? The guard raises
--     ACCOUNT_DISABLED on any UPDATE of a disabled profile.

\echo '=== Q1: the trigger depth of an UPDATE executed inside a function ==='

begin;

drop trigger if exists moderation_actions_append_only_trigger on public.moderation_actions;

create or replace function public.probe_depth_check()
returns trigger
language plpgsql
as $$
begin
  raise notice 'UPDATE ran at depth=%', pg_trigger_depth();
  return new;
end;
$$;

create trigger probe_depth_trg
  before update on public.moderation_actions
  for each row execute function public.probe_depth_check();

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values (null, '11111111-1111-1111-1111-1111111111a2', null, 'remove', 'depth probe');

\echo '--- UPDATE executed inside server_side_write (a function) ---'
select public.server_side_write(
  $q$update public.moderation_actions set note = 'rewritten' where note = 'depth probe'$q$
);

rollback;

\echo ''
\echo '=== Q2: can a client role create a trigger? ==='

select
  has_schema_privilege('anon', 'public', 'create') as anon_can_create,
  has_schema_privilege('authenticated', 'public', 'create') as authenticated_can_create;

\echo ''
\echo '=== Q3: is the purge blocked for a DISABLED account? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('77777777-7777-4777-8777-777777777799', 'disabled-probe@test.local',
        json_build_object('phone', '+8801711007777'));

-- The account is disabled AND soft-deleted 31 days ago — the purge candidate.
update public.profiles
   set disabled_at = now() - interval '60 days',
       deleted_at = now() - interval '31 days'
 where id = '77777777-7777-4777-8777-777777777799';

\echo '--- the purge job writes the tombstone placeholder (an ordinary UPDATE) ---'
update public.profiles
   set phone = 'purged-abcdefghijkl', email = 'purged-abcdefghijkl'
 where id = '77777777-7777-4777-8777-777777777799';

rollback;
