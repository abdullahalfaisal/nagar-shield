---
id: 003-report-detail-and-category-edit
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 003-report-detail-and-category-edit

## User Story

**As a** Nagar Shield user who filed a report
**I want** to open my own report from History, see what I submitted, and label it with the right incident type
**So that** my report is correctly classified without having to guess at a category while the incident is still happening

## Acceptance Criteria

- [ ] **Given** the author opens one of their own reports from History, **When** the Report detail screen renders, **Then** it shows the media, the description, the resolved area, the capture time, and the category — and the screen is built only from the existing design tokens and shared primitives
- [ ] **Given** a report was submitted without a category, **When** the author opens it, **Then** the category row shows the neutral "uncategorised" placeholder and an explicit affordance to set a category; the report is never shown as invalid or incomplete
- [ ] **Given** the author opens the category editor, **When** the list renders, **Then** it lists exactly the fixed 11 values — `theft`, `assault`, `harassment`, `robbery`, `accident`, `fire`, `medical`, `fraud`, `vandalism`, `suspicious`, `other` — each with its Bangla label, and there is **no** free-text field
- [ ] **Given** the author selects one of the 11 values, **When** the save completes, **Then** `updateCategory(reportId, category)` writes the value, the stored `reports.category` equals it, and the detail screen shows the selected category's Bangla label
- [ ] **Given** the author changes an already-set category, **When** the save completes, **Then** the stored `reports.category` is replaced with the new value and the previous value is not retained anywhere
- [ ] **Given** a signed-in user who is **not** the author, **When** they attempt to update the category of a report, **Then** the update is rejected with `FORBIDDEN` and the stored category is unchanged
- [ ] **Given** a value outside the fixed 11, **When** it is submitted to the update path, **Then** it is rejected by the shared `ReportCategory` parser and the database CHECK constraint, and no row is written
- [ ] **Given** a report the author has just submitted, **When** the author opens History, **Then** the report is present in the author's own History immediately, with `moderation_status = 'visible'` and no pending-review gate and no moderation step in between (FR-HIST-3)
- [ ] **Given** a non-author viewing a report's category, **When** the detail screen renders, **Then** the category is shown read-only with no edit affordance and no editor can be opened
- [ ] **Given** the author opens a report's detail, **When** the user attempts to change the media, the location, the description, or the visibility, **Then** no edit affordance for those fields exists — the category is the **only** editable field after submit

## Technical Notes

