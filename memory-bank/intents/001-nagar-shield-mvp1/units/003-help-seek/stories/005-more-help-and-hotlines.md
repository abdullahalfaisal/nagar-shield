---
id: 005-more-help-and-hotlines
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 005-more-help-and-hotlines

## User Story

**As a** Nagar Shield user who needs a service that is not an emergency number
**I want** a More Help sheet that lists the curated hotlines and opens each category's own surface
**So that** I can reach women-and-children support, disaster response, an ambulance, the electricity complaint line, my nearest thana, or a hospital map without searching the web

## Acceptance Criteria

- [ ] **Given** the user taps the dashed More Help card on Home or the Help Alert screen, **When** the sheet opens, **Then** it appears as a bottom sheet (not a separate full screen) and shows, in the prototype's exact visual order, নারী ও শিশু হেল্পলাইন `109`, দুর্যোগ হেল্পলাইন `333`, অ্যাম্বুলেন্স `999`, বিদ্যুৎ অভিযোগ `16116`, নিকটবর্তী থানা (sub-line সবচেয়ে কাছের থানায় কল with the italic note ১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।), and ম্যাপে স্টেশন খুঁজুন (sub-line হাসপাতাল · ফায়ার · থানা)
- [ ] **Given** the More Help sheet, **When** it renders, **Then** the copy "নম্বর ভুল? রিপোর্ট করুন →" and the "বন্ধ করুন" button are both present, and the disclaimer "কলগুলি নিকটবর্তী উপলব্ধ সেবায় স্বয়ংক্রিয়ভাবে রাউট করা হয়" is kept verbatim
- [ ] **Given** the More Help sheet, **When** it is compared to `docs/design/screen-help-alert.html`, **Then** the six rows, their `--ink-50` backgrounds and 12 px radius, the violet `call` icons, the 40 × 4 dp drag handle, the "আরও জরুরি নম্বর" heading, and the 48 dp "বন্ধ করুন" button match 1:1
- [ ] **Given** a hotline row (109 / 333 / 999 / 16116), **When** the user taps its call affordance, **Then** the OS dialer opens pre-filled with that hotline's number through `ACTION_DIAL`, and the app places no call itself
- [ ] **Given** the More Help sheet, **When** the hotline rows render, **Then** the list is read from the bundled curated dataset and zero network requests are made
- [ ] **Given** the sheet's rows, **When** the user taps নিকটবর্তী থানা, **Then** the thana-line surface opens; **When** the user taps ম্যাপে স্টেশন খুঁজুন, **Then** the find-a-station map surface opens; and **When** the user taps a hotline row, **Then** the hotline list surface opens — each category opens its own list or map surface
- [ ] **Given** the hotline list surface, **When** it renders, **Then** it lists the full curated hotline set (including the prototype's four entries plus mental health, anti-drug, and cyber-crime) ordered by `sort_order`, each showing the service name and the number
- [ ] **Given** the user taps "নম্বর ভুল? রিপোর্ট করুন →", **When** the wrong-number sheet opens, **Then** it is stacked over the More Help sheet and the More Help sheet remains behind it
- [ ] **Given** the More Help sheet, **When** the user taps "বন্ধ করুন" or the backdrop, **Then** the sheet closes and no dialer or other surface is opened
- [ ] **Given** the sheet's controls, **When** accessibility is checked, **Then** every row, the report link, and the close button are ≥ 48 × 48 dp and carry accessibility labels in `bn` and `en`

## Technical Notes

- **The prototype's sheet is the copy contract.** `docs/design/screen-help-alert.html` (`#more-help-dialog`) already contains the exact entries and must be reproduced as-is: the four hotline rows, নিকটবর্তী থানা (with the sub-line and the italic 10 km note), ম্যাপে স্টেশন খুঁজুন, the "নম্বর ভুল? রিপোর্ট করুন →" link, and the "বন্ধ করুন" button.
- **FR-SEEK-1 names three categories; the prototype sheet shows six rows.** The four hotline rows are the "Other hotlines" category, "নিকটবর্তী থানা" is the "Thana line" category, and "ম্যাপে স্টেশন খুঁজুন" is the "Find a station" category. **Resolution:** the sheet keeps the prototype's six rows and visual order 1:1 (the copy is the contract), and tapping a row opens the corresponding category surface. The three-category structure is preserved as the navigation model without reordering or removing a prototype row.
- **Disclaimer copy is kept.** "কলগুলি নিকটবর্তী উপলব্ধ সেবায় স্বয়ংক্রিয়ভাবে রাউট করা হয়" is retained verbatim from the prototype — it describes the *operator's* routing, not a Nagar Shield dispatch.
- **The hotline list renders from the bundle.** The rows are read from the bundled curated JSON (FR-SEEK-2 / FR-SEEK-5), so the list renders with no network available. The Postgres mirror is a separate read path, not a dial-path dependency.
- **Tap-to-call prefills the dialer.** Every call affordance routes through the single `openDialer(number)` helper (`Linking.openURL('tel:<number>')` → `ACTION_DIAL`). `ACTION_CALL` is never used and no call state is observed.
- **The sheet is built from `shared/ui/BottomSheet`**, and the wrong-number sheet is stacked over it as a separate bottom sheet (the prototype's `#wrong-number-dialog`).
- **Category surfaces are separate routes**, not inline expansions of the sheet, so the thana line and the map can own their own location handling and lifecycle.
- **i18n is a hard requirement.** Every string ships in `bn` (primary, native-speaker reviewed) and `en`; no user-facing string is hardcoded in either language.

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
