-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/business_rules.sql
--
-- Exercises the server-side rules that the client must never re-derive:
--   * the 3-distinct-flag hide threshold
--   * the 5-flag / 24 h author auto-hide
--   * the 10-flags-per-hour rate limit
--   * the idempotent capture submission
--   * the 10 km → 999 station fallback
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/business_rules.sql
--
-- The test runs as the `postgres` superuser, so `auth.uid()` is null and every
-- SECURITY DEFINER function would reject the call. The test therefore sets
-- `request.jwt.claims` to impersonate each user — the same mechanism the
-- PostgREST layer uses.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

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
  ('11111111-1111-1111-1111-111111111105', 'flagger4'),
  ('11111111-1111-1111-1111-111111111106', 'flagger5'),
  -- The second author and five more flaggers, for the distinct-report test.
  ('33333333-3333-3333-3333-333333333301', 'author2'),
  ('22222222-2222-2222-2222-222222222201', 'flagger6'),
  ('22222222-2222-2222-2222-222222222202', 'flagger7'),
  ('22222222-2222-2222-2222-222222222203', 'flagger8'),
  ('22222222-2222-2222-2222-222222222204', 'flagger9'),
  ('22222222-2222-2222-2222-222222222205', 'flagger10');


-- `profiles.id` references `auth.users.id`, so the auth rows must exist
-- first. The `handle_new_user` trigger then creates each profile for us.
insert into auth.users (id, email, raw_user_meta_data)
select id, label || '@test.local', json_build_object('phone', '+880171100' || lpad((row_number() over ())::text, 4, '0'))
from test_users;

-- The `handle_new_user` trigger creates the profile row for each auth user,
-- so there is nothing to insert here.

-- The report under test.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '22222222-2222-2222-2222-222222222201',
  '11111111-1111-1111-1111-111111111101',
  '33333333-3333-3333-3333-333333333301',
  23.7461, 90.3774, now(), 'A test report', 'theft', 'anonymous', 'visible'
);

-- The media row under test. The report metadata must survive the purge.
insert into public.report_media (
  id, report_id, storage_path, media_type, byte_size, created_at
)
values (
  '77777777-7777-7777-7777-777777777701',
  '22222222-2222-2222-2222-222222222201',
  'reports/test/test.jpg', 'photo', 1024, now()
);

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

-- Same impersonation, for statements that return no rows (INSERT / UPDATE).
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
-- Test 1 — the 3rd DISTINCT flag hides the report
-- =============================================================================

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'misinformation')$$
) as flag1 \gset

select 'Test 1a: first flag does not hide' as test,
       (select moderation_status from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'visible' as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111103',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'duplicate')$$
) as flag2 \gset

select 'Test 1b: second flag does not hide' as test,
       (select moderation_status from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'visible' as passed;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111104',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'off_topic')$$
) as flag3 \gset

select 'Test 1c: third distinct flag HIDES the report' as test,
       (select moderation_status from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'hidden_pending_review' as passed;

select 'Test 1d: hide_reason is flag_threshold' as test,
       (select hide_reason from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'flag_threshold' as passed;

-- A repeat flag from the same user must not count again.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111102',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'misinformation')$$
) as flag_dup \gset

select 'Test 1e: a repeat flag is rejected as duplicate' as test,
       :'flag_dup'::jsonb ->> 'status' = 'duplicate' as passed;
-- The author cannot flag their own report.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.flag_report('22222222-2222-2222-2222-222222222201', 'misinformation')$$
) as flag_own \gset

select 'Test 1f: an author cannot flag their own report' as test,
       :'flag_own'::jsonb ->> 'status' = 'own_report' as passed;

-- =============================================================================
-- Test 2 — the author auto-hide at 5 DISTINCT flagged reports / 24 h
-- =============================================================================

-- Four more reports from the same author, to be hidden by the author rule.
--
-- The threshold counts DISTINCT flagged reports, not flags. The author under
-- test already has ONE flagged report (report #1, flagged three times in Test
-- 1 — which is one flagged report, and was already handled by the 3-flag
-- threshold). These four bring the tally to five distinct flagged reports.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, public_visibility, moderation_status
)
values
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333302', 23.80, 90.40, now(), 'anonymous', 'visible'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333303', 23.81, 90.41, now(), 'anonymous', 'visible'),
  ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333304', 23.82, 90.42, now(), 'anonymous', 'visible'),
  ('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333305', 23.83, 90.43, now(), 'anonymous', 'visible'),
  -- A sixth report with **zero flags of its own**. The author rule hides
  -- EVERY one of the author's reports in the window, including the ones that
  -- were never flagged.
  ('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333306', 23.84, 90.44, now(), 'anonymous', 'visible');

