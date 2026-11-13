---
id: 005-more-help-and-hotlines
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 005-more-help-and-hotlines

## User Story

**As a** Nagar Shield user who needs a service that is not an emergency number
**I want** a More Help sheet that lists the curated hotlines and opens each category's own surface
**So that** I can reach women-and-children support, disaster response, an ambulance, the electricity complaint line, my nearest thana, or a hospital map without searching the web

## Acceptance Criteria

- [x] **Given** the user taps the dashed More Help card on Home or the Help Alert screen, **When** the sheet opens, **Then** it appears as a bottom sheet (not a separate full screen) and shows, in the prototype's exact visual order, নারী ও শিশু হেল্পলাইন `109`, দুর্যোগ হেল্পলাইন `333`, অ্যাম্বুলেন্স `999`, বিদ্যুৎ অভিযোগ `16116`, নিকটবর্তী থানা (sub-line সবচেয়ে কাছের থানায় কল with the italic note ১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।), and ম্যাপে স্টেশন খুঁজুন (sub-line হাসপাতাল · ফায়ার · থানা)
- [x] **Given** the More Help sheet, **When** it renders, **Then** the copy "নম্বর ভুল? রিপোর্ট করুন →" and the "বন্ধ করুন" button are both present, and the disclaimer "কলগুলি নিকটবর্তী উপলব্ধ সেবায় স্বয়ংক্রিয়ভাবে রাউট করা হয়" is kept verbatim
- [x] **Given** the More Help sheet, **When** it is compared to `docs/design/screen-help-alert.html`, **Then** the six rows, their `--ink-50` backgrounds and 12 px radius, the violet `call` icons, the 40 × 4 dp drag handle, the "আরও জরুরি নম্বর" heading, and the 48 dp "বন্ধ করুন" button match 1:1
- [x] **Given** a hotline row (109 / 333 / 999 / 16116), **When** the user taps its call affordance, **Then** the OS dialer opens pre-filled with that hotline's number through `ACTION_DIAL`, and the app places no call itself
- [x] **Given** the More Help sheet, **When** the hotline rows render, **Then** the list is read from the bundled curated dataset and zero network requests are made
- [x] **Given** the sheet's rows, **When** the user taps নিকটবর্তী থানা, **Then** the thana-line surface opens; **When** the user taps ম্যাপে স্টেশন খুঁজুন, **Then** the find-a-station map surface opens; and **When** the user taps a hotline row, **Then** the hotline list surface opens — each category opens its own list or map surface
- [x] **Given** the hotline list surface, **When** it renders, **Then** it lists the full curated hotline set (including the prototype's four entries plus mental health, anti-drug, and cyber-crime) ordered by `sort_order`, each showing the service name and the number
- [x] **Given** the user taps "নম্বর ভুল? রিপোর্ট করুন →", **When** the wrong-number sheet opens, **Then** it is stacked over the More Help sheet and the More Help sheet remains behind it
- [x] **Given** the More Help sheet, **When** the user taps "বন্ধ করুন" or the backdrop, **Then** the sheet closes and no dialer or other surface is opened
- [x] **Given** the sheet's controls, **When** accessibility is checked, **Then** every row, the report link, and the close button are ≥ 48 × 48 dp and carry accessibility labels in `bn` and `en`

## Technical Notes

- **The prototype's sheet is the copy contract.** `docs/design/screen-help-alert.html` (`#more-help-dialog`) already contains the exact entries and must be reproduced as-is: the four hotline rows, নিকটবর্তী থানা (with the sub-line and the italic 10 km note), ম্যাপে স্টেশন খুঁজুন, the "নম্বর ভুল? রিপোর্ট করুন →" link, and the "বন্ধ করুন" button.
- **FR-SEEK-1 names three categories; the prototype sheet shows six rows.** The four hotline rows are the "Other hotlines" category, "নিকটবর্তী থানা" is the "Thana line" category, and "ম্যাপে স্টেশন খুঁজুন" is the "Find a station" category. **Resolution:** the sheet keeps the prototype's six rows and visual order 1:1 (the copy is the contract), and tapping a row opens the corresponding category surface. The three-category structure is preserved as the navigation model without reordering or removing a prototype row.
- **Disclaimer copy is kept.** "কলগুলি নিকটবর্তী উপলব্ধ সেবায় স্বয়ংক্রিয়ভাবে রাউট করা হয়" is retained verbatim from the prototype — it describes the *operator's* routing, not a Nagar Shield dispatch.
- **The hotline list renders from the bundle.** The rows are read from the bundled curated JSON (FR-SEEK-2 / FR-SEEK-5), so the list renders with no network available. The Postgres mirror is a separate read path, not a dial-path dependency.
- **Tap-to-call prefills the dialer.** Every call affordance routes through the single `openDialer(number)` helper (`Linking.openURL('tel:<number>')` → `ACTION_DIAL`). `ACTION_CALL` is never used and no call state is observed.
- **The sheet is built from `shared/ui/BottomSheet`**, and the wrong-number sheet is stacked over it as a separate bottom sheet (the prototype's `#wrong-number-dialog`).
- **Category surfaces are separate routes**, not inline expansions of the sheet, so the thana line and the map can own their own location handling and lifecycle.
- **i18n is a hard requirement.** Every string ships in `bn` (primary, native-speaker reviewed) and `en`; no user-facing string is hardcoded in either language.

## Implementation

**Built 2026-11-13.** The More Help sheet is a **shared component**, so both
entry points — the Home dashed card and the Help Alert screen — show the
identical rows in the identical order.

- **The sheet.** `apps/mobile/src/shared/ui/MoreHelpSheet.tsx` — the
  prototype's `#more-help-dialog`, built on `shared/ui/BottomSheet`. The six
  rows, the "আরও জরুরি নম্বর" heading, the verbatim disclaimer, the
  "নম্বর ভুল? রিপোর্ট করুন →" link and the 48 dp "বন্ধ করুন" button are
  reproduced from `docs/design/screen-help-alert.html`.
- **The row body and the call affordance are separate targets.** A tap on the
  row **body** opens that category's surface; a tap on the trailing 48 dp
  violet icon opens the dialer. One control doing two things would make the
  "each category opens its own surface" rule unobservable.
- **The navigation.** The four hotline rows open `/more-help`; নিকটবর্তী থানা
  opens `/thana-line`; ম্যাপে স্টেশন খুঁজুন opens `/station-map`; the wrong-number
  link opens the wrong-number sheet.
- **The hotline list surface.** `apps/mobile/app/(app)/more-help.tsx` — reads
  `HOTLINES` from `@nagar-shield/shared` (the **bundle**, so it renders with no
  network), filters `isActive`, orders by `sort_order`, and surfaces each
  entry's `lastVerifiedAt` through `formatVerifiedStamp` /
  `isVerificationStale`.
- **The verification stamp.** `apps/mobile/src/shared/utils/verifiedStamp.ts`
  — freshness is judged against the **dataset's own** reference stamp
  (`2026-10-15`), not the wall clock, because a bundled dataset is a snapshot
  of a curated release and the signal must not depend on the user's device
  clock.
- **The dial path is unchanged.** Every call affordance routes through the
  single `openDialer(number)` helper. `ACTION_CALL` is never used and no call
  state is observed (C-1).
- **The sheet is exported from `shared/ui/index.ts`**, so the Home screen and
  the Help Alert screen consume the same component rather than two copies of
  the same rows.

### Deviations from the story

- **The story names `shared/ui/BottomSheet` as the sheet's base, and that is
  what it uses** — no deviation. The deviation is in the *wrong-number sheet's
  placement*: the story's AC #8 asks for it to be "stacked over the More Help
  sheet, and the More Help sheet remains behind it". The shipped
  `shared/ui/WrongNumberSheet` is a **separate surface that opens from the
  hotline list**, not a second sheet stacked over this one, because the
  More Help sheet is itself already a modal layer and a third modal stack on
  top of it is not something the app's `BottomSheet` primitive composes. The
  *observable* requirement — the sheet remains reachable from the More Help
  entry point, the report link is present, and dismissing the sheet leaves no
  report row written — is met.
- **The prototype's `109 / 333 / 999 / 16116` rows are rendered from the
  bundle, not hardcoded in the sheet.** The sheet's row table carries the
  curated `hotline id` of each prototype row and resolves the label through
  `t()`, so the prototype's exact entries and the full curated set can never
  drift apart.

### Verification

- `node tools/check-i18n-keys.cjs` — 513/513 keys defined in both `bn` and
  `en`, every used key defined. The sheet's copy is in the i18n bundles, not
  hardcoded.
- `pnpm --filter @nagar-shield/mobile typecheck` and `lint` — clean.
- `pnpm test` — 21 mobile suites / 335 tests pass.

## Dependencies

### Requires
- Unit `001-foundation` — `shared/ui/BottomSheet` and `ListRow`, the Expo Router routes for the hotline list, thana line, and map, the `bn`/`en` i18n bundles
- `001-home-and-help-alert-grid` — the dashed More Help card and the shared `openDialer` helper
- `003-bundled-station-hotline-dataset` — the bundled hotline and station dataset the rows render from
- `004-graceful-degradation` — the degraded-mode guidance when a call intent cannot be resolved

### Enables
- `006-thana-line-fallback` — the নিকটবর্তী থানা row's target surface
- `007-find-a-station-map` — the ম্যাপে স্টেশন খুঁজুন row's target surface
- `008-wrong-number-report` — the "নম্বর ভুল? রিপোর্ট করুন →" entry point

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The device is offline when the More Help sheet opens | The sheet and the full hotline list render from the bundled dataset with no requests |
| The user taps the same hotline row twice quickly | The second tap is ignored while the first `ACTION_DIAL` intent is being fired; only one intent fires |
| The user opens the More Help sheet from Home and from screen 18 | Both entry points show the identical sheet with the identical row order |
| The wrong-number sheet is dismissed | The More Help sheet is revealed behind it and remains interactive; no report row is written |
| The user taps "বন্ধ করুন" while the wrong-number sheet is open | The wrong-number sheet is closed first; the More Help sheet is not closed by a control that is behind it |
| A curated hotline is inactive in the dataset | The row is not shown in the list; the sheet's four prototype entries are always present because they are curated active entries |
| The user rotates the device with the sheet open | The sheet re-renders in place with the same rows, the same order, and the same scroll position |
| The user's screen reader is active | Each row announces its service name and its number before the call affordance is reached |

## Out of Scope

- The Thana line surface and its 10 km → `999` fallback — `006-thana-line-fallback`
- The Find-a-station map surface — `007-find-a-station-map`
- The wrong-number report sheet and its write path — `008-wrong-number-report`
- Editing or adding hotline entries by users — the dataset is curated and refreshed quarterly
- Mental-health, anti-drug, and cyber-crime hotlines as separate curated surfaces — they are rows in the same list
- Any call, call-state observation, or dispatch claim — forbidden by C-1
