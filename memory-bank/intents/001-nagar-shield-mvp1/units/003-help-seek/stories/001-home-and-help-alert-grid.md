---
id: 001-home-and-help-alert-grid
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 001-home-and-help-alert-grid

## User Story

**As a** Nagar Shield user in a panic moment
**I want** Home to *be* the Help Alert surface, with one tap on Police, Medical, or Fire opening a pre-filled OS dialer for the right number
**So that** I reach the correct service without searching, reading, or waiting on the network

## Acceptance Criteria

- [ ] **Given** the app is on Home, **When** the viewport renders, **Then** it shows exactly four full-width **80 dp** help cards (Police, Medical, Fire, Personal Emergency) in that order, followed by one dashed More Help card, and no other element appears above or between them
- [ ] **Given** the four help cards, **When** each is compared to `docs/design/screen-help-alert.html`, **Then** each is 80 dp tall with a 56 dp translucent icon tile, a Bangla title, a Bangla sub-line, an English line, the number, and a 36 dp call circle whose hit area is padded to ≥ 48 dp
- [ ] **Given** the Police card, **When** it renders, **Then** it uses the `--grad-hero` purple gradient, the `local_police` icon, the title পুলিশ, the sub-line নিকটবর্তী থানায় কল, the English line Police, and the number ৯৯৯
- [ ] **Given** the Medical card, **When** it renders, **Then** it uses the `--grad-emergency` red gradient, the `local_hospital` icon, the title মেডিকেল, the sub-line নিকটবর্তী হাসপাতালে কল, the English line Medical, and the number ৯৯৯
- [ ] **Given** the Fire card, **When** it renders, **Then** it uses the amber gradient `#D97706 → #F59E0B`, the `local_fire_department` icon, the title ফায়ার সার্ভিস, the sub-line নিকটবর্তী ফায়ার স্টেশনে কল, the English line Fire Service, and the number ১০২
- [ ] **Given** the Personal Emergency card, **When** it renders, **Then** it uses the green gradient `#059669 → #10B981`, the `groups_2` icon, the title বিশ্বস্ত পরিচিত, the sub-line আপনার {n}টি সংরক্ষিত কন্টাক্ট, and the count {n} জন, where {n} is the user's real primary-contact count and never the prototype's hardcoded ৫
- [ ] **Given** any of the four help cards, **When** the user taps it, **Then** a confirmation sheet opens naming the exact number — "Calling 999 — tap to confirm." for Police and Medical, "Calling 102 — tap to confirm." for Fire — and displaying the measured `app_open_to_dialer_ms`
- [ ] **Given** the confirmation sheet is open, **When** the user confirms, **Then** exactly one Android `ACTION_DIAL` intent fires through `Linking.openURL('tel:<number>')` with the sanitised number, and the source tree contains no `ACTION_CALL` intent, no call-state listener, and no telephony-state permission request
- [ ] **Given** a help card is tapped, **When** the `helpAlertTap` telemetry event is recorded, **Then** it carries the surface and the exact number — `police`/`999`, `medical`/`999`, `fire`/`102`, `personal`/`contacts`
- [ ] **Given** the measurement window for Police, Medical, and Fire, **When** the median `app_open_to_dialer_ms` is computed, **Then** it is below 12,000 ms
- [ ] **Given** the device has no network, **When** the user taps a help card and confirms, **Then** the cards render, the confirmation sheet appears, the dialer opens with the correct number, and zero network requests are made between the card tap and the intent

## Technical Notes

