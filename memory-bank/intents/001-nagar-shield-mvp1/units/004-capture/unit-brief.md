---
unit: 004-capture
intent: 001-nagar-shield-mvp1
phase: inception
status: ready
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Unit Brief: Capture

## Purpose

Own the `capture` domain module end to end: the **Capture screen** where a
bystander reports an incident in progress as a photo, a video, or a file, the
media pipeline that sanitises and caps that media, the server-side
`area_hierarchy` resolution, the `reports` / `report_media` write path, and the
**non-blocking offline upload queue**.

The Capture path is the second-most important surface in the product after the
panic path. It has one job: let someone who is standing in the middle of
something get evidence out of their phone **fast**, **without exposing who they
are**, and **without ever losing the evidence**. Three rules define it:

1. **Anonymous by default, identity retained server-side.** The toggle is ON
   when the screen opens. `public_visibility = 'anonymous'` controls only the
   *public projection*; `reports.author_id` is **always** written (FR-DATA-3) so
   moderation and dispute handling remain possible.
2. **Capture must never block.** A failed upload does not trap the user — it
   queues on the device, the user can immediately start the next capture, and
   the queue drains with exponential backoff up to 3 attempts before the item
   is kept on the device as "saved on device".
3. **Category is optional and late.** Nothing on the Capture screen asks for a
   category. `category` is nullable at creation and the **author** — and only
   the author — sets it later from History → Report detail, using the fixed
   11-value enum (FR-CAPTURE-5 override, 2026-09-11).

The area hierarchy is resolved **server-side** (FR-CAPTURE-4 / waiver W-3):
the curated Dhaka-local `area_lookup` table is consulted **first**, the online
Nominatim-compatible geocoder is a **cache-miss-only backup**, and a geocode
failure degrades to `'Dhaka'` / unknown thana instead of failing the submit.
The submit path never waits on a live geocode call.

## Scope

### In Scope

- `supabase/migrations/0003_capture.sql` — `reports`, `report_media`,
  `area_lookup`, `geocode_cache` tables, CHECK constraints (11-value category
  enum, `description` ≤ 140, `public_visibility`, `moderation_status`,
  `media_type`), RLS policies (author-only insert, author-only category
  update, public select only for `visible` / `restored`), PostGIS
  `geography(Point,4326)` column + GiST index on `reports` for the History
  1 km radius query, the `update_category` RPC, and the `updated_at` trigger
- `finalize_capture` Edge Function (`supabase/functions/finalize-capture/`) —
  validates the Zod payload, resolves `area_hierarchy` (Dhaka-local table
  first → `geocode_cache` → online geocode backup), inserts the `reports` row
  and the `report_media` row, and returns
  `{ report_id, area_hierarchy, moderation_status }`
- Curated Dhaka-local area dataset (`supabase/seed/area-lookup.json` mirrored
  into `area_lookup`) — thana / neighborhood centroids + bounding boxes for
  Dhaka metro, the primary source of `area_hierarchy`
- Private Supabase Storage bucket for report media + the storage policies
  (signed-path policy, MIME allow-list, size cap)
- Media pipeline (device side): `stripExif`, `compressImage`, `transcodeVideo`,
  `uploadToStorage` — the 1080p / 30 s caps and the EXIF strip are enforced
  **before** the bytes leave the device
- Offline upload queue (device side): `enqueueUpload`, `drainUploadQueue` —
  app-sandbox JSON, bounded to 20 items, exponential backoff, max 3 attempts,
  then "saved on device"
- `updateCategory(reportId, category)` — the author-only category edit reached
  from History → Report detail
- Mobile: the **Capture screen** (screen 17) 1:1 from the prototype, the
  camera / gallery / file entry points, the media picker flow, the description
  field with the `0 / 140` counter, the auto-detected location card, the sticky
  **রিপোর্ট পাঠান** CTA, the Report detail + category-edit surface, and the
  permission-degradation behaviour
- `capture_open_to_submit_ms` telemetry (the FR-CAPTURE-7 median)
- i18n keys for every new string in `bn` (primary) and `en`

### Out of Scope

- The **Alerts feed**, the area chip row, the flagging workflow, and the
  **History screen / History map read models** (`history_nearby`) — unit
  `006-alerts`. This unit only *writes* `reports`; unit 006 reads them.
- `flags` and the flag-threshold transition (unit 006), `moderation_actions`
  and the moderator console (unit 007)
- One-shot location sharing and the `location_shares` audit table — unit
  `005-location`. This unit only consumes the shared `expo-location` fix.
- The **90-day media purge job** and the geocode-cache cleanup job — unit
  `008-jobs-operations`. This unit owns the caps and the storage-path policy
  that keep the free tier inside quota.
- Push notifications / FCM fanout on a new report (Phase 2)
- AI media classification, image blurring, face detection (out of MVP scope)
- Charts / crime-statistics dashboards (excluded by FR-NG-3 / FR-NG-4 /
  ADR-010)
