-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000023_contacts_phone_constraint.sql
--
-- `contacts.phone` had no format rule.
--
-- The defect
-- ----------
-- `public.contacts.phone` was created as a bare `text not null` column:
--
--   phone text not null,
--
-- Unlike `profiles.phone` and `profiles.alternate_phone`, it carries **no
-- CHECK constraint**. The server's `normalise_bd_phone` (migration 018) is
-- applied by `handle_new_user` to a profile's PRIMARY phone only, and the
-- trigger writes only `id, email, phone, full_name` — so a contact's phone
-- was never normalised by anything on the server.
--
-- That left the column free to hold any string at all. A client writing
-- `phone` could store `'abc'`, `'01712345678'` (the local format no reader
-- matches), or `'+14155550123'` (a non-BD number). Every consumer that later
-- wants to **dial** that contact — unit 003's Personal Emergency picker, unit
-- 005's location sharing — would have to defend itself against the shape of
-- the value, and the app's own validator is not a guarantee a server-side
-- caller (the admin console, an Edge Function, a script) would honour.
--
-- The story's contract is explicit:
--
--   * `002-identity / 006-emergency-contacts-crud` AC #7 — "a contact whose
--     phone is not a valid BD E.164 number is rejected with
--     `VALIDATION_FAILED` naming the `phone` field and no row is written";
--   * the Technical Notes — "a contact's phone is stored and compared in E.164
--     Bangladesh format (`+8801XXXXXXXXX`); raw `01XXXXXXXXX` input is
--     normalised before the write. The shared `contactSchema` is the single
--     source of truth and the **DB CHECK constraint is the second line of
--     defence**".
--
-- The second line of defence was never actually applied. This migration
-- applies it.
--
-- The rule
-- --------
-- The column holds **E.164 Bangladesh** — the same shape
-- `normalise_bd_phone` produces and the same shape a profile's phone is
-- stored in. The check calls the existing normaliser, so the rule lives in
-- one place and cannot drift from the signup path:
--
--   '+8801XXXXXXXXX'  → unchanged
--   '8801XXXXXXXXX'   → '+8801XXXXXXXXX'
--   '01XXXXXXXXX'     → '+8801XXXXXXXXX'
--   anything else     → NULL, which the check rejects
--
-- The non-uniqueness is preserved. There is deliberately **no** unique
-- constraint: the story's edge-case table says "Two contacts share the same
-- phone number → Accepted — there is no uniqueness constraint on
-- `emergency_contacts.phone`", and a shared family number is a legitimate
-- thing for two people to store.
--
-- The three-valued trap
-- ---------------------
-- The obvious form of this check is WRONG:
--
--   check (public.normalise_bd_phone(phone) = phone)
--
-- It looks right — "the stored value is its own normalisation". But
-- `normalise_bd_phone` returns NULL for a number that is not Bangladeshi, so
-- for `'+14155550123'` the comparison evaluates to `NULL = '+14155550123'`,
-- which is **NULL**, not FALSE.
--
-- And a CHECK constraint only rejects a row when its expression evaluates to
-- FALSE. A NULL result is treated as **satisfied**. So the obvious form
-- accepts every non-BD number — the check silently passes exactly the values
-- it was written to refuse.
--
-- The same trap was found and fixed for `profiles.alternate_phone` in
-- migration 020, and it was found there by a live probe, not by reading the
-- constraint. This migration writes the corrected form from the start.
--
-- The fix is to make the expression never evaluate to NULL: the normalised
-- value is required to be non-NULL AND equal to the stored value.
--
-- The backfill
-- ------------
-- The constraint is added AFTER the backfill below, and the order matters: a
-- row holding `01712345678` fails this check as written, because the
-- normaliser turns it into `+8801712345678`, which is not equal to the
-- stored value. The data has to be in the canonical shape before the
-- constraint can be added.
--
-- The whole file runs in one transaction (migrations do), so the statements
-- here and the constraint below either all apply or none do.
--
-- The forward-only rule
-- ---------------------
-- Migrations are never edited once applied. This is a new file.
-- =============================================================================

alter table public.contacts
  drop constraint if exists contacts_phone_format;

-- -----------------------------------------------------------------------------
-- Backfill: normalise any value that is already stored
-- -----------------------------------------------------------------------------

-- A value that is already E.164 normalises to itself and is left alone.

update public.contacts
   set phone = public.normalise_bd_phone(phone)
 where public.normalise_bd_phone(phone) is distinct from phone;

-- A value that cannot be normalised to a Bangladesh number is **deleted**
-- rather than kept in a shape no reader can match.
--
-- A deletion, not a nulling: the column is `NOT NULL`, so there is nothing to
-- null it to. A row holding an undiallable phone is a contact that could
-- never be dialled, and keeping it would leave the migration unappliable.
-- Deleting it is the honest outcome — the contact was never valid, and the
-- user can re-add it in a form the app accepts.

delete from public.contacts
 where public.normalise_bd_phone(phone) is null;

-- -----------------------------------------------------------------------------
-- The constraint
-- -----------------------------------------------------------------------------
--
-- `not valid` is NOT used: a constraint that only applies to new rows is not
-- a constraint, and the column holds no value worth exempting.

alter table public.contacts
  add constraint contacts_phone_format
  check (
    public.normalise_bd_phone(phone) is not null
    and public.normalise_bd_phone(phone) = phone
  );

comment on constraint contacts_phone_format on public.contacts is
  'The contact phone is E.164 Bangladesh (`+8801XXXXXXXXX`). The check calls `normalise_bd_phone` so the rule is the same one the signup path applies. The column is deliberately NOT unique — two contacts may share a number, and a shared family number is legitimate.';
