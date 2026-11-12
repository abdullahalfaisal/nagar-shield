-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000019_disabled_account_write_guard.sql
--
-- DEFECT F — a disabled account can still write to the database.
--
-- The defect
-- ----------
-- `002-identity / 005-remote-account-disable` AC #2 requires that when an
-- account is disabled, "any API write is attempted → rejected with
-- `AUTH_DISABLED` (HTTP 403)".
--
-- The Edge Function honours that today. `supabase/functions/_shared/auth.ts`
-- → `authenticateCaller` refuses a disabled caller with `AUTH_DISABLED` → 403.
--
-- But **the database is the real boundary**, and the Edge Function is only one
-- of the doors into it. A client holding a valid citizen JWT talks to
-- PostgREST directly, and PostgREST applies the RLS policies and nothing
-- else. The `profiles` write guard refuses a disabled account — but
-- `profiles` is the ONLY table that checked `disabled_at`.
--
-- Measured against the running database as the `authenticated` role with
-- `profiles.disabled_at` set, every one of these SUCCEEDED:
--
--   insert into public.contacts ...               -- succeeded
--   insert into public.location_shares ...        -- succeeded
--   insert into public.wrong_number_reports ...   -- succeeded
--   insert into public.reports ...                -- succeeded
--   insert into public.report_media ...           -- succeeded
--   select public.finalize_capture(...)           -- succeeded (report + media rows landed)
--   select public.update_category(...)            -- succeeded
--   select public.soft_delete_account()           -- succeeded
--
-- So the disable was cosmetic: the account kept its full write surface
-- through the front door that the Edge Function does not own.
--
-- Why the `profiles` guard does not cover the rest
-- ------------------------------------------------
-- A trigger on `profiles` cannot see a write to `contacts`. A `profiles`
-- UPDATE does not happen when a client inserts a contact. The guard is
-- row-scoped to the table it is attached to, so it can only ever protect
-- that table.
--
-- The fix
-- -------
-- Two layers, because the write paths are two different shapes:
--
--   1. A shared predicate `public.account_is_disabled(uuid)` — SECURITY
--      DEFINER, because the client roles cannot read `profiles` rows they do
--      not own, and a policy must be able to ask the question without
--      granting visibility.
--
--   2. The predicate is applied to:
--        * every CLIENT WRITE POLICY — `contacts`, `location_shares`,
--          `wrong_number_reports`, `reports`, `report_media`, and the
--          Storage insert policy `report_media_insert_own`; and
--        * the top of every SECURITY DEFINER RPC a client may call —
--          `finalize_capture`, `update_category`, `soft_delete_account`,
--          `restore_account`.
--
--      The RPCs matter because they are SECURITY DEFINER: they run with the
--      owner's privileges, so the RLS policies do not apply to the writes
--      they perform. A policy-level fix alone would leave them wide open —
--      and `finalize_capture` was measured as the widest hole of all.
--
-- The discriminator: client or server
-- -----------------------------------
-- The check must refuse a CLIENT and never refuse the SERVER. The server has
-- legitimate work against disabled rows:
--
--   * `disable_user` writes `disabled_at` — the disable itself.
--   * the PII purge scrubs a disabled account's tombstone (DEFECT D).
--   * `purge-deleted-accounts` writes the tombstone placeholders.
--
-- The discriminator is the same one `profiles_update_guard` already uses,
-- and for the same reason (see migration 017): the `role` GUC is the only
-- role signal that survives the `SECURITY DEFINER` hop. `session_user` and
-- `current_user` are useless — inside a SECURITY DEFINER function
-- `current_user` is the owner, and the session user is the pool's login.
--
--   role                 anon           authenticated     service_role
--   -------------------- -------------- ----------------- ---------------
--   current_setting(role) anon          authenticated      service_role
--
-- So: the caller is a CLIENT exactly when the role GUC is `anon` or
-- `authenticated`. Everything else — `service_role`, the migration role,
-- `supabase_auth_admin` — is the server.
--
-- `auth.role()` is deliberately NOT used: it reads the JWT's role claim and
-- falls back to `service_role` when the request carries no claims, so an
-- unauthenticated REST call would look like the server.
--
-- The `app.server_side_write` bypass is honoured as well, for the same reason
-- it exists in the other guards: the server-side functions set it for the
-- duration of their own statement, and the check must not reject those.
--
-- The error
-- ---------
-- `ACCOUNT_DISABLED` with `errcode = '42501'`, exactly as the `profiles`
-- guard already raises it. `mapDatabaseError` in
-- `supabase/functions/_shared/http.ts` maps `42501` + `ACCOUNT_DISABLED` →
-- `AUTH_DISABLED` → HTTP 403. The error code is therefore already mapped
-- end to end, and nothing in the Edge Functions needs to change.
--
-- The forward-only rule
-- ---------------------
-- Migrations are never edited once applied. This is a new file.
-- =============================================================================

