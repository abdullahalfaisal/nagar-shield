# Data Stack

> Database and data persistence decisions for this project.
> Source: `ARCHITECTURE.md` §G.

## Database

**PostgreSQL via Supabase.** Relational integrity is the core requirement:
`reports ↔ report_media ↔ flags ↔ moderation_actions` all need FK guarantees,
unique constraints (one flag per reporter per report), and CHECK constraints on
enums and length caps. Firestore's document model fights the moderation
workflow; a document DB cannot express the flag-threshold transaction.

**Extensions:**

- `postgis` — History radius query (1 km default) and nearest-thana lookup.
  Without it, distance queries need app-side haversine over the full table.
- `pgcrypto` — UUID generation (`gen_random_uuid()`), `crypt()` for any
  server-side hashing.

**Migrations:** forward-only, in `supabase/migrations/`, applied via
`supabase db push`. **Never** edit an applied migration — add a new one.
CI runs a migration dry-run against a local Supabase stack.

## Core entities

| Entity | Purpose |
|---|---|
| `profiles` | Extends `auth.users`; phone E.164 unique, email, role, locale, theme, biometric_opt_in, disabled_at |
| `emergency_contacts` | Name, phone, is_primary, sort_order, owner profile |
| `reports` | Media-backed incident; lat/lng; captured_at; description (≤140); category nullable; public_visibility; area_hierarchy jsonb; moderation_status |
| `report_media` | Storage path, media type, size, duration |
| `flags` | report_id, flagger_id, reason enum, created_at |
| `moderation_actions` | report_id, moderator_id, decision, note, created_at |
| `stations` | Dhaka metro police/hospital/fire; name, type, phone, lat/lng |
| `hotlines` | Curated non-emergency numbers |
| `wrong_number_reports` | User reports on a station/hotline entry |
| `location_shares` | Audit row for a one-shot location snapshot |
| `geocode_cache` | Reverse-geocode cache |

## Enums (CHECK constraints)

**Category** (fixed 11 values, nullable on `reports`):

```
theft, assault, harassment, robbery, accident, fire, medical,
fraud, vandalism, suspicious, other
```

**Flag reason** (fixed 5 values):

```
misinformation, harassment, duplicate, off_topic, other
```

**Moderation status** state machine:

```
visible → hidden_pending_review → restored (visible) | removed
```

**Public visibility:** `anonymous` (default) | `identified`.
**Role:** `citizen` | `moderator`.

## Row Level Security

RLS is the primary authorization mechanism. The service-role key exists only in
Edge Functions and CI.

| Table | Policy |
|---|---|
| `profiles` | Select own row; update own row. Moderator reads all. Author identity is **never** exposed in a public read model. |
| `reports` | Public select only when `moderation_status in ('visible','restored')`. Insert as own `author_id`. Update `category` only as the author. |
| `emergency_contacts` | Full CRUD scoped to `user_id = auth.uid()`. |
| `flags` | Insert as own `flagger_id`; unique `(report_id, flagger_id)`. |
| `moderation_actions` | Moderator-only select/insert. |
| `stations` / `hotlines` | Public read. |

**Anonymous projection:** public feed reads go through a view / RPC that omits
`author_id` when `public_visibility = 'anonymous'`. The server retains
`author_id` for moderation (FR-DATA-3) — that is the whole point of keeping it
server-side while hiding it publicly.

## Indexes

| Index | Serves |
|---|---|
| `reports (captured_at DESC)` | Alerts recency ordering |
| `reports` GiST on `geography(Point,4326)` | History 1 km radius, nearest-station |
| `reports (moderation_status)` | Moderator queue |
| `flags (report_id)` | Flag count / threshold |
| `flags (flagger_id, created_at)` | Rate limit (10 flags/hour) |
| `stations` GiST on `geography(Point,4326)` | Nearest thana within 10 km |
| `profiles (phone)` unique, `profiles (email)` unique | Identifier resolution |

## Retention

- Media objects hard-deleted at **90 days** (scheduled Edge Function / cron).
- Report metadata retained longer (FR-DATA-4).
- Account deletion: soft-delete + **30-day** recovery window, then PII purge
  (FR-DATA-6).
- EXIF stripped on upload; app-supplied GPS replaces any embedded GPS
  (FR-CAPTURE-2).

## Migrations & seed

- `supabase/migrations/` — forward-only SQL.
- `supabase/seed/` — Dhaka stations + hotlines + ~60 synthetic reports across
  8 areas (Showcase seed).
- The curated station/hotline JSON in the repo is the source of truth; the
  Postgres mirror is regenerated from it on refresh.

## Client-side persistence

Local-only, in the device sandbox: the Capture upload queue (offline-first,
exponential backoff, max 3 attempts), theme + locale preference, biometric
opt-in flag. Session tokens live in the OS secure store (`expo-secure-store`).
