-- Probe 4 — the trigger depth during a direct UPDATE vs an FK referential action.
--
-- The append-only trigger is dropped for the duration of this probe so the
-- depth numbers are observable; the transaction rolls back, so the trigger is
-- restored with it.

\echo '=== depth during a DIRECT update ==='

begin;

drop trigger if exists moderation_actions_append_only_trigger on public.moderation_actions;

create or replace function public.probe_depth_check()
returns trigger
language plpgsql
as $$
begin
  raise notice 'DIRECT update ran at depth=%', pg_trigger_depth();
  return new;
end;
$$;

create trigger probe_depth_trg
  before update on public.moderation_actions
  for each row execute function public.probe_depth_check();

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values (null, '11111111-1111-1111-1111-1111111111a2', null, 'remove', 'depth probe');

update public.moderation_actions set note = 'direct' where note = 'depth probe';

rollback;

\echo ''
\echo '=== depth during the FK SET NULL referential action ==='

begin;

drop trigger if exists moderation_actions_append_only_trigger on public.moderation_actions;

create or replace function public.probe_depth_check()
returns trigger
language plpgsql
as $$
begin
  raise notice 'FK action ran at depth=%', pg_trigger_depth();
  return new;
end;
$$;

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

\echo '--- deleting the referenced report fires the FK SET NULL ---'
delete from public.reports where id = '88888888-8888-4888-8888-888888888887';

\echo '--- the audit row survived with a NULL report_id ---'
select report_id is null as report_id_nulled, target_user_id is null as target_nulled
from public.moderation_actions where note = 'fk probe';

rollback;
