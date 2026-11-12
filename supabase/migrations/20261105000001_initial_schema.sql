-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 001_initial_schema.sql
--
-- Source of truth: `prd.md`, `ARCHITECTURE.md` §G, and
-- `memory-bank/standards/data-stack.md`.
--
-- Locked facts encoded here:
--   * Police = 999, Medical = 999, Fire = 102 (PRD A-7)
--   * Email-primary Auth; `profiles.phone` is unique (waiver W-1)
--   * SMS OTP is feature-flagged OFF (waiver W-2)
--   * Flag hide threshold = 3, rate limit = 10/hour, author auto-hide = 5/24h
--   * The public feed projection OMITS `author_id` entirely (FR-DATA-3)
--
-- The shape follows `ARCHITECTURE.md`:
--   * `reports.area_hierarchy` is a jsonb document, not four columns
--   * `report_media` is a SEPARATE table — the 90-day purge owns
--     `report_media.purged_at` and the report row must outlive its media
--   * `area_lookup` is the curated Dhaka-local area table (waiver W-3)
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- =============================================================================
-- Enums
-- =============================================================================

create type public.report_category as enum (
  'theft', 'assault', 'harassment', 'robbery', 'accident',
  'fire', 'medical', 'fraud', 'vandalism', 'suspicious', 'other'
);

create type public.flag_reason as enum (
  'misinformation', 'harassment', 'duplicate', 'off_topic', 'other'
);

create type public.moderation_status as enum (
  'visible', 'hidden_pending_review', 'restored', 'removed'
);

create type public.moderation_decision as enum ('restore', 'remove', 'disable_user');

create type public.hide_reason as enum ('flag_threshold', 'author_auto_hide', 'both', 'manual');

create type public.public_visibility as enum ('anonymous', 'identified');

create type public.app_role as enum ('citizen', 'moderator');

create type public.media_type as enum ('photo', 'video', 'file');

create type public.station_type as enum ('police', 'hospital', 'fire');

create type public.contact_group as enum ('family', 'friend', 'colleague', 'other');

create type public.share_channel as enum ('app', 'os_share_sheet');

-- Only 'snapshot' at MVP (FR-LOC-3 / FR-NG-7). The column is the Phase-2
-- streaming hook; a server-side CHECK keeps the client honest.
create type public.location_share_mode as enum ('snapshot');

-- The geocode source. `local` is the Dhaka-local table, `online` is the
-- allowlisted Nominatim backup, `degraded` is the coordinate-only result.
create type public.geocode_source as enum ('local', 'online', 'degraded');

-- =============================================================================
-- profiles
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique,
  email text not null,
  full_name text,
  alternate_phone text,
  role public.app_role not null default 'citizen',
  locale text not null default 'bn' check (locale in ('bn', 'en')),
  theme text not null default 'dark' check (theme in ('light', 'dark')),
  biometric_opt_in boolean not null default false,
  biometric_fail_count integer not null default 0 check (biometric_fail_count >= 0),
  biometric_fail_until timestamptz,
  disabled_at timestamptz,
  -- Set by the account-deletion action. Starts the 30-day recovery window.
  deleted_at timestamptz,
  -- Set by the PII purge once the 30-day window has closed.
  pii_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.phone is
  'Required unique phone (waiver W-1: email-primary Auth, phone as a profile attribute).';

comment on column public.profiles.pii_purged_at is
  'Set by purge_deleted_accounts once the 30-day recovery window has closed.';

-- =============================================================================
-- contacts — the unified emergency-contact table
-- =============================================================================

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null,
  is_primary boolean not null default false,
  group_name public.contact_group not null default 'other',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_sort_idx on public.contacts (user_id, sort_order);

-- =============================================================================
-- reports
--
-- The anchor row for the feed, History, and moderation. `author_id` is ALWAYS
-- written (FR-DATA-3) even when `public_visibility = 'anonymous'` — the
-- visibility flag controls only the public projection.
-- =============================================================================

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,

  -- Idempotency key for the offline upload queue. A retry of a submit whose
  -- response was lost must not create a second report.
  client_request_id uuid not null,

  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  captured_at timestamptz not null default now(),

  description text check (description is null or char_length(description) <= 140),
  category public.report_category,

  public_visibility public.public_visibility not null default 'anonymous',
  moderation_status public.moderation_status not null default 'visible',
  hide_reason public.hide_reason,

  -- The resolved area. A jsonb document, per ARCHITECTURE.md — the four
  -- levels are always read and written together.
  area_hierarchy jsonb not null default
    '{"division":"Dhaka","city":"Dhaka","thana":null,"neighborhood":null}'::jsonb,

  -- Set when the author withdraws the report. The row is RETAINED; only the
  -- media becomes immediately eligible for the purge.
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The offline queue retries with the same `client_request_id`.
  constraint reports_author_client_request_unique unique (author_id, client_request_id)
);

create index reports_author_created_idx on public.reports (author_id, created_at desc);
create index reports_captured_idx on public.reports (captured_at desc);
create index reports_status_idx on public.reports (moderation_status);
create index reports_deleted_idx on public.reports (deleted_at) where deleted_at is not null;
create index reports_category_idx on public.reports (category) where category is not null;

-- The History radius query (FR-HIST-1, 1 km default) and the nearest-thana
-- lookup both use this index.
create index reports_location_idx on public.reports using gist (
  (st_setsrid(st_makepoint(lng, lat), 4326)::geography)
);

