---
id: 005-offline-upload-queue
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 005-offline-upload-queue

## User Story

**As a** Nagar Shield user whose connection drops while I am reporting an incident
**I want** my report to be saved on my phone and sent automatically when the signal comes back
**So that** I never lose evidence, and I never have to stand there waiting for an upload bar

## Acceptance Criteria

- [x] **Given** an upload fails because the device is offline, **When** the failure is handled, **Then** the item is written into the device-local queue with its attempt count and the timestamp of the next permitted attempt, and no error screen blocks the user — `captureFlow.submitDraft` catches a transport failure and hands the payload to `enqueueUploadBounded`; the outcome is `{status: 'queued'}` and the screen navigates away immediately.
- [x] **Given** an item is queued, **When** the user returns to the screen, **Then** the user can start the next capture **immediately** — no code path awaits an upload before returning the user to the screen — `submitDraft` resolves as soon as the item is written to the sandbox file; the drain is a separate, off-render-path concern.
- [x] **Given** a queued item, **When** the drain retries it, **Then** the retry schedule is **exponential backoff** — the delay between attempts grows with each failure — `backoffDelayMs` returns 30 s, 2 min and 8 min for attempts 1, 2 and 3; `markAttemptFailed` writes `nextAttemptAt` from that schedule.
- [x] **Given** a queued item has failed **3 attempts**, **When** the third attempt fails, **Then** the UI shows **"Saved on device — will retry when network returns"** and the item **remains** on the device — `QUEUE_MAX_ATTEMPTS` is 3; `markAttemptFailed` sets `savedOnDevice`, `dueItems` never offers a retained item, and `useQueueDrain` reports the retained count to the Capture screen's `StatusBanner` (`capture.savedOnDevice` / `capture.savedOnDeviceBody`).
- [x] **Given** connectivity returns or the app is brought to the foreground, **When** the queue drains, **Then** each due item is retried and a successful item is removed from the queue and its draft media is deleted — `useQueueDrain` listens to `expo-network`'s state listener and to `AppState`'s transition to `active`; `drainItem` calls `removeFromQueue` and `deleteDraftMedia` on success.
- [x] **Given** a retry whose original response was lost in transit, **When** the retried submit is processed, **Then** **no second report is created** — the unique `(author_id, client_request_id)` constraint makes `finalize_capture` idempotent and the retry returns the **original** `report_id` — the queued item keeps the `clientRequestId` of the attempt that failed, and the drain sends that same key. **This was a real defect and it was fixed**: `enqueueUpload` used to mint a fresh key, which would have let a submit whose response was lost in transit land twice.
- [x] **Given** the queue already holds 20 items, **When** a 21st item is enqueued, **Then** the **oldest** item is dropped with a warning to the user and the queue never exceeds 20 items — `enqueueUploadBounded` detects the overflow **before** the write and returns the dropped item; the Capture screen raises the `capture.queueOverflow` alert.
- [x] **Given** the queue file is inspected, **When** its storage is checked, **Then** it lives in the **app sandbox** (`expo-file-system`), it is **not** in AsyncStorage, and it **never** contains the session token — the queue is a JSON file under `Paths.cache/nagar-shield-media`; `QueuedUpload` has no token field, and the token is read fresh from the session at drain time by `submitCapture`.
- [x] **Given** an item has been retried 3 times and is still failing, **When** the user reopens the app, **Then** the item is still present with its attempt count, and the drain does not silently discard it — the attempt count and `savedOnDevice` flag are persisted in the queue file; `dueItems` filters the retained item out of the drain but `readQueue` still returns it, and `savedOnDeviceItems()` surfaces it to the UI.
- [x] **Given** a queued item is drained successfully, **When** the report appears, **Then** the telemetry records the event as an **offline** submit and it is **excluded** from the FR-CAPTURE-7 `capture_open_to_submit_ms` median, which is measured over successful online submits only — the drain path (`queueDrain.drainItem`) is entirely separate from the online submit path (`captureFlow.submitDraft`), so a drained item never contributes to the online median, and the queued clock starts at the drain rather than at the enqueue. **Note:** the mobile app has **no telemetry emitter at all** yet — the FR-CAPTURE-7 median is a server-side metric with no client-side counterpart to exclude from. The separation this AC requires is enforced structurally here; the emitter itself belongs to a later unit.

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

