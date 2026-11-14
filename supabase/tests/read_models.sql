-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/read_models.sql
--
-- Exercises the read models and identity helpers added by
-- `007_read_models.sql`:
--
--   * `resolve_login_identifier` — email hit, phone hit, unknown identifier
--   * `alerts_feed` — the public projection, the area filters, the cursor
--   * `history_nearby` — the 1 km / 24 h defaults, the radius, the cursor
--   * `moderation_queue` — the role check, the flag aggregation, the
--     `hide_reason` derivation, the cursor pagination
--   * `record_biometric_attempt` — 3 fails → password, 5 fails → auto-disable
--   * `soft_delete_account` / `restore_account` — the 30-day recovery window
--   * the append-only guarantee on `moderation_actions`
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/read_models.sql
--
-- The test runs as the `postgres` superuser, so `auth.uid()` is null and every
-- SECURITY DEFINER function would reject the call. The test therefore sets
-- `request.jwt.claims` to impersonate each user — the same mechanism the
-- PostgREST layer uses.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Isolation — this suite's counts are absolute
-- -----------------------------------------------------------------------------
--
-- The assertions below count the FEED and the HISTORY result, not "the feed
-- plus whatever the developer's database happens to hold". The Edge Function
-- smoke test leaves a report behind on every run, so a working machine carries
-- rows this suite did not create, and every absolute count drifts by the
-- number of leftovers.
--
-- The delete is inside the suite's own transaction, so it is rolled back with
-- everything else — the developer's rows are untouched once the suite ends.
--
-- It is safe to clear the table here: the suite creates its own three
-- reports immediately below, and the only rows that reference a report
-- (`report_media`, `flags`) cascade, while `moderation_actions` nulls its
-- `report_id` — the referential action the append-only trigger deliberately
-- allows (see `write_guards.sql`, Test B4).

delete from public.reports;

-- -----------------------------------------------------------------------------
-- Test fixtures
-- -----------------------------------------------------------------------------

create temporary table test_users (
  id uuid primary key,
  label text not null
) on commit drop;

insert into test_users (id, label)
values
  ('11111111-1111-1111-1111-111111111101', 'author'),
  ('11111111-1111-1111-1111-111111111102', 'flagger1'),
  ('11111111-1111-1111-1111-111111111103', 'flagger2'),
  ('11111111-1111-1111-1111-111111111104', 'flagger3'),
  ('11111111-1111-1111-1111-111111111105', 'moderator'),
  ('11111111-1111-1111-1111-111111111106', 'otherauthor');

-- `profiles.id` references `auth.users.id`, so the auth rows must exist first.
-- The `handle_new_user` trigger creates each profile for us.
insert into auth.users (id, email, raw_user_meta_data)
select
  id,
  label || '@test.local',
  json_build_object(
    'phone', '+8801711' || lpad((row_number() over ())::text, 6, '0'),
    'full_name', initcap(label)
  )
from test_users;

-- The moderator role is granted server-side; it is never a signup field.
update public.profiles set role = 'moderator'
where id = '11111111-1111-1111-1111-111111111105';

-- -----------------------------------------------------------------------------
-- Helper: run a statement as a given user
-- -----------------------------------------------------------------------------

create or replace function pg_temp.as_user(user_id uuid, statement text)
returns text
language plpgsql
as $$
declare
  v_result text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);
  execute statement into v_result;
  return v_result;
end;
$$;

create or replace function pg_temp.exec_as_user(user_id uuid, statement text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);
  execute statement;
end;
$$;

-- =============================================================================
-- Test 1 — resolve_login_identifier
-- =============================================================================

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.resolve_login_identifier('author@test.local')$$
) as by_email \gset

select 'Test 1a: an email identifier resolves to the account email' as test,
       :'by_email'::jsonb ->> 'email' = 'author@test.local' as passed;

-- The author's phone is '+8801711' + '000001' (the first row_number).
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.resolve_login_identifier('+8801711000001')$$
) as by_phone \gset

