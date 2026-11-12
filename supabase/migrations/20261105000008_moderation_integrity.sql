-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 008_moderation_integrity.sql
--
-- The `moderation_actions` audit trail is **append-only**, and the guarantee
-- is a **database property**, not a convention (FR-MOD-3).
--
-- RLS grants moderators SELECT and INSERT and grants nothing on UPDATE or
-- DELETE. That covers the client paths. This migration closes the remaining
-- hole: even the service-role key — used by the Edge Functions and CI —
-- cannot rewrite an existing audit row, because a BEFORE UPDATE OR DELETE
-- trigger raises unconditionally.
--
-- An audit trail that can be rewritten is not an audit trail.
-- =============================================================================

create or replace function public.moderation_actions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'MODERATION_ACTIONS_APPEND_ONLY' using errcode = '42501';
end;
$$;

drop trigger if exists moderation_actions_append_only_trigger on public.moderation_actions;

create trigger moderation_actions_append_only_trigger
  before update or delete on public.moderation_actions
  for each row execute function public.moderation_actions_append_only();

comment on function public.moderation_actions_append_only() is
  'Blocks UPDATE and DELETE on moderation_actions. The trail is append-only (FR-MOD-3).';

-- -----------------------------------------------------------------------------
-- The note is the required floor.
--
-- The table already carries a CHECK on `char_length(note) between 1 and 2000`,
-- but that CHECK passes for a whitespace-only note. The business rule is that
-- a decision without a *meaningful* note is rejected and writes **no** row
-- (FR-MOD-3), so the whitespace case is rejected here.
-- -----------------------------------------------------------------------------

alter table public.moderation_actions
  drop constraint if exists moderation_actions_note_not_blank;

alter table public.moderation_actions
  add constraint moderation_actions_note_not_blank
  check (char_length(btrim(note)) > 0);
