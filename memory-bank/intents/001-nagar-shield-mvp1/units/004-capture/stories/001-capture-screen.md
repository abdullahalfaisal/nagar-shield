---
id: 001-capture-screen
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 001-capture-screen

## User Story

**As a** bystander standing in the middle of an incident with my phone in my hand
**I want** one screen where I can attach photo, video, or a file, describe what happened, confirm my location, and send it in a few taps
**So that** my evidence reaches the community quickly, without my identity being exposed and without me losing the moment

## Acceptance Criteria

- [ ] **Given** the Capture screen is opened, **When** it renders, **Then** the app bar shows a `close` icon button (navigating to Home), the centred title **অপরাধ রিপোর্ট করুন**, the sub-line **আপনার সাক্ষ্য অন্যদের সুরক্ষিত রাখবে**, and a 40 px right spacer; the prototype's fake iOS status bar is **not** ported
- [ ] **Given** a freshly opened Capture screen, **When** the anonymous card renders, **Then** the `.capture-anon` card shows the 36 dp `visibility_off` icon circle, the label **বেনামী রিপোর্ট**, the helper **আপনার পরিচয় সম্পূর্ণ গোপন থাকবে**, and the toggle in the **ON** state — the prototype's demo `onclick` is replaced by real state
- [ ] **Given** the user never touches the anonymous toggle, **When** the report is submitted, **Then** the stored `public_visibility` is `'anonymous'`; **Given** the user toggles it OFF, **When** the report is submitted, **Then** `public_visibility` is `'identified'` and `reports.author_id` is still populated in both cases
- [ ] **Given** the Capture screen renders, **When** the media entry points are listed, **Then** exactly three `.upload-card` rows are present — `videocam` **ভিডিও ক্যাপচার করুন**, `photo_camera` **ছবি তুলুন** / **অথবা গ্যালারি থেকে নির্বাচন করুন**, `attach_file` **ফাইল আপলোড করুন** / **PDF, DOC — সর্বোচ্চ ১০MB** — each with an `arrow_forward_ios` chevron
- [ ] **Given** the video upload card renders, **When** its sub-line is read, **Then** it reads **সর্বোচ্চ ৩০ সেকেন্ড** and **not** the prototype's **সর্বোচ্চ ৬০ সেকেন্ড**, because PRD-X-4 locks the enforced video cap at 30 s and the UI must not promise more than the product delivers
- [ ] **Given** the description field is empty, **When** the counter renders, **Then** it reads **`0 / 140`** and an empty description is accepted — the report is created with `description IS NULL`, because the description is optional and is never the reason a submit fails; **Given** 140 characters have been typed, **When** a 141st character is entered, **Then** the counter reads **`140 / 140`**, the extra character is **not** accepted, and no further character can be entered
- [ ] **Given** a location fix is available, **When** the `.location-card` renders, **Then** the title shows the **live reverse-geocoded address** for the current fix, the sub-line shows **অটো-ডিটেক্টেড · ±৫ মিটার** driven by the real `location.coords.accuracy`, and the **পরিবর্তন** affordance is present; the prototype's hardcoded **বসুন্ধরা R/A, ঢাকা** never appears in a build
- [ ] **Given** a geocode is still in flight or the geocoder is unreachable, **When** the user looks at the sticky CTA, **Then** the `.sticky-cta` **রিপোর্ট পাঠান** button (`.btn.btn-primary.btn-lg` with the `send` icon) is **enabled** and the submit is never gated on a geocode
- [ ] **Given** the Capture screen renders, **When** the whole screen is inspected, **Then** there is **no** category field, picker, or step anywhere, and a screenshot comparison against `docs/design/screen-capture-report-crime-.html` differs only in the video sub-line number (৩০ vs ৬০) — a copy deviation, not a layout one
- [ ] **Given** a logged-in user completes the happy path, **When** the telemetry for the run is read, **Then** `capture_open_to_submit_ms` has a median below **30,000 ms** and the media upload completes in under **5 s** on BD LTE

## Technical Notes

