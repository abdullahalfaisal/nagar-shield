---
intent: 001-nagar-shield-mvp1
phase: inception
status: complete
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Requirements: Nagar Shield MVP Phase 1

## Intent Overview

Build **Nagar Shield** — a Bangladesh-citizen Android app that bundles emergency
help, non-emergency "more help", anonymous incident capture, one-shot location
sharing, local History, and a BD-wide Alerts feed into one Home screen.

The product is **not** a public-safety intermediary. It does not dispatch to
police, fire, or hospitals, never auto-dials, and never claims it notified
emergency services. It removes decision friction in panic moments (correct
number in one tap) and provides a quiet, filterable view of incidents.

**This intent delivers MVP Phase 1**, the full PRD contract, as a working
system: Expo/React Native Android app (1:1 port of `prototype ui.html`),
Supabase backend (Auth + Postgres + Storage + Edge Functions), Next.js moderator
console, and a CI/EAS pipeline that produces a sideloadable APK.

**Design source of truth:** `prototype ui.html`, with the extracted contracts in
`docs/design/design-tokens.md` and `docs/design/screen-spec.md`.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Cut the panic-moment decision count to one | Help Alert dialer-prefill median **< 12 s** from app open (Police / Medical / Fire) | Must |
| Lower the friction of reporting an in-progress incident | Capture open → server submit median **< 30 s**; upload **< 5 s** on BD LTE | Must |
| Give the country a quiet, filterable incident feed | ≥30% of weekly active users open Alerts ≥1×/week | Should |
| Help users reach non-emergency services without Googling | ≥15% of weekly active users tap "More Help" ≥1× in week 1 | Should |
| Be defensible at MVP scale on free tier | $0 required infrastructure; no regulatory exposure we cannot document | Must |

### Counter-metrics (named so we don't game the targets)

- Help Alert taps → emergency-service-connect rate. **We do not claim this**;
  we measure dialer-open rate only.
- Capture submission rate → flagged / hidden / removed rate.
- Retention → Day-1 / Day-7 / Day-30 watched together.

We do **not** measure "crimes prevented" or "lives saved" — unmeasurable at
this scale.

---

## Functional Requirements

### FR-AUTH: Authentication and session

#### FR-AUTH-1 — Dual-identifier signup and login
- **Description**: Signup collects **email + password + phone (E.164)**. Supabase
  Auth identity is **email-primary**; `profiles.phone` is a required, unique
  attribute. Login accepts **phone OR email + password** — the client resolves
  the identifier to the email-primary Auth user and signs in with the same
  password. One `auth.users` row per person, never two.
- **Acceptance Criteria**:
  - Given a new email + valid BD phone + password, when the user submits
    signup, then an `auth.users` row and a `profiles` row exist with the same
    `id`, and `profiles.phone` matches the submitted number.
  - Given a registered phone number, when the user enters it plus the correct
    password on the login screen, then the session resolves to that account.
  - Given a registered email, when the user enters it plus the correct
    password, then the session resolves to that account.
  - Given a phone number that already belongs to another account, when signup
    is submitted, then it fails with `VALIDATION_FAILED` and no auth user is
    created.
  - No SMS verification is required or claimed while `EXPO_PUBLIC_SMS_OTP_ENABLED=false`.
- **Priority**: Must
- **Related Stories**: US-AUTH-01, US-AUTH-02

#### FR-AUTH-2 — Remember me (30-day session)
- **Description**: The login screen offers "Remember me". Checked → the refresh
  token is persisted in the OS secure store for **30 days**. Unchecked → session
  ends when the app is backgrounded past the grace window.
- **Acceptance Criteria**:
  - With "Remember me" checked, when the app is force-closed and reopened
    after more than the default session window but within 30 days, then the
    user is still authenticated.
  - With "Remember me" unchecked, when the app is force-closed and reopened
    after the session window, then the login screen is shown.
  - The refresh token is stored via `expo-secure-store`, never in AsyncStorage.
- **Priority**: Must
- **Related Stories**: US-AUTH-02

