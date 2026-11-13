-- ---------------------------------------------------------------------------
-- 20261105000029_storage_author_token.sql
--
-- Story: `006-alerts / 009-alert-detail-screen`
--
-- The storage path's second segment stops carrying the author's uuid.
--
-- The defect
-- ---------
-- The report-media storage path is:
--
--   reports/<author_id>/<client_request_id>/<file>
--
-- and the **author id is the author's uuid, in the clear**. Every Storage
-- policy reads that segment to decide who owns the object, so it could not be
-- anything else — until now.
--
-- The leak
-- --------
-- The public alert detail (`public.alert_detail`, migration 028) returns the
-- media **paths** to any signed-in citizen, because the client mints a
-- short-lived signed URL against the Storage API and the bucket is private.
-- That made the author id client-visible for the first time: every reader of
-- a public alert learned the filing citizen's uuid.
--
-- A uuid is author identity. It is stable, it is joinable against
-- `profiles.id`, and it is exactly what FR-DATA-3 and the
-- `006-alerts / 009-alert-detail-screen` story forbid — "no author identity
-- of any kind … no name, no avatar, no handle, **no author id**, and no
-- 'reported by' row of any kind". The unit brief says the same from the
-- schema side: `reports.author_id` is "server-side only".
--
-- The negative test on the alert detail caught it:
--
--   select (public.alert_detail(<id>)::text) not like '%<author uuid>%'
--
-- The fix
-- ------
-- The second segment becomes the **author token** — the hex SHA-256 of the
-- author's uuid:
--
--   reports/<author_token>/<client_request_id>/<file>
--
-- The token keeps every property the old segment had:
--
--   * the **author** can still prove a path is theirs — the insert policy
--     compares the segment against the hash of `auth.uid()`, and the
--     `finalize-capture` Edge Function compares the path prefix against the
--     same hash;
--   * a **moderator** can still read every object in the bucket, through the
--     existing moderator policy, which does not read the segment at all;
--   * the **public** read still works, through the policy migration 028 added.
--
-- And it gains the one property the uuid lacked: the id is **not recoverable**
-- from it. A reader of a public alert detail learns a stable handle on the
-- *media*, and nothing about the person who filed it.
--
-- The three implementations must agree byte for byte:
--
--   * Postgres — `encode(digest(<uuid>::text, 'sha256'), 'hex')`
--   * the Edge Function — `authorToken()` from `_shared/vendor/storage`
--   * the mobile client — the same `authorToken()` from `@nagar-shield/shared`
--
-- The functions' mirror is generated (`tools/mirror-shared-to-functions.cjs`),
-- so the function and the client cannot drift from each other.
--
-- Existing objects
-- ----------------
-- The path is written **at upload time**, so an object uploaded under the old
-- shape keeps its old key forever. The policies below therefore accept
-- **either** segment:
--
--   * the token (the new shape), or
--   * the raw uuid (the old shape, for objects already in the bucket).
--
-- Both are owner-verifiable, so the old shape stays safe. A maintenance job
-- could re-key the existing objects; until it does, the old keys remain
-- reachable only by the author, a moderator, and the public read — the same
-- three that could reach them before.
-- ---------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- A helper the policies share.
--
-- The token is the hex SHA-256 of the caller's uuid. `pgcrypto`'s `digest()`
-- is available — the extension is installed in this database, in the
-- `extensions` schema — and it is the authority the other two implementations
-- mirror.
-- -----------------------------------------------------------------------------

create or replace function public.author_token(p_user_id uuid)
returns text
language sql
immutable
strict
security invoker
set search_path = public
as $$
  select encode(extensions.digest(p_user_id::text, 'sha256'), 'hex');
$$;

comment on function public.author_token(uuid) is
  'The hex SHA-256 of a user id — the second segment of a report-media storage path. The id is not recoverable from it. The Edge Function and the mobile client compute the same value.';

-- -----------------------------------------------------------------------------
-- The insert policy — the author may upload into their own folder.
--
-- The segment must be the hash of the caller's own uuid, or the uuid itself
-- for an object uploaded before this migration.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_insert_own" on storage.objects;

create policy "report_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = 'reports'
    and (
      (storage.foldername(name))[2] = public.author_token((auth.uid())::uuid)
      or (storage.foldername(name))[2] = (auth.uid())::text
    )
    and public.assert_account_not_disabled()
  );

-- -----------------------------------------------------------------------------
-- The author's own select policy — the author reads their own objects.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_select_own" on storage.objects;

create policy "report_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = 'reports'
    and (
      (storage.foldername(name))[2] = public.author_token((auth.uid())::uuid)
      or (storage.foldername(name))[2] = (auth.uid())::text
    )
  );

-- -----------------------------------------------------------------------------
-- The public read policy, from migration 028.
--
-- It joined the object back to its report through the path's own segments —
-- the second was the author id, the third the `client_request_id`. The second
-- segment is now a token, so the join cannot read it.
--
-- The join is rewritten to go through `report_media.storage_path` — the
-- column that records the object's exact key — and to reach the report
-- through the media row's own `report_id`. The path is no longer parsed at
-- all: the object's key is matched against the recorded key, and the report
-- is matched by its id.
--
-- This is strictly better than the segment-parsing version: it no longer
-- depends on the path's shape at all, so the shape can change again without
-- touching this policy.
--
-- The lookup goes through `public.media_is_publicly_visible()` rather than
-- being written inline. That is not a style choice — it is required.
--
-- A policy's expression is evaluated **as the calling role**, so the inline
-- `EXISTS` was reading `public.reports` and `public.report_media` under
-- their own RLS. Both are scoped to the author, so a citizen reading a
-- *neighbour's* visible report saw nothing: the subquery matched no rows,
-- the policy did not match, and the signed URL was refused. The author's own
-- objects still worked, because the author could see their own rows — which
-- is exactly why the defect survived the SQL suite: every assertion in it
-- ran as the author.
--
-- `media_is_publicly_visible()` is `SECURITY DEFINER`, so it reads the rows
-- as their owner and answers the one question the policy needs: is this
-- object the media of a publicly visible report?
-- -----------------------------------------------------------------------------

create or replace function public.media_is_publicly_visible(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.report_media rm
    join public.reports r on r.id = rm.report_id
    where rm.storage_path = p_storage_path
      and rm.purged_at is null
      and r.deleted_at is null
      and r.moderation_status in ('visible', 'restored')
  );
$$;

revoke execute on function public.media_is_publicly_visible(text) from public;
grant execute on function public.media_is_publicly_visible(text) to authenticated;

comment on function public.media_is_publicly_visible(text) is
  'True when the object at this storage path is the media of a report that is publicly visible. SECURITY DEFINER because a Storage policy is evaluated as the calling role, and the reports and report_media tables are owner-scoped.';

drop policy if exists "report_media_select_public" on storage.objects;

create policy "report_media_select_public"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = 'reports'
    and public.media_is_publicly_visible(name)
  );

-- -----------------------------------------------------------------------------
-- The moderator policy — unchanged in meaning, rewritten for the new path.
--
-- The moderator reads every object in the bucket, so the segment is never
-- read. It is kept as a separate policy so the moderator's access is stated
-- rather than inherited.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_select_moderator" on storage.objects;

create policy "report_media_select_moderator"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-media'
    and public.is_moderator()
  );
