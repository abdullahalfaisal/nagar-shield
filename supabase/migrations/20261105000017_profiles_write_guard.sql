-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 017_profiles_write_guard.sql
--
-- Two defects in `profiles_update_guard`, both found by impersonating a real
-- client role against the running database (not by reading the code):
--
--   * DEFECT C — a citizen can promote **themselves** to `role = 'moderator'`
--     with a direct PostgREST update, because the policy is row-scoped
--     (`id = auth.uid()`) and the guard only checked `disabled_at`.
--
--   * DEFECT D — the guard refuses EVERY update to a disabled profile, so the
--     account purge cannot scrub the PII of an account a moderator disabled.
--     The purge needs to write the tombstone placeholders; the guard raises
--     `ACCOUNT_DISABLED` and the account stays un-purged forever.
--
-- Both are fixed by replacing the guard with one that states, explicitly,
-- which columns each caller may write.
-- =============================================================================

-- =============================================================================
-- DEFECT C — the self-escalation
-- =============================================================================
--
-- The defect
-- ----------
-- The policy is row-scoped:
--
--   create policy "profiles_update_own" on public.profiles for update
--     using (id = auth.uid()) with check (id = auth.uid());
--
-- and `profiles_update_guard` only refused updates to a disabled row:
--
--   if old.disabled_at is not null then raise exception 'ACCOUNT_DISABLED'; end if;
--
-- So the guard placed no restriction on WHICH columns a citizen may write.
-- Measured as `authenticated` with a citizen's JWT:
--
--   update public.profiles set role = 'moderator' where id = <self>;  -- UPDATE 1
--   select public.is_moderator();                                       -- t
--
-- The citizen became a moderator. `is_moderator()` gates the moderation
-- queue, the report detail, the audit trail, the account search, and the
-- `disable_user` / `moderation_decide` RPCs — so this is a total compromise
-- of the moderation console, not a cosmetic bug.
--
-- Two more holes sat behind the same missing column check, and both are
-- escapes from the PII purge that `002-deleted-account-pii-purge` promises:
--
--   * `pii_purged_at` — the purge's worklist predicate is
--     `deleted_at < now() - interval '30 days' AND pii_purged_at IS NULL`.
--     A citizen who sets their own `pii_purged_at` removes themselves from
--     the worklist and keeps their PII forever.
--
--   * `deleted_at` — a citizen who clears their own `deleted_at` after the
--     window closes escapes the purge the same way.
--
-- The fix
-- -------
-- The guard becomes **column-scoped**, mirroring the pattern already used by
-- `reports_update_guard` (which restricts an author to the category column).
--
-- Who may write what:
--
--   client-owned    full_name, alternate_phone, locale, theme,
--                   biometric_opt_in
--   moderator-only  role, disabled_at
--   server-only     deleted_at, pii_purged_at, phone, email,
--                   biometric_fail_count, biometric_fail_until
--   immutable       id, auth_user_id, created_at
--
-- The moderator-only columns are additionally refused when the moderator
-- changes their **own** role — a moderator cannot escalate, which is the
-- same shape of the defect being fixed here.
--
-- The discriminator
-- -----------------
-- The guard must tell a client write from a server write. The candidates,
-- and what each actually reads inside a `SECURITY DEFINER` function:
--
--   role                 anon           authenticated     service_role
--   -------------------- -------------- ----------------- ---------------
--   session_user         postgres       postgres          postgres
--   current_user         postgres       postgres          postgres
--   current_setting(role) anon          authenticated      service_role
--
-- `session_user` and `current_user` are useless here: the guard is
-- `SECURITY DEFINER`, so `current_user` is the owner, and the session user
-- is the pool's login role, not the caller's.
--
-- The `role` GUC is the one signal that survives the `SECURITY DEFINER` hop,
-- because it is set by PostgREST with `SET LOCAL ROLE <jwt role>` and a
-- `SECURITY DEFINER` function does not change it. It is also the signal
-- Postgres itself enforces, so it cannot disagree with the privileges the
-- statement actually ran under.
--
-- `auth.role()` is deliberately NOT used: it reads the JWT's role claim, and
-- when the request carries no claims it falls back to `service_role`. An
-- unauthenticated REST call would then look like the server.
--
-- The rule is therefore: the caller is a **client** exactly when the role
-- GUC is `anon` or `authenticated`. Every other role — `service_role`, the
-- migration role, `supabase_auth_admin` — is the server. The two client roles
-- are the only ones PostgREST can select for an unauthenticated or a
-- signed-in request.
-- =============================================================================