- Any emergency-service framing: Capture is a civic-information and
  evidence-sharing surface, never a dispatch channel (C-6)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-CAPTURE-1 | Photo, video, or file — all three entry points present; the file entry accepts PDF and DOC up to 10 MB | Must |
| FR-CAPTURE-2 | GPS + timestamp auto-attached at capture time; embedded EXIF GPS replaced with the app-supplied location | Must |
| FR-CAPTURE-3 | Anonymous by default — the toggle is on when the screen opens; `public_visibility` defaults to `anonymous` | Must |
| FR-CAPTURE-4 | Server-side `area_hierarchy` — Dhaka-local table first, online geocode backup only, capture never blocks on a live geocode | Must |
| FR-CAPTURE-5 | No category required at submit — `category` is nullable at creation and settable later by the author only | Must |
| FR-CAPTURE-6 | Description capped at 140 characters; `0 / 140` counter; over-cap input rejected client- **and** server-side | Must |
| FR-CAPTURE-7 | Capture latency — median Capture-open → submit-on-server < 30 s; upload < 5 s on BD LTE | Must |
| FR-HIST-3 | Immediate visibility — a submitted report appears with **no** pending-review gate on publish | Must |
| FR-DATA-3 | Server retains identity — `reports.author_id` is always populated even when `public_visibility = 'anonymous'` | Must |
| FR-PERMS-1 | Just-in-time permission requests — camera / mic / media-library / location are requested at the moment they are needed, never at first launch | Must |
| FR-PERMS-2 | Function with permissions denied — with camera denied the Capture screen hides the camera and mic entry points | Must |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `reports` | A media-backed incident report. The anchor row for the feed, History, and moderation. `author_id` is always populated (FR-DATA-3) | `id` uuid PK default `gen_random_uuid()`, `author_id` uuid not null FK → `profiles.id`, `public_visibility` text not null default `'anonymous'` CHECK in `('anonymous','identified')`, `category` text **nullable** CHECK (`category IS NULL OR category IN ('theft','assault','harassment','robbery','accident','fire','medical','fraud','vandalism','suspicious','other')`), `description` text nullable CHECK (`description IS NULL OR char_length(description) <= 140`), `lat` double precision not null, `lng` double precision not null, `area_hierarchy` jsonb not null default `{'division':'Dhaka','city':'Dhaka','thana':null,'neighborhood':null}`, `captured_at` timestamptz not null default now(), `moderation_status` text not null default `'visible'` CHECK in `('visible','hidden_pending_review','restored','removed')`, `client_request_id` uuid not null (idempotency key for the offline-retry path), `created_at` timestamptz, `updated_at` timestamptz |
| `report_media` | The media object(s) attached to a report — storage path, kind, size, and the optional video/image geometry | `id` uuid PK, `report_id` uuid not null FK → `reports.id` ON DELETE CASCADE, `storage_path` text not null, `media_type` text not null CHECK in `('photo','video','file')`, `byte_size` integer not null, `duration_seconds` numeric nullable, `width` integer nullable, `height` integer nullable, `created_at` timestamptz default now() |
| `area_lookup` | The curated Dhaka-local area table — the **primary** source of `area_hierarchy`. A row per thana / neighborhood with its centroid and bounding box | `id` uuid PK, `name` text not null, `name_bn` text not null, `division` text not null default `'Dhaka'`, `city` text not null default `'Dhaka'`, `thana` text not null, `neighborhood` text nullable, `centroid` geometry(Point,4326) not null, `bbox` geometry(Polygon,4326) nullable, `created_at` timestamptz default now() |
| `geocode_cache` | Reverse-geocode cache — one resolved `area_hierarchy` per coordinate key, so the online geocoder is hit only on a genuine miss | `key` text PK (rounded coordinate grid + geohash), `area_hierarchy` jsonb not null, `source` text not null CHECK in `('local','online','degraded')`, `created_at` timestamptz default now(), `last_hit_at` timestamptz |

Notes on the schema:

- **`category` is nullable and the CHECK allows NULL.** The 11-value enum is
  enforced by the CHECK, not by a `NOT NULL` column — a report submitted with
  no category is a valid, successful write (FR-CAPTURE-5). The 2026-09-11
  override removed the category picker from the Capture screen; the column
  stays nullable so the author can set it later.
- **`reports` carries a PostGIS `geography(Point,4326)` column with a GiST
  index** (`memory-bank/standards/data-stack.md`) so unit 006's History 1 km
  radius query is a `ST_DWithin` index scan rather than an app-side haversine
  over ~50k rows. The column is derived from `lat` / `lng` so there is one
  source of truth.
- **`client_request_id` makes `finalize_capture` idempotent.** The offline
  queue can retry a submit whose response was lost in transit; without an
  idempotency key the retry would create a duplicate report. The unique
  constraint `(author_id, client_request_id)` turns the retry into a no-op
  that returns the original `report_id`.
