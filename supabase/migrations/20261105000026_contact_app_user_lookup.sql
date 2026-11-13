-- =============================================================================
-- 20261105000026_contact_app_user_lookup.sql
--
-- The Location Sharing screen has to route each recipient one of two ways:
--
--   * an **app user** → a `location_shares` row with
--     `share_channel = 'app'`, the recipient reading it inside Nagar Shield;
--   * everyone else → the **OS share sheet**, which is the only channel that
--     reaches someone who has no Nagar Shield account.
--
-- To tell the two apart the client needs to know, for each of **its own**
-- contacts, whether that phone number belongs to a Nagar Shield account.
--
-- Why this needs a function
-- ------------------------
-- `public.profiles` is owner-scoped: a client may read only its own row. The
-- other user's profile — and specifically their phone — is not readable by
-- the sender's client, and it must not be: a phone number is PII, and the
-- sender already holds the contact's phone anyway, but the *account* behind
-- it is nobody else's business.
--
-- The RLS on `profiles` is deliberately not loosened for this. Instead the
-- answer is computed **inside** the database and only a **boolean** comes
-- back out:
--
--   * the function is `security definer`, so it may read `profiles`;
--   * it only ever looks at the contacts **of the calling user** — the
--     contact ids are intersected with `user_id = auth.uid()` before
--     anything is resolved, so a caller cannot probe an arbitrary contact;
--   * it returns a set of **contact ids**, and nothing else. No phone
--     number, no name, no user id, no email. The caller already knows the
--     contact's phone; the only new fact is the yes/no.
--
-- The failing direction is the safe one
-- -------------------------------------
-- The edge-case table in story 002 says: *"The recipient has a Nagar Shield
-- account but the phone lookup is offline → the lookup failure falls back to
-- the OS share sheet — the safe direction, because the OS path works with no
-- network and claims nothing."*
--
-- So the client treats a failed lookup exactly like a "not an app user"
-- answer: the recipient goes down the OS path. A lookup failure must never
-- mean "send this to nobody", and it must never mean "claim it was
-- delivered" — it means "use the channel that claims nothing".
--
-- What does NOT change
-- --------------------
--   * `public.profiles` keeps its owner-scoped policies — nothing is
--     loosened here;
--   * the `location_shares` RLS is untouched;
--   * the `contacts` RLS is untouched;
--   * the function reveals **no** account state beyond the yes/no, and it
--     reveals it only for the caller's own contacts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- resolve_app_contacts
--
-- Returns the ids of the caller's own contacts that belong to a Nagar Shield
-- account.
--
-- The input is the list of contact ids the client is asking about. The list
-- is intersected with the caller's own contacts **first**, so a contact
-- belonging to somebody else is silently ignored rather than resolved.
--
-- A contact with a malformed phone is simply not matched: the normalisation
-- below returns NULL for it, and NULL never matches. That is the same
-- direction the OS share sheet would take, so a malformed number degrades
-- rather than crashes.
-- -----------------------------------------------------------------------------

create or replace function public.resolve_app_contacts(p_contact_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.phone
      from public.contacts c
     where c.user_id = auth.uid()
       and c.id = any (coalesce(p_contact_ids, '{}'::uuid[]))
  ),
  normalised as (
    select m.id, public.normalise_bd_phone(m.phone) as e164
      from mine m
  )
  select n.id as contact_id
    from normalised n
    join public.profiles p
      on p.phone = n.e164
   where n.e164 is not null
     -- A disabled or deleted account is not a reachable in-app recipient:
     -- the snapshot would land in an account nobody can read. Those
     -- recipients go down the OS path instead.
     and p.disabled_at is null
     and p.deleted_at is null;
$$;

grant execute on function public.resolve_app_contacts(uuid[]) to authenticated;

comment on function public.resolve_app_contacts(uuid[]) is
  'Returns the ids of the calling user''s own contacts that belong to an enabled Nagar Shield account. Returns ids only — no phone, name, email, or user id. A contact outside the caller''s own list is ignored. Used by the Location Sharing screen to route each recipient to the in-app path or the OS share sheet.';

-- -----------------------------------------------------------------------------
-- The guard: the function must never run for an anonymous caller.
--
-- `auth.uid()` is NULL without a session, and the `user_id = auth.uid()`
-- predicate would then match nothing — so the function already returns the
-- empty set. This revoke makes the boundary explicit: EXECUTE is not
-- granted to `anon` at all, and PUBLIC's default grant is taken away.
-- -----------------------------------------------------------------------------

revoke execute on function public.resolve_app_contacts(uuid[]) from public;
revoke execute on function public.resolve_app_contacts(uuid[]) from anon;
grant execute on function public.resolve_app_contacts(uuid[]) to authenticated;
