---
id: 003-area-filter-chips
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 003-area-filter-chips

## User Story

**As a** Nagar Shield user who is interested in what is happening in my part of the country rather than everywhere
**I want** to narrow the Alerts feed with a row of area chips
**So that** I can focus on my division, my city, or a specific thana without reading every report from all over Bangladesh

## Acceptance Criteria

- [ ] **Given** the Alerts feed block renders, **When** the chip row is laid out, **Then** it matches the prototype exactly — `display: flex`, `gap: 8px`, `overflow-x: auto`, `padding: 0 20px 12px`, every chip `flex-shrink: 0`, and the chips are **All BD**, **My division**, **My city**, **Mirpur**, **Dhanmondi**
- [ ] **Given** the **selected** chip renders, **When** its style is read, **Then** its background is `var(--grad-primary)`, its text is white, its padding is `8px 14px`, its `border-radius` is `999px`, its font size is 12 px and its weight is 600
- [ ] **Given** an **unselected** chip renders, **When** its style is read, **Then** its background is `var(--surface-white)`, its border is `1px solid var(--ink-200)`, its text colour is `var(--ink-700)`, its padding is `8px 14px`, its `border-radius` is `999px`, its font size is 12 px and its weight is 600
- [ ] **Given** the chip list is built, **When** its source is inspected, **Then** the chips are **data-driven from `area_hierarchy`** — the list is derived from the resolved area hierarchy (the prototype's five chips being the seeded instance), and no chip label is a hardcoded literal in the component
- [ ] **Given** the user taps a chip other than **All BD**, **When** the selection is applied, **Then** the feed narrows to that area — the chip's parameters are passed to `alerts_feed` as the matching `division` / `city` / `thana` / `neighborhood` argument and the returned rows change accordingly (FR-ALERTS-4)
- [ ] **Given** a chip is selected, **When** accessibility is checked, **Then** the selected chip carries `accessibilityState={{ selected: true }}` and every unselected chip carries `accessibilityState={{ selected: false }}`, and each chip has an accessibility label
- [ ] **Given** the chip row renders on a narrow device, **When** the five chips do not fit, **Then** the row scrolls **horizontally** — no chip is clipped, wrapped, or squeezed, and each chip keeps its `flex-shrink: 0` width
- [ ] **Given** the user taps **All BD**, **When** the selection is applied, **Then** every area filter is cleared (no `division`, `city`, `thana`, or `neighborhood` is sent), the feed shows the full Bangladesh-wide set again, and **All BD** becomes the selected chip
- [ ] **Given** a chip is selected and the feed re-queries, **When** the request is inspected, **Then** the chip selection is part of the **query key**, so a different chip produces a different cached page and the previous chip's rows are never served for the new selection
- [ ] **Given** **My division** or **My city** is tapped, **When** no current fix is available (permission denied or the fix failed), **Then** the chip is disabled or visibly marked unavailable, no `division` / `city` parameter is sent, and the feed keeps the previous result set instead of filtering to an empty area

## Technical Notes

- **`resolveAreaFilter` is the single mapping function.** It maps the selected chip (or a search-bar selection) to the RPC's area parameters: `All BD` → no filter; `My division` → the current fix's `division`; `My city` → the current fix's `city`; `Mirpur` / `Dhanmondi` → `thana`; a search selection may set any of the four levels. Both the chip row and the Home search bar feed the same function and the same `alerts_feed` parameters.
- **The chip row is a filter, not a search box.** The Home search bar (`এলাকা খুঁজুন...`, also in the feed slot) may narrow to a `neighborhood`; the chip row is the prototype's five-chip visual contract. They are not merged into one control.
- **The prototype source contains the chip row twice.** The same five-chip markup appears **twice** in `prototype ui.html`; the extractor collapsed it into a single row in `docs/design/screen-spec.md`. **Port exactly one row** — a duplicated chip row is a visible 1:1 port defect and is rejected in review. A render test counts the chip rows in the tree and asserts exactly one.
- **The chip list is data-driven from `area_hierarchy`.** The prototype's five chips (All BD / My division / My city / Mirpur / Dhanmondi) are the seeded instance of the data-driven list, not a hardcoded array inside the component. The chip's identity carries its level (`division` / `city` / `thana` / `neighborhood`) and its area key, so a new area is a data change, not a code change.
- **`Chip` is the shared primitive** (`shared/ui/Chip`). The selected state carries `accessibilityState={{ selected: true }}` and renders the `var(--grad-primary)` gradient through `expo-linear-gradient`.
- **The selected gradient is a token, not a hex.** `var(--grad-primary)` resolves through the theme, so the chip keeps AA contrast in light and dark mode.
- **Every chip is ≥ 48 × 48 dp.** The chip's visual box is `padding: 8px 14px` at 12 px type; the **hit target** is padded to 48 dp without changing the visual box (FR-UX-4).
- **The chip selection lives in the feed's query key.** `useAlertsFeed` is keyed by `{ division?, city?, thana?, neighborhood? }`, so switching chips produces a distinct cache entry. The previous chip's cached pages are not shown under the new selection, and the previous selection's pages remain cached for a back-navigation.
- **"My division" / "My city" need a fix.** They resolve from the current location's `area_hierarchy`. The fix is requested just-in-time (never at app open, never on the panic path) and the feed must not **depend** on it — with no fix, the two location-derived chips are unavailable and the feed still serves All BD.
- **A chip selection resets the pagination cursor.** A narrowed filter starts a fresh page sequence; the cursor from the wider query is never reused against the narrower one.
- **The chip row's horizontal scroll is a `ScrollView` with `horizontal`,** `showsHorizontalScrollIndicator={false}`, and `contentContainerStyle` carrying the `padding: 0 20px 12px` contract.
- **Testing.** Jest covers `resolveAreaFilter` for all chip ids (All BD / My division / My city / thana / neighborhood) including the no-fix case, and the chip's selected / unselected style values. A Maestro flow covers: open Home → tap **Mirpur** → the results narrow → tap **All BD** → the full BD-wide set returns.

## Dependencies

### Requires
- `001-alerts-feed-list` — the feed query, the `useAlertsFeed` hook keyed by the area filter, and the feed block the chip row sits above
- Unit `001-foundation` — the `Chip` primitive, the `expo-linear-gradient` dependency behind `var(--grad-primary)`, the design tokens, and the `bn` / `en` i18n bundles
- Unit `002-identity` — the session that scopes the feed read
- Unit `003-help-seek` — the Home search bar that may narrow to a `neighborhood` and feeds the same RPC parameters
- `expo-location` — the current fix that "My division" and "My city" resolve from (external; may be denied)

### Enables
- `009-alert-detail-screen` — the detail link opened from a card inside a narrowed feed
- Unit `007-moderation` — the moderator view's area-scoped read of the same feed projection

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The current fix is unavailable and **My city** is tapped | The chip is disabled or marked unavailable, no `city` parameter is sent, and the previous result set is retained — the feed never empties because of a missing fix |
| The user taps the already-selected chip | The selection is unchanged and no duplicate query is issued; the feed does not reload |
| The user switches from **Mirpur** to **Dhanmondi** | The query key changes, a fresh page sequence starts from the first page, and the Mirpur rows are not shown under the Dhanmondi chip |
| The user selects **Mirpur** and then taps **All BD** | Every area parameter is cleared, the BD-wide set returns, and the cursor is reset — the narrowed page is not appended to the wide set |
| The chip row does not fit the screen width | The row scrolls horizontally, no chip is clipped or wrapped, and each chip keeps its intrinsic width |
| The feed is narrowed and a poll lands | The poll re-queries the **narrowed** query key; the narrowed result set is refreshed and never replaced by the unfiltered set |
| A `neighborhood` selection arrives from the Home search bar while a chip is active | The search selection updates the same area-filter state, so the feed reflects the finer area and the chip row's selected state stays consistent with the active filter |
| The area list resolves to more chips than fit the row | The row scrolls; chips are never dropped or silently truncated from the filter set |
| The device is offline when a chip is tapped | The selection is applied to the cached key and the cached page for that filter is shown; no doomed request is issued and the offline indication remains |
| The user rotates the device with a chip selected | The selection, the query key, and the rendered chip row are preserved unchanged |

## Out of Scope

- The feed card layout, the accent map, and the public projection — `001-alerts-feed-list`
- The 60-second polling, the pull-to-refresh gesture, and the battery pause — `002-auto-refresh-and-pull-to-refresh`
- The Home **search bar** itself and its neighbourhood autocomplete — unit `003`
- The area hierarchy's server-side resolution, the reverse geocode, and the area lookup tables — unit `004`
- The History screen's own location pill and filter sheet — `006-history-list` and `007-history-filters`
- A map-based area picker, a polygon draw, or a bounding-box filter — the filter is a chip row
- Saving a user's favourite area or persisting the last selection across launches — Phase 1 keeps **All BD** as the default on every launch