- **This is a new surface.** The prototype has no report-detail screen. Build it from the existing token set and the shared primitives (`shared/ui/ListRow`, `shared/ui/SegmentedTabs`, `shared/ui/BottomSheet`) in the prototype's visual language. It must **not** introduce a new layout system, a new colour token, or a new type ramp.
- **The Capture screen has no category field** — the 2026-09-11 FR-CAPTURE-5 override. The prototype never had one either, so screen 17 is already compliant. Do not "helpfully" add a picker to the Capture flow; this screen is the only place a category is chosen.
- **Category is nullable at creation.** The DB column is `category text NULL` with `CHECK (category IS NULL OR category IN (...))`. A report with `category IS NULL` is a valid, successful write and renders with the neutral placeholder — it is never a validation error.
- **The write path is a Postgres RPC, `update_category`,** called through PostgREST at `POST /rest/v1/rpc/update_category`. It is `SECURITY DEFINER` with an explicit `auth.uid() = author_id` check, and the RLS `UPDATE` policy on `reports` independently permits `category` changes only by the author and permits no other column.
- **The author check is enforced by the database, not by the UI.** The UI hides the edit affordance for a non-author, but the authoritative check is RLS plus the RPC's own `auth.uid()` comparison. A forged request from a non-author is rejected with `FORBIDDEN` regardless of what the client sent.
- **The 11-value enum is the single source of truth.** The client renders from the shared `ReportCategory` parser and the Bangla labels from the shared i18n bundle; the database CHECK is the second line of defence; the RPC validates again. Three layers, one vocabulary.
- **The History entry point is a unit 006 surface, but the guarantee is this unit's.** The History Overview screen (prototype screen 21) and the `history_nearby` read model belong to unit `006-alerts`. What this unit owns is the guarantee that the author's own report appears there **immediately** after submit, with `moderation_status = 'visible'` and no pending-review gate (FR-HIST-3). Moderation is after-the-fact via flags.
- **Only the category is editable after submit.** Media, location, description, and visibility are immutable. There is no edit affordance for them, and no RPC that writes them. A "correct my location" flow is explicitly out of scope for MVP — re-reporting is the path.
- **`reports.author_id` is always stored**, even when `public_visibility = 'anonymous'` (FR-DATA-3). The Report detail screen is the author's own view of their own report, so it may show the author row; the **public** projection must never return `author_id`. The detail surface reads the author's own row through the owner-scoped select, never through the public feed projection.
- **The category selector is a sheet or a list, not a picker in a form.** The prototype's visual language is a list of rows; a bottom sheet listing the 11 Bangla-labelled values matches it and keeps the screen free of a native `<select>` that would not exist on Android.
- **Immediate visibility is asserted, not assumed.** A test submits a report, then reads the author's History and asserts the report is present with `moderation_status = 'visible'` — no moderation step, no queue, no delay beyond the submit response.
- **The author-only update has a negative integration test.** A second authenticated user attempts the update and the test asserts `FORBIDDEN` and that the stored category is byte-identical afterwards.
- **i18n is a hard requirement.** The 11 category labels, the placeholder, the save / cancel actions, and the "no category" copy ship in `bn` (primary, native-speaker reviewed) and `en`.
- **Accessibility.** Every interactive control is ≥ 48 × 48 dp with an accessibility label. The category rows announce their selected state to the screen reader.
- **The edit is optimistic only if it can be rolled back.** Prefer a pessimistic save with an explicit pending state on the row; on failure the previous category is restored and a typed error is surfaced. The user must never see a category the database rejected.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ReportCategory` parser and the 11-value enum, `areaHierarchySchema`, `ApiErrorCode` incl. `FORBIDDEN`), the typed Supabase client, the design tokens, the shared UI primitives (`ListRow`, `BottomSheet`, `SegmentedTabs`), and the `bn` / `en` i18n bundles
- Unit `002-identity` — the authenticated session whose `auth.uid()` scopes the update
- `supabase/migrations/0003_capture.sql` — the nullable `category` column with its 11-value CHECK, the author-only `update_category` RPC, the `UPDATE` RLS policy on `reports`, and the `updated_at` trigger
- `007-storage-upload-and-finalize` — the report row and its `moderation_status` this screen reads
- `002-area-hierarchy-extraction` — the resolved `area_hierarchy` this screen displays

### Enables
- Unit `006-alerts` — the classified reports the Alerts feed renders ("New alert from `<area>`: `<category>`") and the History category filter (`FR-HIST-2`)
- Unit `007-moderation` — the moderator queue reads the author and the category the author set

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The author never sets a category | The report keeps `category IS NULL`; the detail screen shows the neutral placeholder; the Alerts feed renders the neutral "uncategorised" placeholder |
| The author sets the category to `other` | It is a first-class enum value and is stored as `'other'`; it is not treated as a free-text bucket |
| The author changes the category several times | The last write wins; every intermediate value is transient and no history of category edits is retained at MVP |
| The network drops mid-save | The row returns to its previous category, a typed error is shown, and the report is not left in a half-saved state |
| The author opens the detail screen from a push or a deep link while signed out | The screen redirects to the auth flow; no report data is rendered and no row is queried |
| The author's session was revoked between opening the screen and saving | The RPC rejects with `AUTH_REQUIRED`; the UI surfaces the sign-in prompt and leaves the stored category unchanged |
| A report the author can see has been hidden by moderation | The detail screen still resolves the author's own row; the public projection's `hidden_pending_review` state is not confused with the author's own view |
| A non-author opens the same report | The category is rendered read-only, no editor can be opened, and any direct API attempt is rejected with `FORBIDDEN` |
| The report has no media (media upload failed and the item is still queued) | The detail screen renders the description, area, capture time, and category without a media block; it never shows a broken image frame |

## Out of Scope

- The History Overview / History Distribution read models and the `history_nearby` RPC — unit `006-alerts`
- The category picker on the Capture screen — explicitly excluded by FR-CAPTURE-5
- Editing the media, the location, the description, or the visibility — the category is the only editable field
- Deleting a report, hiding a report, or withdrawing a report
- Flagging a report, or the auto-hide at 3 flags — unit `006-alerts`
- The moderator console and the restore / remove actions with a required note — unit `007-moderation`
- Editing another user's report as a moderator — the moderator surface is unit `007-moderation`
- Any AI category suggestion or automatic classification
- Any copy claiming the report has been reviewed, verified, or forwarded to an authority — forbidden by C-6