- **`area_lookup.centroid` is `geometry(Point,4326)`** with a GiST index;
  distance lookups cast to `geography`
  (`ST_DWithin(centroid::geography, $point::geography, $radius)`) so the
  metre-based radius is correct on the SRID-4326 plane.
- **`geocode_cache` is a cache, not a source of truth.** It may be evicted at
  any time; a miss simply re-resolves through `area_lookup` first and the
  online geocoder second.
- **RLS on `reports`**: public select only when `moderation_status in
  ('visible','restored')`; insert as own `author_id`; **update `category` only
  as the author** (`auth.uid() = author_id`) — no other column is updatable
  by the author. `report_media` is readable only through its parent's policy.
- **The public projection that omits `author_id`** is a view / RPC owned by
  unit 006; this unit's obligation is that `author_id` is *stored* and that
  the raw table is never exposed publicly.

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `finalize_capture` | **Edge Function.** Validates the Zod payload, resolves `area_hierarchy` (curated `area_lookup` nearest centroid **first** → `geocode_cache` → online Nominatim-compatible geocode **only on a cache miss**, allowlisted host + rate limit, graceful degrade to `'Dhaka'` / unknown thana), inserts the `reports` row and the `report_media` row, and returns the envelope. Idempotent on `client_request_id`. Enforces the per-user daily capture cap → `CAPTURE_RATE_LIMIT` | `{ client_request_id, storage_path, media_type, byte_size, duration_seconds?, width?, height?, description?, public_visibility, lat, lng, captured_at }` | `{ "data": { "report_id": "…", "area_hierarchy": { "division": "…", "city": "…", "thana": "…", "neighborhood": "…" }, "moderation_status": "visible" } }` |
| `stripExif` | Removes embedded EXIF (GPS in particular) from the captured or imported media and replaces the location with the **app-supplied** coordinates and capture timestamp (FR-CAPTURE-2). Runs on the device before any byte is uploaded | media asset + `{ lat, lng, captured_at }` | sanitised media asset — no embedded EXIF GPS, app-supplied coordinates attached |
| `compressImage` | Re-encodes a photo down to the 1080p cap (longest edge ≤ 1920) before upload. The re-encode is also the reliable EXIF strip for images | image asset | image asset ≤ 1080p, EXIF-free, JPEG |
| `transcodeVideo` | Re-encodes a video to the 1080p / **30 s** caps (PRD-X-4) before upload; a longer recording is trimmed at 30 s | video asset | video asset ≤ 1080p and ≤ 30 s |
| `uploadToStorage` | Direct-to-bucket upload of the sanitised media into the **private** bucket under a signed-path policy (`reports/<author_token>/<client_request_id>/<file>`), with the MIME allow-list and the size cap enforced by the storage policy | sanitised file + destination path | `{ "data": { "storage_path": "…", "byte_size": n } }` |
| `enqueueUpload` | Writes a pending / failed upload into the device-local queue (app-sandbox JSON, bounded to 20 items) together with its attempt count and the timestamp of the next permitted attempt | queued payload (media path, description, visibility, coordinates, `client_request_id`) | queue entry (persisted) |
| `drainUploadQueue` | Retries queued uploads with **exponential backoff**. After **3 failed attempts** the item is retained on the device and the UI shows "saved on device"; the drain never blocks the foreground UI | queue | drained items → `finalize_capture` success; retained items → "saved on device" state |
| `updateCategory` | Author-only category change on an existing report using the fixed 11-value enum, reached from History → Report detail (FR-CAPTURE-5). Media, location, description, and visibility are **not** editable | `{ report_id, category }` | `{ "data": { "report_id": "…", "category": "…" } }` |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 7 |
| Must Have | 7 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| US-CAPTURE-01 | Capture screen — media entry points, anonymous toggle, description counter, location card, sticky CTA | Must | Planned |
| US-CAPTURE-02 | Area hierarchy extraction — Dhaka-local table first, online backup, never blocks the submit | Must | Planned |
| US-CAPTURE-03 | Report detail + author-only category edit from History | Must | Planned |
| US-CAPTURE-04 | EXIF strip + media caps (1080p / 30 s / 10 MB) before upload | Must | Planned |
| US-CAPTURE-05 | Offline upload queue with exponential backoff and "saved on device" | Must | Planned |
| US-CAPTURE-06 | Permission degradation — camera / mic entry points hidden when denied | Must | Planned |
| US-CAPTURE-07 | Storage upload + `finalize_capture` round trip | Must | Planned |