#### FR-AUTH-3 — Password reset by email OTP
- **Description**: Password reset defaults to **email OTP**. OTP validity
  **10 minutes**; max **3 attempts** before a **30-minute cooldown**. SMS-OTP
  reset is opt-in behind a feature flag and, when offered, requires a
  carrier-charge disclosure that is re-acknowledged each session where the user
  is opted in.
- **Acceptance Criteria**:
  - Given a registered email, when the user requests a reset, then an OTP
    email is sent and an OTP entry screen opens.
  - A correct OTP within 10 minutes resets the password and signs the user in.
  - An expired OTP (>10 min) is rejected.
  - After 3 incorrect attempts, further attempts are rejected for 30 minutes.
  - While `EXPO_PUBLIC_SMS_OTP_ENABLED=false`, no SMS reset path is offered and
    no copy claims SMS delivery.
- **Priority**: Must
- **Related Stories**: US-AUTH-03

#### FR-AUTH-4 — Biometric re-auth for returning sessions
- **Description**: The user may opt into fingerprint/face re-auth. Biometric
  is a **local device unlock** of an existing session — never a login
  credential.
- **Acceptance Criteria**:
  - With biometric opt-in, when the app opens with a valid session, then a
    biometric prompt appears and a successful match lands the user on Home.
  - A failed match never locks the user out.
- **Priority**: Should
- **Related Stories**: US-AUTH-04

#### FR-AUTH-5 — Biometric failure handling
- **Description**: After **3** biometric failures the identifier + password
  screen appears. After **5** failures in **24 h**, biometric auto-disables for
  that user.
- **Acceptance Criteria**:
  - 3 consecutive failures show the password screen (no lockout screen).
  - 5 failures within 24 h disable the biometric preference for that account
    and the next session uses password login.
- **Priority**: Must
- **Related Stories**: US-AUTH-04

#### FR-AUTH-6 — No social login
- **Description**: No Google / Facebook / Apple sign-in at MVP.
- **Acceptance Criteria**: No social sign-in control appears on any auth screen.
- **Priority**: Must

#### FR-AUTH-7 — Remote account disable
- **Description**: A moderator can disable a user. `profiles.disabled_at` is
  set. On the next app open the user sees "Your account has been disabled.
  Contact support." and cannot use the app.
- **Acceptance Criteria**:
  - Given a disabled account, when the app opens, then a disable message is
    shown and no API write succeeds.
  - A disabled account's session is rejected by the API with `AUTH_DISABLED`.
- **Priority**: Must
- **Related Stories**: US-MOD-03, US-AUTH-05

---

### FR-HELP: Help Alert (prefilled dialer)

#### FR-HELP-1 — Five Home surfaces
- **Description**: Home exposes Police, Medical, Fire, More Help, and Personal
  Emergency. Police / Medical / Fire / Personal Emergency render as four
  full-width **80 dp** help cards (panic grid). More Help renders as a dashed
  card one level deeper, opening the curated-hotline / thana-line /
  find-a-station sheet.
- **Acceptance Criteria**:
  - Home shows exactly four 80 dp help cards plus one More Help card.
  - The four help cards are the visually dominant elements on Home.
  - More Help opens the sub-sheet rather than a separate full screen.
- **Priority**: Must
- **Related Stories**: US-HELP-01

#### FR-HELP-2 / 3 / 4 — Correct numbers
- **Description**: Police → `999`. Medical → `999`. Fire → `102`.
- **Acceptance Criteria**:
  - The Police card displays `৯৯৯`, Medical displays `৯৯৯`, Fire displays `১০২`.
  - Each card's `helpAlertTap` telemetry records the correct number.
- **Priority**: Must
- **Related Stories**: US-HELP-01

#### FR-HELP-5 — Personal Emergency contact picker
- **Description**: Personal Emergency opens a contact-picker sheet listing the
  user's primary emergency contacts in a stable order, prefilled with the first
  primary. Tapping a contact opens the dialer with that number. The app **does
  not** initiate a call, **does not** observe call outcome, and **does not**
  failover automatically. A "Call next contact" affordance MAY appear once
  **25 s** have elapsed, prefilled with the next primary contact's number; the
  user taps to open the dialer.