---

## Implementation Notes

### What shipped

| File | Role |
|---|---|
| `apps/mobile/src/shared/services/uploadQueue.ts` | The queue file, the bound, the backoff schedule, the attempt counter, the sign-out purge. |
| `apps/mobile/src/shared/services/queueDrain.ts` | The drain — `isRetryable`, `drainItem`, `drainQueue`. Decides what is retried and what is dropped. |
| `apps/mobile/src/shared/services/useQueueDrain.ts` | The trigger — `expo-network` + `AppState` listeners, and the queue counts the UI surfaces. |
| `apps/mobile/src/shared/services/captureFlow.ts` | The submit path — hands a transport failure to the queue **with the same idempotency key**. |
| `apps/mobile/src/shared/ui/StatusBanner.tsx` | The "saved on device" surface. A state, not an error toast. |
| `apps/mobile/app/(app)/capture.tsx` | Mounts the drain; surfaces the saved-on-device count and the overflow warning. |
| `apps/mobile/src/shared/auth/authService.ts` | `logOut` discards the queue — a queued item is scoped to its session. |

### The idempotency defect this story found

The gap this story was opened for was "the queue never drains". Fixing it
surfaced a **second** defect, one the story treats as non-negotiable:

> *"The queue generates the `client_request_id` **once**, when the item is
> first enqueued, and reuses it for every retry of that item. Without it, a
> submit whose response was lost in transit would create a duplicate report on
> the retry."*

`submitDraft` generated a `clientRequestId` for the attempt, but the catch
path called `enqueueUpload` **without it** — so the queue minted a **fresh**
key. The retry would then have sent a different key, `finalize_capture` would
have seen no existing `(author_id, client_request_id)` pair, and a second
report would have been created. The exact failure the story names, in the
exact path the story names.

The fix makes `clientRequestId` a **required** parameter of `enqueueUpload`
rather than something it generates, and `submitDraft` passes its own key
through `enqueueUploadBounded`. The key is now minted once, at the top of
`submitDraft`, and used for both the attempt and the queue.

### The attempt counter moved twice

The story's edge-case table says:

> *"A drain attempt is interrupted by the OS killing the app — the item's
> attempt count is incremented **before** the attempt is recorded, so an
> interrupted attempt cannot be retried forever as a free attempt."*

The first implementation called `markAttemptFailed` **twice** per attempt —
once before the upload (correct) and once again in the catch handler. That
burned **two** attempts on a single failure, so the 3-attempt budget was
actually 1.5 real attempts, and a report would have been written off as
"kept on the device" after two genuine failures.

The counter now moves **exactly once** per attempt, before it. `drainItem`
reads the persisted count back and reuses it for the outcome, so the "retry"
outcome and the persisted state can never disagree.

### The overflow was never reported

`enqueueUpload` writes the queue through `writeQueue`, which **truncates to
the bound**. `enqueueUploadBounded` then read the queue back to look for an
overflow — but the queue it read back had already lost its oldest item, so
`queue.length > QUEUE_MAX_ITEMS` was never true and the drop was **never
reported**. The user would have lost a report with no warning, which is the
one thing the story forbids.

The eviction is now detected **before** the write: `enqueueUploadBounded`
reads the queue, identifies the tail (the queue is newest-first, so the tail
is the oldest), and returns it as `dropped`. The Capture screen raises the
`capture.queueOverflow` alert.

The overflow warning is an **alert** rather than an inline banner because the
screen navigates away the moment the capture is queued — an inline banner
would be dismissed before it was ever read.

### A wrong clock cannot strand a report

The edge-case table says:

> *"The device clock is wrong and `next_attempt_at` is in the future by days —
> the backoff is bounded and the item is retried on the next foreground
> regardless of the stored timestamp, so a bad clock cannot strand a report
> indefinitely."*