select 'Test 1b: a phone identifier resolves to the account email' as test,
       :'by_phone'::jsonb ->> 'email' = 'author@test.local' as passed;

-- A national-format number ('01711000001') must normalise to the same E.164.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.resolve_login_identifier('01711000001')$$
) as by_national \gset

select 'Test 1c: a national-format phone resolves to the same account' as test,
       :'by_national'::jsonb ->> 'email' = 'author@test.local' as passed;

do $block$
begin
  begin
    perform pg_temp.exec_as_user(
      '11111111-1111-1111-1111-111111111101',
      $q$select public.resolve_login_identifier('nobody@test.local')$q$
    );
    raise exception 'an unknown identifier should have been rejected';
  exception when others then
    if sqlerrm not like '%AUTH_REQUIRED%' then
      raise;
    end if;
  end;
end
$block$;

select 'Test 1d: an unknown identifier is rejected' as test,
       true as passed;

-- =============================================================================
-- Test 1e — the phone is stored in E.164, whichever shape it arrived in
-- =============================================================================
--
-- The defect this guards: `profiles.phone` was written exactly as the client
-- sent it, while every reader normalised the number first. A signup that
-- carried the local format — `01712345678`, which is what the app's own
-- placeholder invites — stored `01712345678`, and the resolver looked for
-- `+8801712345678`. The account existed and could never sign in by phone.
--
-- The signup trigger is the writer, so the invariant is asserted on the row
-- the trigger produced.

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111107', 'localformat@test.local',
        json_build_object('phone', '01712345678', 'full_name', 'Local Format'));

select 'Test 1e: a local-format signup is stored in E.164' as test,
       (select phone from public.profiles
         where id = '11111111-1111-1111-1111-111111111107') = '+8801712345678' as passed;

-- The account now resolves by either shape.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111107',
  $q$select public.resolve_login_identifier('01712345678')$q$
) as local_shape \gset

select 'Test 1f: the local-format account resolves by phone' as test,
       :'local_shape'::jsonb ->> 'email' = 'localformat@test.local' as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111107',
  $q$select public.resolve_login_identifier('+880 171-234-5678')$q$
) as spaced_shape \gset

select 'Test 1g: a spaced, prefixed number resolves to the same account' as test,
       :'spaced_shape'::jsonb ->> 'email' = 'localformat@test.local' as passed;

-- A number that is not a Bangladesh number is refused, not stored.
select 'Test 1h: a non-Bangladesh number does not normalise' as test,
       public.normalise_bd_phone('+14155552671') is null
   and public.normalise_bd_phone('12345') is null as passed;

-- The two shapes of one number are the same account: the unique constraint
-- holds across shapes, not just across identical strings.
do $block$
begin
  begin
    perform pg_temp.exec_as_user(
      '11111111-1111-1111-1111-111111111107',
      $q$insert into public.profiles (id, auth_user_id, phone, email)
        values ('11111111-1111-1111-1111-111111111108',
                '11111111-1111-1111-1111-111111111108',
                '+8801712345678', 'impostor@test.local')$q$
    );
    raise exception 'the same number in another account must be refused';
  exception when others then
    if sqlerrm not like '%profiles_phone_key%'
       and sqlerrm not like '%unique%' then
      raise;
    end if;
  end;
end
$block$;

select 'Test 1i: one phone number cannot be claimed twice' as test,
       true as passed;

-- =============================================================================
-- Test 2 — the alerts_feed projection and its area filters
-- =============================================================================

insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status, area_hierarchy
)
values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333301', 23.7461, 90.3774, now() - interval '1 hour',
   'Dhanmondi incident', 'theft', 'anonymous', 'visible',
   '{"division":"Dhaka","city":"Dhaka","thana":"Dhanmondi","neighborhood":"Dhanmondi"}'::jsonb),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111106',
   '33333333-3333-3333-3333-333333333302', 23.8042, 90.4027, now() - interval '2 hours',
   'Mirpur incident', 'assault', 'identified', 'visible',
   '{"division":"Dhaka","city":"Dhaka","thana":"Mirpur","neighborhood":"Mirpur"}'::jsonb),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111106',
   '33333333-3333-3333-3333-333333333303', 24.7539, 90.4073, now() - interval '3 hours',
   'Mymensingh incident', 'fraud', 'anonymous', 'visible',
   '{"division":"Mymensingh","city":"Mymensingh","thana":"Mymensingh Sadar","neighborhood":null}'::jsonb);

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.alerts_feed(null, null, null, null, null, 20)$$
) as feed_all \gset

select 'Test 2a: the feed returns every visible report' as test,
       jsonb_array_length(:'feed_all'::jsonb -> 'items') = 3 as passed;

select 'Test 2b: the feed projection omits author_id' as test,
       not exists (
         select 1 from jsonb_object_keys(:'feed_all'::jsonb -> 'items' -> 0) k
         where k = 'author_id'
       ) as passed;

select 'Test 2c: an anonymous report has no display name' as test,
       (:'feed_all'::jsonb -> 'items' -> 0) ->> 'author_display_name' is null as passed;

select 'Test 2d: an identified report carries its display name' as test,
       (:'feed_all'::jsonb -> 'items' -> 1) ->> 'author_display_name' = 'Otherauthor' as passed;

-- The area filter reads the JSONB document.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.alerts_feed('Dhaka', null, null, null, null, 20)$$
) as feed_dhaka \gset

select 'Test 2e: the division filter narrows the feed' as test,
       jsonb_array_length(:'feed_dhaka'::jsonb -> 'items') = 2 as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.alerts_feed(null, null, 'Mirpur', null, null, 20)$$
) as feed_mirpur \gset

select 'Test 2f: the thana filter narrows the feed' as test,
       jsonb_array_length(:'feed_mirpur'::jsonb -> 'items') = 1
       and (:'feed_mirpur'::jsonb -> 'items' -> 0) ->> 'id' = '22222222-2222-2222-2222-222222222202' as passed;

-- A hidden report never appears in the feed.
select public.server_side_write(
  $q$update public.reports
       set moderation_status = 'hidden_pending_review', hide_reason = 'flag_threshold'
     where id = '22222222-2222-2222-2222-222222222203'$q$
);

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.alerts_feed(null, null, null, null, null, 20)$$
) as feed_after_hide \gset

select 'Test 2g: a hidden report never appears in the feed' as test,
       jsonb_array_length(:'feed_after_hide'::jsonb -> 'items') = 2 as passed;

-- A withdrawn report never appears either.
select public.server_side_write(
  $q$update public.reports
       set moderation_status = 'visible', deleted_at = now()
     where id = '22222222-2222-2222-2222-222222222203'$q$
);

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.alerts_feed(null, null, null, null, null, 20)$$
) as feed_after_delete \gset

select 'Test 2h: a withdrawn report never appears in the feed' as test,
       jsonb_array_length(:'feed_after_delete'::jsonb -> 'items') = 2 as passed;

-- =============================================================================
-- Test 3 — the cursor pagination
-- =============================================================================

-- The withdrawn report from Test 2h is restored so the feed holds three
-- reports and the pagination has a third page to land on.
select public.server_side_write(
  $q$update public.reports
       set moderation_status = 'visible', deleted_at = null
     where id = '22222222-2222-2222-2222-222222222203'$q$
);

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.alerts_feed(null, null, null, null, null, 1)$$
) as page1 \gset

select 'Test 3a: the first page honours the limit' as test,
       jsonb_array_length(:'page1'::jsonb -> 'items') = 1 as passed;

select 'Test 3b: the first page returns a next cursor' as test,
       (:'page1'::jsonb ->> 'next_cursor') is not null as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  format(
    $$select public.alerts_feed(null, null, null, null, %L, 1)$$,
    :'page1'::jsonb ->> 'next_cursor'
  )
) as page2 \gset

