-- Probe 2 — the two defects, and the fix for each.
--
-- DEFECT A: deleting the Auth identity cascades to `profiles`, which cascades
-- to `reports`. The purge job's own contract says it NEVER deletes report
-- metadata. This probe proves the cascade fires.
--
-- DEFECT B: the `moderation_actions` append-only trigger blocks the FK's own
-- `ON DELETE SET NULL` action. The schema declares those FKs as SET NULL so
-- the audit trail survives, but the trigger makes the action unreachable.
--
-- The candidate fix for B is `pg_trigger_depth() > 1`: a referential action is
-- fired by an internal AFTER trigger on the referenced table, so the row-level
-- BEFORE trigger on the referencing table runs one level deeper than a
-- user-issued UPDATE.

\echo '=== DEFECT A: the auth delete cascade ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999999', 'purge-probe@test.local',
        json_build_object('phone', '+8801711009999'));

insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '99999999-9999-4999-8999-999999999998',
  '99999999-9999-4999-8999-999999999999',
  '99999999-9999-4999-8999-999999999997',
  23.7461, 90.3774, now(), 'purge probe', 'theft', 'anonymous', 'visible'
);

\echo '--- BEFORE the auth delete ---'
select
  (select count(*) from public.reports where id = '99999999-9999-4999-8999-999999999998') as report_rows,
  (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999999') as profile_rows;

delete from auth.users where id = '99999999-9999-4999-8999-999999999999';

\echo '--- AFTER the auth delete (the purge job does exactly this) ---'
select
  (select count(*) from public.reports where id = '99999999-9999-4999-8999-999999999998') as report_rows,
  (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999999') as profile_rows;

rollback;

\echo ''
\echo '=== DEFECT B: the trigger depth during an FK SET NULL ==='

begin;

-- A probe trigger that reports the depth it runs at.
create or replace function public.probe_trigger_depth()
returns trigger
language plpgsql
as $$
begin
  raise notice 'depth=%', pg_trigger_depth();
  return new;
end;
$$;

create or replace function public.probe_depth_check()
returns trigger
language plpgsql
as $$
begin
  raise notice 'depth=%', pg_trigger_depth();
  return new;
end;
$$;

drop trigger if exists probe_depth_trg on public.moderation_actions;
create trigger probe_depth_trg
  before update on public.moderation_actions
  for each row execute function public.probe_depth_check();

insert into auth.users (id, email, raw_user_meta_data)
values ('88888888-8888-4888-8888-888888888888', 'fk-probe@test.local',
        json_build_object('phone', '+8801711008888'));

insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '88888888-8888-4888-8888-888888888887',
  '88888888-8888-4888-8888-888888888888',
  '88888888-8888-4888-8888-888888888886',
  23.7461, 90.3774, now(), 'fk probe', 'theft', 'anonymous', 'visible'
);

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values ('88888888-8888-4888-8888-888888888887',
        '11111111-1111-1111-1111-1111111111a2',
        '88888888-8888-4888-8888-888888888888',
        'remove', 'fk probe');

\echo '--- a direct UPDATE (the append-only trigger must BLOCK this) ---'
update public.moderation_actions set note = note where note = 'fk probe';

\echo '--- now delete the referenced report: the FK SET NULL fires ---'
delete from public.reports where id = '88888888-8888-4888-8888-888888888887';

rollback;
