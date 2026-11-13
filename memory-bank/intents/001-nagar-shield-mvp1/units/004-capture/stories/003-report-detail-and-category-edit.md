---
id: 003-report-detail-and-category-edit
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 003-report-detail-and-category-edit

## User Story

**As a** Nagar Shield user who filed a report
**I want** to open my own report from History, see what I submitted, and label it with the right incident type
**So that** my report is correctly classified without having to guess at a category while the incident is still happening

## Acceptance Criteria

- [x] **Given** the author opens one of their own reports from History, **When** the Report detail screen renders, **Then** it shows the media, the description, the resolved area, the capture time, and the category — and the screen is built only from the existing design tokens and shared primitives — `app/(app)/report-detail.tsx`, reached from the **My Reports** tab of `app/(app)/history.tsx`.
- [x] **Given** a report was submitted without a category, **When** the author opens it, **Then** the category row shows the neutral "uncategorised" placeholder and an explicit affordance to set a category; the report is never shown as invalid or incomplete — the placeholder is `alerts.uncategorised` and the row is tappable.
- [x] **Given** the author opens the category editor, **When** the list renders, **Then** it lists exactly the fixed 11 values — `theft`, `assault`, `harassment`, `robbery`, `accident`, `fire`, `medical`, `fraud`, `vandalism`, `suspicious`, `other` — each with its Bangla label, and there is **no** free-text field — the sheet maps `REPORT_CATEGORIES` from `packages/shared` and nothing else.
- [x] **Given** the author selects one of the 11 values, **When** the save completes, **Then** `updateCategory(reportId, category)` writes the value, the stored `reports.category` equals it, and the detail screen shows the selected category's Bangla label — `src/shared/api/reportDetail.ts`; asserted by `tools/probe-report-category.cjs`.
- [x] **Given** the author changes an already-set category, **When** the save completes, **Then** the stored `reports.category` is replaced with the new value and the previous value is not retained anywhere — asserted by the probe, and by the SQL suite (there is no category-history table).
- [x] **Given** a signed-in user who is **not** the author, **When** they attempt to update the category of a report, **Then** the update is rejected with `FORBIDDEN` and the stored category is unchanged — **this required a migration**; see "The author check was fail-open" below.
- [x] **Given** a value outside the fixed 11, **When** it is submitted to the update path, **Then** it is rejected by the shared `ReportCategory` parser and the database CHECK constraint, and no row is written — the shared parser rejects it client-side, and the database refuses it by the **enum type**; see "The column is an enum, not text with a CHECK" below.
- [x] **Given** a report the author has just submitted, **When** the author opens History, **Then** the report is present in the author's own History immediately, with `moderation_status = 'visible'` and no pending-review gate and no moderation step in between (FR-HIST-3) — the **My Reports** tab reads `history_nearby`, which always includes the caller's own reports.
- [x] **Given** a non-author viewing a report's category, **When** the detail screen renders, **Then** the category is shown read-only with no edit affordance and no editor can be opened — the row is `disabled={!isAuthor}`, carries a "read only" badge, and has no chevron.
- [x] **Given** the author opens a report's detail, **When** the user attempts to change the media, the location, the description, or the visibility, **Then** no edit affordance for those fields exists — the category is the **only** editable field after submit — asserted over the wire: the description PATCH and the visibility PATCH are both refused with `403`.

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

## Implementation Notes

Implemented in bolt `013-capture`. The story above is the spec; where the
built schema disagreed with it, **the schema won and the story was updated
to match**. Every deviation is listed here rather than silently ticked.

### The author check was fail-open — a migration was required

The story says the RPC "is `SECURITY DEFINER` with an explicit
`auth.uid() = author_id` check". It did not have one. The shipped function
scoped its `UPDATE` to the author's own row:

```sql
update public.reports
   set category = %L::public.report_category, updated_at = now()
 where id = %L and author_id = %L
```

so a non-author's attempt matched **zero rows**, the `UPDATE` was a no-op,
and the function returned a success envelope anyway:

```json
{ "report_id": "…", "category": "fraud" }
```

The caller was told the category had been set. It had not. Nothing was
written and nothing was refused — a fail-**open** shape, and the worst kind
here, because the client caches the returned category and shows it as the
report's category while the database holds a different one. The user's screen
and the database disagree, and the disagreement is invisible.

**`20261105000024_update_category_forbidden.sql`** closes it. The function
now checks the row **before** writing and raises `FORBIDDEN` (42501) when the
report is not the caller's. The check is explicit rather than inferred from
the `UPDATE`'s row count, so the refusal is a first-class outcome with a
typed error the client can map — `fromSupabaseError` turns `42501` into
`AppError('FORBIDDEN')`.

The three cases:

| the caller | the result |
|---|---|
| the report's author | the category is written |
| not the author | `FORBIDDEN` (42501) — no write |
| no session | `AUTH_REQUIRED` (42501) — no write |