-- =============================================================================
-- DEFECT D — the purge is blocked for a disabled account
-- =============================================================================
--
-- The defect
-- ----------
-- The purge job scrubs the account with an ordinary `UPDATE` on `profiles`:
--
--   update public.profiles set phone = <placeholder>, email = <placeholder>,
--     full_name = null, alternate_phone = null where id = <user>;
--
-- The guard refuses it when the account is disabled:
--
--   ERROR:  ACCOUNT_DISABLED
--   CONTEXT:  PL/pgSQL function profiles_update_guard() line 11 at RAISE
--
-- An account that a moderator disabled and then deleted never gets its PII
-- purged: the guard makes the account permanently un-purgeable, so
-- `pii_purged_at` is never written and the job re-selects it forever.
--
-- The fix
-- -------
-- The guard's job is to stop a **client** from writing a **disabled**
-- account. It is not the guard for a server-side write, and it must not
-- become one by accident.
--
-- The purge runs as `service_role` — the role GUC reads `service_role`, so
-- the server branch applies and the tombstone write succeeds.
--
-- A moderator **re-enabling** an account is a client write against a
-- disabled row, so that one case is exempted explicitly: the
-- `profiles_moderator_update` policy already requires `is_moderator()`, and
-- `is_moderator()` itself requires `disabled_at IS NULL`, so a disabled
-- moderator can never reach it.
-- =============================================================================

create or replace function public.profiles_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The effective role of the statement, per the `role` GUC. This is the only
  -- one of the role signals that survives the SECURITY DEFINER hop.
  v_effective_role text := current_setting('role', true);
  -- True when the caller is a client: an unauthenticated request, or a
  -- signed-in citizen. Everything else is the server.
  v_is_client boolean := v_effective_role in ('anon', 'authenticated');
  -- True when the caller is a moderator, by the server's own rule.
  v_caller_is_moderator boolean := false;
begin
  -- A **referential action** — Postgres nulling `profiles.auth_user_id`
  -- because the Auth identity was destroyed — is an UPDATE of this row, and
  -- it fires this trigger one level deeper than a statement anybody asked
  -- for. The same depth rule as the audit trail's append-only trigger.
  -- Only the Auth linkage may be nulled that way.
  if pg_trigger_depth() > 1 then
    if new.id is distinct from old.id
       or (new.auth_user_id is distinct from old.auth_user_id and new.auth_user_id is not null) then
      raise exception 'PROFILE_IDENTITY_IMMUTABLE' using errcode = '42501';
    end if;

    return new;
  end if;

  -- Server-side paths (the moderation functions, the biometric accounting,
  -- the soft-delete and restore) set this flag for the duration of their own
  -- statement. Without the bypass, the guard would also reject the server's
  -- legitimate writes.
  if coalesce(current_setting('app.server_side_write', true), 'off') = 'on' then
    return new;
  end if;

  -- The server may always write a profile row. This is what lets the purge
  -- scrub a disabled account (DEFECT D) and what lets the Auth lifecycle
  -- move the linkage.
  if not v_is_client then
    return new;
  end if;

  -- The identity columns never change. `id` is the application identity that
  -- every foreign key resolves to; `auth_user_id` is the Auth linkage, and
  -- only the Auth lifecycle (the signup trigger, the auth delete) may move it.
  if new.id is distinct from old.id
     or new.auth_user_id is distinct from old.auth_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'PROFILE_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;

  -- `role` and `disabled_at` are moderator-only columns. A moderator may
  -- change another account's, but never their own role — that would let a
  -- moderator escalate, and it is the same shape of the defect being fixed.
  if new.role is distinct from old.role or new.disabled_at is distinct from old.disabled_at then
    v_caller_is_moderator := public.is_moderator();

    if not v_caller_is_moderator then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if new.role is distinct from old.role and old.id = auth.uid() then
      raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '42501';
    end if;
  end if;

  -- The lifecycle columns are server decisions. A client may not clear its own
  -- soft-delete, forge its own purge stamp, or rewrite the biometric failure
  -- accounting — each of those is an escape from the PII purge.
  if new.deleted_at is distinct from old.deleted_at
     or new.pii_purged_at is distinct from old.pii_purged_at
     or new.phone is distinct from old.phone
     or new.email is distinct from old.email
     or new.biometric_fail_count is distinct from old.biometric_fail_count
     or new.biometric_fail_until is distinct from old.biometric_fail_until then
    raise exception 'PROFILE_LIFECYCLE_IS_SERVER_MANAGED' using errcode = '42501';
  end if;

  -- A disabled account cannot mutate its own profile. The one exemption is a
  -- moderator re-enabling it, which is the documented way to lift a disable.
  if old.disabled_at is not null then
    if not (v_caller_is_moderator and new.disabled_at is null) then
      raise exception 'ACCOUNT_DISABLED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.profiles_update_guard() is
  'Guards the `profiles` write path. A client may write only its own user-facing columns; `role` and `disabled_at` are moderator-only; the lifecycle columns are server-managed; `id`, `auth_user_id` and `created_at` never change. A disabled account cannot write at all — except by the server, which is how the purge scrubs it.';