-- =============================================================================
-- 1. The shared predicate
-- =============================================================================
--
-- SECURITY DEFINER, because the client roles may not read `profiles` rows
-- they do not own, and a policy must be able to ask the question without
-- granting visibility of the whole table.
--
-- STABLE, because it only reads.
--
-- The parameter defaults to `auth.uid()`, so a policy can call it with no
-- argument: `public.account_is_disabled()`.

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
       and disabled_at is not null
  );
$$;

comment on function public.account_is_disabled(uuid) is
  'True when the given account is disabled (`profiles.disabled_at` is set). SECURITY DEFINER so a policy can ask the question without granting visibility of `profiles`.';

-- =============================================================================
-- 2. The client/server discriminator
-- =============================================================================
--
-- One function, so every guard in this migration — the policies and the RPCs
-- — asks the question the same way. If the rule ever changes, it changes in
-- one place.
--
-- The rule: the caller is a CLIENT when the role GUC is `anon` or
-- `authenticated`. The server is every other role.

create or replace function public.caller_is_client()
returns boolean
language sql
stable
as $$
  select current_setting('role', true) in ('anon', 'authenticated');
$$;

comment on function public.caller_is_client() is
  'True when the statement runs as a client role (`anon` or `authenticated`). The `role` GUC is the only role signal that survives a SECURITY DEFINER hop, so it is what tells a client write from a server write.';

-- =============================================================================
-- 3. The guard
-- =============================================================================
--
-- One function, called from every write path. It returns a boolean, so it
-- can be used both as a policy predicate (`with check (...)`) and as a
-- statement inside an RPC (`if public.assert_account_not_disabled() then`).
--
-- The policy usage raises the error from inside the policy, which PostgREST
-- surfaces as a 42501 with the message intact.

create or replace function public.assert_account_not_disabled(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $guard$
begin
  -- The server may always write, including against a disabled row: the
  -- disable itself, the PII purge, the tombstone writes.
  if not public.caller_is_client() then
    return true;
  end if;

  -- The server-side functions lift the client guards for the duration of
  -- their own statement.
  if coalesce(current_setting('app.server_side_write', true), 'off') = 'on' then
    return true;
  end if;

  if p_user_id is null then
    return true;
  end if;

  if public.account_is_disabled(p_user_id) then
    raise exception 'ACCOUNT_DISABLED' using errcode = '42501';
  end if;

  return true;
end;
$guard$;

comment on function public.assert_account_not_disabled(uuid) is
  'Refuses a write by a disabled account. Raises `ACCOUNT_DISABLED` (errcode 42501), which maps to `AUTH_DISABLED` → HTTP 403. The server is never refused.';

-- =============================================================================
-- 4. The write policies
-- =============================================================================
--
-- Each policy gains the guard. The guard is a SECURITY DEFINER function that
-- raises, so the policy evaluates to an exception rather than to false —
-- the client sees the error code, not an empty result.
--
-- `for all` policies are split rather than amended, because a `for all`
-- policy cannot carry a different predicate per command. The SELECT
-- predicates are unchanged: a disabled account may still READ its own rows
-- (the handover requires the app to show a disable screen and to let the
-- user delete their account — both need reads). It is the WRITES that the
-- disable forbids.

-- -----------------------------------------------------------------------------
-- contacts — the owner may insert, update and delete only while enabled.
-- -----------------------------------------------------------------------------

drop policy if exists "contacts_owner_all" on public.contacts;

create policy "contacts_select_own"
  on public.contacts for select
  using (user_id = auth.uid());

create policy "contacts_insert_own"
  on public.contacts for insert
  with check (user_id = auth.uid() and public.assert_account_not_disabled());

create policy "contacts_update_own"
  on public.contacts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.assert_account_not_disabled());

