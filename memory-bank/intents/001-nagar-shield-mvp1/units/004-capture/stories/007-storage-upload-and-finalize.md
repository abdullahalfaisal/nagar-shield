---
id: 007-storage-upload-and-finalize
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 007-storage-upload-and-finalize

## User Story

**As a** Nagar Shield user who has pressed **রিপোর্ট পাঠান**
**I want** my media uploaded straight into secure storage and my report filed server-side with a resolved area
**So that** my evidence is stored safely, classified to the right place, and visible to the community right away

## Acceptance Criteria

- [ ] **Given** a submit with a valid payload, **When** the client uploads the sanitised media, **Then** the bytes go **directly** to the **private** Storage bucket under the signed-path policy `reports/{author_token}/{client_request_id}/{file}` — the media never transits the Edge Function
- [ ] **Given** the mobile bundle is inspected, **When** it is searched, **Then** it contains **no** service-role key — the client authenticates with the user's JWT only, and the privileged key lives in the Edge Function and CI
- [ ] **Given** a `finalize_capture` request whose payload violates the Zod schema, **When** the Edge Function validates it, **Then** the request is rejected with `VALIDATION_FAILED` and no `reports` row and no `report_media` row is written
- [ ] **Given** a valid `finalize_capture` request, **When** it completes, **Then** the function inserts the `reports` row and the `report_media` row and returns `{ "data": { "report_id", "area_hierarchy", "moderation_status" } }` in the standard envelope
- [ ] **Given** a report is created, **When** the `moderation_status` is read, **Then** it is `'visible'` — there is no pending-review gate on publish (FR-HIST-3)
- [ ] **Given** a submit carries `public_visibility = 'anonymous'`, **When** the `reports` row is written, **Then** `author_id` is **still populated** with the authenticated user's id (FR-DATA-3), and the public projection never returns it
- [ ] **Given** a user has exceeded the per-user daily capture cap, **When** they submit, **Then** the request is rejected with `CAPTURE_RATE_LIMIT` and no `reports` row is written
- [ ] **Given** the same `client_request_id` is submitted twice for the same author, **When** the second request is processed, **Then** **no second report is created** and the response returns the **original** `report_id`
- [ ] **Given** a submit that bypasses the client-side caps, **When** the server re-validates the payload, **Then** the request is rejected with `MEDIA_TOO_LARGE` or `UNSUPPORTED_MEDIA` and no row and no Storage object survive
- [ ] **Given** an online submit on BD LTE, **When** the upload completes, **Then** the media upload finishes in under **5 s**, and the `capture_open_to_submit_ms` median over online submits stays below **30,000 ms**

## Technical Notes

- **Direct-to-bucket upload, never through the function.** The media bytes go from the handset to the private Storage bucket under the signed-path policy `reports/{author_token}/{client_request_id}/{file}`. They never transit the Edge Function — that keeps the function's memory and cold-start budget small and the upload on the fast path. The Edge Function receives only the metadata.
- **`{author_token}` is a hash, not the user id.** The second path segment is the hex SHA-256 of the uploader's uuid, never the uuid itself. The segment used to be the uuid in the clear, and that was a leak: the public alert detail (`006-alerts / 009-alert-detail-screen`) hands the media path to every signed-in reader so the client can mint a short-lived signed URL, so a path carrying the uuid handed every reader a stable handle on the author — the thing FR-DATA-3 forbids and `reports.author_id` being "server-side only" means. The hash keeps the ownership check working: the author computes the token for their **own** id (the Storage insert policy compares the segment against `digest(auth.uid()::text, 'sha256')`, and `finalize-capture` compares the path prefix against the same hash), and the id is not recoverable from the token. Three implementations must agree byte for byte — Postgres's `digest()`, the Edge Function's `authorToken()`, and the mobile client's — and the shared one is mirrored into the functions by `tools/mirror-shared-to-functions.cjs`, so the two client-side copies cannot drift. The change landed in migration `20261105000029_storage_author_token.sql`.
- **The bucket is private.** Media is reachable only through short-lived signed URLs; the bucket is never public and there is no public path convention. The storage policies enforce the MIME allow-list and the size cap on upload, in addition to the client-side and function-side checks.
- **No service-role key in any client bundle.** The mobile app calls Storage with the user's JWT; the Edge Function uses the service-role key, which lives in the function's environment and in CI only. The service-role key is never committed, never bundled, and never sent from the device.
- **`finalize_capture` is the write path.** `POST /functions/v1/finalize_capture` with the user's JWT:
  1. Validate the Zod payload (shared schema from `packages/shared` — the same one the client uses).
  2. Re-validate the media caps (`MEDIA_TOO_LARGE` / `UNSUPPORTED_MEDIA`) — the client check is UX, this is the contract.
  3. Check the idempotency key (`author_id`, `client_request_id`) and return the original `report_id` on a hit.
  4. Enforce the per-user daily capture cap → `CAPTURE_RATE_LIMIT`.
  5. Resolve the area: `area_lookup` → `geocode_cache` → online backup → degrade (`002-area-hierarchy-extraction`).
  6. Insert the `reports` row and the `report_media` row.
  7. Return `{ "data": { "report_id", "area_hierarchy", "moderation_status" } }`.
