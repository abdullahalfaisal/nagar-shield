-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/alert_detail.sql
--
-- The **public** alert-detail read model, asserted inside Postgres.
--
-- The story
-- ---------
-- `006-alerts / 009-alert-detail-screen`:
--
--   * AC #3 — "it displays the media through a **short-lived signed URL** …
--     the storage bucket is never public and the URL is never persisted";
--   * AC #4 — "the report is **anonymous** … it shows **no author identity** —
--     no name, no avatar, no handle, no author id, and no 'reported by' row
--     of any kind";
--   * AC #5 — "a report with no category shows the neutral placeholder";
--   * AC #8 — "the report was removed or hidden by moderation … the screen
--     shows a 'this report is no longer available' state and renders **no**
--     report content";
--   * and the Technical Notes' privacy assertion — "A negative test asserts
--     that no detail response body contains `author_id`".
--
-- and `006-alerts / 008-history-map`:
--
--   * "The report's own coordinates come from the read model … no additional
--     geometry query is issued."
--
-- The impersonation
-- -----------------
-- These tests must run as a **client**, not as the `postgres` superuser. The
-- superuser has BYPASSRLS and the owner role, so it sees and writes
-- everything — every defect here would be invisible. The suite uses the same
-- mechanism PostgREST uses:
--
--   set local role authenticated   -- the role the request runs as
--   set local request.jwt.claims   -- the verified JWT's claims
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/alert_detail.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

-- Two citizens. The uuid space is deliberately distinct from the seed's and
-- from the other suites', so this suite never collides with them.
--
-- `full_name` is set because the `handle_new_user()` trigger copies it into
-- the profile, and the profile's name is the display alias an `identified`
-- report carries. Without it the alias would be null and the identified
-- case would be indistinguishable from the anonymous one.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('44444444-4444-4444-4444-4444444444a1', 'alert-a@test.local',
   json_build_object('phone', '+8801711000501', 'full_name', 'Ay')),
  ('44444444-4444-4444-4444-4444444444a2', 'alert-b@test.local',
   json_build_object('phone', '+8801711000502', 'full_name', 'Bee'));

-- The trigger created the two profiles.

-- A's **identified** report, with media, in the middle of the city.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '55555555-5555-5555-5555-5555555555a1',
  '44444444-4444-4444-4444-4444444444a1',
  '66666666-6666-6666-6666-6666666666a1',
  23.8103, 90.4125, now(), 'an identified report with media', 'theft',
  'identified', 'visible'
);

insert into public.report_media (
  report_id, storage_path, media_type, byte_size, duration_seconds, width, height
)
values (
  '55555555-5555-5555-5555-5555555555a1',
  'reports/' || public.author_token('44444444-4444-4444-4444-4444444444a1'::uuid)
    || '/66666666-6666-6666-6666-6666666666a1/photo.jpg',
  'photo', 1024, null, 640, 480
);

-- A's **anonymous** report, with no category — the neutral-placeholder case.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '55555555-5555-5555-5555-5555555555a2',
  '44444444-4444-4444-4444-4444444444a1',
  '66666666-6666-6666-6666-6666666666a2',
  23.7500, 90.3900, now() - interval '3 hours', 'an anonymous report', null,
  'anonymous', 'visible'
);

-- B's report, for the cross-user tests.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '55555555-5555-5555-5555-5555555555a3',
  '44444444-4444-4444-4444-4444444444a2',
  '66666666-6666-6666-6666-6666666666a3',
  23.7600, 90.3800, now(), 'another citizen''s report', 'fire',
  'anonymous', 'visible'
);

-- A report that moderation removed — it must not resolve.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '55555555-5555-5555-5555-5555555555a4',
  '44444444-4444-4444-4444-4444444444a2',
  '66666666-6666-6666-6666-6666666666a4',
  23.7700, 90.3700, now(), 'a report that was removed', 'medical',
  'anonymous', 'removed'
);

-- A soft-deleted report — it must not resolve either.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status, deleted_at
)
values (
  '55555555-5555-5555-5555-5555555555a5',
  '44444444-4444-4444-4444-4444444444a2',
  '66666666-6666-6666-6666-6666666666a5',
  23.7800, 90.3600, now(), 'a soft-deleted report', 'fraud',
  'anonymous', 'visible', now()
);

-- -----------------------------------------------------------------------------
-- Helper: run a statement as a client role
-- -----------------------------------------------------------------------------

