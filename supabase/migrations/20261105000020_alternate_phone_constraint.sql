-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000020_alternate_phone_constraint.sql
--
-- The alternate phone is a first-class, user-owned attribute — and it had no
-- format rule.
--
-- The defect
-- ----------
-- `profiles.alternate_phone` was created as a bare `text` column:
--
--   alternate_phone text,
--
-- Unlike `profiles.phone`, it carries **no CHECK constraint**. The server's
-- `normalise_bd_phone` (migration 018) is applied by `handle_new_user` to
-- the PRIMARY phone only, and the trigger writes only `id, email, phone,
-- full_name` — so `alternate_phone` was never normalised by anything.
--
-- That left the column free to hold any string at all. A client writing
-- `alternate_phone` could store `'abc'`, `'01712345678'` (the local format no
-- reader matches), or `'+14155550123'` (a non-BD number). Every consumer that
-- later wants to call the user on that number would have to defend itself
-- against the shape of the value, and the app's own validator — which
-- normalises before it writes — is not a guarantee a server-side caller
-- (the admin console, an Edge Function, a script) would honour.
--
-- The story's contract is explicit:
--
--   * `002-identity / 001-signup-with-email-and-phone` AC #10 — "it is stored
--     in the nullable, non-unique `profiles.alternate_phone` column";
--   * the Technical Notes — "`text NULL` with a format CHECK but **no unique
--     constraint**".
--
-- So the format CHECK the story asked for was never actually applied. This
-- migration applies it.
--
-- The rule
-- --------
-- The column holds **E.164 Bangladesh** or NULL — the same shape
-- `normalise_bd_phone` produces and the same shape the primary phone is
-- stored in. The check calls the existing normaliser, so the rule lives in
-- one place and cannot drift from the signup path:
--
--   '+8801XXXXXXXXX'  → unchanged
--   '8801XXXXXXXXX'   → '+8801XXXXXXXXX'
--   '01XXXXXXXXX'     → '+8801XXXXXXXXX'
--   anything else     → NULL, which the check rejects
--
-- NULL is allowed and means "no alternate number" — the column is nullable
-- and most accounts will leave it empty.
--
-- The non-uniqueness is preserved. There is deliberately **no** unique
-- constraint: a shared family number is a legitimate thing for two people to
-- store, and the story's edge-case table says so — "A different user enters
-- the same alternate number → Accepted".
--
-- Why the check calls a function rather than testing a regex
-- -----------------------------------------------------------
-- A CHECK constraint cannot call a `plpgsql` function? It can — a CHECK is
-- any expression returning a boolean, and a function call is an expression.
-- `normalise_bd_phone` is `immutable`, which is what a CHECK requires: the
-- constraint must not depend on anything that could change under it.
--
-- Writing it as a function call rather than an inline regex is what keeps
-- the rule identical to the signup path. If the normalisation rule is ever
-- changed, the CHECK follows it for free.
--
-- The forward-only rule
-- ---------------------
-- Migrations are never edited once applied. This is a new file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The constraint
-- -----------------------------------------------------------------------------
--
-- `not valid` is NOT used: a constraint that only applies to new rows is not
-- a constraint, and the column holds no value worth exempting.
--
-- The constraint is added AFTER the backfill below, and the order matters: a
-- row holding `01712345678` fails this check as written, because the
-- normaliser turns it into `+8801712345678`, which is not equal to the
-- stored value. The data has to be in the canonical shape before the
-- constraint can be added.

alter table public.profiles
  drop constraint if exists profiles_alternate_phone_format;

-- -----------------------------------------------------------------------------
-- Backfill: normalise any value that is already stored
-- -----------------------------------------------------------------------------
--
-- This runs BEFORE the constraint is added, and the order is not incidental:
-- a row holding `01712345678` fails the constraint as written, because the
-- normaliser turns it into `+8801712345678`, which is not equal to the
-- stored value. The data has to be in the canonical shape before the
-- constraint can be added at all.
--
-- The whole file runs in one transaction (migrations do), so the statements
-- here and the constraint below either all apply or none do.

-- A value that is already E.164 normalises to itself and is left alone.

update public.profiles
   set alternate_phone = public.normalise_bd_phone(alternate_phone)
 where alternate_phone is not null
   and public.normalise_bd_phone(alternate_phone) is distinct from alternate_phone;

-- A value that cannot be normalised to a Bangladesh number is dropped rather
-- than kept in a shape no reader can match. The alternative — keeping it and
-- letting the constraint fail — would leave the migration unappliable.

update public.profiles
   set alternate_phone = null
 where alternate_phone is not null
   and public.normalise_bd_phone(alternate_phone) is null;

-- -----------------------------------------------------------------------------
-- The constraint
-- -----------------------------------------------------------------------------
--
-- `not valid` is NOT used: a constraint that only applies to new rows is not
-- a constraint, and there is no value worth exempting.
--
-- The three-valued trap
-- ----------------------
-- The obvious form of this check is WRONG:
--
--   check (alternate_phone is null
--          or public.normalise_bd_phone(alternate_phone) = alternate_phone)
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
-- This was caught by `pnpm alternate:check`, the live probe: the "a non-BD
-- number is refused" assertion failed with HTTP 200 while the constraint was
-- in place.
--
-- The fix is to make the expression never evaluate to NULL: the normalised
-- value is required to be non-NULL AND equal to the stored value.
-- `coalesce` would also work, but spelling it out keeps the intent visible.

alter table public.profiles
  add constraint profiles_alternate_phone_format
  check (
    alternate_phone is null
    or (
      public.normalise_bd_phone(alternate_phone) is not null
      and public.normalise_bd_phone(alternate_phone) = alternate_phone
    )
  );

comment on constraint profiles_alternate_phone_format on public.profiles is
  'The alternate phone is E.164 Bangladesh (`+8801XXXXXXXXX`) or NULL. The check calls `normalise_bd_phone` so the rule is the same one the signup path applies. The column is deliberately NOT unique — a shared family number is legitimate.';