-- =============================================================================
-- report_media
--
-- The media object(s) attached to a report. A SEPARATE table so the 90-day
-- purge can delete the bytes while the report metadata survives
-- (FR-DATA-4). `purged_at` is the idempotency flag.
-- =============================================================================

create table public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  storage_path text not null,
  media_type public.media_type not null,
  byte_size bigint not null check (byte_size >= 0),
  duration_seconds double precision check (duration_seconds is null or duration_seconds >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now(),

  -- Set by purge_media after the Storage object is deleted.
  purged_at timestamptz,

  -- The video cap is 30 s (PRD-X-4), not the prototype's 60 s.
  constraint report_media_video_duration_cap check (
    media_type is distinct from 'video' or duration_seconds is null or duration_seconds <= 30
  ),
  constraint report_media_file_size_cap check (
    byte_size <= 10485760  -- 10 MB
  )
);

create index report_media_report_idx on public.report_media (report_id);
-- The purge worklist is derived from this index — a single range scan.
create index report_media_created_idx on public.report_media (created_at);
create index report_media_purge_idx on public.report_media (created_at) where purged_at is null;

-- =============================================================================
-- flags
-- =============================================================================

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  flagger_id uuid not null references public.profiles (id) on delete cascade,
  reason public.flag_reason not null,
  created_at timestamptz not null default now(),

  -- "The 3rd **distinct** flag" is well-defined because a user can flag a
  -- report only once.
  constraint flags_report_flagger_unique unique (report_id, flagger_id)
);

create index flags_report_idx on public.flags (report_id);
create index flags_flagger_created_idx on public.flags (flagger_id, created_at desc);
create index flags_report_created_idx on public.flags (report_id, created_at desc);

-- =============================================================================
-- moderation_actions — append-only audit trail (FR-MOD-3)
-- =============================================================================

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports (id) on delete set null,
  moderator_id uuid not null references public.profiles (id) on delete restrict,
  target_user_id uuid references public.profiles (id) on delete set null,
  decision public.moderation_decision not null,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index moderation_actions_report_idx on public.moderation_actions (report_id);
create index moderation_actions_moderator_idx on public.moderation_actions (moderator_id);

-- =============================================================================
-- location_shares — one-shot snapshots only (FR-LOC-3)
-- =============================================================================

create table public.location_shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_contact_id uuid references public.contacts (id) on delete set null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  mode public.location_share_mode not null default 'snapshot',
  share_channel public.share_channel not null default 'app',
  shared_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index location_shares_sender_idx on public.location_shares (sender_id, shared_at desc);

-- =============================================================================
-- area_lookup — the curated Dhaka-local area table (waiver W-3)
--
-- The PRIMARY source of `area_hierarchy`. A row per thana / neighborhood with
-- its centroid and bounding box. The online geocoder is only a backup.
-- =============================================================================

create table public.area_lookup (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_bn text not null,
  division text not null default 'Dhaka',
  city text not null default 'Dhaka',
  thana text not null,
  neighborhood text,
  centroid geometry(Point, 4326) not null,
  bbox geometry(Polygon, 4326),
  created_at timestamptz not null default now()
);

create index area_lookup_centroid_idx on public.area_lookup using gist (centroid);
create index area_lookup_thana_idx on public.area_lookup (thana);

-- =============================================================================
-- geocode_cache — one resolved area per coordinate key
--
-- The rounded coordinate is the key. A cache hit never touches the network.
-- =============================================================================

create table public.geocode_cache (
  key text primary key,
  area_hierarchy jsonb not null,
  source public.geocode_source not null,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

create index geocode_cache_created_idx on public.geocode_cache (created_at);

-- =============================================================================
-- Curated reference data
-- =============================================================================

create table public.stations (
  -- The curated slug is the primary key. The app bundle ships the same slug,
  -- so the bundle and the mirror can never disagree about which row is which.
  id text primary key,
  station_type public.station_type not null,
  name text not null,
  name_bn text,
  phone text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text,
  -- Retired entries are flagged, never deleted — the audit trail survives.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index stations_type_idx on public.stations (station_type);
create index stations_location_idx on public.stations (lat, lng);
create index stations_active_idx on public.stations (is_active) where is_active;

create table public.hotlines (
  -- The curated slug is the primary key. See the note on `stations.id`.
  id text primary key,
  name text not null,
  name_bn text,
  phone text not null,
  category text not null,
  description text,
  sort_order integer not null default 0,
  -- Retired entries are flagged, never deleted — the audit trail survives.
  is_active boolean not null default true,
  -- The quarterly curator stamp. A stale value means "due for verification".
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index hotlines_category_idx on public.hotlines (category);

create table public.wrong_number_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  entry_type text not null check (entry_type in ('station', 'hotline')),
  -- The curated slug of the station or hotline being reported.
  entry_id text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'rejected')),
  created_at timestamptz not null default now()
);

create index wrong_number_reports_entry_idx on public.wrong_number_reports (entry_type, entry_id);

-- =============================================================================
-- job_runs — the audit row for every scheduled job
--
-- Exactly one row per invocation. Opened as `running`, closed as `succeeded`
-- or `failed`. A `running` row with a null `finished_at` means the job died
-- mid-flight — the monitor reads it, it never deletes it.
-- =============================================================================

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (job_name in (
    'purge_media',
    'cleanup_geocode_cache',
    'purge_deleted_accounts',
    'keep_project_awake'
  )),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  items_processed integer not null default 0,
  items_failed integer not null default 0,
  bytes_reclaimed bigint not null default 0,
  error_detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index job_runs_name_started_idx on public.job_runs (job_name, started_at desc);
