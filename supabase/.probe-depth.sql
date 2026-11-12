-- Probe 3 — the trigger depth during an FK referential action.
--
-- The append-only trigger must keep blocking a **direct** UPDATE (the
-- service-role key must not be able to rewrite the audit trail), but it must
-- not block Postgres's **own** `ON DELETE SET NULL` referential action.
--
-- `pg_trigger_depth()` distinguishes them: a referential action is fired by an
-- internal AFTER trigger on the referenced table, so the row-level BEFORE
-- trigger on the referencing table runs one level deeper than a user-issued
-- statement.

\echo '=== depth during a DIRECT update ==='

begin;

create or replace function public.probe_depth_check()
returns trigger
language plpgsql
as $$
begin
  raise notice 'direct update ran at depth=%', pg_trigger_depth();
  return new;
end;
$$;

drop trigger if exists probe_depth_trg on public.moderation_actions;
create trigger probe_depth_trg
  before update on public.moderation_actions
  for each row execute function public.probe_depth_check();

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values (null, '11111111-1111-1111-1111-1111111111a2', null, 'remove', 'depth probe');

update public.moderation_actions set note = note where note = 'depth probe';

rollback;

\echo ''
\echo '=== depth during the FK SET NULL referential action ==='

begin;

create or replace function public.probe_depth_check()
returns trigger
language plpgsql
as $$
begin
  raise notice 'fk action ran at depth=%', pg_trigger_depth();
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

\echo '--- deleting the referenced report fires the FK SET NULL ---'
delete from public.reports where id = '88888888-8888-4888-8888-888888888887';

\echo '--- the audit row survived with a NULL report_id ---'
select report_id is null as report_id_nulled, target_user_id is null as target_nulled
from public.moderation_actions where note = 'fk probe';

rollback;