- **Acceptance Criteria**:
  - The sheet lists primary contacts in `sort_order`, first primary preselected.
  - Tapping a contact opens the dialer with that contact's number only.
  - The app contains no code that places a call or reads call state.
  - The "next contact" affordance is not shown before 25 s.
- **Priority**: Must
- **Related Stories**: US-HELP-02

#### FR-HELP-6 — OS dialer, never auto-dial
- **Description**: Help Alert opens the system dialer via an Android
  `ACTION_DIAL` intent. The app **never** auto-dials.
- **Acceptance Criteria**:
  - Tapping a help card fires an `ACTION_DIAL` intent with the correct number.
  - No code path in the app places a call (`ACTION_CALL` is never used).
- **Priority**: Must
- **Related Stories**: US-HELP-01

#### FR-HELP-7 — Confirmation copy
- **Description**: Before the dialer opens, the app shows "Calling 999 — tap to
  confirm." / "Calling 102 — tap to confirm." (Bangla + English).
- **Acceptance Criteria**:
  - The confirmation sheet names the exact number being dialled.
  - The sheet displays the measured `app_open_to_dialer_ms` for the showcase
    demonstration.
- **Priority**: Must
- **Related Stories**: US-HELP-01

#### FR-HELP-8 — Dialer latency
- **Description**: Median time from app open to dialer-prefilled for Police,
  Medical, and Fire is **< 12 s**.
- **Acceptance Criteria**: Telemetry `app_open_to_dialer_ms` has a median
  below 12,000 ms over the measurement window.
- **Priority**: Must
- **Related Stories**: US-HELP-01

---

### FR-SEEK: More Help (non-emergency / broader help)

#### FR-SEEK-1 — Three categories
- **Description**: More Help opens a bottom sheet with three categories: Other
  hotlines, Thana line, Find a station.
- **Acceptance Criteria**: All three entries are present and each opens its
  own list or map surface.
- **Priority**: Must
- **Related Stories**: US-SEEK-01

#### FR-SEEK-2 — Curated hotline list
- **Description**: A curated list of non-emergency helplines (Women & Children
  `109`, disaster `333`, ambulance `999`, electricity complaint `16116`,
  mental-health, anti-drug, cyber-crime). Each entry shows the service name and
  the number; tap-to-call pre-fills the dialer.
- **Acceptance Criteria**:
  - The list renders from the bundled curated dataset, not a network call.
  - Tapping an entry opens the dialer with that number.
- **Priority**: Must
- **Related Stories**: US-SEEK-01

#### FR-SEEK-3 — Thana line with fallback
- **Description**: "Thana line" shows the nearest police station from the
  station DB with name + distance + phone; tap-to-call pre-fills the dialer.
  If no thana is within **10 km**, fall back to `999` and show "Couldn't find a
  thana near you — calling 999 instead."
- **Acceptance Criteria**:
  - With a station within 10 km, the nearest station is shown with its distance.
  - With no station within 10 km, the fallback banner is shown and the dialer
    target is `999`.
- **Priority**: Must
- **Related Stories**: US-SEEK-02

#### FR-SEEK-4 — Find a station map
- **Description**: "Find a station" opens a map view (reusing the History map
  component) showing nearby hospitals, fire stations, and police thanas with
  their phone numbers; tap-to-call from the map.
- **Acceptance Criteria**: The map renders station markers; tapping one shows
  the name + number with a call action.
- **Priority**: Should
- **Related Stories**: US-SEEK-03

#### FR-SEEK-5 — Curated dataset shipped in the app
- **Description**: The hotline list is a hardcoded dataset shipped in the app
  bundle, refreshed quarterly by a curator (same cadence as the station DB).
  The dataset is mirrored in Postgres.
- **Acceptance Criteria**: The hotline list renders with no network available.
- **Priority**: Must
- **Related Stories**: US-SEEK-01

#### FR-SEEK-6 — Wrong-number report
- **Description**: Any user may report a "wrong number" on a hotline or thana
  entry. The report goes to the curator for next-refresh verification.
- **Acceptance Criteria**: A wrong-number report is persisted with the
  referenced entry and is visible to the curator workflow.