-- flagger4 flags report #2, then flagger5 flags report #3. Together with the
-- three flags already cast in Test 1, that is five flags against the author
-- inside 24 hours — but only THREE distinct flagged reports. The auto-hide
-- must NOT fire yet.
select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111105',
  $$select public.flag_report('22222222-2222-2222-2222-222222222202', 'harassment')$$
) as flag4 \gset

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111106',
  $$select public.flag_report('22222222-2222-2222-2222-222222222203', 'other')$$
) as flag5 \gset

select 'Test 2a: three distinct flagged reports do NOT trigger the author auto-hide' as test,
       :'flag5'::jsonb ->> 'author_flags_24h' = '5'
       and :'flag5'::jsonb ->> 'author_flagged_reports_24h' = '3'
       and (select count(*) from public.reports
            where author_id = '11111111-1111-1111-1111-111111111101'
              and moderation_status = 'hidden_pending_review') = 1 as passed;

-- The fourth and fifth DISTINCT flagged reports. The tally now reaches five
-- and the hide fires.
select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222201',
  $$select public.flag_report('22222222-2222-2222-2222-222222222204', 'misinformation')$$
) as flag6 \gset

select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222202',
  $$select public.flag_report('22222222-2222-2222-2222-222222222205', 'off_topic')$$
) as flag7 \gset

select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222203',
  $$select public.flag_report('22222222-2222-2222-2222-222222222205', 'harassment')$$
) as flag8 \gset

select 'Test 2b: the 5th DISTINCT flagged report triggers the author auto-hide' as test,
       :'flag8'::jsonb ->> 'author_flagged_reports_24h' = '5'
       and :'flag8'::jsonb ->> 'author_hidden' = 'true'
       and (select count(*) from public.reports
            where author_id = '11111111-1111-1111-1111-111111111101'
              and moderation_status = 'hidden_pending_review') = 6 as passed;

select 'Test 2c: the untouched sibling report is also hidden' as test,
       (select moderation_status from public.reports where id = '22222222-2222-2222-2222-222222222206') = 'hidden_pending_review' as passed;

select 'Test 2d: the author-auto-hidden report keeps a distinct badge' as test,
       (select hide_reason from public.reports where id = '22222222-2222-2222-2222-222222222206') = 'author_auto_hide' as passed;

select 'Test 2e: a report that hit both rules is badged "both"' as test,
       (select hide_reason from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'both' as passed;

select 'Test 2f: a report with zero flags of its own is hidden and badged' as test,
       (select hide_reason from public.reports where id = '22222222-2222-2222-2222-222222222204') = 'author_auto_hide' as passed;

-- =============================================================================
-- Test 3 — the 10-flags-per-hour rate limit
-- =============================================================================

-- A fresh user who flags 10 distinct reports, then an 11th.
-- A fresh user who flags 10 distinct reports, then an 11th.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111107', 'spammer@test.local',
        json_build_object('phone', '+8801711009999'));

do $$
declare
  i integer;
  v_result jsonb;
begin
  for i in 1..10 loop
    insert into public.reports (
      id, author_id, client_request_id, lat, lng, captured_at, public_visibility, moderation_status
    ) values (
      ('44444444-4444-4444-4444-4444444443' || lpad(i::text, 2, '0'))::uuid,
      '11111111-1111-1111-1111-111111111101',
      ('55555555-5555-5555-5555-5555555553' || lpad(i::text, 2, '0'))::uuid,
      23.7, 90.3, now(), 'anonymous', 'visible'
    );
  end loop;

  for i in 1..10 loop
    v_result := pg_temp.as_user(
      '11111111-1111-1111-1111-111111111107',
      format(
        'select public.flag_report(%L, %L)',
        ('44444444-4444-4444-4444-4444444443' || lpad(i::text, 2, '0'))::uuid,
        'other'
      )
    );
  end loop;