- **Home IS the Help Alert surface.** This story owns the Home layout composition (shell, slot order, and the Help Alert block). The Help Alert block is the first and largest block on Home; any change that pushes the four cards below the fold, shrinks them below 80 dp, or delays them is rejected (ARCHITECTURE rule 20 — panic path first).
- **Home slot contract.** App bar (greeting + date + `more_horiz` → screen 15 + avatar) → **Help Alert block (this story)** → search bar (slot reserved for unit 006) → দ্রুত অ্যাকশন grid (6 tiles; this story owns the shell and the হেল্প অ্যালার্ট tile → screen 18) → Alerts feed slot (unit 006).
- **Prototype markup is the contract.** `docs/design/screen-help-alert.html` (screen 18) is ported 1:1: gradient per card (Police `--grad-hero`; Medical `--grad-emergency`; Fire `linear-gradient(135deg, #D97706, #F59E0B)`; Personal `linear-gradient(135deg, #059669, #10B981)`), 56 dp translucent icon tile, 80 dp card height, Bangla title + Bangla sub + English line, number + 36 dp call circle (hit area padded to 48 dp). The More Help card is the dashed card — `1.5px dashed var(--ink-300)`, 18 px radius, 48 dp `more_horiz` tile in `--ink-100`, `chevron_right` affordance.
- **One dial path in the app.** `openDialer(number)` (`expo-linking` → `Linking.openURL('tel:<number>')`) is the single, auditable number → OS path. It sanitises the number to digits and an optional leading `+` before the intent — no `tel://`, no encoded text, no arbitrary URI. `confirmDial(surface, number)` is the only caller that opens the confirmation sheet.
- **C-1 — never auto-dial.** The app fires `ACTION_DIAL` and stops. The string `ACTION_CALL` must not appear in any source file, and no code path may read call state (no `TelephonyManager` / `PhoneStateListener` / `READ_PHONE_STATE`). A Jest test scans the source tree for all three.
- **C-6 — no "emergency service" framing.** The confirmation sheet is a *confirmation*, not a claim. No copy may say the app dispatched, routed, notified, or contacted anyone; the OS and the operator do the routing.
- **The dial path is offline-capable and zero-network.** The panic numbers are bundled; there is no request, retry, or timeout between the card tap and the intent. A request interceptor fails the test if any request occurs in that window.
- **`app_open_to_dialer_ms` is measured, not estimated.** The clock starts when the app process reports first render (a cold-start timestamp carried on the app-open event) and stops when the `ACTION_DIAL` intent fires. The median is computed over Police / Medical / Fire only — the three surfaces FR-HELP-8 names.
- **The confirmation sheet is new** (the prototype has none). It is built from `shared/ui/BottomSheet` in the prototype's visual language and states the number explicitly ("Calling 999 — tap to confirm." / "Calling 102 — tap to confirm.") plus the measured elapsed time.
- **`helpAlertTap` is telemetry, not behaviour.** The prototype's `console.info` becomes a real event recording the surface and the exact number, so FR-HELP-2/3/4's "each card records the correct number" is testable.
- **The Personal card's count is live, not literal.** The prototype's `আপনার ৫টি সংরক্ষিত কন্টাক্ট` / `৫ জন` are placeholders; the card renders the real primary-contact count with plural handling in both locales.
- **Fire is `102` everywhere** (locked fact A-7) — not `999`, not `16123`. Police `999`, Medical `999`.
- **Screen 15 (More Options) rows owned here:** জরুরি সেবা → Help Alert and সংরক্ষিত কন্টাক্ট → screen 20. The remaining rows keep the prototype labels and route to their owning units.
- **i18n is a hard requirement.** Every string ships in `bn` (primary, native-speaker reviewed) and `en`; no user-facing string is hardcoded in either language. Every interactive control is ≥ 48 × 48 dp and carries an accessibility label (the prototype's `aria-label` strings are the contract).

## Dependencies

### Requires
- Unit `001-foundation` — Expo Router `(app)` group and Home route, `shared/ui` primitives (`BottomSheet`), light/dark design tokens, `expo-linear-gradient`, the `bn`/`en` i18n bundles, the typed Supabase client
- `003-bundled-station-hotline-dataset` — the bundled emergency numbers (Police/Medical `999`, Fire `102`) and the offline dataset the cards render from
- `004-graceful-degradation` — the degraded-mode behaviour (location denied, battery saver, no signal) of the same help action

### Enables
- `002-personal-emergency-picker` — the Personal Emergency card and the shared `openDialer` hand-off
- `005-more-help-and-hotlines` — the dashed More Help card and its bottom sheet
- `006-thana-line-fallback` — the dialer helper and the `999` fallback target
- `007-find-a-station-map` — the Home composition and the shared map wrapper's host surface
- `008-wrong-number-report` — the More Help entry point for reporting a wrong number
- Unit `004-capture`, `005-location`, `006-alerts` — the reserved Home slots they fill

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user taps the same help card repeatedly | Each tap opens a fresh confirmation sheet; exactly one `ACTION_DIAL` intent fires per confirmed sheet, and a dismissed sheet fires none |
| The user dismisses the confirmation sheet | No intent fires, no telemetry dial event is written, and the Help Alert block is unchanged |
| No dialer app is installed on the device | The `tel:` intent cannot be resolved; the app shows manual-dial guidance with the number instead of a blank screen or an unhandled error |
| The emergency number is read in Bangla numerals (৯৯৯ / ১০২) but dialled in ASCII | The card displays the Bangla numeral exactly as the prototype does; the intent carries the ASCII value `999` / `102` |
| The user is signed out | The Home screen still renders all four help cards and the dial path still works; only the Personal Emergency count depends on a session |
| The device clock changes between app open and the intent | `app_open_to_dialer_ms` uses a monotonic elapsed-time source, so the recorded value is never negative |
| The OS battery saver suppresses the intent | The help action still completes and the degraded-state guidance from `004-graceful-degradation` is shown; the app never reports a successful call |
| The screen is rotated between the tap and the confirm | The confirmation sheet and its selected surface/number survive the re-render, and the confirmed number is unchanged |

## Out of Scope

- Placing the call, observing call state, or any call-outcome claim — forbidden by C-1
- The Personal Emergency picker behaviour and screen 20's contact list — `002-personal-emergency-picker`
- The curated dataset, its Postgres mirror, and the quarterly refresh script — `003-bundled-station-hotline-dataset`
- Location-denied and battery-saver degraded modes — `004-graceful-degradation`
- The More Help bottom sheet, the hotline list, the thana line, the map, and the wrong-number sheet — `005`–`008`
- The Alerts feed, the area chip row, the History screen and the History map read model — unit 006
- The Capture and Location Sharing quick-action tiles — units 004 and 005
- The `emergency_contacts` schema, RLS, and CRUD API — unit 002
- Any server involvement in the dial path (ADR-003): the panic path makes zero network calls