-- `client_bool` sets the role GUC and the JWT claims the way PostgREST does
-- for a signed-in request, then executes the statement and returns its result
-- as a **boolean**. The result is captured **inside** the impersonated
-- session — the superuser's view would prove nothing.
--
-- The return type is `boolean` rather than `text` on purpose. `execute …
-- into` a text variable renders a boolean as `true` / `false`, not as the
-- `t` / `f` psql prints — so a text helper would make every assertion
-- compare against the wrong literal. A boolean helper cannot have that
-- class of mistake: there is only one false.
create or replace function pg_temp.client_bool(user_id uuid, statement text)
returns boolean
language plpgsql
as $w$
declare
  v_result boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_id, 'role', 'authenticated')::text, true);

  begin
    execute statement into v_result;
  exception when others then
    v_result := false;
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);

  return v_result;
end;
$w$;

-- `anon_bool` runs a statement as the `anon` role with **no** JWT claims —
-- the shape PostgREST uses for an unauthenticated request. It is a separate
-- helper because `client_bool` impersonates an authenticated user, which
-- would prove nothing about an anonymous visitor.
create or replace function pg_temp.anon_bool(statement text)
returns boolean
language plpgsql
as $w$
declare
  v_result boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);

  begin
    execute statement into v_result;
  exception when others then
    v_result := false;
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);

  return v_result;
end;
$w$;

-- `anon_denied` runs a statement as the `anon` role and reports whether it
-- was **refused**.
--
-- It answers a different question from `anon_bool`. The alert detail is not
-- granted to `anon` at all, so an anonymous call raises `permission denied
-- for function alert_detail` — it never reaches the function body, so it
-- never returns a row to be tested. The refusal **is** the behaviour, and a
-- helper that swallowed the exception and returned `false` would report the
-- opposite of the truth.
--
-- The refusal is also only meaningful if it is the **grant** that refused it:
-- an `others` handler would swallow a missing relation or a syntax error
-- just as happily. So the SQLSTATE is checked — `42501` is
-- `insufficient_privilege`, which is what a missing `EXECUTE` grant raises.
create or replace function pg_temp.anon_denied(statement text)
returns boolean
language plpgsql
as $w$
declare
  v_denied boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);

  begin
    execute statement;
  exception when insufficient_privilege then
    v_denied := true;
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);

  return v_denied;
end;
$w$;

-- =============================================================================
-- Test 1 — the function exists, is granted to `authenticated`, and is
--          `security definer`
-- =============================================================================

select 'Test 1.1: the alert_detail function exists' as test,
       (select count(*) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'alert_detail') = 1 as passed;

select 'Test 1.2: alert_detail is security definer' as test,
       (select p.prosecdef from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'alert_detail') as passed;

-- `information_schema.routine_privileges` only shows the **current** user's
-- grants, so it reports nothing here — the assertions would pass or fail for
-- the wrong reason. `has_function_privilege` asks the question directly.
select 'Test 1.3: alert_detail is granted to authenticated' as test,
       has_function_privilege('authenticated', 'public.alert_detail(uuid)', 'EXECUTE') as passed;

select 'Test 1.4: alert_detail is not granted to anon' as test,
       (not has_function_privilege('anon', 'public.alert_detail(uuid)', 'EXECUTE')) as passed;

-- =============================================================================
-- Test 2 — a visible report resolves for **any** signed-in citizen
-- =============================================================================

select 'Test 2.1: a visible report resolves for another citizen' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select public.alert_detail('55555555-5555-5555-5555-5555555555a1') is not null$w$
       ) as passed;

select 'Test 2.2: the resolution carries the description' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->>'description')
                 = 'an identified report with media'$w$
       ) as passed;

select 'Test 2.3: the resolution carries the category' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->>'category')
                 = 'theft'$w$
       ) as passed;

select 'Test 2.4: the resolution carries the captured_at timestamp' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->>'captured_at')
                 is not null$w$
       ) as passed;

-- =============================================================================
-- Test 3 — the privacy assertion: **no author id** in the response
-- =============================================================================

-- The story's Technical Notes: "A negative test asserts that no detail
-- response body contains `author_id`."
--
-- This is the assertion that actually matters, and it is the one a
-- superuser-scoped check would have quietly faked — the superuser sees the
-- column, so a naive "does the projection mention author_id" test would
-- pass for the wrong reason.
select 'Test 3.1: the response body contains no author_id key' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select not (public.alert_detail('55555555-5555-5555-5555-5555555555a1')
                        ? 'author_id')$w$
       ) as passed;

