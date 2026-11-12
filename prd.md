---
title: "Nagar Shield — PRD"
status: final
created: 2026-09-11
updated: 2026-11-04
sources:
  - ../brief-001/brief.md
  - ../brief-001/addendum.md
  - ../../specs/spec-nagar-shield/SPEC.md
  - ../../specs/spec-nagar-shield/data-model.md
  - ../../specs/spec-nagar-shield/alerts-feed.md
  - ../../specs/spec-nagar-shield/help-alert-taxonomy.md
  - ../../specs/spec-nagar-shield/auth-edge-cases.md
  - ../../specs/spec-nagar-shield/moderation-model.md
  - ../../specs/spec-nagar-shield/state-machines.md
  - ../../specs/spec-nagar-shield/rejected-alternatives.md
  - ./ARCHITECTURE.md
---

# Nagar Shield — Product Requirements Document

> Internal-team PRD. Builds on the brief (`brief-001/brief.md`) and the spec (`spec-nagar-shield/SPEC.md`); where the PRD repeats content from those, it summarizes rather than re-derives. `[ASSUMPTION]` tags mark inferences I made for fast-path drafting — flag any that are wrong.
>
> **Technical source of truth:** stack, hosting, auth implementation pattern, and MVP waivers live in [`ARCHITECTURE.md`](ARCHITECTURE.md). This PRD owns product requirements; where an open question was resolved in architecture, §7 records the decision.

---

## 1. Summary

Nagar Shield is a Bangladesh-citizen mobile app that bundles **emergency help, non-emergency "more help," crime capture, location sharing, local history, and a BD-wide alerts feed** into one Home screen. It is **not** a public-safety intermediary — it does not dispatch to police, fire, or hospitals. It speeds up the user's own actions in panic moments (prefilled dialer, biometric skip) and gives the country a quiet, low-friction view of what's happening nearby and nationwide. The Home screen has **five visually dominant emergency/urgent buttons** (Police, Medical, Fire, More Help, Personal Emergency) plus smaller chips for Capture, Location Sharing, History, and Alerts.

The product's primary design driver is the **panic-moment user** (someone facing a threat, accident, medical event, or fire who needs to act in five seconds). Secondary use cases — bystander capture, location sharing, history lookup, alerts, non-emergency "more help" — are verified MVP-compatible but not the design driver.

The MVP target is **Dhaka metro**, **Android-first** (confirmed — OQ-3 resolved; iOS in Phase 2), ~1,000 active users over 90 days, no claims of national rollout on day one. Distribution for Phase 1: installable on **emulator and real Android devices** via sideloaded APK/AAB; Google Play listing is **not** required.

---

## 2. Goals and non-goals

### Goals (in priority order)