> US-CAPTURE-01 carries FR-CAPTURE-1, FR-CAPTURE-3, FR-CAPTURE-6 and the
> Capture-screen half of FR-PERMS-1 / FR-PERMS-2. US-CAPTURE-02 carries
> FR-CAPTURE-4. US-CAPTURE-03 carries FR-CAPTURE-5 and the report-visibility
> half of FR-HIST-3. US-CAPTURE-04 carries FR-CAPTURE-2. US-CAPTURE-05 carries
> the offline leg of FR-CAPTURE-7. US-CAPTURE-07 carries the online latency
> leg of FR-CAPTURE-7 and the identity-retention half of FR-DATA-3.

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-foundation` | `packages/shared` contracts (`captureDescriptionSchema` ≤ 140, the 11-value `ReportCategory` parser, `AreaHierarchy` parser, `ApiErrorCode` incl. `CAPTURE_RATE_LIMIT` / `MEDIA_TOO_LARGE` / `GEOCODE_UNAVAILABLE`, the i18n key contract), the typed Supabase client, the Expo Router `(app)` group, the light/dark design tokens, and the shared UI primitives (`Toggle`, `StickyFooter`, `LocationCard`, `TextField`, `Button`, `AppBar`) |
| `002-identity` | The session and `profiles.id` used as `reports.author_id`; the `AUTH_DISABLED` gate for a disabled account; the app-shell navigation that hosts the Capture route |

### Depended By

| Unit | Reason |
|------|--------|
| `005-location` | Reuses the shared `expo-location` fix helper and the just-in-time location-permission pattern this unit establishes |
| `006-alerts` | Reads the `reports` / `report_media` rows this unit writes for the Alerts feed, the area filters (`area_hierarchy`), the History read models, and the public anonymous projection |
| `007-moderation` | Reads `reports` + `report_media` in the moderator queue; needs `moderation_status` and the retained `author_id` (FR-DATA-3) |
| `008-jobs-operations` | Needs the `reports.captured_at` / `report_media.storage_path` contract for the 90-day media purge and the `geocode_cache` table for its cleanup job |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Supabase Storage (private bucket) | Holds the report media objects; served only through short-lived signed URLs | Medium — 1 GB free tier; the caps and the 90-day purge are mandatory, not optional |
| Nominatim-compatible geocoder (`GEOCODE_BASE_URL`) | Backup reverse-geocode only, on a cache miss | High — public instances rate-limit hard and are often unavailable; the Dhaka-local table is the primary path and a failure must degrade, never fail the submit |
| Android OS camera / microphone | Capture and record the media | Low — permission may be denied (FR-PERMS-2); the capture and mic entry points are then hidden |
| `expo-location` | The single foreground GPS fix attached to the report and shown in the location card | Medium — permission may be denied and the fix can be slow indoors; the submit must never block on it |
| Android media store / `expo-media-library` | Gallery pick for an existing photo or video | Low — the file and gallery entry points survive a denied camera permission |
| npm registry | Expo SDK, `expo-image-picker`, `expo-camera`, `expo-image-manipulator`, `expo-file-system`, `expo-location` | Low |

---

## Technical Context

### Suggested Technology

Expo SDK + Expo Router, `expo-camera` for recording, `expo-image-picker` for the
gallery entry point, `expo-image-manipulator` for the image re-encode (and the
EXIF strip), `expo-video-thumbnails` / `expo-media-library` for the video
poster frame and the source duration, `expo-file-system` for the device-sandbox
media drafts and the offline queue file, `expo-location` for the single GPS
fix, `@supabase/supabase-js` (typed, from unit 001) for the Storage upload and
the `finalize_capture` Edge Function call, `@tanstack/react-query` for the
Report detail query, React Hook Form + the shared Zod resolvers for the
description field, `i18next` + `expo-localization` for `bn` / `en`, Jest +
React Native Testing Library for the unit tests, Maestro for the Android E2E
capture flows, and Supabase local for the RLS / RPC / Edge Function
integration tests.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Mobile → Supabase Storage (private bucket) | API | HTTPS — direct-to-bucket upload under the signed-path policy `reports/<author_token>/<client_request_id>/<file>`; never through the Edge Function (the media never transits the function) |
| Mobile → Edge Function `finalize_capture` | API | HTTPS — `POST /functions/v1/finalize_capture` with the user's JWT; returns the `{ "data": { report_id, area_hierarchy, moderation_status } }` envelope |
| Mobile → PostgREST `/rest/v1/reports` | API | HTTPS — insert own row (`author_id = auth.uid()`), read own rows for History |
| Mobile → RPC `update_category` | API | HTTPS — `POST /rest/v1/rpc/update_category`; author-only, enforced by RLS as well |
| Edge Function → Nominatim-compatible geocoder | External HTTPS | **Allowlisted host only** (`GEOCODE_BASE_URL`), rate-limited, short timeout, cache-miss only; failure degrades to `'Dhaka'` / unknown thana |
| Edge Function → PostGIS `area_lookup` | SQL | Nearest-centroid lookup (`ST_DWithin` over the centroid GiST index) — the primary resolution path |
| Edge Function → `geocode_cache` | SQL | Cache read before any online call; cache write after a successful online resolve |
| Mobile → `expo-camera` / `expo-image-picker` / `expo-media-library` | Native module | Media acquisition; permission requested just-in-time at the moment the entry point is tapped |
| Mobile → `expo-location` | Native module | One foreground GPS fix → `lat` / `lng` / `captured_at` → the location card and the report row |
| Mobile → device sandbox | Local file | Media drafts and the offline upload queue (app-private JSON via `expo-file-system`) |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `reports` rows | Postgres table | ~50k rows at 90 days | Metadata retained longer than the media purge (FR-DATA-4) |
| `report_media` rows | Postgres table | ~50k rows | Tied to the parent report; the Storage object is what expires |
| `area_lookup` rows | Postgres table (seeded from a curated JSON) | ~100–300 Dhaka metro areas | Indefinite; refreshed with the curated dataset |
| `geocode_cache` rows | Postgres table | Low — one row per resolved coordinate key | TTL; the cleanup job is owned by unit 008 |
| Storage objects | Supabase Storage (private bucket) | **≤ 1 GB free tier** — the caps and the 90-day purge are mandatory to stay inside it | Hard-deleted at 90 days by unit 008's purge job |
| Media drafts | Device app sandbox (`expo-file-system`) | 1–20 items | Discarded after a successful upload; purged when a queued item is discarded |
| Offline upload queue | Device app sandbox (app-private JSON) | **Bounded to 20 items** | Until drained, or until the user discards the item |
| `capture_open_to_submit_ms` | Device telemetry buffer | 1 event per submit | Flushed opportunistically; never blocks the submit path |

### Mobile Screens

Every surface below is a **1:1 port** of `docs/design/screen-spec.md` and
`docs/design/screen-capture-report-crime-.html`; no redesign, no additional
chrome.

| Screen | Prototype spec | Story | Notes |
|--------|----------------|-------|-------|
| Capture | screen 17 | US-CAPTURE-01, US-CAPTURE-04, US-CAPTURE-06 | The full 1:1 port — see the markup contract below |
| Report detail + category edit | new surface (no prototype screen) | US-CAPTURE-03 | Reached from History → a report row. Shows the media, the description, the area, the capture time, and the category selector — **author only**; a non-author sees the category as read-only |
| History Overview | screen 21 | US-CAPTURE-03, FR-HIST-3 | The **surface** is unit 006's read model (`history_nearby`); this unit owns the guarantee that the author's own report appears there **immediately** after submit, with no moderation step, and the entry point into Report detail |
| History Distribution | screen 22 | — | Unit 006 (map read model). This unit contributes the `area_hierarchy` and `captured_at` values it renders, and no surface of its own |

#### Screen 17 — Capture (the markup contract)

Ported from `docs/design/screen-capture-report-crime-.html`, element by element:

| Element | Markup / copy | Notes |
|---------|---------------|-------|
| App bar | `app-bar app-bar-no-border`, `close` icon button (→ Home, screen 14), centred title **অপরাধ রিপোর্ট করুন**, sub-line **আপনার সাক্ষ্য অন্যদের সুরক্ষিত রাখবে**, 40 px spacer on the right | The prototype's fake iOS status bar is **not** ported (real Android status bar replaces it) |
| Anonymous card | `.capture-anon` — 36 dp `.icon-circle` with `visibility_off`, label **বেনামী রিপোর্ট**, helper **আপনার পরিচয় সম্পূর্ণ গোপন থাকবে**, `.toggle on` | **The toggle renders ON by default** (FR-CAPTURE-3). The prototype's `onclick` demo is replaced by real state. Toggling OFF sets `public_visibility = 'identified'` — it never changes what the server stores for `author_id` |
| Upload card 1 | `.upload-card` — `videocam` icon, title **ভিডিও ক্যাপচার করুন**, sub **সর্বোচ্চ ৬০ সেকেন্ড**, `arrow_forward_ios` | **Copy discrepancy — the PRD wins.** PRD-X-4 locks the cap at **30 s**, so the shipped sub-line reads **সর্বোচ্চ ৩০ সেকেন্ড**. See Notes. The card is **hidden entirely** when the camera / mic permission is denied (FR-PERMS-2) |
| Upload card 2 | `.upload-card` — `photo_camera` icon, title **ছবি তুলুন**, sub **অথবা গ্যালারি থেকে নির্বাচন করুন**, `arrow_forward_ios` | One card, two destinations: the camera and the gallery picker. Survives a denied camera permission via the gallery path |
| Upload card 3 | `.upload-card` — `attach_file` icon, title **ফাইল আপলোড করুন**, sub **PDF, DOC — সর্বোচ্চ ১০MB**, `arrow_forward_ios` | PDF and DOC, ≤ 10 MB. Other MIME types → `UNSUPPORTED_MEDIA` |
| Description | Label **দৃশ্যের বর্ণনা**, `.textarea-field` (min-height 120 px), prototype placeholder **কী ঘটেছে, কখন, কোথায় — যত বিস্তারিত পারেন...**, right-aligned counter | The counter reads **`0 / 140`** at rest and **`140 / 140`** at the cap. Input past 140 characters is rejected client-side; the server rejects it again (FR-CAPTURE-6) |
| Location card | `.location-card` — `location_on` icon, `.location-card-title`, `.location-card-sub`, `.location-card-edit` **পরিবর্তন** | The prototype's hardcoded **বসুন্ধরা R/A, ঢাকা** is a placeholder — the build renders the **live reverse-geocoded address** with the accuracy sub-line **অটো-ডিটেক্টেড · ±৫ মিটার**. See Notes |
| Sticky CTA | `.sticky-cta` → `.btn.btn-primary.btn-lg` with the `send` icon and **রিপোর্ট পাঠান** | The primary submit. It is **never** disabled by a pending geocode, and a failed upload routes to the queue instead of blocking |

---

## Constraints

- **Category is nullable at creation and settable later by the author only**
  (FR-CAPTURE-5 override, 2026-09-11). There is **no category picker on the
  Capture screen**. The only write path for `category` is
  `updateCategory(reportId, category)` from History → Report detail, and RLS
  permits it only when `auth.uid() = author_id`.
- **Anonymous is the default, but `author_id` is ALWAYS stored server-side**
  (FR-DATA-3). `public_visibility` controls the *public projection* only; the
  toggle must never be able to suppress the stored identity, and the public
  read model must never return `author_id`.
- **EXIF GPS is replaced by the app-supplied coordinates** (FR-CAPTURE-2). The
  strip happens **on the device, before upload** — the original bytes with
  their embedded GPS never leave the handset. The stored media carries the
  app-supplied `lat` / `lng` / `captured_at`.
- **Description ≤ 140 characters**, rejected client-side *and* server-side;
  the DB CHECK is the third line of defence. Plain text only — never HTML,
  never rendered as rich text.
- **Media caps are 1080p and 30 s** (PRD-X-4); files are ≤ 10 MB and limited
  to PDF / DOC. An over-cap item is rejected with `MEDIA_TOO_LARGE` and is
  **never uploaded**.
- **Capture MUST NOT block.** A failed upload queues locally, the user can
  start the next capture immediately, and the queue drains with exponential
  backoff up to **3 attempts** before the item is retained as "saved on
  device". No code path may await an upload before returning the user to the
  screen.
- **Geocode MUST NOT block the submit** (waiver W-3 / FR-CAPTURE-4). The
  Dhaka-local table is consulted **first**; the online geocoder is a
  **cache-miss-only** backup with an allowlisted host and a rate limit; a
  failure degrades to `'Dhaka'` / unknown thana and the submit still succeeds.
- **Reports appear immediately — there is no pending-review gate on publish**
  (FR-HIST-3). `moderation_status` defaults to `'visible'`; moderation is
  after-the-fact via flags (unit 006).
- **The author may edit only the category** — never the media, never the
  location, never the description, never the visibility, after submit.
- **RLS is the authorization mechanism.** `reports`: public select only when
  `moderation_status in ('visible','restored')`; insert as own `author_id`;
  update `category` only as the author. The service-role key stays in the
  Edge Function and CI — it must never appear in the mobile bundle.
- **The Storage bucket is private.** Media is reachable only through
  short-lived signed URLs; the bucket is never public.
- **Just-in-time permissions** (FR-PERMS-1): camera, mic, media-library, and
  location prompts fire at the moment the entry point is tapped — never at
  first launch, and never as part of a screen mount.
- **With the camera permission denied, the camera and mic entry points are
  hidden** (FR-PERMS-2). The gallery-pick path inside the photo card and the
  file-upload card remain available.
- **The 90-day media hard delete** is unit 008's job; this unit's obligation
  is the caps and the storage-path policy that keep the free tier inside
  quota.
- **A per-user daily capture cap** is enforced in `finalize_capture`
  (OQ-6) and returns `CAPTURE_RATE_LIMIT`.
- All user-facing strings go through i18n; **Bangla is primary**, English is
  the secondary locale, and no string is hardcoded in either language.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` must pass, plus the migration
  dry-run against Supabase local.