- **Priority**: Should
- **Related Stories**: US-SEEK-04

---

### FR-CAPTURE: Capture (anonymous report)

#### FR-CAPTURE-1 — Photo, video, or file
- **Description**: A logged-in user may capture a photo, record a video, or
  pick a file.
- **Acceptance Criteria**: All three entry points are present; the file entry
  accepts PDF and DOC up to 10 MB.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-01

#### FR-CAPTURE-2 — GPS + timestamp, EXIF stripped
- **Description**: The app auto-attaches GPS coordinates and a timestamp at
  capture time, replacing any EXIF GPS data with the app-supplied location.
- **Acceptance Criteria**:
  - A captured photo's stored metadata contains the app-supplied coordinates.
  - Any embedded EXIF GPS in an imported file is removed before upload.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-01

#### FR-CAPTURE-3 — Anonymous by default
- **Description**: `public_visibility` defaults to `anonymous`. The user may
  toggle to `identified`.
- **Acceptance Criteria**:
  - The Capture screen shows the anonymous toggle **on** by default.
  - A report created without touching the toggle has
    `public_visibility = 'anonymous'` and is absent from public author data.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-01

#### FR-CAPTURE-4 — Server-side area hierarchy
- **Description**: `area_hierarchy` is extracted server-side via reverse
  geocode — **Dhaka-local area table first**, online geocode is backup only.
  Capture never blocks on a live geocode call.
- **Acceptance Criteria**:
  - A submitted report receives an `area_hierarchy` with `division`, `city`,
    `thana` (and `neighborhood` when known).
  - If geocode is unavailable, the report is still created with `Dhaka` /
    unknown thana and the submit succeeds.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-02

#### FR-CAPTURE-5 — No category required at submit
- **Description**: A Capture submission is photo + optional description
  (≤140 chars) + auto-captured location and timestamp. `category` is
  **nullable at creation** and may be set or changed later by the original
  reporter from History → Report detail, using the fixed 11-value enum.
- **Acceptance Criteria**:
  - A report submitted with no category is created successfully.
  - The author can set a category later from the report detail screen.
  - Only the author can change the category.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-03

#### FR-CAPTURE-6 — Description cap
- **Description**: The description is capped at **140 characters**. The
  counter reads `0 / 140` and blocks further input past the cap.
- **Acceptance Criteria**: Input beyond 140 characters is rejected client-side
  and server-side.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-01

#### FR-CAPTURE-7 — Capture latency
- **Description**: Median time from Capture open to submit-on-server is
  **< 30 s** on a typical flow; upload **< 5 s** on BD LTE when online.
- **Acceptance Criteria**: Telemetry reports a median below 30,000 ms.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-01

---

### FR-LOC: Location Sharing

#### FR-LOC-1 — One-shot snapshot to contacts
- **Description**: The user may share their current location as a **single
  snapshot** with (a) one selected EmergencyContact or (b) all primary
  EmergencyContacts.
- **Acceptance Criteria**:
  - "Share with one contact" sends exactly one snapshot to the chosen contact.
  - "Share with everyone" sends exactly one snapshot to each primary contact.
- **Priority**: Must
- **Related Stories**: US-LOC-01

#### FR-LOC-2 — 5-second SLA (intent, not delivery)
- **Description**: The snapshot payload is prepared and either the OS share
  sheet is presented / the share intent fires, or the `location_shares` audit
  row is written — median **< 5 s** from user confirm. Carrier delivery and
  recipient open time are **not** guaranteed and must not be claimed.
- **Acceptance Criteria**:
  - Telemetry `location_share_intent_ms` has a median below 5,000 ms.
  - No UI states that a message was delivered or read.
- **Priority**: Must
- **Related Stories**: US-LOC-01

#### FR-LOC-3 — Snapshot, not stream
- **Description**: The location is sent **once**. The app **never** streams
  location.
- **Acceptance Criteria**: No continuous location transmission code path
  exists; `location_shares.mode` is `snapshot`.
- **Priority**: Must
- **Related Stories**: US-LOC-01