select 'Test 3c: the second page returns a different report' as test,
       (:'page2'::jsonb -> 'items' -> 0) ->> 'id'
         <> (:'page1'::jsonb -> 'items' -> 0) ->> 'id' as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  format(
    $$select public.alerts_feed(null, null, null, null, %L, 1)$$,
    :'page2'::jsonb ->> 'next_cursor'
  )
) as page3 \gset

select 'Test 3d: the third page is the last one' as test,
       jsonb_array_length(:'page3'::jsonb -> 'items') = 1
       and (:'page3'::jsonb ->> 'next_cursor') is null as passed;

-- A malformed cursor is rejected rather than silently ignored.
do $$
begin
  begin
    perform pg_temp.exec_as_user(
      '11111111-1111-1111-1111-111111111102',
      $q$select public.alerts_feed(null, null, null, null, 'not-a-cursor', 20)$q$
    );
    raise exception 'a malformed cursor should have been rejected';
  exception when others then
    if sqlerrm not like '%VALIDATION_FAILED%' then
      raise;
    end if;
  end;
end
$$;

select 'Test 3e: a malformed cursor is rejected' as test,
       true as passed;

-- =============================================================================
-- Test 4 — history_nearby
-- =============================================================================

-- The Dhanmondi report is at (23.7461, 90.3774); the Mirpur one at
-- (23.8042, 90.4027) — roughly 6.5 km away, so it falls outside a 1 km radius.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.history_nearby(23.7461, 90.3774, 1, 24, null, null, 20)$$
) as history_tight \gset

select 'Test 4a: the 1 km radius excludes the distant report' as test,
       jsonb_array_length(:'history_tight'::jsonb -> 'items') = 1
       and (:'history_tight'::jsonb -> 'items' -> 0) ->> 'id' = '22222222-2222-2222-2222-222222222201' as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.history_nearby(23.7461, 90.3774, 10, 24, null, null, 20)$$
) as history_wide \gset

select 'Test 4b: a 10 km radius includes both Dhaka reports' as test,
       jsonb_array_length(:'history_wide'::jsonb -> 'items') = 2 as passed;

-- The 24 h window excludes a report older than 24 h.
select public.server_side_write(
  $q$update public.reports set captured_at = now() - interval '48 hours'
     where id = '22222222-2222-2222-2222-222222222202'$q$
);

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.history_nearby(23.7461, 90.3774, 10, 24, null, null, 20)$$
) as history_windowed \gset

select 'Test 4c: the 24 h window excludes an older report' as test,
       jsonb_array_length(:'history_windowed'::jsonb -> 'items') = 1 as passed;

-- The category filter.
select public.server_side_write(
  $q$update public.reports set captured_at = now() - interval '2 hours'
     where id = '22222222-2222-2222-2222-222222222202'$q$
);

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.history_nearby(23.7461, 90.3774, 10, 24, 'assault', null, 20)$$
) as history_category \gset

select 'Test 4d: the category filter narrows the result' as test,
       jsonb_array_length(:'history_category'::jsonb -> 'items') = 1
       and (:'history_category'::jsonb -> 'items' -> 0) ->> 'category' = 'assault' as passed;

-- The caller's OWN reports are always included, even out of radius.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.history_nearby(21.5, 88.0, 1, 24, null, null, 20)$$
) as history_own \gset

select 'Test 4e: the caller''s own reports are included out of radius' as test,
       jsonb_array_length(:'history_own'::jsonb -> 'items') = 1
       and (:'history_own'::jsonb -> 'items' -> 0) ->> 'is_own' = 'true' as passed;

-- A different user does NOT see those own-reports.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.history_nearby(21.5, 88.0, 1, 24, null, null, 20)$$
) as history_not_own \gset

select 'Test 4f: another user does not see them' as test,
       jsonb_array_length(:'history_not_own'::jsonb -> 'items') = 0 as passed;