- **The payload shape** is `{ client_request_id, storage_path, media_type, byte_size, duration_seconds?, width?, height?, description?, public_visibility, lat, lng, captured_at }`. `media_type` is `photo` | `video` | `file`. `description` is optional and ≤ 140. `public_visibility` is `anonymous` | `identified`.
- **Three lines of defence on the caps and the description.** The client rejects early (UX), the Zod schema rejects in the function (contract), and the DB `CHECK` constraints are the last line (`description <= 140`, the 11-value `category` CHECK, the `public_visibility` / `moderation_status` / `media_type` CHECKs).
- **Identity is always retained server-side.** `reports.author_id` is `NOT NULL` and is written from the authenticated session on every submit — including when `public_visibility = 'anonymous'`. The anonymous toggle controls the **public projection** only. The public read model (a view / RPC owned by unit 006) omits `author_id` entirely; this unit's obligation is that it is *stored* and that the raw table is never exposed publicly.
- **Idempotency is enforced by a unique constraint, not by application logic alone.** `UNIQUE (author_id, client_request_id)` is the guarantee. `finalize_capture` checks for an existing row with the same key and returns it instead of inserting. This is what makes the offline retry in `005-offline-upload-queue` safe — a submit whose response was lost in transit cannot become a duplicate report.
- **`moderation_status` starts as `'visible'`.** There is **no** pending-review gate on publish (FR-HIST-3). The column's default is `'visible'` and the CHECK permits `visible` | `hidden_pending_review` | `restored` | `removed`. Auto-hide is after-the-fact via flags (unit 006), and the moderator console is unit 007.
- **The per-user daily capture cap** is enforced server-side in `finalize_capture` and returns `CAPTURE_RATE_LIMIT` (429). It is a server-side rule, so a modified client cannot bypass it. A rate-limited queued item is retained and retried later — it is not a transport failure.
- **`area_hierarchy` is resolved server-side and never blocks.** The function never awaits a live geocode on the normal path; on a cache miss the online backup is attempted once and a failure degrades to `division = 'Dhaka'`, `city = 'Dhaka'`, unknown thana, with the non-fatal `GEOCODE_UNAVAILABLE` code. The submit still returns a `report_id`.
- **`report_media` carries the sanitised asset's facts.** `storage_path`, `media_type`, `byte_size` (the **sanitised** size, not the original), and the optional `duration_seconds` / `width` / `height` for video and image geometry. The row cascades on report delete.
- **The media never transits the function.** The function does not download, re-encode, or proxy the object — it records the path and the metadata.
- **Error envelope.** Success is `{ "data": … }`; failure is `{ "error": { "code", "message", "details" } }` with a stable `SCREAMING_SNAKE_CASE` code. Clients switch on `code`, never on `message`, and raw Postgres text never reaches the user.
- **Logging.** The function emits structured JSON logs with a request id, a hashed user id, and the action. Raw GPS coordinates, media payloads, passwords, and tokens are never logged.
- **Testing.** Supabase-local integration tests cover the `reports` / `report_media` insert, the `description <= 140` CHECK, the 11-value `category` CHECK, the author-only `update_category` policy, and the anonymous projection (0 leaks of `author_id` on a public read). A dedicated test asserts that the same `client_request_id` submitted twice yields exactly one row and the original `report_id`.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`captureDescriptionSchema`, `PublicVisibility`, `ModerationStatus`, `AreaHierarchy`, `ApiErrorCode` incl. `VALIDATION_FAILED`, `CAPTURE_RATE_LIMIT`, `MEDIA_TOO_LARGE`, `UNSUPPORTED_MEDIA`, `GEOCODE_UNAVAILABLE`), the typed Supabase client, and the `bn` / `en` i18n bundles
- Unit `002-identity` — the authenticated session whose `auth.uid()` becomes `reports.author_id`, and the `AUTH_DISABLED` gate
- `supabase/migrations/0003_capture.sql` — the `reports` and `report_media` tables, the CHECK constraints, the `client_request_id` unique constraint, the RLS policies, the `geography(Point,4326)` column with its GiST index, and the `updated_at` trigger
- `002-area-hierarchy-extraction` — the resolver that supplies `area_hierarchy` inside the function
- `004-exif-strip-and-media-caps` — the sanitised media and its metadata that the function records