---

## Success Criteria

### Functional

- [ ] A submit with **no category** succeeds — the `reports` row is created
      with `category IS NULL` (FR-CAPTURE-5)
- [ ] The stored report's `author_id` is **populated even when
      `public_visibility = 'anonymous'`** (FR-DATA-3)
- [ ] The anonymous toggle renders **ON by default** on a freshly opened
      Capture screen, and a report created without touching it has
      `public_visibility = 'anonymous'` (FR-CAPTURE-3)
- [ ] A description **over 140 characters is rejected client-side** (the
      counter stops at `140 / 140` and no further character is entered) **and
      server-side** (`VALIDATION_FAILED`; the DB CHECK is the third line)
- [ ] The stored media has **no embedded EXIF GPS** and carries the
      **app-supplied** coordinates — asserted by reading the metadata back off
      the uploaded object (FR-CAPTURE-2)
- [ ] A submitted report receives an `area_hierarchy` with `division`, `city`,
      and `thana` populated (FR-CAPTURE-4)
- [ ] With the geocoder unreachable, the submit **still succeeds** and the
      report carries `division = 'Dhaka'`, `city = 'Dhaka'`, and an unknown
      thana (FR-CAPTURE-4)
- [ ] An offline submit queues locally and **succeeds on the next drain**;
      after **3 failed attempts** the UI shows **"saved on device"** and the
      item remains on the device