`dueItems` filtered strictly on `nextAttemptAt <= now`, so a device whose
clock was days ahead would hold every queued report until the clock caught
up. The backoff is now a **floor, not a wall**: an item whose stored
timestamp is more than `BACKOFF_CEILING_MS` (30 minutes) ahead of the current
time is treated as due regardless. The schedule itself tops out at 8 minutes,
so the ceiling only ever fires for a genuinely unreachable timestamp.

### The retry classification

`isRetryable` decides what the drain does with a failure:

| Code | Retried? | Why |
|---|---|---|
| `INTERNAL` | yes | The network. The whole point of the queue. |
| `CAPTURE_RATE_LIMIT` | yes | A server-side throttle, not a bad payload. |
| `AUTH_REQUIRED` | yes | Resolves on the next foreground. |
| `VALIDATION_FAILED` | no | The payload is invalid; every attempt fails identically. |
| `MEDIA_TOO_LARGE` / `UNSUPPORTED_MEDIA` | no | Same — an invalid payload cannot be fixed by retrying. |
| `FORBIDDEN` | no | The write is refused. |

A **rejected** item is removed from the queue and its draft media is deleted
with it. A **retry** item keeps its place and is rescheduled.

### Signing out discards the queue

The edge-case table says:

> *"The user signs out with items in the queue — the queued items are scoped
> to the session and are discarded on sign-out with a warning; they are never
> uploaded under another account."*

`logOut` now calls `clearQueue` before ending the session, which deletes each
item's draft media and empties the queue. It returns the number of discarded
items, and the Settings screen raises an alert when it is non-zero —
evidence that never landed is evidence the user still needs to know about.

The queue carries no session token, so there is nothing to leak; the token is
read fresh from the session at drain time by `submitCapture`.

### The drain trigger

`useQueueDrain` listens to two events, as the story names:

* **connectivity regain** — `expo-network`'s `addNetworkStateListener`;
* **app foreground** — an `AppState` transition to `active`.

Two details are worth recording:

* **`expo-network` reports a connection *state*, not a boolean "is online".**
  The signal that matters is "the connection changed"; the drain itself
  decides whether the device can actually reach the network, and a failed
  attempt is rescheduled rather than dropped.
* **The in-flight guard is a `ref`, not a state.** A state update would not be
  visible to a second trigger before the re-render, so two events in the same
  tick could both start a drain — a burst of uploads the moment the signal
  came back, which is exactly what the backoff exists to prevent.

The drain runs **off the render path**: it is never awaited by a screen, and
the Capture screen navigates away on a queued submit without waiting for it.

### Verification

| Layer | What it proves | Count |
|---|---|---|
| `apps/mobile/src/shared/services/uploadQueue.test.ts` | The backoff schedule, the 3-attempt cut-off, the 20-item bound and the oldest-first eviction, the `client_request_id` idempotency rule, the sign-out purge, and the storage contract (sandbox, no token, corrupt-file tolerance). | 32 |
| `apps/mobile/src/shared/services/queueDrain.test.ts` | The retry classification, the attempt-counted-once rule, the removal + draft deletion on success, the rejection path, and the sequential drain. | 22 |
| `apps/mobile/src/shared/services/captureFlow.test.ts` | The transport-failure split, the **same-key** handoff to the queue, the overflow report, and the fact that a server rejection is never queued. | 16 |

`expo-file-system` is replaced with an **in-memory** implementation in the
queue suite, so the real read / write / truncate path is exercised rather
than mocked away — the filesystem is the boundary, not the thing under test.

### What this story does **not** own

* **The telemetry emitter.** The mobile app has no telemetry emitter at all.
  The FR-CAPTURE-7 median is server-side, and the AC's requirement — that a
  drained item is excluded from the *online* median — is satisfied
  structurally: the drain path and the online submit path are separate
  functions, and the queued clock starts at the drain rather than at the
  enqueue.
* **A user-visible queue screen.** The story puts that out of scope. The only
  surfaced state is "saved on device" plus the overflow warning.
* **A Maestro E2E flow.** The story's Technical Notes name one
  (airplane-mode submit → queued → reconnect → drained → the report appears
  in History). The unit-level contract is covered; the Maestro flow is not
  written here — it needs a device or emulator and a running stack.