#### FR-LOC-4 — OS share sheet fallback
- **Description**: If the recipient is not a Nagar Shield user, the app falls
  back to the **OS share sheet** (SMS / WhatsApp / any system target).
- **Acceptance Criteria**: A share to a non-app contact opens the system share
  sheet with the location + timestamp text.
- **Priority**: Must
- **Related Stories**: US-LOC-02

---

### FR-HIST: History (local view)

#### FR-HIST-1 — Default radius and window
- **Description**: History opens on the **widest radius the filter sheet offers**
  — **15 km** — of the user's current location from the last **24 hours** by
  default, so a cold launch shows the full local picture instead of an empty
  quiet-hour street. (The `history_nearby` RPC keeps a server-side fallback of
  1 km for callers that omit the parameter.)
- **Acceptance Criteria**: Opening History with no filter applied queries
  `radius_km = 15` (the largest radius option) and `window_hours = 24`; the
  reset action restores exactly these values.
- **Priority**: Must
- **Related Stories**: US-HIST-01

#### FR-HIST-2 — Filters
- **Description**: The user may change the radius, the time window, and the
  category filters.
- **Acceptance Criteria**: Each filter is selectable and changes the result
  set.
- **Priority**: Must
- **Related Stories**: US-HIST-02

#### FR-HIST-3 — Immediate visibility
- **Description**: A submitted report appears immediately. There is **no**
  pending-review gate on publish. Moderation is after-the-fact via flags.
- **Acceptance Criteria**: After a successful submit, the report is present in
  the author's History without any moderation step.
- **Priority**: Must
- **Related Stories**: US-HIST-01, US-CAPTURE-03

#### FR-HIST-4 — Fast load
- **Description**: The default History view loads in **< 2 s** on a warm
  session.
- **Acceptance Criteria**: A skeleton is shown during load and is replaced
  within 2 s on a warm session.
- **Priority**: Must
- **Related Stories**: US-HIST-01

---

### FR-ALERTS: Alerts (BD-wide newsfeed)

#### FR-ALERTS-1 — BD-wide feed, recency ordered
- **Description**: The app displays a Bangladesh-wide list of recent reports,
  ordered by recency.
- **Acceptance Criteria**: Reports across all divisions appear, newest first.
- **Priority**: Must
- **Related Stories**: US-ALERTS-01

#### FR-ALERTS-2 — 60-second foreground refresh
- **Description**: The feed auto-refreshes every **60 s** while foregrounded,
  and pauses when battery is **< 20%**.
- **Acceptance Criteria**:
  - Foregrounded with battery ≥20%, the feed re-queries at 60 s intervals.
  - Foregrounded with battery <20%, the feed stops auto-refreshing and a quiet
    indicator is shown.
- **Priority**: Should
- **Related Stories**: US-ALERTS-02

#### FR-ALERTS-3 — Pull to refresh
- **Description**: The user may pull to refresh on demand.
- **Acceptance Criteria**: Pull-to-refresh triggers an immediate re-query.
- **Priority**: Must
- **Related Stories**: US-ALERTS-02

#### FR-ALERTS-4 — Area filter
- **Description**: The user may filter by area (division, city, thana,
  neighborhood). The prototype's horizontal chip row ("All BD", "My division",
  "My city", "Mirpur", "Dhanmondi") is the visual contract.
- **Acceptance Criteria**: Selecting a chip narrows the feed to that area.
- **Priority**: Must
- **Related Stories**: US-ALERTS-03

#### FR-ALERTS-5 — Alert row format
- **Description**: Each alert renders as "New alert from `<area>`: `<category>`
  — `<user description>`". The prototype renders the Bangla/English pair
  (`চুরি — Theft`) with area (`Mirpur · মিরপুর`), description, and relative
  time. A missing category renders a neutral placeholder ("uncategorized").
- **Acceptance Criteria**: Every feed row shows area, category, description,
  and relative time.
- **Priority**: Must
- **Related Stories**: US-ALERTS-01

#### FR-ALERTS-6 — Flagging
- **Description**: Any user may flag any alert with a reason from the fixed
  enum: `misinformation`, `harassment`, `duplicate`, `off_topic`, `other`.
