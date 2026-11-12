---
id: 005-offline-upload-queue
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 005-offline-upload-queue

## User Story

**As a** Nagar Shield user whose connection drops while I am reporting an incident
**I want** my report to be saved on my phone and sent automatically when the signal comes back
**So that** I never lose evidence, and I never have to stand there waiting for an upload bar

## Acceptance Criteria

- [ ] **Given** an upload fails because the device is offline, **When** the failure is handled, **Then** the item is written into the device-local queue with its attempt count and the timestamp of the next permitted attempt, and no error screen blocks the user
- [ ] **Given** an item is queued, **When** the user returns to the screen, **Then** the user can start the next capture **immediately** — no code path awaits an upload before returning the user to the screen
- [ ] **Given** a queued item, **When** the drain retries it, **Then** the retry schedule is **exponential backoff** — the delay between attempts grows with each failure
- [ ] **Given** a queued item has failed **3 attempts**, **When** the third attempt fails, **Then** the UI shows **"Saved on device — will retry when network returns"** and the item **remains** on the device
- [ ] **Given** connectivity returns or the app is brought to the foreground, **When** the queue drains, **Then** each due item is retried and a successful item is removed from the queue and its draft media is deleted
- [ ] **Given** a retry whose original response was lost in transit, **When** the retried submit is processed, **Then** **no second report is created** — the unique `(author_id, client_request_id)` constraint makes `finalize_capture` idempotent and the retry returns the **original** `report_id`
- [ ] **Given** the queue already holds 20 items, **When** a 21st item is enqueued, **Then** the **oldest** item is dropped with a warning to the user and the queue never exceeds 20 items
- [ ] **Given** the queue file is inspected, **When** its storage is checked, **Then** it lives in the **app sandbox** (`expo-file-system`), it is **not** in AsyncStorage, and it **never** contains the session token
- [ ] **Given** an item has been retried 3 times and is still failing, **When** the user reopens the app, **Then** the item is still present with its attempt count, and the drain does not silently discard it
- [ ] **Given** a queued item is drained successfully, **When** the report appears, **Then** the telemetry records the event as an **offline** submit and it is **excluded** from the FR-CAPTURE-7 `capture_open_to_submit_ms` median, which is measured over successful online submits only

## Technical Notes

