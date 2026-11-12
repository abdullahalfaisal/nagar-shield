-- Probe 7 — the decisive measurements for the DEFECT B fix.
--
-- Q1: at what `pg_trigger_depth()` does Postgres fire the referencing table's
--     row trigger during an `ON DELETE SET NULL` referential action?
--     The append-only trigger is dropped for the measurement, because it
--     would otherwise abort before the probe trigger can report.
--
-- Q2: can `service_role` create a trigger on `public.moderation_actions`?
--     If so, a depth-based bypass would be forgeable and the fix must also
--     constrain *which* columns a deep write may touch.
--
-- Q3: the real constraint name of `profiles.id -> auth.users`.

\echo '=== Q1: the trigger depth of an ON DELETE SET NULL referential action ==='

begin;

drop trigger if exists moderation_actions_append_only_trigger on public.moderation_actions;

create or replace function public.probe_depth_fk()
returns trigger
language plpgsql
as $$
begin
  raise notice 'REFERENTIAL ACTION ran at depth=%', pg_trigger_depth();
  return new;
end;
$$;

create trigger probe_depth_fk_trg
  before update on public.moderation_actions
  for each row execute function public.probe_depth_fk();

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

\echo '--- DELETE the referenced report: the FK fires ON DELETE SET NULL ---'
delete from public.reports where id = '88888888-8888-4888-8888-888888888887';

\echo '--- the audit row survived, with its FK columns nulled ---'
select report_id is null as report_id_nulled,
       target_user_id is null as target_nulled,
       note as note_preserved
  from public.moderation_actions
 where note = 'fk probe';

rollback;

\echo ''
\echo '=== Q2: can service_role forge a deeper trigger? ==='

select
  has_schema_privilege('service_role', 'public', 'create') as service_role_can_create,
  pg_get_userbyid(relowner) as moderation_actions_owner
  from pg_class
 where oid = 'public.moderation_actions'::regclass;

\echo ''
\echo '=== Q3: the real constraint name of profiles.id -> auth.users ==='

select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.profiles'::regclass
 order by conname;
