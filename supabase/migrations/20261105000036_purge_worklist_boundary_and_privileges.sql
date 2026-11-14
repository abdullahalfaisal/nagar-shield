-- =============================================================================
-- The purge worklist — the boundary, and who may call it.
--
-- `002-identity / 007-account-deletion-and-recovery`.
--
-- =============================================================================
--
-- Two defects, both found by `supabase/tests/account_deletion.sql`.
--
-- 1. The worklist's window was one instant too narrow.
--
--    Three places state the same 30-day promise:
--
--      * `restore_account` (migration 035) refuses with
--        `VALIDATION_FAILED` when `now() >= deleted_at + interval '30 days'`;
--      * `isRecoveryWindowOpen` (the shared package) is open only while
--        `now() < deleted_at + 30 days`;
--      * `job_purge_deleted_accounts` (migration 012) selected
--        `deleted_at < now() - interval '30 days'`.
--
--    The first two agree: the window closes **at** `deleted_at + 30 days`.
--    The third did not. `deleted_at < now() - 30 days` is the same instant
--    written with a strict inequality, so for the sliver between
--    `deleted_at + 30 days` and `deleted_at + 30 days + 1 microsecond` the
--    account was **unrecoverable but not yet purgeable**.
--
--    The consequence: the citizen had lost their account — the app said the
--    recovery period was over — while their PII was still on disk, and the
--    job that would have removed it would not touch the account for another
--    run. The story's edge-case table says the boundary is "treated as
--    expired", and the restore treats it that way. The purge now does too.
--
--    The fix is `<=`, which makes the worklist's predicate exactly the
--    restore's predicate read from the other side:
--
--        deleted_at <= now() - interval '30 days'
--    ⟺ deleted_at + interval '30 days' <= now()
--    ⟺ now() >= deleted_at + interval '30 days'
--
--    The two halves of the promise now land on the same instant. The purge
--    still never runs *before* the window closes — the criterion AC #8 names
--    — and now it runs the moment the window closes, which is when the
--    promise says it should.
--
-- 2. The job worklists were callable by `anon` and `authenticated`.
--
--    Migration 012 revoked execute from `public` and granted it to
--    `service_role`. That is not enough on Supabase: `anon` and
--    `authenticated` carry their **own** EXECUTE grant on these functions
--    (from the platform's default privileges), and a `REVOKE … FROM public`
--    does not remove a grant made directly to a role. The resulting ACL was
--
--        {postgres=X, anon=X, authenticated=X, service_role=X}
--
--    so any signed-in citizen — and any anonymous caller — could call
--    `job_purge_deleted_accounts` and enumerate every account awaiting
--    purge, along with the exact instant each was deleted. Migration 015
--    already had the correct three-line pattern for
--    `job_keep_project_awake_ping`; migration 012 needed the same two extra
--    revokes.
--
--    The worklist is the service role's alone. The purge job calls it with
--    the service-role key, and the Edge Function
--    (`supabase/functions/purge-deleted-accounts/index.ts`) rejects any
--    caller that is not the service role before it ever reaches the RPC.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The boundary.
-- -----------------------------------------------------------------------------

create or replace function public.job_purge_deleted_accounts(p_batch_size integer)
returns table (
  id uuid,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.deleted_at
  from public.profiles p
  where p.deleted_at <= now() - interval '30 days'
    and p.pii_purged_at is null
  order by p.deleted_at asc
  limit greatest(1, least(coalesce(p_batch_size, 100), 500));
$$;

comment on function public.job_purge_deleted_accounts(integer) is
  'The 30-day deleted-account PII worklist. The predicate `deleted_at <= now() - interval ''30 days''` is the same instant `restore_account` refuses at (`now() >= deleted_at + interval ''30 days''`), so the window closes and the purge begins together.';

-- -----------------------------------------------------------------------------
-- 2. The privileges.
--
-- `REVOKE … FROM public` alone does not remove the direct grants that
-- Supabase's default privileges give `anon` and `authenticated`, so both are
-- revoked explicitly — the pattern migration 015 already used.
-- -----------------------------------------------------------------------------

revoke execute on function public.job_purge_deleted_accounts(integer) from public;
revoke execute on function public.job_purge_deleted_accounts(integer) from anon;
revoke execute on function public.job_purge_deleted_accounts(integer) from authenticated;
grant execute on function public.job_purge_deleted_accounts(integer) to service_role;

revoke execute on function public.job_purge_media_candidates(integer) from public;
revoke execute on function public.job_purge_media_candidates(integer) from anon;
revoke execute on function public.job_purge_media_candidates(integer) from authenticated;
grant execute on function public.job_purge_media_candidates(integer) to service_role;

revoke execute on function public.job_geocode_cache_evictions(integer) from public;
revoke execute on function public.job_geocode_cache_evictions(integer) from anon;
revoke execute on function public.job_geocode_cache_evictions(integer) from authenticated;
grant execute on function public.job_geocode_cache_evictions(integer) to service_role;