-- -----------------------------------------------------------------------------
-- The trigger itself is unchanged — it already fires BEFORE UPDATE on every
-- row, so the redefined function is picked up immediately.
-- -----------------------------------------------------------------------------

drop trigger if exists profiles_update_guard_trigger on public.profiles;

create trigger profiles_update_guard_trigger
  before update on public.profiles
  for each row execute function public.profiles_update_guard();

-- =============================================================================
-- DEFECT E — the INSERT path is the same escalation, one door further down
-- =============================================================================
--
-- The defect
-- ----------
-- The UPDATE guard above was not the only way in. The INSERT policy is:
--
--   create policy "profiles_insert_own" on public.profiles for insert
--     with check (id = auth.uid());
--
-- It checks the ROW ID and nothing else. A client that can INSERT a profile
-- row for its own id can choose every other column, including
-- `role = 'moderator'`, `disabled_at`, `pii_purged_at` and `deleted_at`.
--
-- There is no `profiles_insert_guard` trigger, so nothing narrows it.
--
-- Today the escalation is blocked by two accidents rather than by a rule:
--
--   * the signup trigger (`handle_new_user`) creates the profile row first,
--     so a client INSERT collides with the primary key — and
--   * `profiles.auth_user_id` has a unique index, so a client INSERT cannot
--     claim another account's Auth linkage.
--
-- Neither is a guarantee. The INSERT policy is public API: any client that
-- reaches a state where its profile row is absent can insert one with any
-- role. The trigger that creates the profile is `SECURITY DEFINER` and
-- raises `PHONE_REQUIRED` when the signup carried no phone — a signup that
-- a client can drive directly through the Auth API.
--
-- The fix
-- -------
-- The INSERT path gets the same treatment as the UPDATE path: a client may
-- create its own profile, and it starts as a **citizen**. Every
-- server-managed column is reset to its default, whatever the client asked
-- for.
--
-- The guard normalises rather than refuses. Refusing would turn a
-- misconfigured signup into a hard failure; normalising produces the row
-- the server would have produced, which is the documented shape:
--
--   role              -> 'citizen'
--   disabled_at      -> NULL
--   deleted_at       -> NULL
--   pii_purged_at    -> NULL
--   biometric_*      -> the defaults (the biometric accounting is server-side)
--   phone / email    -> taken from the Auth user, not from the client
--
-- The Auth user is the authority for the phone and the email, because the
-- Auth row is the identity the client actually proved. Reading them back
-- from `auth.users` also removes the last way a client could write a
-- *different* account's phone number into its own row.
-- =============================================================================

create or replace function public.profiles_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
declare
  -- The effective role of the statement, per the `role` GUC. The only role
  -- signal that survives the SECURITY DEFINER hop.
  v_effective_role text := current_setting('role', true);
  v_is_client boolean := v_effective_role in ('anon', 'authenticated');
  v_auth_user record;
begin
  -- The server may insert whatever it likes. The signup trigger itself runs
  -- as the owner, and the backfill and the seed do too.
  if not v_is_client then
    return new;
  end if;

  -- A client may only create a profile for its own Auth identity. The RLS
  -- policy already requires `id = auth.uid()`; this is the same rule stated
  -- where the column values are decided.
  if new.id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- The Auth row is the authority for the contact details.
  select u.email, u.raw_user_meta_data
    into v_auth_user
    from auth.users u
   where u.id = auth.uid();

  if not found then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- The Auth linkage points at the caller's own Auth user.
  new.auth_user_id := auth.uid();

  -- The contact details come from the Auth identity, never from the client.
  new.email := v_auth_user.email;
  new.phone := coalesce(
    v_auth_user.raw_user_meta_data ->> 'phone',
    v_auth_user.raw_user_meta_data ->> 'phone_number'
  );

  if new.phone is null or char_length(btrim(new.phone)) = 0 then
    raise exception 'PHONE_REQUIRED' using errcode = '23502';
  end if;

  new.phone := btrim(new.phone);

  -- Every server-managed column is reset. A client creates a citizen.
  new.role := 'citizen';
  new.disabled_at := null;
  new.deleted_at := null;
  new.pii_purged_at := null;
  new.biometric_opt_in := false;
  new.biometric_fail_count := 0;
  new.biometric_fail_until := null;

  return new;
end;
$guard$;

comment on function public.profiles_insert_guard() is
  'Guards the `profiles` INSERT path. A client may create only its own profile, the contact details come from the Auth identity, and every server-managed column is reset — so a client-created profile is always a citizen.';

drop trigger if exists profiles_insert_guard_trigger on public.profiles;

create trigger profiles_insert_guard_trigger
  before insert on public.profiles
  for each row execute function public.profiles_insert_guard();