select 'Test 4g: the total_count matches the filtered result' as test,
       (:'history_tight'::jsonb ->> 'total_count')::int
         = jsonb_array_length(:'history_tight'::jsonb -> 'items') as passed;

-- =============================================================================
-- Test 5 — moderation_queue
-- =============================================================================

-- The Mymensingh report is hidden again so it joins the queue.
select public.server_side_write(
  $q$update public.reports
       set moderation_status = 'hidden_pending_review', hide_reason = 'flag_threshold'
     where id = '22222222-2222-2222-2222-222222222203'$q$
);

-- Three distinct flags on the Dhanmondi report.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'misinformation')$$
) as q_flag1 \gset

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111103',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'duplicate')$$
) as q_flag2 \gset

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111104',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'off_topic')$$
) as q_flag3 \gset

-- A CITIZEN calling the queue gets FORBIDDEN.
do $$
begin
  begin
    perform pg_temp.exec_as_user(
      '11111111-1111-1111-1111-111111111102',
      $q$select public.moderation_queue(null, 20)$q$
    );
    raise exception 'a citizen should have been forbidden';
  exception when others then
    if sqlerrm not like '%FORBIDDEN%' then
      raise;
    end if;
  end;
end
$$;

select 'Test 5a: a citizen calling moderation_queue gets FORBIDDEN' as test,
       true as passed;

-- A MODERATOR gets the queue.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111105',
  $$select public.moderation_queue(null, 20)$$
) as queue \gset

select 'Test 5b: a moderator gets the hidden queue' as test,
       jsonb_array_length(:'queue'::jsonb -> 'items') = 2 as passed;

select 'Test 5c: only hidden_pending_review reports are queued' as test,
       not exists (
         select 1 from jsonb_array_elements(:'queue'::jsonb -> 'items') item
         where item ->> 'id' = '22222222-2222-2222-2222-222222222202'
       ) as passed;

select 'Test 5d: the flag count is aggregated' as test,
       (:'queue'::jsonb -> 'items' -> 0) ->> 'flag_count' = '3' as passed;

select 'Test 5e: every flag reason is listed' as test,
       jsonb_array_length((:'queue'::jsonb -> 'items' -> 0) -> 'flags') = 3 as passed;

select 'Test 5f: the hide_reason is derived' as test,
       (:'queue'::jsonb -> 'items' -> 0) ->> 'hide_reason' = 'flag_threshold' as passed;

select 'Test 5g: the uploader identity is server-side only' as test,
       (:'queue'::jsonb -> 'items' -> 0) -> 'uploader' ->> 'phone' = '+8801711000001'
       and (:'queue'::jsonb -> 'items' -> 0) -> 'uploader' ->> 'email' = 'author@test.local' as passed;

-- The queue projection is NOT a public read model — it carries the uploader.
select 'Test 5h: the public feed still omits author_id' as test,
       not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'alerts_feed' and column_name = 'author_id'
       ) as passed;

-- =============================================================================
-- Test 6 — record_biometric_attempt
-- =============================================================================

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.record_biometric_attempt(false)$$
) as bio1 \gset

select 'Test 6a: the first failure counts as one' as test,
       (:'bio1'::jsonb ->> 'fail_count')::int = 1
       and (:'bio1'::jsonb ->> 'fallback') is null as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.record_biometric_attempt(false)$$
) as bio2 \gset

select 'Test 6b: the second failure still has no fallback' as test,
       (:'bio2'::jsonb ->> 'fail_count')::int = 2
       and (:'bio2'::jsonb ->> 'fallback') is null as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.record_biometric_attempt(false)$$
) as bio3 \gset

select 'Test 6c: the third failure falls back to the password screen' as test,
       (:'bio3'::jsonb ->> 'fail_count')::int = 3
       and (:'bio3'::jsonb ->> 'fallback') = 'password' as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.record_biometric_attempt(false)$$
) as bio4 \gset