1. **Cut the panic-moment decision count to one.** A user in a panic should not have to choose between four emergency numbers; the app picks the right one and prefills the dialer.
2. **Lower the friction of reporting in-progress incidents.** A bystander should be able to capture, tag, and send a report in under 30 seconds, anonymously by default.
3. **Give the country a quiet, filterable newsfeed of recent incidents** as an alternative to Facebook groups + fear-mongering local news.
4. **Help users reach non-emergency services** (women's helpline, thana line, mental health) the same way Help Alert reaches emergencies — without making them Google a number.
5. **Be defensible at MVP scale.** Work on Android, on real BD networks, with real BD carrier OTP delivery. No regulatory exposure we can't document.

### Non-goals (explicit)

- **Not a live dispatch system.** We do not relay calls or messages to emergency services. (FR-NG-1)
- **Not a replacement for emergency services.** We open the dialer; we don't claim to have called. (FR-NG-2)
- **Not a government data platform.** No aggregation, no published crime stats. (FR-NG-3)
- **Not an AI crime-prediction tool.** No "heatmaps of where crime will happen tomorrow." (FR-NG-4)
- **Not a social network.** No public profiles, no public feed of user identities — only public *content* with anonymous *authors*. (FR-NG-5)
- **Not a national-rollout product at MVP.** Dhaka metro only at launch. (FR-NG-6)
- **No live location streaming at MVP** — Location Sharing is a single snapshot. (FR-NG-7)
- **No live push updates for Alerts at MVP** — pull-to-refresh + 60s auto-refresh. (FR-NG-8)
- **No dedicated fire-service nearest-station lookup at MVP** — Fire goes to `102`, the national Bangladesh Fire Service number. Per-station routing is Phase 2. (FR-NG-9)

---

## 3. Personas and primary user

**Primary — Panic-moment user (e.g. "Ayesha").** Adult in Dhaka. Walking home from work at 11pm in a poorly-lit alley. Suspects someone is following her. Hands shaking, phone at 40%. Needs the right number, *now*, without having to remember it. Will not read tooltips. Will not customize settings. Will abandon the app if the first tap doesn't put a number on her screen.

**Secondary — Bystander (e.g. "Rashid").** Adult in Dhaka. Sees an incident in progress from a distance — shoplifting, a road accident, a fight. Wants to capture evidence without revealing his identity. Will tolerate a 30-second flow if it doesn't ask for a written paragraph.

**Tertiary — Situationally-aware user (e.g. "Maya").** Adult in Dhaka. Just moved to Mirpur. Wants to know what kinds of incidents have happened near her new home in the last week. Will open the app on a calm evening, browse History and Alerts, and never use Capture or Help Alert.

**Quaternary — Asker (e.g. "Nadia").** Adult in Dhaka. Needs a non-emergency service — wants to call the women's helpline, file something at her local thana, or find the nearest hospital without dialing 999. Currently Googles or scrolls Facebook for these numbers. Will tap "More Help" on the Home screen.

For deeper persona reads, see `brief-001/addendum.md` §A.

---

## 4. User journeys

The PRD captures four journeys — one per persona. Each is a real session, narrated, then structured into UJ form.

### UJ-1 — Panic-moment user (Ayesha)

1. **Trigger**: walking home, hears footsteps behind, suspects a threat.
2. **Open the app**: fingerprint unlocks (biometric skip, already logged in).
3. **Home screen** appears in <2s. Help Alert is the dominant element.
4. **Tap "Police"**: dialer opens with 999 pre-filled.
5. **Tap call in system dialer**: connects to 999.
6. **Post-call**: optionally tap Location Sharing → Share with Everyone. Trusted contacts receive her snapshot.

**Failure modes**:
- Fingerprint fails 3× → fall back to phone + password within defined timeout. *Never* lock out.
- Permission denied (location off, dialer suppressed by battery saver) → show "Dial 999 manually" guidance.
- No signal → app must not pretend to call. Show "No signal — dial 999 from your phone keypad."

### UJ-2 — Bystander (Rashid)

1. **Trigger**: sees a snatch-theft in progress at New Market.
2. **Open the app**: phone + password (cached session, <2s).
3. **Tap Capture**: camera opens.
4. **Tap shutter**: photo captured, EXIF stripped, GPS + timestamp re-attached.
5. **Toggle "Anonymous"**: default on.
6. **Tap Send**: uploaded to server in <5s on BD LTE.
7. **Optional description**: "Snatch theft near New Market entrance" (140-char cap).
8. **Optional category**: pick from enum (theft) — *optional at capture; the reporter may set or refine it later from History → Report detail* (FR-CAPTURE-5 override, 2026-09-11).

**Failure modes**:
- Slow network → app shows "uploading..." with a spinner; never blocks the next Capture.
- Upload fails → retry with exponential backoff; max 3 attempts, then show "Saved on device — will retry when network returns."

### UJ-3 — Situationally-aware user (Maya)

1. **Trigger**: hears about an incident in Mirpur on a friend's WhatsApp status.
2. **Open the app**: phone + password.
3. **Tap Alerts**: list opens in <2s with unfiltered BD list.
4. **Filter by area**: pick Mirpur → list narrows to reports tagged there.
5. **Browse**: scrolls recent alerts, taps one to read full description.
6. **Optional**: open History → same data, but local view (1 km, last 24h) for finer-grained awareness.

**Failure modes**:
- Auto-refresh eats battery → pause when battery < 20% (FR-X-9).
- No reports in selected area → show "No alerts in this area in the last 24 hours."

### UJ-4 — Asker (Nadia)

1. **Trigger**: needs to file a non-emergency complaint at her local thana; doesn't know the thana phone number.
2. **Open the app**: phone + password (cached session).
3. **Tap "More Help"** on Home: opens a sub-screen with three categories — Other hotlines / Thana line / Find a station.
4. **Tap "Thana line"**: app shows the user's nearest thana (from the station DB) with name + distance + phone; tap-to-call prefills the dialer.
5. **Tap "Call"**: dialer opens pre-filled with the thana number.
6. **Optional**: tap "Find a station" → opens a map view of nearby hospitals, fire stations, police thanas with their phone numbers; user can tap any to call.

**Failure modes**:
- No station DB coverage for the user's area → fall back to `999` for police/medical, `102` for fire, and show banner "Couldn't find a thana near you — calling 999 instead."
- Hotline number out of date → user-reported "wrong number" flag (FR-SEEK-6).

---

## 5. Functional requirements

FRs are grouped by capability. IDs are stable and globally unique.

### FR-AUTH: Authentication and session

- **FR-AUTH-1**: The app SHALL require both a verified phone (E.164) and a verified email at signup. The app SHALL allow login with **phone OR email + password** — either identifier is accepted with the same password. Email verification happens via email-OTP (free); phone verification happens via SMS one-tap or SMS-OTP at signup (a small per-send cost; budgeted as the only paid line item at MVP).
- **FR-AUTH-2**: The app SHALL allow "Remember me" for a 30-day session.
- **FR-AUTH-3**: The app SHALL send password-reset OTPs to the user's **email by default** (free). The user MAY opt in to **SMS-OTP** via Settings; the disclosure *"Switching to SMS may incur carrier charges. Nagar Shield does not profit from this"* SHALL be shown once before opt-in takes effect and SHALL be re-acknowledged at every session-start where the user is opted in. OTP validity: 10 minutes; max 3 attempts before 30-min cooldown.
- **FR-AUTH-4**: The app SHALL allow users to opt into biometric (fingerprint / face) re-auth for returning sessions on supported devices.
- **FR-AUTH-5**: Biometric failure SHALL NOT lock the user out; after 3 fails, the identifier+password screen SHALL appear. After 5 fails in 24h, biometric SHALL auto-disable for that user.
- **FR-AUTH-6**: The app SHALL NOT offer social login at MVP.
- **FR-AUTH-7**: Remote logout by admin SHALL disable a user immediately; the user SHALL see "Your account has been disabled. Contact support." on next open.

### FR-CAPTURE: Capture (anonymous report)

- **FR-CAPTURE-1**: The app SHALL allow a logged-in user to capture a photo, video, or file from the device.
- **FR-CAPTURE-2**: The app SHALL auto-attach GPS coordinates and timestamp at capture time, replacing any EXIF GPS data with the app-supplied location.
- **FR-CAPTURE-3**: The app SHALL default `public_visibility` to `anonymous`. The user MAY toggle to `identified`.
- **FR-CAPTURE-4**: The app SHALL auto-extract `area_hierarchy` server-side via reverse-geocode.
- **FR-CAPTURE-5**: The app SHALL accept a Capture submission with photo + optional description (<=140 chars) + auto-captured location and timestamp, and SHALL NOT require a category at submission time. `category` SHALL be nullable at creation and MAY be set or changed afterwards by the original reporter from History → Report detail, using the fixed 11-value enum (no free-text category). `[OVERRIDE 2026-09-11 — supersedes the earlier "SHALL require the user to pick a category at capture" wording; rationale: at the panic moment, asking the user to triage wastes seconds. Capture is photo + optional short note + send.]`
- **FR-CAPTURE-6**: User description SHALL be capped at 140 characters.
- **FR-CAPTURE-7**: Median time from Capture open to submit-on-server SHALL be <30s on a typical flow.

### FR-HELP: Help Alert (prefilled dialer)

- **FR-HELP-1**: The app SHALL provide Help Alert access to Police, Medical, Fire, More Help, and Personal Emergency. On the Home surface, Police / Medical / Fire / Personal Emergency render as four full-width buttons (80dp, panic grid); **More Help** renders as a labelled link one tap deeper, opening the curated-hotline / thana-line / find-a-station sub-screen. `[UX-layer refinement — override 2026-09-11, rationale: the panic-moment user must reach the right number in one tap; curated help is a browsing task and sits one level deeper. Reconciliation of the original "five buttons on Home" wording. Downstream epics cite the EXPERIENCE.md Home component, not this enumeration.]`
- **FR-HELP-2**: Police SHALL pref fill the dialer with `999`. (National police number for BD. Verified.)
- **FR-HELP-3**: Medical SHALL pref fill the dialer with `999`. (National emergency number; dispatch routes to the nearest appropriate medical responder. Verified.)
- **FR-HELP-4**: Fire SHALL pref fill the dialer with `102`. (Dedicated Bangladesh Fire Service number. Verified.)
- **FR-HELP-5**: Personal Emergency SHALL open a contact-picker sheet listing the user's primary emergency contacts in a stable order, prefilled with the first primary contact. The user SHALL be able to tap any listed contact to open the dialer with that contact's number prefilled. The app SHALL NOT initiate a call, SHALL NOT observe call outcome, and SHALL NOT failover automatically — the app cannot know whether a call connected because it never places one (C-1). A "Call next contact" affordance MAY be shown once 25 seconds have elapsed since the sheet opened, and it SHALL prefilled the next primary contact's number; the user taps to open the dialer. `[OVERRIDE 2026-10-12 — supersedes the earlier "on no-answer (25s ring timeout), sequentially failover to the next primary contact" wording; rationale: the app opens the OS dialer and never places or observes a call, so app-observed no-answer failover is not implementable under C-1 without either placing the call (forbidden) or claiming call state the app does not have (a dispatch-style claim forbidden by C-6). The user-armed contact picker preserves the intent — the next contact is always one tap away — while the app stays honest about what it did. Owner-confirmed as the MVP standard.]`
- **FR-HELP-6**: Help Alert SHALL open the system dialer via OS intent (`ACTION_DIAL` on Android). The app SHALL NOT auto-dial.
- **FR-HELP-7**: On tap, the app SHALL show clear UX copy indicating the number being dialed: "Calling 999 — tap to confirm." / "Calling 102 — tap to confirm."
- **FR-HELP-8**: Median time from app open to dialer-prefilled for Police, Medical, and Fire SHALL be <12s.

### FR-SEEK: More Help (non-emergency / broader help)

- **FR-SEEK-1**: The app SHALL provide a Home-screen "More Help" button that opens a sub-screen with three categories: Other hotlines, Thana line, Find a station.
- **FR-SEEK-2**: "Other hotlines" SHALL display a curated list of non-emergency helplines (e.g., Women & Children `109`, mental-health crisis lines, anti-drug helpline, cyber-crime helpline). Each entry SHALL show the service name and phone number; tap-to-call pre-fills the dialer.
- **FR-SEEK-3**: "Thana line" SHALL display the user's nearest thana (police station) from the station DB with name + distance + phone; tap-to-call pre-fills the dialer. If no thana within 10 km, fall back to `999` and show "Couldn't find a thana near you — calling 999 instead."
- **FR-SEEK-4**: "Find a station" SHALL open a map view (reusing the History map component) showing nearby hospitals, fire stations, and police thanas with their phone numbers; tap-to-call from the map.
- **FR-SEEK-5**: The curated hotline list SHALL be a hardcoded DB shipped with the app, refreshed quarterly by a curator (same cadence as the station DB).
- **FR-SEEK-6**: Any user MAY report a "wrong number" on a hotline or thana entry; the report goes to the curator for next-refresh verification.

### FR-LOC: Location Sharing

- **FR-LOC-1**: The app SHALL allow a user to share their current location as a single snapshot with (a) one selected EmergencyContact or (b) all primary EmergencyContacts.
- **FR-LOC-2**: The recipient SHALL receive the snapshot with timestamp within 5s of sender action.
- **FR-LOC-3**: The snapshot SHALL be sent once. The app SHALL NOT stream location. `[ASSUMPTION: streaming deferred to Phase 2]`
- **FR-LOC-4**: If the recipient is not a Nagar Shield user, the app SHALL fall back via the **OS share sheet** (SMS / WhatsApp / other system targets). `[RESOLVED 2026-11-04 — PRD-X-1: OS share intent; see ARCHITECTURE.md W-4 for the 5s SLA interpretation]`

### FR-HIST: History (local view)

- **FR-HIST-1**: The app SHALL display reports within 1 km of the user's current location, last 24 hours, by default.
- **FR-HIST-2**: The user MAY change the radius, time window, and category filters.
- **FR-HIST-3**: Reports SHALL appear immediately on submit — no pending-review state.
- **FR-HIST-4**: The default view SHALL load in <2s.

### FR-ALERTS: Alerts (BD-wide newsfeed)

- **FR-ALERTS-1**: The app SHALL display a Bangladesh-wide list of recent reports, ordered by recency.
- **FR-ALERTS-2**: The list SHALL auto-refresh every 60 seconds when foregrounded. `[ASSUMPTION: foreground-only refresh; PRD-X-2]`
- **FR-ALERTS-3**: The user MAY pull-to-refresh on demand.
- **FR-ALERTS-4**: The user MAY filter by area (division, city, thana, neighborhood).
- **FR-ALERTS-5**: Each alert SHALL render as: "New alert from <area>: <category> — <user description>."
- **FR-ALERTS-6**: Any user MAY flag any alert with a reason (`misinformation`, `harassment`, `duplicate`, `off_topic`, `other` — the fixed enum in `data-model.md` / `moderation-model.md`).
- **FR-ALERTS-7**: After N flags (start: 3), the alert SHALL auto-hide from the feed pending moderation. `[ASSUMPTION: 3 flags; tune in PRD via OQ-4]`
- **FR-ALERTS-8**: An auto-hidden alert SHALL be returned to visible if a moderator marks it `restore`.
- **FR-ALERTS-9**: A moderator-marked `remove` SHALL permanently remove the alert from public feeds.
- **FR-ALERTS-10**: A user SHALL NOT flag more than 10 reports per hour (anti-griefing).
- **FR-ALERTS-11**: A user whose reports have been flagged 5+ times in 24h SHALL have their last 24h of reports auto-hide pending review.

### FR-MOD: Moderation

- **FR-MOD-1**: The app SHALL provide a small internal admin tool for moderators to review the hidden_pending_review queue.
- **FR-MOD-2**: Moderators SHALL see the report, the flag reasons, and the uploader (server-side only).
- **FR-MOD-3**: Moderators SHALL make a `restore` or `remove` decision with a required `note`.
- **FR-MOD-4**: At MVP, "moderator" is a single role with full access; Phase 2 may split into trust-and-safety + admin.

### FR-DATA: Data handling and privacy

- **FR-DATA-1**: All captured media SHALL be encrypted at rest on the device (using device secure enclave / keystore) and on the server (KMS-wrapped keys).
- **FR-DATA-2**: All transit SHALL use TLS 1.3 with cert pinning on the API host.
- **FR-DATA-3**: User identity SHALL be retained server-side even when `public_visibility = anonymous`, for moderation and dispute handling.
- **FR-DATA-4**: Captured media SHALL be hard-deleted after 90 days; metadata retained longer.
- **FR-DATA-5**: The app SHALL NOT sell or share user data with third parties.
- **FR-DATA-6**: User account deletion SHALL be supported, with a 30-day recovery window.

### FR-PERMS: Permissions and graceful degradation

- **FR-PERMS-1**: The app SHALL request location, camera, mic, and storage permissions at the moment they're needed (not at first launch).
- **FR-PERMS-2**: The app SHALL function when permissions are denied — Help Alert shall fall back to `999` if location is denied; Capture shall hide the camera/mic buttons if those permissions are denied.
- **FR-PERMS-3**: The app SHALL detect Android battery-saver aggressive mode and warn the user if dialer intent is suppressed.

### FR-UX: UX and accessibility

- **FR-UX-1**: All UI strings SHALL exist in both Bangla and English. Native-speaker review on every string; no machine translation.
- **FR-UX-2**: Help Alert buttons SHALL be visually dominant on the Home screen.
- **FR-UX-3**: The app SHALL support dark mode and light mode; user choice persisted.
- **FR-UX-4**: All controls SHALL have a minimum tap target of 44×44 dp (iOS HIG) / 48×48 dp (Material) `[ASSUMPTION: pick Material; PRD-X-3]`.
- **FR-UX-5**: Color contrast SHALL meet WCAG AA in both modes. `[ASSUMPTION: AA target; AAA in panic-critical surfaces]`

---

## 6. Success metrics (must-measure)

| Metric | Target | Source |
|---|---|---|
| Help Alert dial time | <12s median for Police, Medical, Fire (vs. ~30s manual) | Telemetry |
| Capture WAU | ≥30% of weekly active users submit ≥1 Capture / month | Telemetry |
| Day-30 retention | ≥20% | Telemetry |

**Counter-metrics** (named so we know we're not gaming the targets):
- Help Alert taps → emergency-service-connect rate (we don't claim this; we measure the dialer-open rate only).
- Capture submission rate → flagged / hidden / removed rate (we want signal *and* quality).
- Retention → Day-1 / Day-7 / Day-30 (we watch all three, not just Day-30).

**Directional signals** (not gating):
- ≥20% of users have ≥3 EmergencyContacts and used Share at least once.
- ≥40% of users open History at least once in week 1.
- ≥50% of eligible users opt into biometric re-auth in week 1.
- OTP delivery (channel = user's chosen default; email by default): <8s median.
- ≥30% of weekly active users open Alerts at least once a week.
- ≥15% of weekly active users tap "More Help" at least once in week 1.

We do **not** measure "crimes prevented" or "lives saved" — unmeasurable at this scale.

---

## 7. Constraints and assumptions

### Hard constraints (we don't negotiate these)

- **C-1**: Help Alert must not auto-dial.
- **C-2**: MVP station DB is hardcoded Dhaka metro.
- **C-3**: Alerts feature is gated on the moderation model.
- **C-4**: Phone **and** email are both required at signup. Either is a valid login identifier. Email-OTP is the default free password-reset channel; SMS-OTP is opt-in via Settings.
- **C-5**: Mobile OS permissions are adversarial — design must work when denied.
- **C-6**: App store policies forbid "emergency service" framing.
- **C-7**: Captured media + location are sensitive; encrypted, never sold.
- **C-8**: Bangla + English only at MVP.

### Assumptions (carried from brief + spec)

- **A-1**: Map provider is **MapLibre + OpenStreetMap** (resolved OQ-2 — free-tier safe). See `ARCHITECTURE.md`.
- **A-2**: Password-reset / OTP default channel is **email** (free). SMS-OTP is secondary, opt-in, and **feature-flagged off** on free-tier / training builds until a funded provider is configured (`ARCHITECTURE.md` W-2). Auth identity model: email-primary Supabase Auth + required phone on profile (`ARCHITECTURE.md` W-1).
- **A-3**: Android-first at MVP; iOS in Phase 2. **Confirmed** (OQ-3).
- **A-4**: Personal Emergency contact list is unlimited. The user picks the contact from a picker sheet; there is no app-observed failover (the app never places or observes a call — see FR-HELP-5, override 2026-10-12).
- **A-5**: Reports soft-deleted after 90 days (media); metadata retained longer.
- **A-6**: Curated hotline list (Women & Children `109`, mental health, anti-drug, etc.) is hardcoded in the app bundle at MVP, refreshed quarterly by the same curator as the station DB.
- **A-7**: Fire = `102`, Police = `999`, Medical = `999`. All confirmed by user. Re-confirmed by the project owner on 2026-10-12 as fact, after a prototype-review note asserted `16123` — that note was wrong and has been corrected.
- **A-8**: Station DB is **in-house curated** Dhaka metro (resolved OQ-1), mirrored in Postgres and shipped with the app.
- **A-9**: Reverse-geocode / area hierarchy is **Dhaka-local table first**; online geocode is backup only (`ARCHITECTURE.md` W-3).
- **A-10**: Location Sharing “within 5s” (FR-LOC-2) means share intent / audit write completed — not carrier delivery (`ARCHITECTURE.md` W-4).

### Decisions resolved (architecture alignment — 2026-11-04)

Former open questions, now closed. Do not re-litigate in implementation without a PRD change.

| ID | Decision |
|---|---|
| **OQ-1** | Station DB: **in-house curated** Dhaka metro (JSON + Postgres mirror; quarterly curator refresh). |
| **OQ-2** | Maps: **MapLibre + OpenStreetMap**. |
| **OQ-3** | Platform: **Android-first**; iOS Phase 2. Sideload APK via EAS for emulator + real device; Play Store not required for Phase 1. |
| **OQ-4** | Flag threshold: **start at 3**; tune later with telemetry. |
| **OQ-5** | Moderation: **internal Next.js admin** (not third-party SaaS; not in-app citizen moderator mode). |
| **OQ-6** | Capture rate limits: enforce a **per-user daily cap** in Edge Function at MVP; area/IP caps deferred unless abuse appears. |
| **OQ-7** | Alerts area taxonomy: use report `area_hierarchy` from Dhaka-local geocode / lookup (division → city → thana → neighborhood). |
| **OQ-8** | SMS OTP: **not required** for free-tier MVP; email OTP default; SMS behind feature flag when budget allows. Benchmark only if flag is enabled. |
| **PRD-X-1** | Non-app location recipients: **OS share sheet**. |
| **PRD-X-2** | Alerts 60s refresh: **pause when battery &lt;20%**. |
| **PRD-X-3** | Tap targets: **Material 48dp**. |
| **PRD-X-4** | Media caps: **1080p / 30s video** accepted. |
| **PRD-X-5** | Home density: accepted — Help Alert dominant; More Help one level deeper; secondary chips for Capture / Location / History / Alerts. Prototype Charts (`S-23`) remain **out of scope** (FR-NG-3 / FR-NG-4). |

### Remaining product notes (non-blocking)

None blocking architecture. Implementation follows `ARCHITECTURE.md`. Re-open an OQ only via explicit PRD amendment.

---

## 8. Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| 999 dial time doesn't actually beat manual | Med | Med | Benchmark dial time in lab before launch; if Help Alert tap is slower than `Settings → Emergency → 999`, we have a problem. |
| SMS OTP delivery >8s on BD carriers | High | Med | Benchmark SMS providers before commit; switch if delivery fails the bar. |
| Dhaka metro station DB is wrong/outdated | Med | High | Curator quarterly re-verification; user-reported wrong-number flag in Help Alert UX. |
| Hotline number wrong (Women 109, mental health, etc.) | Med | Med | FR-SEEK-6 wrong-number flag + curator quarterly verification; same DB discipline as station DB. |
| Fire = 102 misdialed to 999 by a user | Low | Low | Clear UX copy "Calling 102 — tap to confirm" so user knows the number before tapping. |
| Mobile OS permission denial breaks Help Alert | High | Low | FR-PERMS-2 graceful-degradation paths tested explicitly. |
| Public Alerts misused for mob-justice | High | Med | FR-MOD + FR-ALERTS-10/11 anti-griefing; small human-review queue. |
| SIM-swap account takeover | Med | Low | Accepted at MVP (C-4); Phase 2 device-binding is documented. |
| App store rejects for "emergency" framing | Med | Med | C-6 wording discipline; if rejected, reframe as Utilities/News. |
| Capture storage costs balloon with media | Low | Med | 90-day soft delete; cap media at 1080p / 30s video (PRD-X-4 resolved). |

PRD-only risks (added during this draft):

- **PRD-X-5**: The five-bundled-actions Home screen is information-dense; the panic-moment user has 5 seconds. `[ASSUMPTION: ordering Help Alert first solves this; UJ-1 to validate.]`

---

## 9. Out-of-scope (Phase 2+)

Explicitly not at MVP — these go on the Phase 2 backlog:

- Live location streaming
- Live push updates for Alerts (FCM data-messages / WebSocket)
- Social login (Google / Facebook)
- iOS app
- Wearables / smartwatch companion
- AI classification of uploaded media (auto-categorize, NSFW detect, duplicate detection)
- Government / hospital dispatch API integration
- Heatmaps, crime prediction, statistical dashboards
- Insurance, legal-aid, victim-counseling marketplace
- Languages beyond Bangla + English
- Real-time panic-trigger automatic location share (e.g., "if I don't move for 10 minutes, share location")

---

## 9.1 Showcase scope profile (training build)

> The MVP scope above is the target contract. The **Showcase** profile is the training build: the smallest slice that demonstrates the product thesis end-to-end, with every cut recorded rather than silently dropped. CAP-1..7 and AD-1..18 remain the architecture contract; Showcase changes what is *built*, never what is *promised*.

| Capability | Showcase build | Cut (goes to backlog) |
|---|---|---|
| CAP-1 Help Alert | Full — confirmation sheet → `ACTION_DIAL` → pre-filled dialer | — |
| CAP-6 Auth | Thin — seeded account, biometric re-auth | OTP delivery (email/SMS), signup wizard, remote disable |
| CAP-5 Alerts | Read-only — seeded reports, area filter, 60s foreground pull | Live push (Phase 2), live moderation wiring |
| CAP-2 Capture | Photo only — real upload to Supabase Storage | Video, file upload, EXIF pipeline hardening |
| CAP-4 History | List view, 1 km / 24 h default | Map surface (full MVP uses MapLibre + OSM — OQ-2 resolved) |
| CAP-3 Location Share | UI + mock send | Real OS share delivery (PRD-X-1 resolved for full MVP) |
| CAP-7 Moderation | Static admin screen | Live queue, flag-threshold automation |

**Seed data (Showcase precondition):** ~60 reports across 8 Dhaka areas, timestamps spread over the last 24 h, bundled locally so a network failure degrades to cached content instead of an empty screen.

**Acceptance for a Showcase demo** — on a cold emulator launch:
1. App opens directly on the Help Alert home (override B.2 — Home *is* Help Alert).
2. Tap Police → confirmation sheet shows the number → "Open dialer" opens the system dialer pre-filled with 999.
3. The measured `app_open_to_dialer_ms` is displayed on the confirmation sheet, so the <12 s target is demonstrated rather than asserted.
4. Alerts loads seeded reports without a network round-trip and filters by area.
5. Capture takes a photo and uploads it to Supabase Storage; the report appears in History.

**Out of scope for the Showcase build:** live push, iOS, SMS-OTP provider, map tiles, live location streaming, social login, wearables, AI media classification.

**Carried risk:** Showcase demonstrates a subset of CAP-1..7. Any training material must state which capabilities are fully implemented vs. seeded/mocked, so the demo is not read as a complete MVP.

---

## 10. Architecture resolution status

Architecture is **complete** for MVP Phase 1. See [`ARCHITECTURE.md`](ARCHITECTURE.md).

| Former open item | Resolution |
|---|---|
| Station DB (OQ-1) | In-house curated Dhaka metro |
| Map provider (OQ-2) | MapLibre + OSM |
| SMS OTP provider (OQ-8) | Deferred; email OTP default; SMS feature-flagged (W-2) |
| iOS vs Android (OQ-3) | Android-first; sideload APK |
| Object storage | Supabase Storage |
| Push notifications | Not required at MVP (pull + 60s refresh); FCM Phase 2 |
| Hosting region | Supabase free project default region acceptable for training MVP; revisit if BD residency becomes a hard constraint |
| Moderation tooling | Next.js internal admin on Vercel |

---

## 11. References

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — MVP Phase 1 technical source of truth (stack, modules, waivers W-1..W-4, ADRs).
- `../brief-001/brief.md` — the brief.
- `../brief-001/addendum.md` — personas-in-depth, Help Alert taxonomy, auth edge cases, rejected alternatives, 10 open questions.
- `../../specs/spec-nagar-shield/SPEC.md` — kernel: Why, Capabilities, Constraints, Non-goals, Success signal.
- `../../specs/spec-nagar-shield/data-model.md` — entity definitions.
- `../../specs/spec-nagar-shield/alerts-feed.md` — refresh cadence, area taxonomy, copy format, anti-griefing.
- `../../specs/spec-nagar-shield/help-alert-taxonomy.md` — per-button number source.
- `../../specs/spec-nagar-shield/auth-edge-cases.md` — five discrete auth behaviors.
- `../../specs/spec-nagar-shield/moderation-model.md` — flag + queue mechanics.
- `../../specs/spec-nagar-shield/state-machines.md` — Auth, OTP, Alerts, Moderation state machines.
- `../../specs/spec-nagar-shield/rejected-alternatives.md` — audit trail.

---

## 12. `[ASSUMPTION]` index

A consolidated list of the assumptions I made for fast-path drafting, so they're easy to find and correct. Items marked **resolved** were closed in the 2026-11-04 architecture alignment.

- A-1 (**resolved**) MapLibre + OSM
- A-2 (**resolved**) email OTP default; SMS flagged off until funded; email-primary auth (W-1/W-2)
- A-3 (**resolved**) Android-first at MVP, iOS Phase 2
- A-6 (curated hotline list hardcoded, quarterly refresh)
- A-7 (Police=999, Medical=999, Fire=102 — confirmed by user)
- A-8 (**resolved**) in-house Dhaka station DB
- A-9 (**resolved**) Dhaka-local geocode first (W-3)
- A-10 (**resolved**) location 5s = intent/audit (W-4)
- FR-HELP-3 (Medical = 999 primary; not nearest-hospital-first)
- FR-HELP-4 (Fire = 102; not 999)
- FR-LOC-3 (Location Sharing is snapshot, not stream)
- FR-LOC-4 (**resolved**) OS share sheet for non-app recipients
- FR-ALERTS-2 (60s auto-refresh; foreground-only; pause &lt;20% battery)
- FR-ALERTS-7 (3 flags = auto-hide)
- FR-UX-4 (**resolved**) Material 48dp tap target
- FR-UX-5 (WCAG AA contrast target)
- OQ-1..OQ-8 and PRD-X-1..PRD-X-5 — **resolved**; see §7 decisions table
- §6 metric (More Help WAU ≥15% directional)
- §8 risks PRD-X-5 (Home screen density) — Help Alert dominant; Charts out of scope