A report that does not exist is **also** `FORBIDDEN` here, rather than
`NOT_FOUND`. The distinction is deliberate: a caller must not be able to probe
which report ids exist by the error it gets back. `NOT_FOUND` would answer
that question; `FORBIDDEN` does not, and it matches the story, which only ever
names `FORBIDDEN` for this path.

The disabled-account guard still runs **first**, because `ACCOUNT_DISABLED` is
a *more specific* answer: the client must be able to tell the user that their
account is disabled rather than that they lack permission.

### A regression in the write-guards suite, and what it was actually testing

Migration 024 broke one assertion in `supabase/tests/write_guards.sql`:

```
✗ Test G30: an enabled account can still edit its report category
```

The fixture was at fault, not the migration. G30 edited report
`…2201` — the report that **Test B deletes** at line 200, to exercise the
`ON DELETE SET NULL` referential action on the audit trail. By the time G30
ran, the row was gone.

The old function was fail-open, so the missing report matched zero rows and
returned success. **G30 was passing for the wrong reason**: it was asserting
"the RPC does not error" against a row that was not there. After the
migration it correctly errored — with `FORBIDDEN`, because a report that does
not exist is refused the same way as one that belongs to somebody else.

G30 now gets its own report (`…2203`), which really does exist and really is
the citizen's, so it tests what it claims to test. Three assertions were
added alongside it: the non-author's `FORBIDDEN`, the unchanged category
afterwards, and the not-found report's identical `FORBIDDEN`.

### The column is an enum, not `text` with a CHECK

The story's Technical Notes describe the column as "`category text NULL` with
`CHECK (category IS NULL OR category IN (...))`". The shipped column is
`category public.report_category` — a Postgres **enum type**
(`theft`, `assault`, `harassment`, `robbery`, `accident`, `fire`, `medical`,
`fraud`, `vandalism`, `suspicious`, `other`).

The enum is the **stronger** of the two. A CHECK rejects a bad value; an enum
makes the bad value unrepresentable — Postgres refuses to coerce it at all,
so the vocabulary cannot be widened by a bad write. The three-layer
vocabulary the story describes is intact, with the enum standing where the
CHECK was:

| layer | what it is |
|---|---|
| client | `reportCategorySchema` in `packages/shared` — the shared parser |
| database | the `public.report_category` enum — the type of the column |
| RPC | the parameter type of `update_category` — the same enum |

The AC is met either way. The SQL suite asserts the enum carries exactly the
story's 11 values, in the story's order.

### `history_nearby` does not project `moderation_status`

The story asks for the author's own report to appear in History "with
`moderation_status = 'visible'`". The read model does not project that column
at all — it **filters** to `moderation_status in ('visible','restored')`.

So the row's presence in the projection **is** the guarantee: a report that
was pending review, hidden, or withdrawn would not be in the result at all.
The client's `history.ts` hardcodes `moderationStatus: 'visible'` for exactly
this reason, and the assertions are written against the presence and the
`is_own` flag rather than against a field that does not exist.

### Two facts that only show up over the wire

- **A write that RLS filters out is not an error.** PostgREST answers an
  UPDATE with `200` and an empty representation and a DELETE with `204` and no
  body. The probe asserts the **effect** — no rows affected, the other
  user's row unchanged — not the status code.
- **`now()` is the transaction timestamp.** `updated_at` cannot advance past
  `created_at` inside one transaction, so all rows written by one transaction
  share a timestamp. The SQL assertions are written around that fact rather
  than against it.

### The screens

| File | What it is |
|---|---|
| `app/(app)/report-detail.tsx` | the Report detail screen — media, description, area, capture time, and the category row; the category sheet holds the 11 values |
| `app/(app)/history.tsx` | the **My Reports** tab — the author's own reports, tappable into the detail screen. The nearby/distribution surface is unit 006's. |
| `src/shared/api/reportDetail.ts` | the API layer — `fetchOwnedReport`, `updateCategory`, `signMediaUrl`, and the `useOwnedReport` / `useInvalidateReport` hooks |

### Verification

| Layer | Where | Count |
|---|---|---|
| SQL assertions | `supabase/tests/report_category.sql` (Tests 1–8) | 32 |
| Live probe | `tools/probe-report-category.cjs` (`pnpm category:check`) | 22 |

The probe signs in as **two** seeded citizens (`citizen@nagar.local`,
`citizen2@nagar.local`), because the author check is only meaningful when
there is somebody else to be checked against. It goes through the door the app
uses — GoTrue → PostgREST → the `update_category` RPC → the RLS policies —
and cleans up its own rows.

The SQL suite runs as an **impersonated client** (`set local role
authenticated` + `set local request.jwt.claims`), because the superuser has
`BYPASSRLS` — every RLS defect would otherwise be invisible.

### One thing this story does **not** own

The History **Overview** screen's full design — the nearby list, the
per-category distribution, the radius and time-window filters — is unit
`006-alerts`' surface (bolts 020–021). This story owns the **My Reports**
tab, because AC #1 and AC #8 need a real entry point into the detail screen
and a real proof of immediate visibility. The nearby tab is left as the
placeholder it was.

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