select 'Test 3.2: the response body contains no author_id value' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')::text)
                 not like '%author_id%'$w$
       ) as passed;

-- The author id must not leak under any key name. A projection that renamed
-- the column would satisfy the first assertion and still be a leak.
--
-- This is the assertion that found the real defect. The projection was
-- author-free, but the **storage path** it returned carried the author's
-- uuid in the clear — `reports/<author_id>/<client_request_id>/<file>` — so
-- every reader of a public alert learned the filing citizen's uuid. The
-- second path segment is now the hex SHA-256 of that uuid, and the id is not
-- recoverable from it.
select 'Test 3.3: the response body contains no author uuid' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')::text)
                 not like '%44444444-4444-4444-4444-4444444444a1%'$w$
       ) as passed;

-- The same property, asserted on the media path alone — so a failure points
-- at the path rather than at some other part of the body.
select 'Test 3.3b: the media path carries no author uuid' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->'media'->0->>'storage_path')
                 not like '%44444444-4444-4444-4444-4444444444a1%'$w$
       ) as passed;

-- The path's second segment is the **token** — the hash of the author's uuid
-- — so the author can still be verified as the uploader without the id being
-- visible. The token is the same value the Storage insert policy computes
-- for `auth.uid()`.
select 'Test 3.3c: the media path carries the author token' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->'media'->0->>'storage_path')
                 = 'reports/' || public.author_token('44444444-4444-4444-4444-4444444444a1'::uuid)
                   || '/66666666-6666-6666-6666-6666666666a1/photo.jpg'$w$
       ) as passed;

-- The **anonymous** report carries no display name either — no name, no
-- avatar, no handle, no "reported by" row of any kind.
select 'Test 3.4: an anonymous report carries no author display name' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a2')->>'author_display_name')
                 is null$w$
       ) as passed;

-- The **identified** report may carry a display alias — that is the author's
-- own choice, and the feed projection applies the same rule.
select 'Test 3.5: an identified report carries a display alias' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->>'author_display_name')
                 is not null$w$
       ) as passed;

-- The author is **not** erased: the database still keeps `author_id` for
-- moderation (FR-DATA-3). The public surface simply has no field for it.
select 'Test 3.6: the report row still carries its author for moderation' as test,
       (select count(*) from public.reports r
         where r.id = '55555555-5555-5555-5555-5555555555a1'
           and r.author_id = '44444444-4444-4444-4444-4444444444a1') = 1 as passed;

-- =============================================================================
-- Test 4 — the media come back as **paths**, and only for a visible report
-- =============================================================================

select 'Test 4.1: the visible report''s media are returned' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select jsonb_array_length(
                   public.alert_detail('55555555-5555-5555-5555-5555555555a1')->'media') = 1$w$
       ) as passed;

select 'Test 4.2: the media carry the storage path' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->'media'->0->>'storage_path')
                 like 'reports/%'$w$
       ) as passed;

-- The path is returned, not a URL. A signed URL is minted by the client
-- against the Storage API and is short-lived; a URL baked into the database
-- response would outlive its expiry.
select 'Test 4.3: the media carry no signed URL' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->'media'->0->>'storage_path')
                 not like '%token=%' and
                (public.alert_detail('55555555-5555-5555-5555-5555555555a1')->'media'->0->>'storage_path')
                 not like '%signature=%'$w$
       ) as passed;

-- A report with no media returns an empty array, never null — the client
-- renders "no media block" either way, but a null would be a different shape.
select 'Test 4.4: a report with no media returns an empty array' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select jsonb_array_length(
                   public.alert_detail('55555555-5555-5555-5555-5555555555a2')->'media') = 0$w$
       ) as passed;

-- =============================================================================
-- Test 5 — a removed or deleted report does **not** resolve
-- =============================================================================

-- AC #8: "the screen shows a 'this report is no longer available' state and
-- renders **no** report content — it never renders a removed report."
--
-- The three cases — removed, soft-deleted, and never existed — are
-- indistinguishable from outside. That is deliberate: a client must not be
-- able to use this read to discover which reports exist but are hidden.
select 'Test 5.1: a removed report does not resolve' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a1',
         $w$select public.alert_detail('55555555-5555-5555-5555-5555555555a4') is null$w$
       ) as passed;

