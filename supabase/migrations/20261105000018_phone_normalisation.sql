-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 018_phone_normalisation.sql
--
-- The defect
-- ------------
-- `profiles.phone` is stored exactly as the client sent it, but every reader
-- of that column normalises the number first:
--
--   * `resolve_login_identifier` normalises the CALLER's number to E.164 and
--     then compares it against `profiles.phone` verbatim
--   * the shared `phoneSchema` (packages/shared/src/schemas) transforms a
--     number to E.164 before it validates it
--
-- So a signup that carried the local format — `01712345678`, which is what
-- the app's own placeholder (`auth.phonePlaceholder`) invites the user to
-- type — stored `01712345678` on the profile, and the account could never
-- sign in by phone. The resolver looked for `+8801712345678`; the row said
-- `01712345678`. The phone-login path was broken for exactly the numbers the
-- UI invites.
--
-- Measured against the running database, before this migration:
--
--   insert into auth.users (id, email, raw_user_meta_data)
--   values (..., json_build_object('phone', '01712345678'));
--
--   select phone from public.profiles where id = ...;   -- 01712345678
--   select public.resolve_login_identifier('01712345678');
--   -- ERROR:  AUTH_REQUIRED
--
-- The fix
-- -------
-- `handle_new_user` — the only writer of a new profile's phone — normalises
-- the number before it writes it. The server is the authority, so the
-- invariant holds for every signup path: the app, a programmatic signup
-- through the Auth API, and anything else that reaches `auth.users`.
--
-- The rule itself moves into one SQL function, `public.normalise_bd_phone`,
-- and **both** the signup trigger and the login resolver call it. The two
-- used to carry separate copies of the same rule — a change to one would
-- silently drift from the other, and the drift is invisible until a user
-- cannot sign in.
--
-- The rule is the one the shared schema already applies:
--
--   '+8801…'  (14 chars)  → unchanged
--   '8801…'   (13 chars)  → '+8801…'
--   '01…'     (11 chars)  → '+8801…'
--   anything else         → rejected
--
-- A number that cannot be normalised to a Bangladesh E.164 number is
-- rejected with `PHONE_REQUIRED` — the same error the missing-phone case
-- already raises — rather than stored in a shape no reader can match.
--
-- The `profiles.phone` uniqueness constraint becomes *stronger* by this
-- change, not weaker: `01712345678` and `+8801712345678` are the same
-- number, and they now collide instead of creating two accounts for one
-- person.
--
-- The change is confined to the signup path. A profile that already exists
-- keeps the phone it has — the `on conflict` branch only re-writes the value
-- when it is the same account's own signup event.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- public.normalise_bd_phone — the one normalisation rule
-- -----------------------------------------------------------------------------
--
-- `immutable` and free of any table access: it is a pure string rule, so it
-- can be called from anywhere without a `SECURITY DEFINER` escalation.
--
-- It returns NULL for anything that is not a Bangladesh number in E.164
-- form. NULL is the caller's signal to reject the signup — the function
-- never guesses and never falls back to the raw input.