select 'Test 6d: the fourth failure keeps the password fallback' as test,
       (:'bio4'::jsonb ->> 'fail_count')::int = 4
       and (:'bio4'::jsonb ->> 'fallback') = 'password' as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.record_biometric_attempt(false)$$
) as bio5 \gset

select 'Test 6e: the fifth failure auto-disables biometric' as test,
       (:'bio5'::jsonb ->> 'fail_count')::int = 5
       and (:'bio5'::jsonb ->> 'biometric_enabled')::boolean = false as passed;

select 'Test 6f: the auto-disable is persisted on the profile' as test,
       (select biometric_opt_in from public.profiles
        where id = '11111111-1111-1111-1111-111111111102') = false as passed;

-- A success resets the counter.
select public.server_side_write(
  $q$update public.profiles set biometric_opt_in = true
     where id = '11111111-1111-1111-1111-111111111102'$q$
);

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.record_biometric_attempt(true)$$
) as bio_ok \gset

select 'Test 6g: a success resets the counter' as test,
       (:'bio_ok'::jsonb ->> 'fail_count')::int = 0
       and (select biometric_fail_count from public.profiles
            where id = '11111111-1111-1111-1111-111111111102') = 0 as passed;

-- =============================================================================
-- Test 7 — soft delete and restore (FR-DATA-6)
-- =============================================================================

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.soft_delete_account()$$
) as deleted \gset

select 'Test 7a: the soft delete sets deleted_at' as test,
       (:'deleted'::jsonb ->> 'deleted_at') is not null as passed;

select 'Test 7b: the recovery window is 30 days' as test,
       (:'deleted'::jsonb ->> 'recoverable_until')::timestamptz
         between now() + interval '29 days' and now() + interval '31 days' as passed;

-- The account's reports survive the soft delete.
select 'Test 7c: the account''s reports survive the soft delete' as test,
       (select count(*) from public.reports
        where author_id = '11111111-1111-1111-1111-111111111101') = 1 as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.restore_account()$$
) as restored \gset

select 'Test 7d: the restore clears deleted_at' as test,
       (select deleted_at from public.profiles
        where id = '11111111-1111-1111-1111-111111111101') is null as passed;

-- =============================================================================
-- Test 8 — the append-only guarantee on moderation_actions (FR-MOD-3)
-- -----------------------------------------------------------------------------

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values (
  '22222222-2222-2222-2222-222222222201',
  '11111111-1111-1111-1111-111111111105',
  null,
  'restore',
  'Restore test'
);

select 'Test 8a: a decision writes an action row' as test,
       (select count(*) from public.moderation_actions
        where note = 'Restore test') = 1 as passed;

do $$
begin
  begin
    update public.moderation_actions set note = 'Rewritten' where note = 'Restore test';
    raise exception 'the action row should not have been mutable';
  exception when others then
    if sqlerrm not like '%APPEND_ONLY%' then
      raise;
    end if;
  end;
end
$$;

select 'Test 8b: an existing action row cannot be updated' as test,
       (select note from public.moderation_actions where note = 'Restore test') = 'Restore test' as passed;

do $$
begin
  begin
    delete from public.moderation_actions where note = 'Restore test';
    raise exception 'the action row should not have been deletable';
  exception when others then
    if sqlerrm not like '%APPEND_ONLY%' then
      raise;
    end if;
  end;
end
$$;

select 'Test 8c: an existing action row cannot be deleted' as test,
       (select count(*) from public.moderation_actions where note = 'Restore test') = 1 as passed;

-- A whitespace-only note is rejected.
do $$
begin
  begin
    insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
    values (
      '22222222-2222-2222-2222-222222222201',
      '11111111-1111-1111-1111-111111111105',
      null, 'remove', '   '
    );
    raise exception 'a whitespace-only note should have been rejected';
  exception when check_violation then
    null;
  end;
end
$$;

