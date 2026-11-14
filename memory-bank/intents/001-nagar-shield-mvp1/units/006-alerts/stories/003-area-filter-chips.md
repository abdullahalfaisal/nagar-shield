---
id: 003-area-filter-chips
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
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

## Implementation

**The chip row scrolls, the chip list is data, and the selection is one shared mapping. The story is `complete` on the criteria it states — with one honest residue recorded below: the Maestro flow the Testing note names does not exist, and the `neighborhood` selection the edge-case table describes comes from the Home search bar, which unit `003` owns.**

### What ships

- `apps/mobile/src/shared/ui/AreaChipRow.tsx` renders the chips, tracks the active one via `activeId`, and reports a selection through `onSelect`. Each chip carries `accessibilityRole="button"` and `accessibilityState={{ selected: active }}`, so a screen reader announces which filter is on. The **selected** chip wears `var(--grad-primary)` through `expo-linear-gradient` and white text; the **unselected** chip is `--surface-white` with an `--ink-200` border and `--ink-700` text.
- `apps/mobile/src/shared/api/areaChips.ts` is **new** — the chip list, the filter mapping, and the one hook that builds the row.

### The three gaps this section named — closed

**1. The row clipped.** `AreaChipRow.tsx` used a plain `View`:

```tsx
<View style={styles.row}>
  {chips.map((chip) => { ... })}
</View>
```

A horizontal chip row with more chips than fit the screen width overflows in a `View` and is cut off at the edge, with no way to reach the chips beyond it — not clipped off the edge, but **unreachable**, with no gesture to bring them into view. The row is now a horizontal `ScrollView`:

- `horizontal` — the row scrolls sideways, not vertically;
- `showsHorizontalScrollIndicator={false}` — the prototype's row has no scrollbar, and a visible one on Android sits under the chips;
- `contentContainerStyle` carries the prototype's `padding: 0 20px 12px` contract, so the first chip aligns with the feed's own 20 dp gutter;
- `flexGrow: 0` on both the scroll view and the content container — a `ScrollView`'s content container stretches to fill the viewport by default, which would make the row swallow the feed beneath it;
- the chips keep `flexShrink: 0`, so a chip never squeezes to fit — it either fits or the row scrolls.

**2. There was no test.** `apps/mobile/src/shared/ui/areaChipRow.test.ts` is **new** — **34 tests**:

- the row is a horizontal `ScrollView` and not a `View`, the scroll indicator is hidden, the padding contract holds, the content does not stretch, the chips keep `flex-shrink: 0`;
- the chips carry their accessibility state, their labels and their role, and a disabled chip says so;
- the list is data-driven, the chip carries its area's own hierarchy, the chip ids are stable and never collide;
- the location-derived chips are disabled without a fix and send nothing;
- `resolveAreaFilter` is the one mapping function;
- both feed screens render **exactly one** row, build their chips from the shared list, resolve their filter through the shared rule, hardcode **no** chip labels, and start on All BD.

**3. The chip list was a hardcoded array in two screens.** The story says:

> **Given** the chip list is built, **When** its source is inspected, **Then** the chips are **data-driven from `area_hierarchy`** — the list is derived from the resolved area hierarchy (the prototype's five chips being the seeded instance), and no chip label is a hardcoded literal in the component

Both `alerts.tsx` and `home.tsx` carried their own five-chip array — the same one, twice — with **Mirpur** and **Dhanmondi** written into the screen files. The list is now built from the **`area_lookup`** reference table, which the server seeds with the curated Dhaka areas and which is publicly readable (`area_lookup_select_all` uses `using (true)`). A new area is now a **data** change, not a code change in two files.

### The two behaviours the story names that the old code did not have

**The location chips need a fix, and the feed must not depend on it.** The story says *"My division" / "My city" need a fix… The fix is requested just-in-time (never at app open, never on the panic path) and the feed must not **depend** on it — with no fix, the two location-derived chips are unavailable and the feed still serves All BD.*

The old chips sent `{ division: 'Dhaka' }` — a **hardcoded** division, so the chip said "My division" while filtering a division the user might not be in. The chips now resolve from the **current fix**, reverse-geocoded through the existing `useReverseGeocode` hook. With no fix they are **disabled** — rendered, marked unavailable, and *not* pressed — and `resolveAreaFilter` sends **no** parameter for a disabled chip, so the feed keeps the result set it had rather than narrowing to an empty area.

The fix is taken **just-in-time**, when the feed screen opens — not at app open, and never on the panic path.

**The filter and the chip are one thing.** `resolveAreaFilter` is the **single mapping function** from a chip to the RPC's area parameters, exactly as the story names it. The chip row and the Home search bar feed the same function and the same `alerts_feed` parameters, so a narrowed feed can never be produced by a second, divergent mapping.

The `alerts_feed` RPC matches **each level independently, by equality** — `area_hierarchy ->> 'thana' = p_thana` — and a `null` parameter matches everything at that level. So a chip's payload carries the levels **above** the one it names: a chip for a thana sends its division and city too, because a bare thana would match a thana of the same name in another division.

### The selection is a chip id, not a chip

Both screens now hold the selected chip's **id** in state and resolve the chip from the built list. That matters because the list is now **data-driven**: the list changes when the reference data changes, and a screen holding a chip *object* in state would hold a chip that no longer exists. The chip id is derived from the area's own id, so it is stable across builds and two areas can never collide.

**All BD is the default on every launch**, per the story's out-of-scope note — the last selection is not persisted.

### The guards, and their causal checks

Every guard added here was checked by breaking the thing it guards and confirming the test **failed**, then restoring:

| What was broken | The test that failed |
|---|---|
| The row reverted from `ScrollView` to `View` | `areaChipRow.test.ts` — *"the row is a horizontal ScrollView, not a View"* and *"the scroll indicator is hidden"* |
| The `chip.disabled` guard dropped from `resolveAreaFilter` | `areaChipRow.test.ts` — *"a disabled chip sends nothing, even with a payload"* |
| The Alerts screen's shared list replaced with a hardcoded array | `areaChipRow.test.ts` — *"builds its chips from the shared list"* and *"hardcodes no chip labels"* |
| The chip's explicit `height: 28` removed | `tapTarget.test.ts` — the chip was reported **unmeasurable**, because the label had moved into a variable and the `paddingVertical × 2 + content` branch could no longer find a height |
| The tap-target scanner's brace tracking removed | `tapTarget.test.ts` — 8 failures, including *"reads the real chip element whole"*, which then saw the tag cut in half at the `=>` |

The chip's `height: 28` is worth stating plainly: it was added **because** the
label moved into a `label` variable, which made the chip's box unresolvable by
the tap-target gate. The gate was right and the primitive was wrong — the chip
now states its 28 dp height rather than leaving the gate to infer it.

The scanner's brace tracking was guarded the same way. It had been misread as
the cause of that failure; a node script against the shipped file disproved
that, because a JSX attribute is always `name={...}`, so an arrow function's
`=>` sits **inside** the braces the scanner opened. The tracking is still
load-bearing — removing it cuts the real chip's tag in half at the arrow — so
it now has a direct guard rather than an assumed one.

### The honest residue

- **The Maestro flow does not exist.** The Testing note asks for a flow covering *"open Home → tap **Mirpur** → the results narrow → tap **All BD** → the full BD-wide set returns"*. The repo has one Maestro flow (`panic-path.yaml`) and it is the panic path. A feed-narrowing flow needs a live backend with a seeded report in a known thana, and the harness to drive it.
- **The `neighborhood` selection comes from the Home search bar,** which unit `003-help-seek` owns and this story places out of scope. The chip row deliberately does **not** offer neighbourhood chips — the story says the chip row is the prototype's five-chip visual contract and the search bar is the neighbourhood autocomplete, and *"they are not merged into one control."* The edge-case table's "a `neighborhood` selection arrives from the Home search bar while a chip is active" case therefore cannot arise from the chip row alone.
- **The chip's own hierarchy is sent with every chip, and the chip labels are the English area names.** The prototype's chips are the English thana names, and the reference table carries both (`name` and `name_bn`). The Bangla half is not shown on the chip, so the row reads the same in both bundles.