- **Acceptance Criteria**: A flag is persisted with its reason and the
  reporter; flagging the same report twice by the same user is rejected with
  `CONFLICT`.
- **Priority**: Must
- **Related Stories**: US-ALERTS-04

#### FR-ALERTS-7 — Auto-hide at 3 flags
- **Description**: After **3** flags, the alert auto-hides from the feed
  pending moderation (`hidden_pending_review`).
- **Acceptance Criteria**: The 3rd distinct flag transitions the report to
  `hidden_pending_review` and it disappears from the public feed.
- **Priority**: Must
- **Related Stories**: US-ALERTS-04

#### FR-ALERTS-8 / 9 — Moderator restore and remove
- **Description**: A moderator-marked `restore` returns an auto-hidden alert to
  visible. A moderator-marked `remove` permanently removes it from public
  feeds.
- **Acceptance Criteria**:
  - Restored reports reappear in the public feed.
  - Removed reports never appear in the public feed.
- **Priority**: Must
- **Related Stories**: US-MOD-01, US-MOD-02

#### FR-ALERTS-10 — Flag rate limit
- **Description**: A user may not flag more than **10 reports per hour**.
- **Acceptance Criteria**: The 11th flag within an hour is rejected with
  `FLAG_RATE_LIMIT` and `retry_after_sec` in `details`.
- **Priority**: Must
- **Related Stories**: US-ALERTS-04

#### FR-ALERTS-11 — Author auto-hide
- **Description**: A user whose reports have been flagged **5+ times in 24 h**
  has their last 24 h of reports auto-hidden pending review.
- **Acceptance Criteria**: When the 5th distinct report of that author is
  flagged within 24 h, all of that author's reports from the last 24 h move to
  `hidden_pending_review`.
- **Priority**: Should
- **Related Stories**: US-ALERTS-05

---

### FR-MOD: Moderation

#### FR-MOD-1 — Moderator queue
- **Description**: An internal admin tool lists the `hidden_pending_review`
  queue.
- **Acceptance Criteria**: A moderator sees the queue; a citizen cannot access
  it (`FORBIDDEN`).
- **Priority**: Must
- **Related Stories**: US-MOD-01

#### FR-MOD-2 — Report + flag reasons + uploader
- **Description**: The moderator sees the report, its flag reasons, and the
  uploader (**server-side only** — never exposed publicly).
- **Acceptance Criteria**: The moderator view shows the author identity and the
  per-flag reasons; the public feed never does.
- **Priority**: Must
- **Related Stories**: US-MOD-01

#### FR-MOD-3 — Restore / remove with a required note
- **Description**: The moderator makes a `restore` or `remove` decision with a
  **required** note.
- **Acceptance Criteria**: A decision without a note is rejected; every
  decision writes a `moderation_actions` row with the note.
- **Priority**: Must
- **Related Stories**: US-MOD-02

#### FR-MOD-4 — Single moderator role
- **Description**: At MVP, `moderator` is a single role with full access.
  Phase 2 may split into trust-and-safety + admin.
- **Priority**: Must

---

### FR-DATA: Data handling and privacy

#### FR-DATA-1 — Encryption at rest
- **Description**: Captured media is encrypted at rest on the device (OS
  keystore / secure enclave) and on the server (platform-managed KMS).
- **Acceptance Criteria**: Media drafts live in the app sandbox / secure
  storage; the Storage bucket is private.
- **Priority**: Must

#### FR-DATA-2 — TLS 1.3 with cert pinning
- **Description**: All transit uses TLS 1.3 with cert pinning on the API host
  in release builds.
- **Acceptance Criteria**: A release build pins the API host certificate.
- **Priority**: Must

#### FR-DATA-3 — Server retains identity
- **Description**: User identity is retained server-side even when
  `public_visibility = anonymous`, for moderation and dispute handling.
- **Acceptance Criteria**: `reports.author_id` is always populated; the public
  feed projection omits it.
- **Priority**: Must

#### FR-DATA-4 — 90-day media deletion
- **Description**: Captured media is hard-deleted after **90 days**; metadata
  is retained longer.