- **Screen 17 is a 1:1 port.** The markup contract is `docs/design/screen-capture-report-crime-.html` and `docs/design/screen-spec.md` §17. Port the class names, the icon set (`close`, `visibility_off`, `videocam`, `photo_camera`, `attach_file`, `location_on`, `send`, `arrow_forward_ios`), the hierarchy, and the spacing. No redesign, no additional chrome.
- **The one sanctioned copy deviation.** PRD-X-4 locks the media cap at 1080p / 30 s, so the video sub-line ships **সর্বোচ্চ ৩০ সেকেন্ড**. The prototype's ৬০ is a prototype artefact; the PRD wins. Layout, icon, and hierarchy are unchanged — only the number in the copy moves. The enforcement of 30 s lives in `004-exif-strip-and-media-caps`.
- **Category is never asked at capture** (FR-CAPTURE-5 override, 2026-09-11). There is no category field, no category step, and no "helpful" addition of one. `category` is nullable at creation and is set later by the author from History → Report detail (`003-report-detail-and-category-edit`).
- **Anonymous is the default state, not a default value in the payload.** The toggle component owns the state and initialises to ON on every mount. The submit payload always carries an explicit `public_visibility`; the client never omits it and lets the server guess.
- **The toggle never suppresses the stored identity.** `public_visibility` controls the *public projection* only; `reports.author_id` is always written server-side (FR-DATA-3, `007-storage-upload-and-finalize`). The screen copy must never claim that the server does not know who the user is — **আপনার পরিচয় সম্পূর্ণ গোপন থাকবে** is a claim about the public projection, not about server-side retention.
- **The location card address is a hint, not the record.** The displayed reverse-geocoded address may legitimately disagree with the server-resolved `reports.area_hierarchy` (thana boundary, degraded geocode). `reports.lat` / `lng` / `captured_at` are authoritative. The card shows `±<accuracy> মিটার` from `location.coords.accuracy` — do not hardcode ৫.
- **The submit never blocks.** The CTA is never disabled by a pending geocode, a slow GPS fix, or a failed upload. A failed upload routes to the device queue (`005-offline-upload-queue`) and the user returns to the screen immediately. There is no code path that awaits an upload before returning the user to the screen.
- **The description counter reads the shared constant.** The counter and the client-side cap both use `CAPTURE_DESCRIPTION_MAX_LENGTH` (140) exported from `packages/shared`, so the client cap and the server cap cannot diverge. The shared `captureDescriptionSchema` is the authority; the DB CHECK is the third line of defence.
- **`capture_open_to_submit_ms` is measured, not estimated.** The clock starts when the Capture screen reports first render and stops when `finalize_capture` returns a `report_id`. The median is over successful **online** submits only — queued (offline) submits are excluded from the FR-CAPTURE-7 median and tracked separately as an offline-rate metric.
- **The screen renders and works with no network.** The entry points, the counter, and the toggle are all local. The Capture screen must not show a spinner or an empty state that depends on a network call.
- **Shared primitives.** Build the screen from the unit 001 primitives — `AppBar`, `Toggle`, `StickyFooter`, `LocationCard`, `TextField`, `Button` — and the light/dark tokens from `docs/design/design-tokens.md`. Presentational components stay dumb; the screen's hook owns the state and the media selection.
- **i18n is a hard requirement.** Every string on this screen goes through i18n with `bn` primary (native-speaker reviewed) and `en` alongside. Suggested keys: `capture.appBar.title`, `capture.appBar.subtitle`, `capture.anon.label`, `capture.anon.helper`, `capture.media.video.title`, `capture.media.video.sub`, `capture.media.photo.title`, `capture.media.photo.sub`, `capture.media.file.title`, `capture.media.file.sub`, `capture.description.label`, `capture.description.placeholder`, `capture.description.counter`, `capture.location.title`, `capture.location.sub`, `capture.location.edit`, `capture.cta.submit`.
- **Accessibility.** Every interactive control is ≥ 48 × 48 dp with an accessibility label; the prototype's `aria-label` strings are the contract for the RN `accessibilityLabel` values. The toggle exposes its state to the screen reader.
- **Route.** The screen lives in the Expo Router `(app)` group as the Capture route, opened from Home (prototype screen 14 → 17) and closed back to Home.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`captureDescriptionSchema`, `CAPTURE_DESCRIPTION_MAX_LENGTH`, `PublicVisibility`, `ApiErrorCode`), the typed Supabase client, the Expo Router `(app)` group, the light/dark design tokens, the shared UI primitives (`AppBar`, `Toggle`, `StickyFooter`, `LocationCard`, `TextField`, `Button`), and the `bn` / `en` i18n bundles
- Unit `002-identity` — the authenticated session and `profiles.id` that become `reports.author_id`, and the `AUTH_DISABLED` gate
- `006-capture-permission-degradation` — the permission state that decides whether the video / camera entry points render at all
- `004-exif-strip-and-media-caps` — the media caps the copy promises (1080p / 30 s / 10 MB)