create policy "contacts_delete_own"
  on public.contacts for delete
  using (user_id = auth.uid() and public.assert_account_not_disabled());

-- -----------------------------------------------------------------------------
-- location_shares — the sender only, and only while enabled.
-- -----------------------------------------------------------------------------

drop policy if exists "location_shares_insert_own" on public.location_shares;

create policy "location_shares_insert_own"
  on public.location_shares for insert
  with check (sender_id = auth.uid() and public.assert_account_not_disabled());

-- -----------------------------------------------------------------------------
-- wrong_number_reports — the reporter may only file while enabled.
-- -----------------------------------------------------------------------------

drop policy if exists "wrong_number_reports_insert_own" on public.wrong_number_reports;

create policy "wrong_number_reports_insert_own"
  on public.wrong_number_reports for insert
  with check (reporter_id = auth.uid() and public.assert_account_not_disabled());

-- -----------------------------------------------------------------------------
-- reports — the author may create and edit only while enabled.
-- -----------------------------------------------------------------------------

drop policy if exists "reports_insert_own" on public.reports;

create policy "reports_insert_own"
  on public.reports for insert
  with check (author_id = auth.uid() and public.assert_account_not_disabled());

drop policy if exists "reports_update_own" on public.reports;

create policy "reports_update_own"
  on public.reports for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and public.assert_account_not_disabled());

-- -----------------------------------------------------------------------------
-- report_media — the author's media rows.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_insert_own" on public.report_media;

