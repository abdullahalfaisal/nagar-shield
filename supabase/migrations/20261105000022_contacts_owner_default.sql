-- =============================================================================
-- contacts — the owner is set by the database, not by the client.
-- =============================================================================
--
-- Why this migration exists
-- -------------------------
-- `public.contacts.user_id` was `uuid not null` with **no default**, so every
-- insert had to carry the owner explicitly. That put the owner in the
-- client's hands: the app read the id from the session and sent it, and the
-- RLS `WITH CHECK` (`user_id = auth.uid()`) refused a forged one. The
-- refusal is the guarantee, but the *default* was still the client's to
-- choose, and a client that sent nothing got a confusing
-- "new row violates row-level security policy" instead of a row the
-- database had owned for it.
--
-- The default fixes that: `auth.uid()` is the **session's** user, evaluated
-- by the database, in the database. The client no longer names an owner at
-- all.
--
-- What this does NOT weaken
-- --------------------------
-- The `WITH CHECK` clauses are untouched, so a client that *does* send a
-- `user_id` still cannot forge one:
--
--   * an insert with `user_id = <someone else>` still fails the check;
--   * an insert with `user_id = NULL` still fails the check, because the
--     default only applies when the column is *omitted* from the statement.
--
-- So the three cases are:
--
--   | the client sends        | the result                          |
--   |-------------------------|-------------------------------------|
--   | nothing (omitted)       | the database fills in `auth.uid()`  |
--   | its own session's id    | accepted                            |
--   | someone else's id      | refused by the `WITH CHECK`         |
--
-- The default is `auth.uid()`, which is `NULL` for an anonymous request, and
-- `user_id` is `NOT NULL`, so an anonymous insert fails on the NOT NULL
-- constraint rather than creating an ownerless row.
--
-- The `references public.profiles (id)` is kept: a contact cannot belong to
-- an account that does not exist.
--
-- Rollback
-- --------
--   alter table public.contacts alter column user_id drop default;
-- =============================================================================

alter table public.contacts
  alter column user_id set default auth.uid();

comment on column public.contacts.user_id is
  'The owner of this contact. Defaults to auth.uid() — the session''s user, '
  'evaluated by the database — so the client never names an owner. A forged '
  'user_id is still refused by the contacts_insert_own policy''s WITH CHECK.';