- [ ] A report appears in the author's History **immediately** after submit,
      with no moderation step and no pending-review gate (FR-HIST-3)
- [ ] **Only the author can change the category** — the author sets it from
      History → Report detail and the change persists (FR-CAPTURE-5)
- [ ] A **non-author cannot change the category** — the update is rejected by
      RLS (`FORBIDDEN`) and the stored category is unchanged
- [ ] With the **camera permission denied**, the camera and mic entry points
      are **hidden** and the gallery / file entry points remain (FR-PERMS-2)
- [ ] A failed upload does **not** block: the user can start the next capture
      immediately, and the queued item is later drained
- [ ] A video longer than 30 s or larger than 1080p is trimmed / re-encoded
      before upload, and a file larger than 10 MB is rejected with
      `MEDIA_TOO_LARGE` and is never uploaded
- [ ] Retrying a submit whose response was lost does **not** create a second
      report (the `client_request_id` idempotency key returns the original
      `report_id`)

### Non-Functional

- [ ] The median `capture_open_to_submit_ms` is **< 30,000 ms** over the
      measurement window (FR-CAPTURE-7)
- [ ] Media upload completes in **< 5 s** on BD LTE when online
      (FR-CAPTURE-7)
- [ ] Screen 17 is a **1:1 visual match** to
      `docs/design/screen-capture-report-crime-.html` (screenshot comparison
      against the prototype)
