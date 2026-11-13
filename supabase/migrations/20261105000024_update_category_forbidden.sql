-- =============================================================================
-- update_category — a non-author's edit is REFUSED, not silently ignored.
-- =============================================================================
--
-- Why this migration exists
-- -------------------------
-- `public.update_category` is the author-only category edit, and the story
-- is explicit about what a non-author's attempt must look like:
--
--   `004-capture / 003-report-detail-and-category-edit` AC #6 — "a signed-in
--   user who is **not** the author, **when** they attempt to update the
--   category of a report, **then** the update is **rejected with `FORBIDDEN`**
--   and the stored category is unchanged";
--
-- and its edge-case table — "A non-author opens the same report … any direct
-- API attempt is rejected with `FORBIDDEN`".
--
-- The stored category WAS unchanged — but the rejection was **silent**. The
-- function's `UPDATE` was scoped to the author's own row:
--
--   update public.reports
--      set category = …, updated_at = now()
--    where id = %L and author_id = %L
--
-- so a non-author's attempt matched **zero rows**, the `UPDATE` was a no-op,
-- and the function returned a success envelope anyway:
--
--   { "report_id": "…", "category": "fraud" }
--
-- The caller was told the category had been set. It had not. Nothing was
-- written and nothing was refused.
--
-- That is a fail-**open** shape, and it is the worst kind here: the client
-- caches the returned category and shows it as the report's category, while
-- the database holds a different one. The user's screen and the database
-- disagree, and the disagreement is invisible.
--
-- The fix
-- -------
-- The function now checks the row **before** writing, and raises `FORBIDDEN`
-- when the report is not the caller's. The check is explicit rather than
-- inferred from the UPDATE's row count, so the refusal is a first-class
-- outcome with a typed error the client can map — `fromSupabaseError` turns
-- `42501` into `AppError('FORBIDDEN')`.
--
-- The three cases:
--
--   | the caller                | the result                        |
--   |---------------------------|-----------------------------------|
--   | the report's author       | the category is written           |
--   | not the author            | `FORBIDDEN` (42501) — no write    |
--   | no session                | `AUTH_REQUIRED` (42501) — no write |
--
-- A report that does not exist at all is **also** `FORBIDDEN` here, rather
-- than `NOT_FOUND`. The distinction is deliberate: a caller must not be able
-- to probe which report ids exist by the error it gets back. `NOT_FOUND`
-- would answer that question; `FORBIDDEN` does not, and it matches the
-- story, which only ever names `FORBIDDEN` for this path.
--
-- What this does NOT change
-- -------------------------
--   * The `reports_update_guard` trigger still refuses every other column
--     change. The category is still the only editable field after submit.
--   * The `reports_update_own` RLS policy is untouched.
--   * The disabled-account guard still runs first — a disabled account is
--     refused with `ACCOUNT_DISABLED`, which is a *more specific* answer than
--     `FORBIDDEN`, and the client must be able to tell the user that their
--     account is disabled rather than that they lack permission.
--
-- The forward-only rule
-- ---------------------
-- Migrations are never edited once applied. This is a new file.
-- =============================================================================

create or replace function public.update_category(
  p_report_id uuid,
  p_category public.report_category
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_author uuid;
  v_is_author boolean;
begin
  -- `auth.uid()` is read here rather than in the `declare` block, so the
  -- session's user is read at call time rather than at function definition
  -- time.
  v_author := auth.uid();

  if v_author is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- A disabled account may not edit a report. This runs BEFORE the author
  -- check, because `ACCOUNT_DISABLED` is the more specific answer: the client
  -- must be able to tell the user that their account is disabled rather than
  -- that they lack permission.
  perform public.assert_account_not_disabled(v_author);

  -- The author check, made explicit.
  --
  -- `SECURITY DEFINER` means this function reads `reports` with the
  -- definer's privileges, so RLS does not apply here — the check below IS
  -- the authorization. It is what the RLS policy would have said, said out
  -- loud, with a typed refusal.
  --
  -- A report that does not exist is indistinguishable from one that belongs
  -- to someone else: both answer `FORBIDDEN`, so the error cannot be used to
  -- enumerate report ids.
  select exists (
           select 1
             from public.reports r
            where r.id = p_report_id
              and r.author_id = v_author
         )
    into v_is_author;

  if not v_is_author then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

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
$body$;

comment on function public.update_category(uuid, public.report_category) is
  'The author-only category edit (FR-CAPTURE-5). SECURITY DEFINER with an explicit author check: a caller that is not the report''s author is refused with FORBIDDEN, and a report that does not exist is refused the same way so the error cannot be used to enumerate report ids. A disabled account is refused with ACCOUNT_DISABLED.';