select 'Test 5.2: a soft-deleted report does not resolve' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a1',
         $w$select public.alert_detail('55555555-5555-5555-5555-5555555555a5') is null$w$
       ) as passed;

select 'Test 5.3: a report that never existed does not resolve' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a1',
         $w$select public.alert_detail('55555555-5555-5555-5555-5555555555ff') is null$w$
       ) as passed;

-- =============================================================================
-- Test 6 — the null category stays null
-- =============================================================================

-- AC #5: "a report with no category shows the neutral placeholder rather than
-- an empty gap" — and the category is never **invented**.
select 'Test 6.1: a report with no category keeps a null category' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.alert_detail('55555555-5555-5555-5555-5555555555a2')->>'category')
                 is null$w$
       ) as passed;

-- =============================================================================
-- Test 7 — the History map's coordinates come from the read model
-- =============================================================================

-- `008-history-map`: "The report's own coordinates come from the read model …
-- no additional geometry query is issued."
--
-- The coordinates are looked up **by report id**, not by position. The page
-- is ordered by `captured_at desc, id desc` — chronology, not distance — so
-- a positional `->0` would assert against whichever report happened to be
-- filed last. That is a property of the fixture, not of the read model.
select 'Test 7.1: the History read model carries the report''s coordinates' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (
                   select item ->> 'lat'
                   from jsonb_array_elements(
                     public.history_nearby(23.8103, 90.4125, 5, 24, null, null, 20)->'items'
                   ) item
                   where item ->> 'id' = '55555555-5555-5555-5555-5555555555a1'
                 ) = '23.8103'$w$
       ) as passed;

select 'Test 7.2: the History read model carries the longitude' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (
                   select item ->> 'lng'
                   from jsonb_array_elements(
                     public.history_nearby(23.8103, 90.4125, 5, 24, null, null, 20)->'items'
                   ) item
                   where item ->> 'id' = '55555555-5555-5555-5555-5555555555a1'
                 ) = '90.4125'$w$
       ) as passed;

-- The History read model is author-free too — the map is a public surface.
select 'Test 7.3: the History read model carries no author_id' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (public.history_nearby(23.8103, 90.4125, 5, 24, null, null, 20)::text)
                 not like '%author_id%'$w$
       ) as passed;

-- The radius filter still works with the new columns — the projection change
-- must not have altered the predicate.
--
-- The caller is **B** (`a2`), and the report measured is A's `a2` — 7.06 km
-- from the origin (23.8103 / 90.4125). It is inside a 10 km radius and
-- outside a 1 km one.
--
-- The caller's **own** report (`a3`, 6.48 km away) is deliberately not the
-- subject of this assertion: FR-HIST-3 makes the own-reports branch
-- independent of the radius and the window, so a page count would measure
-- the wrong thing entirely. Test 7.5 asserts that branch separately.
select 'Test 7.4: the radius filter still excludes a far-away neighbour report' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (
                   select count(*)
                   from jsonb_array_elements(
                     public.history_nearby(23.8103, 90.4125, 10, 24, null, null, 20)->'items'
                   ) item
                   where item ->> 'id' = '55555555-5555-5555-5555-5555555555a2'
                 ) = 1
                 and (
                   select count(*)
                   from jsonb_array_elements(
                     public.history_nearby(23.8103, 90.4125, 1, 24, null, null, 20)->'items'
                   ) item
                   where item ->> 'id' = '55555555-5555-5555-5555-5555555555a2'
                 ) = 0$w$
       ) as passed;

-- The own-reports branch: the caller's own report appears even though it is
-- far outside the radius. This is what Test 7.4 would have measured by
-- mistake, so it is asserted explicitly.
select 'Test 7.5: the caller''s own report appears outside the radius' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select (
                   select count(*)
                   from jsonb_array_elements(
                     public.history_nearby(23.8103, 90.4125, 1, 24, null, null, 20)->'items'
                   ) item
                   where item ->> 'id' = '55555555-5555-5555-5555-5555555555a3'
                 ) = 1$w$
       ) as passed;

-- =============================================================================
-- Test 8 — the public projection is not readable by an anonymous visitor
-- =============================================================================

-- The alert detail is an **authenticated** surface. An anonymous caller must
-- not resolve a report through it.
--
-- The function is not granted to `anon` at all, so the call is **refused** —
-- it never reaches the function body. The assertion is therefore that the
-- call is refused with `insufficient_privilege`, which is what a missing
-- `EXECUTE` grant raises. Asserting "it returns null" would be wrong: the
-- call raises, and a helper that swallowed the exception would have
-- reported the opposite of the truth.
select 'Test 8.1: an anonymous caller is refused the alert detail' as test,
       pg_temp.anon_denied(
         $w$select public.alert_detail('55555555-5555-5555-5555-5555555555a1')$w$
       ) as passed;