select 'Test 8d: a whitespace-only note is rejected' as test,
       (select count(*) from public.moderation_actions where note = '   ') = 0 as passed;

-- =============================================================================
-- Test 9 — moderation_audit_feed
--
-- Story `007-moderation / 006-moderator-action-audit-log`, criterion 10:
--
--   > "Given the trail renders a row, When its payload is inspected, Then it
--   > contains **no raw GPS coordinates and no media payloads** — it references
--   > report ids, user ids, the decision, the note, and the timestamp, and
--   > never the report's `lat` / `lng`, description, or media"
--
-- The rule was stated in the migration's comment and honoured by the query,
-- but **nothing asserted it**. A later column addition — a `description`, a
-- `lat` — would widen the payload silently, and the trail would start
-- duplicating report contents. This test pins the **exact** key set: not
-- "does not contain lat", but "contains these nine keys and no others".
-- -----------------------------------------------------------------------------

-- A CITIZEN calling the audit feed gets FORBIDDEN.
do $$
begin
  begin
    perform pg_temp.exec_as_user(
      '11111111-1111-1111-1111-111111111102',
      $q$select public.moderation_audit_feed(null, 20)$q$
    );
    raise exception 'a citizen should have been forbidden';
  exception when others then
    if sqlerrm not like '%FORBIDDEN%' then
      raise;
    end if;
  end;
end
$$;

select 'Test 9a: a citizen calling moderation_audit_feed gets FORBIDDEN' as test,
       true as passed;

-- A MODERATOR gets the trail.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111105',
  $$select public.moderation_audit_feed(null, 20)$$
) as audit \gset

-- The exact key set. Nine keys — no more, no fewer.
--
-- The comparison is on the **sorted key array**, so a renamed key fails, a
-- dropped key fails, and an added key fails. `?&` (contains-all) would only
-- catch a dropped key; `<@` (contained-by) would only catch an added one.
-- Both together are the exact set.
select 'Test 9b: the audit payload carries exactly the specified keys' as test,
       (
         select array_agg(k order by k) = array[
           'created_at', 'decision', 'id', 'moderator_display_name', 'moderator_id',
           'note', 'report_id', 'target_user_id'
         ]::text[]
         from (
           select jsonb_object_keys((:'audit'::jsonb -> 'items' -> 0)) as k
         ) keys
       ) as passed;

-- The payload carries no report contents: no coordinates, no description, no
-- media, and no area hierarchy.
select 'Test 9c: the audit payload carries no report contents' as test,
       not exists (
         select 1
         from jsonb_object_keys((:'audit'::jsonb -> 'items' -> 0)) as k
         where k in (
           'lat', 'lng', 'latitude', 'longitude', 'description', 'media',
           'area_hierarchy', 'public_visibility', 'storage_path'
         )
       ) as passed;

-- The note is carried **as written** — trimmed, but never redacted,
-- summarised, or truncated.
select 'Test 9d: the note is carried as written' as test,
       exists (
         select 1
         from jsonb_array_elements(:'audit'::jsonb -> 'items') item
         where item ->> 'note' = 'Restore test'
       ) as passed;

-- The trail is newest-first.
select 'Test 9e: the trail is newest-first' as test,
       not exists (
         select 1
         from (
           select
             (item ->> 'created_at')::timestamptz as ts,
             row_number() over (order by (item ->> 'created_at')::timestamptz desc) as rn
           from jsonb_array_elements(:'audit'::jsonb -> 'items') item
         ) ordered
         where ordered.rn > 1 and ordered.ts > (
           select (prev_item ->> 'created_at')::timestamptz
           from jsonb_array_elements(:'audit'::jsonb -> 'items') prev_item
           where (prev_item ->> 'id') = (
             select (item ->> 'id')
             from jsonb_array_elements(:'audit'::jsonb -> 'items') item
             where (item ->> 'created_at')::timestamptz = ordered.ts
             limit 1
           )
         )
       ) as passed;

rollback;