end
$$;

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111107',
  $$select public.flag_report('22222222-2222-2222-2222-222222222203', 'other')$$
) as flag_over_limit \gset

select 'Test 3a: the 11th flag in an hour is rate limited' as test,
       :'flag_over_limit'::jsonb ->> 'status' = 'rate_limited' as passed;

select 'Test 3b: the rate-limit response carries retry_after_sec' as test,
       (:'flag_over_limit'::jsonb ->> 'retry_after_sec')::int > 0 as passed;

-- =============================================================================
-- Test 4 — the idempotent capture submission
-- =============================================================================

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.finalize_capture(
    '66666666-6666-6666-6666-666666666601',
    'reports/author/test.jpg', 'photo', 1024, null, 800, 600,
    23.7461, 90.3774, now(), 'idempotent test', 'anonymous', 'theft')$$
) as capture_first \gset

select pg_temp.as_user(
  '11111111-1111-1111-1111-111111111101',
  $$select public.finalize_capture(
    '66666666-6666-6666-6666-666666666601',
    'reports/author/test.jpg', 'photo', 1024, null, 800, 600,
    23.7461, 90.3774, now(), 'idempotent test', 'anonymous', 'theft')$$
) as capture_retry \gset

select 'Test 4a: a retried capture returns the same report id' as test,
       :'capture_first'::text = :'capture_retry'::text as passed;

select 'Test 4b: the retry did not create a second row' as test,
       (select count(*) from public.reports
        where author_id = '11111111-1111-1111-1111-111111111101'
          and client_request_id = '66666666-6666-6666-6666-666666666601') = 1 as passed;

select 'Test 4c: the capture wrote its report_media row too' as test,
       (select count(*) from public.report_media
        where report_id = :'capture_first'::uuid) = 1 as passed;

select 'Test 4d: a report and its media are written together' as test,
       (select count(*) from public.reports r
        where r.id = :'capture_first'::uuid
          and exists (select 1 from public.report_media rm where rm.report_id = r.id)) = 1 as passed;

-- =============================================================================
-- Test 5 — the 10 km → 999 station fallback
-- =============================================================================

select 'Test 5a: a coordinate in Dhaka finds a police station within 10 km' as test,
       exists (
         select 1 from public.nearest_thana(23.7461, 90.3774, 10)
         where fallback = false and phone is not null
       ) as passed;

select 'Test 5b: a coordinate far outside any station falls back to 999' as test,
       exists (
         select 1 from public.nearest_thana(21.5000, 88.0000, 10)
         where fallback = true and phone = '999'
       ) as passed;

-- =============================================================================
-- Test 6 — the public feed projection omits author_id entirely
-- =============================================================================

select 'Test 6a: alerts_feed has no author_id column' as test,
       not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'alerts_feed' and column_name = 'author_id'
       ) as passed;

select 'Test 6b: a hidden report never appears in the feed' as test,
       not exists (
         select 1 from public.alerts_feed where id = '22222222-2222-2222-2222-222222222201'
       ) as passed;

-- =============================================================================
-- Test 7 — the author may update only the category
-- =============================================================================

-- The category update is run through the same impersonation helper so it
-- exercises the real RLS + trigger path rather than a privileged write.
do $$
begin
  perform pg_temp.exec_as_user(
    '11111111-1111-1111-1111-111111111101',
    'update public.reports set category = ''robbery''
       where id = ''22222222-2222-2222-2222-222222222202'''
  );
exception when others then
  raise;
end
$$;

select 'Test 7a: the author CAN update the category' as test,
       (select category from public.reports where id = '22222222-2222-2222-2222-222222222202') = 'robbery' as passed;

do $$
begin
  begin
    perform pg_temp.exec_as_user(
      '11111111-1111-1111-1111-111111111101',
      'update public.reports set description = ''tampered''
         where id = ''22222222-2222-2222-2222-222222222202'''
    );
    raise exception 'the description update should have been rejected';
  exception when others then
    if sqlerrm not like '%ONLY_CATEGORY_EDITABLE%' then
      raise;
    end if;
  end;
end
$$;

select 'Test 7b: the author CANNOT update the description' as test,
       (select description from public.reports where id = '22222222-2222-2222-2222-222222222202')
         is distinct from 'tampered' as passed;

-- =============================================================================
-- Test 8 — the reverse-geocode resolution order (waiver W-3)
-- =============================================================================