-- =============================================================================
-- Test 9 — the Storage policy lets a **neighbour** sign the media
-- =============================================================================

-- The signed URL is minted by the client against the Storage API, so the
-- **Storage policy** is the last gate between a neighbour and the bytes. The
-- policy has to grant it, and it has to grant it to a citizen who did not
-- file the report.
--
-- This is the assertion the SQL suite would have missed on its own. The
-- policy's lookup is evaluated **as the calling role**, so a policy that
-- joined `reports` and `report_media` inline would read them under their own
-- RLS — and both are scoped to the author. A neighbour's visible report
-- would match no rows, the policy would not match, and the signed URL would
-- be refused.
--
-- The author's own objects still worked in that case, because the author can
-- see their own rows — so the defect only ever showed up for the *public*
-- read, which is exactly the path nothing else exercised.
--
-- `public.media_is_publicly_visible()` is `SECURITY DEFINER`, so the lookup
-- reads the rows as their owner.

-- The object itself must exist in the bucket for the policy to have anything
-- to grant.
insert into storage.objects (bucket_id, name, owner)
values (
  'report-media',
  'reports/' || public.author_token('44444444-4444-4444-4444-4444444444a1'::uuid)
    || '/66666666-6666-6666-6666-6666666666a1/photo.jpg',
  '44444444-4444-4444-4444-4444444444a1'
);

select 'Test 9.1: a neighbour can see the visible report''s media object' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a2',
         $w$select exists (
                   select 1 from storage.objects o
                   where o.bucket_id = 'report-media'
                     and o.name = 'reports/'
                       || public.author_token('44444444-4444-4444-4444-4444444444a1'::uuid)
                       || '/66666666-6666-6666-6666-6666666666a1/photo.jpg'
                 )$w$
       ) as passed;

-- The author can see their own object too — the own-folder policy.
select 'Test 9.2: the author can see their own media object' as test,
       pg_temp.client_bool(
         '44444444-4444-4444-4444-4444444444a1',
         $w$select exists (
                   select 1 from storage.objects o
                   where o.bucket_id = 'report-media'
                     and o.name = 'reports/'
                       || public.author_token('44444444-4444-4444-4444-4444444444a1'::uuid)
                       || '/66666666-6666-6666-6666-6666666666a1/photo.jpg'
                 )$w$
       ) as passed;

-- A report that moderation removed takes its media out of the public read.
-- The object is still there — the bytes are not deleted by a moderation
-- decision — but no signed URL may be minted for it.
insert into storage.objects (bucket_id, name, owner)
values (
  'report-media',
  'reports/' || public.author_token('44444444-4444-4444-4444-4444444444a2'::uuid)
    || '/66666666-6666-6666-6666-6666666666a4/photo.jpg',
  '44444444-4444-4444-4444-4444444444a2'
);

select 'Test 9.3: a removed report''s media is not publicly readable' as test,
       (not public.media_is_publicly_visible(
          'reports/' || public.author_token('44444444-4444-4444-4444-4444444444a2'::uuid)
            || '/66666666-6666-6666-6666-6666666666a4/photo.jpg'
        )) as passed;

-- A soft-deleted report's media is not publicly readable either.
select 'Test 9.4: a soft-deleted report''s media is not publicly readable' as test,
       (not public.media_is_publicly_visible(
          'reports/' || public.author_token('44444444-4444-4444-4444-4444444444a2'::uuid)
            || '/66666666-6666-6666-6666-6666666666a5/photo.jpg'
        )) as passed;

-- A visible report's media **is** publicly readable.
select 'Test 9.5: a visible report''s media is publicly readable' as test,
       public.media_is_publicly_visible(
         'reports/' || public.author_token('44444444-4444-4444-4444-4444444444a1'::uuid)
           || '/66666666-6666-6666-6666-6666666666a1/photo.jpg'
       ) as passed;

-- The helper is `SECURITY DEFINER` — that is the whole point of it, and it
-- is what lets the policy read the owner-scoped tables.
select 'Test 9.6: the media visibility helper is security definer' as test,
       (select p.prosecdef from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'media_is_publicly_visible') as passed;

rollback;
