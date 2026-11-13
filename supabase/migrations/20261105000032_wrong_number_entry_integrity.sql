-- -----------------------------------------------------------------------------
-- A wrong-number report must point at an entry that exists.
--
-- `003-help-seek / 008-wrong-number-report` — "`entry_id` is polymorphic, so
-- it cannot carry a plain FK. `entry_type = 'station'` resolves against
-- `stations.id`; `entry_type = 'hotline'` resolves against `hotlines.id`.
-- Integrity is enforced by a CHECK trigger … that resolves the target against
-- the table named by `entry_type` and rejects a report whose target does not
-- exist."
--
-- The defect this migration closes
-- ---------------------------------
-- The story's integrity trigger did not exist. `wrong_number_reports.entry_id`
-- was a plain `text` column with no foreign key (correctly — it is
-- polymorphic), and with no trigger there was **nothing** resolving it against
-- the table named by `entry_type`. A report could name a `station` type and
-- carry a hotline's slug, or name an entry that does not exist at all, and
-- the row was accepted silently.
--
-- A curator triaging these rows would be chasing a reference that resolves to
-- nothing. That is the whole point of the report — it is a signal about a
-- specific curated number — so a dangling reference makes the signal useless.
--
-- The trigger
-- -----------
-- A `before insert` trigger resolves the target against the table named by
-- `entry_type` and raises `foreign_key_violation` when the target is absent.
-- `entry_type` is already constrained to `('station', 'hotline')` by the
-- table's CHECK constraint, so the `else` branch is unreachable in practice —
-- it raises rather than passing silently, because a future `entry_type` value
-- must never be accepted without a resolution.
--
-- A `before insert or update` trigger is used rather than insert-only, because
-- `status` transitions are updates and an update must not be able to move a
-- row's `entry_type` / `entry_id` onto a target that does not exist.
--
-- The `curated slugs` are the ids. `stations.id` and `hotlines.id` are both
-- `text primary key` carrying the curated slug, and the dataset is refreshed
-- quarterly. The trigger therefore resolves against the **live** table, so a
-- report about a slug that the curator has retired is rejected — which is the
-- story's edge case: "The referenced entry was retired between opening the
-- sheet and submitting; the integrity trigger rejects the insert; the user
-- sees a typed error and the sheet stays open with the entered text intact."
--
-- Forward-only: a new trigger function and a new trigger. No data is
-- rewritten — every existing row already names a live entry, because the
-- seed data was generated from the same curated dataset.
-- -----------------------------------------------------------------------------

create or replace function public.assert_wrong_number_entry_exists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entry_type = 'station' then
    if not exists (
      select 1 from public.stations s where s.id = new.entry_id
    ) then
      raise exception 'unknown station: %', new.entry_id
        using errcode = '23503';
    end if;
  elsif new.entry_type = 'hotline' then
    if not exists (
      select 1 from public.hotlines h where h.id = new.entry_id
    ) then
      raise exception 'unknown hotline: %', new.entry_id
        using errcode = '23503';
    end if;
  else
    -- Unreachable while the table's CHECK constraint holds. Raised rather
    -- than passed, so a future `entry_type` never lands unreferenced.
    raise exception 'unknown entry_type: %', new.entry_type
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists wrong_number_reports_entry_integrity
  on public.wrong_number_reports;

create trigger wrong_number_reports_entry_integrity
  before insert or update of entry_type, entry_id
  on public.wrong_number_reports
  for each row
  execute function public.assert_wrong_number_entry_exists();