- **Acceptance Criteria**: A scheduled job deletes Storage objects older than
  90 days while keeping the report row.
- **Priority**: Must
- **Related Stories**: US-OPS-01

#### FR-DATA-5 — No data sale
- **Description**: The app does not sell or share user data with third
  parties.
- **Acceptance Criteria**: No third-party analytics or ad SDK is integrated.
- **Priority**: Must

#### FR-DATA-6 — Account deletion
- **Description**: The user may delete their account, with a **30-day**
  recovery window before PII is purged.
- **Acceptance Criteria**: Deletion soft-deletes immediately, the account is
  recoverable for 30 days, and PII is purged after that.
- **Priority**: Should

---

### FR-PERMS: Permissions and graceful degradation

#### FR-PERMS-1 — Just-in-time permission requests
- **Description**: Location, camera, mic, and storage permissions are
  requested **at the moment they are needed**, not at first launch.
- **Acceptance Criteria**: No permission prompt appears on first launch; each
  appears immediately before the feature that needs it.
- **Priority**: Must
- **Related Stories**: US-CAPTURE-01, US-LOC-01

#### FR-PERMS-2 — Function with permissions denied
- **Description**: The app functions when permissions are denied. Help Alert
  falls back to `999` if location is denied. Capture hides the camera/mic
  buttons if those permissions are denied.
- **Acceptance Criteria**:
  - With location denied, Help Alert still opens the dialer with the correct
    number and shows manual-dial guidance.
  - With camera denied, the Capture screen hides the camera and mic entry
    points.
- **Priority**: Must
- **Related Stories**: US-HELP-01, US-CAPTURE-01

#### FR-PERMS-3 — Battery-saver warning
- **Description**: The app detects Android battery-saver / aggressive mode and
  warns the user if the dialer intent would be suppressed.
- **Acceptance Criteria**: With power saving on, a warning appears alongside
  the help action.
- **Priority**: Should

---

### FR-UX: UX and accessibility

#### FR-UX-1 — Bangla + English
- **Description**: All UI strings exist in both Bangla and English. Native
  speaker review on every string; no machine translation.
- **Acceptance Criteria**: No hardcoded user-facing string exists outside the
  i18n resources; both locales render every key.
- **Priority**: Must

#### FR-UX-2 — Help Alert dominance
- **Description**: Help Alert buttons are visually dominant on Home.
- **Acceptance Criteria**: The four help cards are the largest, highest-contrast
  elements in the Home viewport.
- **Priority**: Must

#### FR-UX-3 — Dark and light mode
- **Description**: The app supports dark and light mode; the user's choice
  persists.
- **Acceptance Criteria**: The theme toggle switches the whole app; the choice
  survives an app restart.
- **Priority**: Must

#### FR-UX-4 — Material 48 dp tap targets
- **Description**: All controls have a minimum **48 × 48 dp** tap target.
- **Acceptance Criteria**: No interactive control is smaller than 48 dp in
  either dimension.
- **Priority**: Must

#### FR-UX-5 — WCAG AA contrast
- **Description**: Color contrast meets **WCAG AA** in both modes; AAA on
  panic-critical surfaces.
- **Acceptance Criteria**: Token pairs used on panic surfaces are verified at
  AA (or better) in both themes.
- **Priority**: Must

---

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Help Alert dialer prefill | Median app-open → dialer | **< 12 s** |
| Capture submit | Median open → server | **< 30 s** |
| Capture upload | Media upload on BD LTE | **< 5 s** |
| History / Alerts initial load | Warm session | **< 2 s** |
| Location share intent | Median confirm → intent/audit | **< 5 s** |

### Scalability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Active users | 90-day target | ~1,000 |
| Concurrent alerts readers | Peak | < 100 |
| Reports stored | 90 days of history | ~50,000 |
| Media | Storage volume (1 GB free tier) | Enforce caps + 90-day purge early |

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Authentication | Supabase Auth (JWT, email-primary) | Phone on profile; email OTP reset |
| Authorization | RLS + `profiles.role` | No service-role key in any client bundle |
| Data protection | Platform encryption at rest + TLS 1.3 | EXIF stripped; media private |
| Privacy | Anonymous public projection | `author_id` server-side only |
| Rate limits | Flag 10/h; capture per-user daily cap | Enforced in Edge Function |
| OWASP | Injection / BOLA / SSRF / XSS | RLS negative tests in CI |

