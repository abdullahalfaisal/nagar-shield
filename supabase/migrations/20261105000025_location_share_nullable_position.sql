-- =============================================================================
-- 20261105000025_location_share_nullable_position.sql
--
-- The `location_shares` position becomes optional.
--
-- The story requires **two** fallbacks when the location permission is
-- denied:
--
--   (a) manual coordinate entry — the user types a latitude and a
--       longitude, and the row carries those coordinates with
--       `accuracy_m IS NULL`;
--   (b) share without location — the snapshot carries the timestamp and a
--       note that the location is unavailable.
--
-- The second one has nowhere to put a position. The old schema made
-- `lat` / `lng` NOT NULL, so the only way to write that row was to put
-- `0, 0` in it — a coordinate on the Gulf of Guinea that reads as a real
-- position. The story is explicit: *"the row writes a null position rather
-- than a zeroed one."*
--
-- So `lat` and `lng` become nullable.
--
-- What does NOT change:
--
--   * `mode` stays a one-value CHECK of exactly `'snapshot'` — the column is
--     retained as the Phase-2 streaming hook;
--   * `share_channel` keeps both values, `'app'` and `'os_share_sheet'`;
--   * the RLS policies are untouched — the sender only, and only while the
--     account is enabled;
--   * the table stays out of every public feed, view, RPC output, and admin
--     projection.
--
-- The new CHECK keeps the two states honest: a row has **either** both
-- coordinates **or** neither. A row with a latitude but no longitude would
-- be a half-written position, and the reader would have to guess which half
-- was missing.
-- =============================================================================

alter table public.location_shares
  alter column lat drop not null,
  alter column lng drop not null;

-- A position is all-or-nothing. A half-written coordinate pair is a row
-- some reader will have to interpret, and the only two readings are "the
-- north half" and "the east half" — neither of which is what the sender
-- meant.
--
-- The CHECK is written so that a NULL comparison yields NULL, which a CHECK
-- accepts (it rejects only FALSE). That is what lets the all-null row
-- through while still refusing a half-written one.
alter table public.location_shares
  drop constraint if exists location_shares_position_pair_chk;

alter table public.location_shares
  add constraint location_shares_position_pair_chk
  check ((lat is null and lng is null) or (lat is not null and lng is not null));

-- The comment is the schema's own documentation of the rule.
comment on column public.location_shares.lat is
  'The shared latitude. NULL means the snapshot carried no location - a "share without location" row. Both coordinates are set or both are NULL; a half-written pair is refused by location_shares_position_pair_chk.';

comment on column public.location_shares.lng is
  'The shared longitude. NULL means the snapshot carried no location - a "share without location" row. Both coordinates are set or both are NULL; a half-written pair is refused by location_shares_position_pair_chk.';

comment on column public.location_shares.accuracy_m is
  'The fix accuracy in metres. NULL for a manual coordinate entry and for a degraded fix - there is no honest accuracy to report, and a fabricated number is worse than none.';
