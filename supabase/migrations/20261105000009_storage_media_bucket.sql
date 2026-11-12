-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000009_storage_media_bucket.sql
--
-- The private media bucket and its Storage policies.
--
-- Until now the bucket existed only in the local dev database, created by hand.
-- That is a trap: `supabase db reset` wipes it, the upload path fails with a
-- bucket-not-found error, and the Capture flow silently breaks for anyone who
-- clones the repo. The bucket is part of the SCHEMA, so it belongs in the
-- migration chain.
--
-- The bucket is PRIVATE (`public = false`). Media is served through short-lived
-- signed URLs, never through a public URL (ARCHITECTURE.md §F, §H).
--
-- The object path is `<user_id>/<client_request_id>/<file>` — the first segment
-- is the uploader's id, which is what makes the Storage policies able to scope
-- access to the owner without a JOIN.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'report-media',
  'report-media',
  false,
  10485760  -- 10 MB, matching `report_media_file_size_cap`
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- -----------------------------------------------------------------------------
-- Insert — the author may upload into their own folder only.
--
-- The first path segment must be the caller's own user id. Without this a user
-- could write into another user's folder and attach the object to their own
-- report.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_insert_own" on storage.objects;

create policy "report_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- Select — the author reads their own objects; a moderator reads every object
-- in the bucket so a queued report's media can be reviewed.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_select_own" on storage.objects;

create policy "report_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "report_media_select_moderator" on storage.objects;

create policy "report_media_select_moderator"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-media'
    and public.is_moderator()
  );

-- -----------------------------------------------------------------------------
-- Update / delete — never granted to a client.
--
-- The 90-day purge job deletes the bytes with the SERVICE-ROLE key, which
-- bypasses RLS entirely. A client that could delete its own objects could
-- erase evidence that a report was never backed up, and could delete media a
-- moderator has already reviewed.
--
-- The object deletion itself is intentionally absent: `report_media.purged_at`
-- is the record of what happened, and it is written by the purge job, not by
-- the client.
-- -----------------------------------------------------------------------------