select 'Test 8a: a Dhaka coordinate resolves from the LOCAL area table' as test,
       (public.reverse_geocode(23.7461, 90.3774) ->> 'source') = 'local' as passed;

select 'Test 8b: the resolved area names the thana' as test,
       (public.reverse_geocode(23.7461, 90.3774) -> 'area_hierarchy' ->> 'thana') = 'Dhanmondi' as passed;

select 'Test 8c: a coordinate outside Dhaka degrades, it is never fabricated' as test,
       (public.reverse_geocode(21.5000, 88.0000) ->> 'source') = 'degraded'
       and (public.reverse_geocode(21.5000, 88.0000) -> 'area_hierarchy' ->> 'thana') is null as passed;

-- =============================================================================
-- Test 9 — the media / report split
-- =============================================================================

select 'Test 9a: the media lives in its own table' as test,
       exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'report_media'
       ) as passed;

select 'Test 9b: the report_media FK cascades, it does not restrict' as test,
       (select confdeltype from pg_constraint
        where conrelid = 'public.report_media'::regclass
          and contype = 'f'
          and confrelid = 'public.reports'::regclass) = 'c' as passed;

select 'Test 9c: the media carries a purged_at flag for the 90-day purge' as test,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'report_media' and column_name = 'purged_at'
       ) as passed;

-- =============================================================================
-- Test 10 — the author auto-hide counts DISTINCT flagged reports
--
-- "5 flagged reports" means 5 distinct reports, not 5 flags. Five flags on
-- one report are ONE flagged report, and that report was already handled by
-- the 3-flag threshold. Counting flags instead of reports meant one heavily
-- flagged report could sweep in an author's whole recent output.
-- =============================================================================

-- A second author, whose reports carry the five flags. Five flags on ONE of
-- their reports must NOT trigger the author auto-hide.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, public_visibility, moderation_status
)
values
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301',
   '55555555-5555-5555-5555-555555555501', 23.80, 90.40, now(), 'anonymous', 'visible'),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333301',
   '55555555-5555-5555-5555-555555555502', 23.81, 90.41, now(), 'anonymous', 'visible'),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333301',
   '55555555-5555-5555-5555-555555555503', 23.82, 90.42, now(), 'anonymous', 'visible');

-- Five distinct flaggers on ONE report. That is one flagged report.
select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222201',
  $$select public.flag_report('44444444-4444-4444-4444-444444444401', 'harassment')$$
) as f1 \gset
select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222202',
  $$select public.flag_report('44444444-4444-4444-4444-444444444401', 'harassment')$$
) as f2 \gset
select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222203',
  $$select public.flag_report('44444444-4444-4444-4444-444444444401', 'harassment')$$
) as f3 \gset
select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222204',
  $$select public.flag_report('44444444-4444-4444-4444-444444444401', 'harassment')$$
) as f4 \gset
select pg_temp.as_user(
  '22222222-2222-2222-2222-222222222205',
  $$select public.flag_report('44444444-4444-4444-4444-444444444401', 'harassment')$$
) as f5 \gset

select 'Test 10a: five flags on ONE report is one flagged report' as test,
       :'f5'::jsonb ->> 'author_flagged_reports_24h' = '1' as passed;

select 'Test 10b: five flags on one report do NOT trigger the author auto-hide' as test,
       (select count(*) from public.reports
        where author_id = '33333333-3333-3333-3333-333333333301'
          and moderation_status = 'hidden_pending_review') = 1 as passed;

select 'Test 10c: the untouched sibling reports stay visible' as test,
       (select moderation_status from public.reports where id = '44444444-4444-4444-4444-444444444402') = 'visible'
       and (select moderation_status from public.reports where id = '44444444-4444-4444-4444-444444444403') = 'visible' as passed;

select 'Test 10d: the flag count is still reported alongside the distinct count' as test,
       :'f5'::jsonb ->> 'author_flags_24h' = '5'
       and :'f5'::jsonb ->> 'author_flagged_reports_24h' = '1' as passed;

select 'Test 10e: the author auto-hide did not report a hide' as test,
       :'f5'::jsonb ->> 'author_reports_hidden' = '0'
       and :'f5'::jsonb ->> 'author_hidden' = 'false' as passed;
rollback;