### Reliability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Availability | Free-tier best effort | Heartbeat to avoid project pause |
| Capture offline | Failed upload queue | Max 3 attempts, then "saved on device" |
| Recovery | Media purge | Idempotent, resumable job |
| Data durability | Supabase daily backups | Documented restore drill |

### Compliance

| Concern | Rule |
|---------|------|
| Store framing | **No** "emergency service" framing (C-6). Position as utilities / civic info. |
| Languages | Bangla + English only (C-8). |
| Data sharing | Never sell or share user data (C-7 / FR-DATA-5). |
| Legal | Not a dispatch intermediary; never claims to have contacted authorities. |

---

## Constraints

### Technical Constraints

Project-wide standards live in `memory-bank/standards/`. Intent-specific:

- The mobile UI is a **1:1 port** of `prototype ui.html` — tokens in
  `docs/design/design-tokens.md`, screens in `docs/design/screen-spec.md`.
  Redesigning is out of scope.
- Prototype screen 23 ("Charts — Admin App") and the crime-statistics concept
  are **excluded** (FR-NG-3 / FR-NG-4 / ADR-010).
- Android-first; sideloaded APK via EAS. **No** Play Store listing.
- The real Android status bar replaces the prototype's fake iOS status bar.
- `EXPO_PUBLIC_SMS_OTP_ENABLED=false` for Phase 1 builds.

### Business Constraints

- **$0 required infrastructure.** SMS is the only optional paid line item.
- Geography: Dhaka metro at launch; station + hotline datasets are in-house
  curated and refreshed quarterly.
- Distribution: emulator + real device install of a sideloaded APK.
- Team: solo / small, production-minded engineering on free-tier tooling.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| Supabase free tier sustains ~1,000 users and 1 GB storage | Project pauses on inactivity; media quota exhausted | Heartbeat; enforce caps + 90-day purge early; migrate to Neon + R2 without touching domain modules |
| Email OTP deliverable to BD ISPs within 8 s median | Password reset fails for a slice of users | Benchmark during Phase 1; keep SMS path behind a flag |
| Nominatim / compatible geocoder is reachable and rate-limit tolerant | Area hierarchy degrades | Dhaka-local table is primary; geocode is backup; capture never blocks |
| Material Symbols font renders Bangla-adjacent glyphs correctly | Icon gaps | Bundle the font via `expo-font` and verify on-device |
| OSM tile usage stays within policy at MVP scale | Tiles throttled | Cache aggressively; self-host tiles later if needed |
| The prototype's English copy is acceptable as the EN locale | Rework of all strings | Bangla is the primary; EN strings authored alongside and reviewed |
| Supabase free project region (non-BD) is acceptable | Latency complaints | Measure; revisit if BD residency becomes a hard constraint |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Which free-tier SMS/OTP provider, if any, for Phase 2? | Project owner | Phase 2 | Deferred behind `EXPO_PUBLIC_SMS_OTP_ENABLED` |
| Should `alerts_feed` include a "media thumbnail" in MVP? | Project owner | Post-MVP | Cut — text-only feed keeps the 2 s load target |
| Supabase region — default vs BD-proximate? | Project owner | Pre-launch | Default region acceptable for training MVP (PRD §10) |
| Is the "Showcase" delivery profile still required separately from full MVP? | Project owner | Construction start | **Yes** — built as seeded/demo fixtures over the same code, not a separate build |
| Retry/email delivery SLA for the curator's quarterly dataset refresh | Project owner | Post-MVP | Non-blocking |

---

## Requirement Quality Checklist

- [x] All requirements are testable (measurable, not vague)
- [x] Acceptance criteria are binary (pass/fail)
- [x] NFRs have specific metrics and targets
- [x] Dependencies are identified
- [x] Constraints are documented
- [x] Assumptions are stated and risks assessed
