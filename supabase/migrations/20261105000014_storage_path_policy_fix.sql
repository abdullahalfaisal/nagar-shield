-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000014_storage_path_policy_fix.sql
--
-- The report-media Storage policies disagree with the capture write path.
--
-- **The defect.** Migration 009 wrote the owner check as
--
--   (storage.foldername(name))[1] = auth.uid()::text
--
-- which reads the **first** path segment as the owner's id. But the capture
-- write path — the Edge Function `finalize-capture`, the ARCHITECTURE
-- contract (`reports/{user_id}/{uuid}.jpg`), the smoke test and the unit
-- brief — all use:
--
--   reports/<user_id>/<client_request_id>/<file>
--
-- For that path `storage.foldername(name)` is `{reports, <user_id>}`, so
-- `foldername(name)[1]` is the literal string `reports` and never equals
-- `auth.uid()`. **Every client upload is rejected by the insert policy** and
-- the Capture flow fails at the first byte — even though `finalize-capture`
-- itself would have accepted the path.
--
-- **The fix.** The owner is the **second** segment of the `reports/` prefix.
-- The policies are rewritten to read `foldername(name)[2]` and to require the
-- `reports/` prefix, so the path shape is validated and the owner check is
-- exact:
--
--   bucket_id = 'report-media'
--   and (storage.foldername(name))[1] = 'reports'
--   and (storage.foldername(name))[2] = auth.uid()::text
--
-- The select policy for the author and the moderator policy are corrected the
-- same way, so a report's media can be read back through a short-lived signed
-- URL.
--
-- The previous policies are dropped first, so this migration is safe to run
-- against a database that already has migration 009 applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Insert — the author may upload into their own folder only.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_insert_own" on storage.objects;

create policy "report_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (auth.uid())::text
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
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

drop policy if exists "report_media_select_moderator" on storage.objects;

create policy "report_media_select_moderator"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-media'
    and public.is_moderator()
  );