- **Capture must never block.** This is product rule 5 in `coding-standards.md`, not a preference. A failed upload queues locally, the user returns to the screen immediately, and the queue drains in the background. There is no spinner that the user is trapped behind, and no code path awaits an upload before returning the user to the screen.
- **The queue is device-local and bounded.** An app-sandbox JSON file (`expo-file-system`), **max 20 items**. It is not in AsyncStorage (the unit brief forbids AsyncStorage for the queue) and it never holds the session token. The bound is what stops the app sandbox from growing without limit on a device that is offline for days.
- **Exponential backoff, max 3 attempts.** Each failed attempt increments the item's counter and writes `next_attempt_at`; the delay grows with the attempt number. After the **3rd** failed attempt the item is retained with the "saved on device" state. The attempt count and the schedule are unit-tested against the exact expected timings.
- **The drain is triggered by two events:** connectivity regain (a network-state listener) and app foreground (an `AppState` transition to `active`). Neither may block the foreground UI — the drain runs off the render path and is cancellable.
- **Idempotency is not optional in this path.** `reports.client_request_id` is a `uuid NOT NULL` with a `UNIQUE (author_id, client_request_id)` constraint. The queue generates the `client_request_id` **once**, when the item is first enqueued, and reuses it for every retry of that item. Without it, a submit whose response was lost in transit would create a duplicate report on the retry — and a duplicate report is a privacy problem as much as a data problem. `finalize_capture` checks the constraint first and returns the original `report_id` instead of inserting a second row.
- **The item payload.** Each queue entry carries the media draft path (in the app sandbox), the description, the `public_visibility`, the coordinates, the `captured_at`, and the `client_request_id`. It never carries the session token; the token is read fresh from the session at drain time.
- **Draft lifecycle.** The sanitised media draft is written to the app sandbox before the upload is attempted, so a retry does not have to re-run the pipeline. On a successful drain the draft is deleted. When an item is dropped (queue overflow) its draft is deleted with it.
- **"Saved on device" is a state, not an error.** The queue item carries a distinct status that the UI surfaces as **"Saved on device — will retry when network returns"** in `bn` and `en`. It is not an error toast and it is not a failure dialog — the evidence is safe, and the user is told the truth about its state.
- **The overflow drop is visible.** When the 21st item evicts the oldest, the user is warned. Silently deleting a citizen's evidence is unacceptable; the warning says what was dropped and that the app will keep only the most recent 20.
- **Online vs offline telemetry.** `capture_open_to_submit_ms` is measured from the Capture screen's first render to `finalize_capture` returning a `report_id`, and the median is taken over successful **online** submits only. Queued submits are tracked separately as an offline-rate metric. A queued item's clock starts when it is drained, not when it was enqueued.
- **The `OFFLINE_QUEUED` code.** The shared error-code table lists `OFFLINE_QUEUED` for exactly this outcome — the client maps it to the "saved on device" message rather than a generic failure.
- **Storage and the private bucket.** The upload target is the private bucket under the signed-path policy (`reports/{user_id}/{uuid}.jpg`); the client never holds the service-role key. The media bytes never transit the Edge Function.
- **Testing.** Jest covers the exponential-backoff schedule, the 3-attempt cut-off, the 20-item bound, and the `client_request_id` idempotency rule. A Maestro E2E flow covers airplane-mode submit → queued → reconnect → drained → the report appears in History.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ApiErrorCode` incl. `OFFLINE_QUEUED`), the typed Supabase client, and the `bn` / `en` i18n bundles
- `001-capture-screen` — the submit payload the queue persists and the CTA that must not block
- `004-exif-strip-and-media-caps` — the sanitised media draft that the queue stores and re-uploads
- `007-storage-upload-and-finalize` — `finalize_capture`, the idempotency contract on `client_request_id`, and the private bucket the retry targets

### Enables
- Unit `006-alerts` — the queued reports that eventually land in History and the Alerts feed
- `007-storage-upload-and-finalize` — the idempotent retry contract that makes the queue safe

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The upload fails because the network dropped mid-transfer | The item is queued; the partially written Storage object is not referenced by any row; the retry re-uploads from the local draft |
| The server accepted the report but the response was lost in transit | The retry with the same `client_request_id` returns the original `report_id`; exactly one `reports` row exists |
| The device is offline for 24 hours and 25 captures are made | The first 5 oldest items are dropped with a warning as the 21st–25th arrive; the queue never exceeds 20 |
| The app is force-closed with items in the queue | The queue file survives; on next launch the items are present with their attempt counts and are due for retry |
| The user clears the app's data | The queue is wiped along with the app; the items are lost and the app must not claim otherwise — a fresh install starts with an empty queue |
| The user signs out with items in the queue | The queued items are scoped to the session and are discarded on sign-out with a warning; they are never uploaded under another account |
| Connectivity returns and 20 items drain at once | The drain runs sequentially with the backoff schedule respected; the foreground UI stays responsive and the queue never exceeds its bound mid-drain |
| A drain attempt is interrupted by the OS killing the app | The item's attempt count is incremented **before** the attempt is recorded, so an interrupted attempt cannot be retried forever as a free attempt; the next launch continues from the persisted count |
| The server returns `CAPTURE_RATE_LIMIT` for a queued item | The item is retained and retried later — a rate limit is not a media or validation failure; it is not counted as a transport failure |
| The server returns `MEDIA_TOO_LARGE` for a queued item | The item is rejected with the typed error and dropped from the queue — retrying an invalid payload cannot succeed; the user is told the item was rejected |
| The device clock is wrong and `next_attempt_at` is in the future by days | The backoff is bounded and the item is retried on the next foreground regardless of the stored timestamp, so a bad clock cannot strand a report indefinitely |

## Out of Scope

- The media pipeline itself — `004-exif-strip-and-media-caps`
- The private bucket, the signed-path policy, and the server-side cap re-validation — `007-storage-upload-and-finalize`
- The Edge Function's area resolution — `002-area-hierarchy-extraction`
- A user-visible "queue" screen or a manual "retry now" button — the drain is automatic; the only surfaced state is "saved on device"
- Background upload jobs that run with the app killed — the drain runs on connectivity regain and on foreground, within the app process
- Push notifications when a queued item succeeds
- Any cloud-side queue, retry service, or dead-letter table
- Cross-device sync of the queue — the queue is local to the device
- Offline media editing beyond the caps enforced by `004-exif-strip-and-media-caps`