- [ ] Every interactive control on screen 17 and on Report detail is
      **≥ 48 × 48 dp** and carries an accessibility label (the prototype's
      `aria-label` strings are the contract)
- [ ] Every new i18n key resolves in `bn` (primary, native-speaker reviewed)
      and `en`
- [ ] The local upload queue is **bounded to 20 items** and lives in the app
      sandbox — never in AsyncStorage, and never with the session token
- [ ] The `reports` GiST geography index is used by the History radius query
      (no sequential scan over ~50k rows)
- [ ] No service-role key appears in the mobile bundle, and the public read
      model returns **0** occurrences of `author_id`
- [ ] The Capture screen renders with **no network** available (the media
      entry points, the counter, and the toggle all work offline)

### Quality

- [ ] Jest unit tests cover the 140-character boundary (140 accepted, 141
      rejected), the media-cap checks, the EXIF strip, the exponential-backoff
      schedule and the 3-attempt cut-off, the category-enum parser, and the
      `client_request_id` idempotency rule
- [ ] Supabase-local integration tests cover the `reports` / `report_media`
      insert, the `description` ≤ 140 CHECK, the 11-value category CHECK, the
      author-only `update_category` policy, and the anonymous projection
      (0 leaks of `author_id` on a public read)
- [ ] A Maestro E2E flow covers open Capture → pick a photo → write a
      description → submit → the report is visible in History immediately
- [ ] A Maestro E2E flow covers airplane-mode submit → the item is queued →
      reconnect → the queue drains and the report appears in History
- [ ] A Maestro E2E flow covers the camera-denied state: the video entry point
      is absent, the gallery / file entry points are present
- [ ] The Edge Function `finalize_capture` is covered for the three
      resolution paths: `area_lookup` hit, `geocode_cache` hit, and online
      geocode → degrade
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass, and the migration
      dry-run against Supabase local passes

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-004-capture-1 | ddd | US-CAPTURE-02, US-CAPTURE-03 | `0003_capture.sql` (`reports`, `report_media`, `area_lookup`, `geocode_cache`, CHECK constraints, RLS, geography + GiST index, `update_category` RPC) + the curated `area-lookup.json` seed |
| bolt-004-capture-2 | ddd | US-CAPTURE-07 | `finalize_capture` Edge Function — Zod validation, idempotency key, area resolution (local → cache → online → degrade), the `reports` + `report_media` insert, the per-user capture cap, the private Storage bucket + signed-path storage policies |
| bolt-004-capture-3 | simple | US-CAPTURE-01, US-CAPTURE-06 | Mobile Capture screen (17) 1:1 — `UploadCard`, the anonymous `Toggle`, the description textarea + `0 / 140` counter, the auto-detected `LocationCard`, the sticky **রিপোর্ট পাঠান** CTA, and the permission-degradation behaviour |
| bolt-004-capture-4 | simple | US-CAPTURE-04, US-CAPTURE-05 | The media pipeline (`stripExif`, `compressImage`, `transcodeVideo`, `uploadToStorage`) and the offline queue (`enqueueUpload`, `drainUploadQueue`) with exponential backoff and the "saved on device" state |
| bolt-004-capture-5 | simple | US-CAPTURE-03 | Report detail surface + the author-only category edit, wired to the History entry point and the immediate-visibility guarantee |