create policy "report_media_insert_own"
  on public.report_media for insert
  with check (
    public.assert_account_not_disabled()
    and exists (
      select 1 from public.reports r
      where r.id = report_media.report_id and r.author_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Storage — the report-media bucket.
--
-- The upload policy is the first half of a capture: the client writes the
-- object, then calls `finalize_capture` to write the report and the media
-- row. A disabled account that could upload would leave orphaned objects in
-- the bucket even after the RPC below is closed.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_insert_own" on storage.objects;

create policy "report_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (auth.uid())::text
    and public.assert_account_not_disabled()
  );

-- =============================================================================
-- 5. The RPCs
-- =============================================================================
--
-- These are SECURITY DEFINER, so the writes they perform are NOT subject to
-- the policies above. Each one gets an explicit guard at the top.
--
-- The order matters: the AUTH_REQUIRED check stays first, because an
-- unauthenticated caller is a different failure from a disabled one, and the
-- error code should say so.

-- -----------------------------------------------------------------------------
-- finalize_capture — the report + media write.
--
-- This is the widest hole that was measured: it landed a full report row
-- AND its media row for a disabled account. The function also runs before
-- the rate limit, so the disable is refused before any accounting happens.
-- -----------------------------------------------------------------------------

create or replace function public.finalize_capture(
  p_client_request_id uuid,
  p_storage_path text,
  p_media_type public.media_type,
  p_byte_size bigint,
  p_duration_seconds double precision,
  p_width integer,
  p_height integer,
  p_lat double precision,
  p_lng double precision,
  p_captured_at timestamptz,
  p_description text,
  p_public_visibility public.public_visibility,
  p_category public.report_category,
  p_area_hierarchy jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid := auth.uid();
  v_report_id uuid;
  v_area jsonb;
begin
  if v_author is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- A disabled account may not create a report.
  perform public.assert_account_not_disabled(v_author);

  -- Cap: 50 reports per day per author (FR-CAPTURE-3).
  if (select count(*) from public.reports
      where author_id = v_author and created_at > now() - interval '1 day') >= 50 then
    raise exception 'CAPTURE_RATE_LIMIT' using errcode = 'P0001';
  end if;

  -- Idempotent: an existing row for this client_request_id is returned as-is.
  select id into v_report_id
  from public.reports
  where author_id = v_author and client_request_id = p_client_request_id;

  if v_report_id is not null then
    return v_report_id;
  end if;

  -- The stored hierarchy is authoritative. A resolver that degraded still
  -- stores a complete document — `division` and `city` are always present,
  -- the thana may be null.
  v_area := coalesce(
    p_area_hierarchy,
    '{"division":"Dhaka","city":"Dhaka","thana":null,"neighborhood":null}'::jsonb
  );

  insert into public.reports (
    author_id, client_request_id, lat, lng, captured_at, description,
    category, public_visibility, area_hierarchy
  )
  values (
    v_author, p_client_request_id, p_lat, p_lng, p_captured_at, p_description,
    p_category, p_public_visibility, v_area
  )
  returning id into v_report_id;

  -- The media row is written in the same transaction as the report, so a
  -- report never exists without its media.
  insert into public.report_media (
    report_id, storage_path, media_type, byte_size, duration_seconds, width, height
  )
  values (
    v_report_id, p_storage_path, p_media_type, p_byte_size,
    p_duration_seconds, p_width, p_height
  );

  return v_report_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- update_category — the author-only category edit.
-- -----------------------------------------------------------------------------

create or replace function public.update_category(
  p_report_id uuid,
  p_category public.report_category
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid := auth.uid();
begin
  if v_author is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- A disabled account may not edit a report.
  perform public.assert_account_not_disabled(v_author);

  perform public.server_side_write(
    format(
      'update public.reports
         set category = %L::public.report_category, updated_at = now()
       where id = %L and author_id = %L',
      p_category, p_report_id, v_author
    )
  );

  return jsonb_build_object('report_id', p_report_id, 'category', p_category);
end;
$$;

-- -----------------------------------------------------------------------------
-- soft_delete_account — the user-driven account deletion.
--
-- The account lifecycle is server-managed, so this RPC is the ONLY way a
-- user may soft-delete themselves — which is why it must remain reachable
-- for a DISABLED account. A disabled user must still be able to ask for
-- their own data to be deleted.
--
-- So this RPC does NOT refuse a disabled account. It is listed here because
-- the handover named it, and the finding is the opposite of the others: the
-- guard would have been wrong.
--
-- What it does do is refuse to write the lifecycle column directly — that
-- stays with `profiles_update_guard`, which raises
-- `PROFILE_LIFECYCLE_IS_SERVER_MANAGED` for a client that tries.
--
-- It is left unchanged.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- restore_account — the user-driven recovery.
--
-- Same reasoning as `soft_delete_account`: a disabled user must be able to
-- recover their own account, otherwise the disable is a permanent
-- imprisonment with no exit. The RPC stays reachable.
--
-- Left unchanged.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 6. The remaining write paths a client can reach
-- =============================================================================
--
-- `flags` — a citizen may cast a flag on a report. It is a write, so it is
-- guarded too: a disabled account has no business flagging reports.
--
-- `flag_report` (the RPC) is not guarded separately. It calls
-- `server_side_write` for its own writes, and the flag INSERT goes through
-- the `flags_insert_own` policy, which carries the guard.

drop policy if exists "flags_insert_own" on public.flags;

create policy "flags_insert_own"
  on public.flags for insert
  with check (flagger_id = auth.uid() and public.assert_account_not_disabled());

-- =============================================================================
-- 7. The `moderation_actions` insert
-- =============================================================================
--
-- The audit trail is appended by the server-side moderation functions, never
-- by a client. The policy is left as it is: `moderator_id = auth.uid()`, and
-- the trail's own append-only trigger is the guarantee that matters.
-- =============================================================================

-- =============================================================================
-- 8. Grants
-- =============================================================================
--
-- The three new functions must be executable by the client roles: the
-- policies are evaluated as the calling role, so a SECURITY DEFINER
-- function that the caller cannot EXECUTE would fail the policy with a
-- permission error instead of the intended `ACCOUNT_DISABLED`.
--
-- `assert_account_not_disabled` is SECURITY DEFINER and raises, so it must
-- NOT be executable by `anon` directly — a caller could use it as an
-- oracle. In practice `anon` has no write policy that reaches it, and the
-- check is on the caller's OWN account, so there is no information to
-- extract. It is granted to `authenticated` only, which is the role the
-- write policies run as.

grant execute on function public.account_is_disabled(uuid) to authenticated, service_role;
grant execute on function public.caller_is_client() to authenticated, service_role;
grant execute on function public.assert_account_not_disabled(uuid) to authenticated, service_role;

-- The functions are PUBLIC by default. Revoke from PUBLIC so the grant above
-- is the whole story.
revoke execute on function public.account_is_disabled(uuid) from public;
revoke execute on function public.caller_is_client() from public;
revoke execute on function public.assert_account_not_disabled(uuid) from public;