### Enables
- `004-exif-strip-and-media-caps` — the screen supplies the media the pipeline sanitises
- `005-offline-upload-queue` — the screen supplies the submit payload the queue persists
- `007-storage-upload-and-finalize` — the screen supplies the payload the Edge Function validates
- `002-area-hierarchy-extraction` — the screen supplies the `lat` / `lng` / `captured_at` the server resolves against
- Unit `006-alerts` — the `area_hierarchy` and `captured_at` values the Alerts feed and History filters read

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user rotates the device or the keyboard covers the sticky CTA | The CTA stays reachable above the keyboard and remains enabled; the scroll view keeps the description field visible |
| The screen is opened from a cold start with no GPS fix yet | The location card renders an "acquiring" state; the CTA is enabled and the submit proceeds with a null-guarded coordinate path — the screen never waits for a fix before allowing a submit |
| The user toggles the anonymous switch off and then on again before submitting | The final state (`anonymous`) is what is sent; the toggle is a controlled component with a single source of truth |
| A Bangla conjunct or an emoji is typed into the description | The counter counts the same way the shared schema counts, so the UI and the server agree on where 140 ends |
| The description is exactly 140 characters of whitespace | The shared schema trims first and rejects an empty description; the report is still created with `description IS NULL` rather than a whitespace string |
| The reverse geocoder on the device is slow or unavailable | The location card falls back to a coordinates-only or "location unavailable" state; it never displays a stale address from a previous fix |
| The device is offline when the user opens the Capture screen | The screen renders fully — entry points, counter, toggle, CTA all work; the submit routes to the local queue |
| The user presses the CTA twice in quick succession | The second press is ignored while the first is in flight; the button shows an in-progress state but is never left disabled after a failure |

## Out of Scope

- The category picker and the category write path — `003-report-detail-and-category-edit`
- The media sanitisation, compression, transcoding, and cap enforcement — `004-exif-strip-and-media-caps`
- The offline queue, the backoff schedule, and the "saved on device" state — `005-offline-upload-queue`
- The permission prompts, the hidden entry points, and the Settings re-request path — `006-capture-permission-degradation`
- The Storage upload, the Edge Function, and the `reports` / `report_media` write — `007-storage-upload-and-finalize`
- The server-side area resolution — `002-area-hierarchy-extraction`
- The History read model, the History screen, and the report-detail surface — unit `006-alerts` and `003-report-detail-and-category-edit`
- Any AI media classification, blurring, or face detection — out of MVP scope
- Any copy claiming that police, authorities, or anyone else were notified — forbidden by C-6

## Implementation

**The capture screen ships and works, with the permission degradation and the manual-entry fallback. The story is not `complete` because the telemetry it names does not exist.**

### What ships

- The capture screen exists at `apps/mobile/app/(app)/capture.tsx`, with the upload cards, the location card, and the permission handling.
- Permissions are **read, never prompted for** (`capture.tsx:82-85`): the live permission state is read and re-read on every foreground, so a permission revoked while the app was backgrounded is noticed. The comment states the rule explicitly.
- The manual-entry fallback appears when location is not granted: `capture.tsx:175-180` shows it when `permissions.location !== 'granted' && !hasFix`.
- Each denied permission gets its own message: `capture.tsx:524-536` reads `error.details.permission` and selects `capture.micOnlyDenied` or `capture.galleryDenied` — the citizen is told *which* permission was refused, not given a generic failure.
- The capture flow is covered: `apps/mobile/src/shared/services/captureFlow.test.ts` and `apps/mobile/src/shared/services/submitCapture.test.ts`.
- The upload path is proven live: `tools/probe-capture-submit.cjs` reports **25/25** assertions.

### The gaps

- **The telemetry does not exist.** The story names a `capture_open_to_submit_ms` event. `grep -rn "capture_open_to_submit_ms|captureOpenToSubmit" apps packages supabase` returns **nothing**. The only telemetry in the mobile app is `apps/mobile/src/shared/services/shareTelemetry.ts` (for location sharing) and the dead `dialConfirmation.ts`. So the story's central measurement — how long a citizen takes from opening capture to submitting — is not captured at all.
- **No test on the capture screen's own composition.** `captureFlow.test.ts` and `submitCapture.test.ts` cover the flow service and the submit service; nothing renders the screen and asserts the fallback appears when permission is denied, or that the right card is shown for a microphone denial.
- **The dead `dialConfirmation.ts` telemetry surface is never called.** `apps/mobile/src/shared/services/dialConfirmation.ts` exports `useDialConfirmation`, `recordDialTelemetry`, `medianDialMs`, and `markAppOpen` — `grep` shows **zero callers**. The confirmation sheet it was written for is not wired into any screen.

### What closing this needs

1. A `capture_open_to_submit_ms` telemetry event, emitted once per submission, with the open timestamp captured when the capture screen mounts.
2. A screen-level test for the permission-degradation branches: no location permission → manual entry visible; microphone refused → `capture.micOnlyDenied`; gallery refused → `capture.galleryDenied`.
3. Either the dial-confirmation sheet wired into the help surfaces — which would make the telemetry live — or the module deleted.