create or replace function public.normalise_bd_phone(p_input text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_candidate text;
begin
  if p_input is null then
    return null;
  end if;

  -- Strip the separators a human types: spaces, dashes, parentheses.
  v_digits := replace(replace(replace(replace(btrim(p_input), ' ', ''), '-', ''), '(', ''), ')', '');

  if v_digits = '' then
    return null;
  end if;

  if v_digits like '+880%' then
    v_candidate := v_digits;
  elsif v_digits like '880%' and length(v_digits) = 13 then
    v_candidate := '+' || v_digits;
  elsif v_digits like '0%' and length(v_digits) = 11 then
    v_candidate := '+880' || substr(v_digits, 2);
  else
    v_candidate := '+' || v_digits;
  end if;

  -- Bangladesh E.164 only: `+880` followed by exactly ten digits. A number
  -- in any other country is not a Bangladeshi account, and the app's own
  -- schema already refuses it.
  if v_candidate !~ '^\+880[0-9]{10}$' then
    return null;
  end if;

  return v_candidate;
end;
$$;

comment on function public.normalise_bd_phone(text) is
  'Normalises a Bangladesh phone number to E.164 (+880XXXXXXXXX). Returns NULL for a number that is not a valid Bangladesh number. The single definition of the rule — the signup trigger and the login resolver both call it.';

-- The resolver is `SECURITY DEFINER`, so it runs as the function's owner. The
-- helper must also be callable by `anon` and `authenticated`, because the
-- INSERT guard is a `SECURITY DEFINER` trigger that runs as the owner while
-- the *statement* it guards runs as the client.
grant execute on function public.normalise_bd_phone(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- The backfill — the rows that already exist
-- -----------------------------------------------------------------------------
--
-- A profile row written before this migration may hold a local-format
-- number, and that account cannot sign in by phone. The rows are normalised
-- here so the fix covers the existing population, not only new signups.
--
-- A row whose phone cannot be normalised is left alone rather than nulled:
-- `profiles.phone` is `NOT NULL`, and a placeholder would destroy the only
-- remaining handle on the account. Such a row is reported, not silently
-- dropped.
--
-- The uniqueness constraint is the collision detector. Two rows holding the
-- same number in different shapes would violate it and the transaction would
-- abort — which is the correct outcome: two accounts for one phone number is
-- a conflict a human must resolve, not something to pick a winner for
-- automatically.

do $block$
declare
  v_conflict text;
begin
  select string_agg(p.id::text, ', ')
    into v_conflict
    from public.profiles p
   where public.normalise_bd_phone(p.phone) is not null
     and public.normalise_bd_phone(p.phone) <> p.phone
     and exists (
       select 1
         from public.profiles q
        where q.id <> p.id
          and q.phone = public.normalise_bd_phone(p.phone)
     );

  if v_conflict is not null then
    raise exception
      'phone normalisation would collide on the unique constraint for profile(s): %',
      v_conflict;
  end if;
end
$block$;

update public.profiles p
   set phone = public.normalise_bd_phone(p.phone)
 where public.normalise_bd_phone(p.phone) is not null
   and public.normalise_bd_phone(p.phone) <> p.phone;

-- The rows that could not be normalised. They keep their stored value; the
-- account still works by email, and the phone login simply does not resolve
-- for it. The list is a report, not a mutation.
do $report$
declare
  v_unnormalised text;
begin
  select string_agg(p.id::text || ' (' || p.phone || ')', ', ')
    into v_unnormalised
    from public.profiles p
   where public.normalise_bd_phone(p.phone) is null;

  if v_unnormalised is not null then
    raise notice 'profiles with a phone that is not a valid Bangladesh number: %', v_unnormalised;
  end if;
end
$report$;

-- -----------------------------------------------------------------------------
-- handle_new_user — normalise before writing
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_raw text := coalesce(
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'phone_number',
    new.phone
  );
  v_phone text;
  v_full_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'fullName'
  );
begin
  -- A profile without a phone cannot satisfy the NOT NULL + UNIQUE contract.
  -- The signup screen validates the phone before Auth is called, so a missing
  -- phone means a programmatic signup that bypassed the form.
  if v_phone_raw is null or char_length(btrim(v_phone_raw)) = 0 then
    raise exception 'PHONE_REQUIRED' using errcode = '23502';
  end if;

  -- The stored phone is always the E.164 form, so every reader — the login
  -- resolver above all — can compare against it directly.
  v_phone := public.normalise_bd_phone(v_phone_raw);

  if v_phone is null then
    raise exception 'PHONE_REQUIRED' using errcode = '23502';
  end if;

  insert into public.profiles (id, auth_user_id, email, phone, full_name)
  values (new.id, new.id, new.email, v_phone, nullif(btrim(v_full_name), ''))
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        auth_user_id = coalesce(public.profiles.auth_user_id, excluded.auth_user_id),
        updated_at = now();

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile row the moment a Supabase Auth user is created. `profiles.id` is the Auth id, `profiles.auth_user_id` records the Auth linkage, and `profiles.phone` is stored in E.164 form.';

-- -----------------------------------------------------------------------------
-- profiles_insert_guard — normalise the phone it takes from the Auth row
-- -----------------------------------------------------------------------------
--
-- The INSERT guard (migration 017) reads the contact details back from
-- `auth.users`, because the Auth row is the identity the client actually
-- proved. It wrote that phone straight onto the row — which re-introduced the
-- very defect this migration fixes: a client-created profile would carry
-- whatever shape the Auth metadata happened to hold.
--
-- It now normalises through the same helper.

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
  v_phone text;
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

  v_phone := public.normalise_bd_phone(
    coalesce(
      v_auth_user.raw_user_meta_data ->> 'phone',
      v_auth_user.raw_user_meta_data ->> 'phone_number'
    )
  );

  if v_phone is null then
    raise exception 'PHONE_REQUIRED' using errcode = '23502';
  end if;

  new.phone := v_phone;

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
  'Guards the `profiles` INSERT path. A client may create only its own profile, the contact details come from the Auth identity in E.164 form, and every server-managed column is reset — so a client-created profile is always a citizen.';

-- -----------------------------------------------------------------------------
-- resolve_login_identifier — compare against the normalised value
-- -----------------------------------------------------------------------------
--
-- The RPC keeps its own normalisation code out of the body and calls the
-- shared helper instead, so the rule exists once. Its behaviour is
-- unchanged: an identifier that does not resolve raises `AUTH_REQUIRED`, the
-- same error a wrong password produces, so the endpoint cannot be used to
-- enumerate registered phone numbers.

create or replace function public.resolve_login_identifier(p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trimmed text := btrim(coalesce(p_identifier, ''));
  v_email text;
  v_e164 text;
begin
  if v_trimmed = '' then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  -- An email identifier is used as-is (lower-cased).
  if v_trimmed like '%@%' then
    select p.email into v_email
    from public.profiles p
    where lower(p.email) = lower(v_trimmed);

    if v_email is null then
      raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    return jsonb_build_object('email', v_email);
  end if;

  -- A phone identifier is normalised to E.164 before comparison — the same
  -- rule the signup trigger applied to the stored value.
  v_e164 := public.normalise_bd_phone(v_trimmed);

  if v_e164 is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select p.email into v_email
  from public.profiles p
  where p.phone = v_e164;

  if v_email is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object('email', v_email);
end;
$$;

comment on function public.resolve_login_identifier(text) is
  'Resolves a phone-or-email identifier to the email-primary Auth email. Does not authenticate and does not reveal whether an account exists.';