### Enables
- `003-report-detail-and-category-edit` — the report row, its `moderation_status`, and its `area_hierarchy` that the detail screen reads
- `005-offline-upload-queue` — the idempotent, rate-limited contract the retry relies on
- Unit `006-alerts` — the `reports` / `report_media` rows the feed and the History read models read
- Unit `007-moderation` — the retained `author_id` and the `moderation_status` the moderator queue needs
- Unit `008-jobs-operations` — the `reports.captured_at` and `report_media.storage_path` the 90-day purge runs against

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The same `client_request_id` is submitted twice by the same author | The second call returns the original `report_id`; exactly one `reports` row exists; no second `report_media` row is written |
| Two different authors coincidentally use the same `client_request_id` | The uniqueness is per `(author_id, client_request_id)`, so both succeed as separate reports |
| The Storage upload succeeds but `finalize_capture` is never called | An orphan object exists with no row; the object is not referenced by any report and is reclaimed by the storage lifecycle / purge policy — it is never exposed publicly because the bucket is private |
| `finalize_capture` is called with a `storage_path` that does not belong to the caller | The path prefix `reports/{author_id}/` is validated against the authenticated user; a mismatched path is rejected with `FORBIDDEN` |
| The user is over the daily capture cap | `CAPTURE_RATE_LIMIT` is returned with `retry_after_sec` in `details`; no row is written |
| The payload's `description` is 141 characters | Rejected with `VALIDATION_FAILED` by the Zod schema; the DB CHECK would reject it too |
| The payload omits `description` entirely | Accepted; the row is written with `description IS NULL` |
| The payload's `public_visibility` is `anonymous` | The row is written with `public_visibility = 'anonymous'` and `author_id` populated |
| The payload carries an unknown `media_type` | Rejected with `VALIDATION_FAILED`; the `report_media.media_type` CHECK is the last line |
| The geocoder is unreachable | The submit succeeds with a degraded `area_hierarchy` and the non-fatal `GEOCODE_UNAVAILABLE` code |
| The account was disabled between the upload and the finalize | The function rejects with `AUTH_DISABLED`; no row is written |
| The function times out mid-request | The client retries with the **same** `client_request_id`; the idempotency constraint makes the retry safe |

## Out of Scope

- The Capture screen and its markup — `001-capture-screen`
- The area resolution internals — `002-area-hierarchy-extraction`
- The category edit and the `update_category` RPC — `003-report-detail-and-category-edit`
- The client-side media pipeline — `004-exif-strip-and-media-caps`
- The offline queue and its backoff — `005-offline-upload-queue`
- The permission-degradation behaviour — `006-capture-permission-degradation`
- The public anonymous projection, the Alerts feed, the History read models, and the area chip row — unit `006-alerts`
- The moderator console, the restore / remove actions, and the `moderation_actions` audit — unit `007-moderation`
- The 90-day media purge and the `geocode_cache` cleanup — unit `008-jobs-operations`
- Push notifications on a new report (Phase 2)
- Any server-side media processing, thumbnailing, or transcoding
- Exposing `author_id` in any public response — the public projection omits it entirely