---

## Notes

- **The prototype says ৬০ সেকেন্ড; the PRD says 30 s. The PRD wins.**
  Prototype screen 17's video card sub-line reads **সর্বোচ্চ ৬০ সেকেন্ড**,
  but PRD-X-4 locks the media cap at **1080p / 30 s** and the coding standard
  ("Media caps: 1080p / 30 s video") repeats it. The **enforced** cap is
  30 s; the shipped copy must state the real cap (**সর্বোচ্চ ৩০ সেকেন্ড**) so
  the UI never promises more than the product delivers. The card's layout,
  icon, and hierarchy are otherwise unchanged — only the number in the copy
  moves. This is the one place where the Capture markup deviates from
  `docs/design/screen-capture-report-crime-.html`, and it is a **copy**
  deviation, not a layout one.
- **The prototype's location card shows a hardcoded address.**
  **বসুন্ধরা R/A, ঢাকা** is a placeholder. The build must render the **live
  reverse-geocoded address** for the current fix, with the accuracy sub-line
  **অটো-ডিটেক্টেড · ±৫ মিটার** driven by the real `location.coords.accuracy`.
  The `.location-card` layout, the `location_on` icon, and the **পরিবর্তন**
  edit affordance are ported unchanged. The displayed address is a
  human-readable hint only — the **authoritative** area hierarchy is the
  server-resolved `reports.area_hierarchy`, and the two may legitimately
  disagree (a thana boundary, or a degraded geocode).
- **`location_shares` and the Alerts / flags work belong to units 005 and
  006.** This unit owns **writing `reports`** and nothing else in the
  sharing / feed surface: no `location_shares` row, no `flags` row, no feed
  query, no area chip row. It contributes the `area_hierarchy` that the feed
  filters on and the `captured_at` that it orders by — and that is the end of
  the contract with unit 006.
- **The EXIF strip is a re-encode, not a metadata scrub.** `expo-image-manipulator`
  re-encodes the image, which drops the original EXIF block as a side effect
  — that is the reliable strip for photos. For a *picked* video, the strip
  happens on the transcoded output. The unit test must read the metadata back
  off the **uploaded object** and assert the absence of a GPS tag, rather
  than asserting on the in-memory asset.
- **The app-supplied coordinates are the record; the media metadata is only
  a convenience.** `reports.lat` / `lng` / `captured_at` are the authoritative
  values; the coordinates written into the media metadata must equal them. A
  mismatch between the two is a defect, and the test asserts equality.
- **Idempotency is not optional in the offline path.** The queue retries a
  submit whose response was lost; without `client_request_id` the retry would
  create a duplicate report, and a duplicate report is a privacy problem as
  well as a data problem. The unique `(author_id, client_request_id)`
  constraint is what makes the retry safe.
- **There is no prototype screen for Report detail.** US-CAPTURE-03 needs
  one. It is a **new surface** built from the existing token set and shared
  primitives (`shared/ui/ListRow`, `shared/ui/SegmentedTabs`, `shared/ui/BottomSheet`)
  in the prototype's visual language — it must not introduce a new layout
  system. The category selector lists the fixed 11 values with their Bangla
  labels; the author sees it as editable, everyone else sees it read-only.
- **The Capture screen has no category field and no category step.** This is
  the 2026-09-11 FR-CAPTURE-5 override — the prototype never had one either,
  so the screen is already compliant. Do not "helpfully" add a picker.
- **The location permission is requested just-in-time and may be denied.**
  With location denied the report is still submittable: the lat / lng are
  null-guarded, `area_hierarchy` degrades server-side to `'Dhaka'` / unknown
  thana, and the location card shows a "location unavailable" state instead
  of a fake address. The submit must not be blocked on a GPS fix.
- **`capture_open_to_submit_ms` is measured, not estimated.** The clock starts
  when the Capture screen reports first render and stops when
  `finalize_capture` returns a `report_id`. The median is taken over
  successful online submits only; queued (offline) submits are excluded from
  the FR-CAPTURE-7 median and tracked separately as an offline-rate metric.
- **`geocode_cache` cleanup belongs to unit 008.** This unit owns the cache
  read/write; the eviction job is not in scope here, and the cache must
  tolerate eviction at any time.
- **The `area_lookup` dataset is curated, not scraped.** The repo JSON is the
  source of truth and the Postgres table is the mirror, exactly like
  `stations` / `hotlines` in unit 003 — one refresh script, one dataset, no
  runtime drift.
- **No service-role key and no "we reported this to the authorities" copy
  anywhere in this unit.** Capture is a civic-information and
  evidence-sharing surface (C-6); it never claims that anyone was notified,
  and it never claims a location was verified by a third party.
