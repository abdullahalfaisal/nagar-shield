-- =============================================================================
-- The soft-deleted account — the 30-day window, and the writes that must not
-- happen before it closes.
--
-- `002-identity / 007-account-deletion-and-recovery`.
--
-- =============================================================================
--
-- 1. `restore_account` was not time-boxed.
--
--    The story is explicit: the recoverable period is "exactly 30 days from
--    `profiles.deleted_at`", and the restore must be refused with
--    `VALIDATION_FAILED` once that window has passed. The shipped function
--    checked only `deleted_at is not null`.
--
--    So an account that survived past the window — because the purge job had
--    not run yet, or because the job was disabled, or because a row was
--    written by the seed — could be restored **indefinitely**. The window
--    was advisory rather than enforced: the 30-day promise was kept by the
--    purge job's schedule, not by the database.
--
--    The fix: the window is a predicate on the restore, evaluated against
--    the server's clock.
--
-- 2. A soft-deleted account could still write.
--
--    The disabled-account guard added by migration 019 asks one question:
--    "is `profiles.disabled_at` set?". It does not ask about `deleted_at`.
--    So a soft-deleted account — one that has asked for its data to be
--    deleted and is waiting out the recovery window — could still create
--    contacts, share locations, and file reports.
--
--    That is wrong in both directions. The user asked for deletion; the
--    account is on its way out. It should not be filing new reports during
--    the grace period.
--
--    The fix: the guard refuses a **deleted** account's writes too.
--
--    Two things are deliberately NOT changed:
--
--      * `soft_delete_account` and `restore_account` stay reachable — a
--        deleted user must be able to ask for the deletion and to change
--        their mind about it inside the window. Guarding them would make
--        the deletion irreversible.
--      * A **disabled** account stays able to delete itself and to restore
--        itself, for the same reason the migration 019 comment gives.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The guard — one question, asked in one place.
--
-- The predicate is now "this account may not write", which is true when it
-- is disabled **or** soft-deleted. The two columns are independent: an
-- account can be disabled and not deleted, deleted and not disabled, or
-- both, and each combination is refused for its own reason.
-- -----------------------------------------------------------------------------

create or replace function public.account_is_disabled(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles
     where id = p_user_id
       and (disabled_at is not null or deleted_at is not null)
  );
$$;

comment on function public.account_is_disabled(uuid) is
  'True when the given account may not write — it is disabled (`profiles.disabled_at`) or soft-deleted (`profiles.deleted_at`). SECURITY DEFINER so a policy can ask the question without granting visibility of `profiles`.';

-- -----------------------------------------------------------------------------
-- restore_account — the 30-day window is enforced by the database.
--
-- The check uses the **server's** clock (`now()`), never a client-supplied
-- timestamp, so a device with a wrong date cannot extend its own window.
-- -----------------------------------------------------------------------------

create or replace function public.restore_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select deleted_at into v_deleted_at from public.profiles where id = v_user;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Not deleted at all — there is nothing to restore.
  if v_deleted_at is null then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  -- The window has closed. The account is past its 30 days and the only
  -- remaining path is the purge, not a restore.
  if now() >= v_deleted_at + interval '30 days' then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  perform public.server_side_write(
    format(
      'update public.profiles
          set deleted_at = null, updated_at = now()
        where id = %L',
      v_user
    )
  );

  return jsonb_build_object(
    'deleted_at', null,
    'recoverable_until', v_deleted_at + interval '30 days'
  );
end;
$$;

comment on function public.restore_account() is
  'Restores a soft-deleted account inside its 30-day window. Outside the window the restore is refused with VALIDATION_FAILED — the window is enforced by the database, not by the purge job''s schedule.';
