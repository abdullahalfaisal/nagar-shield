-- Verify 4 — is the moderator's direct UPDATE a pre-existing limitation or a
-- regression from migration 017?
--
-- The test compares the CURRENT guard against the PREVIOUS guard, in the same
-- session, so the only variable is the guard itself.
--
-- Q1: with the CURRENT guard, can a moderator update `disabled_at` on another
--     account? (The earlier run reported UPDATE 0.)
-- Q2: with the PREVIOUS guard (restored temporarily), can they? If the answer
--     is the same, the UPDATE 0 is pre-existing RLS behaviour and not a
--     regression.
-- Q3: does the DOCUMENTED moderator path — the `disable_user` RPC — still
--     work? That is the path the admin console actually uses.

\echo '=== Q1: the CURRENT guard, the moderator updates another account ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999903', 'target@test.local',
        json_build_object('phone', '+8801711009903'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111111a2","role":"authenticated"}';

select 'is_moderator()' as probe, public.is_moderator()::text as value;

update public.profiles
   set disabled_at = now()
 where id = '99999999-9999-4999-8999-999999999903';

select 'Q1: the row was updated' as test,
       (select disabled_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999903') as passed;

\echo '--- is the target row visible to the moderator at all? ---'
select 'the moderator can read the target' as test,
       count(*) = 1 as passed
  from public.profiles
 where id = '99999999-9999-4999-8999-999999999903';

reset role;

rollback;

\echo ''
\echo '=== Q2: the PREVIOUS guard, the same statement ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999903', 'target@test.local',
        json_build_object('phone', '+8801711009903'));

-- Restore the pre-017 guard for the duration of this test.
create or replace function public.profiles_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.server_side_write', true), 'off') = 'on' then
    return new;
  end if;

  if old.disabled_at is not null then
    raise exception 'ACCOUNT_DISABLED' using errcode = '42501';
  end if;
  return new;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111111a2","role":"authenticated"}';

update public.profiles
   set disabled_at = now()
 where id = '99999999-9999-4999-8999-999999999903';

select 'Q2: the row was updated under the OLD guard too' as test,
       (select disabled_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999903') as passed;

reset role;

rollback;

\echo ''
\echo '=== Q3: the DOCUMENTED moderator path — the disable_user RPC ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999903', 'target@test.local',
        json_build_object('phone', '+8801711009903'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111111a2","role":"authenticated"}';

select public.disable_user(
  '99999999-9999-4999-8999-999999999903',
  'verified moderator path'
) ->> 'status' as status;

select 'Q3: the RPC disabled the account' as test,
       (select disabled_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999903') as passed;

select 'Q3b: the RPC wrote the audit row' as test,
       (select count(*) from public.moderation_actions
         where target_user_id = '99999999-9999-4999-8999-999999999903'
           and decision = 'disable_user') = 1 as passed;

reset role;

rollback;
