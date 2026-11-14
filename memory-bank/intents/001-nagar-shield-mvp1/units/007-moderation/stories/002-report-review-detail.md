---
id: 002-report-review-detail
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
---

# Story: 002-report-review-detail

## User Story

**As a** Nagar Shield moderator
**I want** a single wide review screen that shows the report's media, every flag reason with who raised it and when, and the uploader's identity
**So that** I can judge the report on its merits before deciding to restore or remove it, instead of guessing from a list row

## Acceptance Criteria

- [x] **Given** a moderator opens `/queue/[reportId]` for a report that has media, **When** the left column renders, **Then** the media preview is loaded through a **short-lived signed Storage URL** and the bucket itself is never public
- [x] **Given** the signed URL has expired or the media row is missing, **When** the preview area renders, **Then** a neutral placeholder is shown — never a broken image — and the signed URL is re-requested on demand
- [x] **Given** the report has one or more flags, **When** the right column renders the flag list, **Then** **every** flag row is shown with its reason, its reporter, and its timestamp, with no truncation and no "and N more" (FR-MOD-2)
- [x] **Given** the report has a `description` and a `category`, **When** the report meta renders, **Then** the description is rendered as plain text and the category is rendered with its shared accent tile; a `null` category renders the neutral "uncategorized" placeholder
- [x] **Given** the report's uploader has a `profiles` row, **When** the uploader identity block renders, **Then** the profile id, registered phone, and email are present and the account state is shown (FR-MOD-2)
- [x] **Given** the uploader's identity was rendered, **When** the page source, the URL, the query keys, and the logs are inspected, **Then** the unmasked identity appears in **none** of them — it exists only in the server response payload
- [x] **Given** the public feed and every public projection, **When** they are queried, **Then** the uploader's identity is **absent** from the payload — the identity is server-side only and is never exposed on a public surface
- [x] **Given** the report was moved to `hidden_pending_review` by the author auto-hide rule, **When** the detail renders, **Then** the full-width hide-reason banner explains in plain language that the author rule (5 flagged reports in 24 h) caused the hide, not the 3-flag threshold (FR-ALERTS-11)
- [x] **Given** the decision panel renders, **When** it is inspected, **Then** it offers exactly two choices — `restore` and `remove` — together with a required note field and a submit control
- [x] **Given** the decision call fails, **When** the response code is `VALIDATION_FAILED`, `FORBIDDEN`, or `CONFLICT`, **Then** the panel renders the matching mapped message for that code — never a raw Postgres or server error string

## Technical Notes

- **The route is a wide two-column desktop layout**, not a phone frame. Left column: media preview, area (`English · বাংলা` pair), category, description, capture time. Right column: flag-reason list, uploader identity block, decision panel. A full-width hide-reason banner and a decision-history strip complete the page.
- **The signed URL is requested per view and never persisted.** The bucket is private; the console asks Supabase Storage for a short-lived signed read URL, uses it in the `<img>` / `<video>` source, and lets it expire. The URL is never written to local storage, a query key, a log line, or the URL bar.
- **The full flag list comes from the server.** The queue payload already carries `flag_reasons` (reason + flagger id + timestamp) for every flag on the report; the detail route renders the complete set. The count is displayed as a **number** next to the heading — a count, never a chart or a distribution.
- **The uploader identity is server-side only.** It is returned by the moderator-only RPC, rendered in the console, and never written into a public projection, a URL, a query key, or a log. A source-review assertion covers this path.
- **The hide-reason banner is explanatory, not statistical.** It renders the server's authoritative `hide_reason` (`'flag_threshold'` | `'author_auto_hide'` | `'both'`). The client helper `deriveHideReason()` only mirrors the server's value for rendering; it never recomputes a statistic or states a per-author count.
- **The decision panel renders the choice and the note, but the write belongs to story `003`.** The panel calls `moderation_decide` with `{ report_id, decision, note }`; `moderator_id` is taken from the **JWT** server-side and can never be supplied by the client.
- **The remove choice is visually distinct** and its button label states that the action is **permanent** — `remove` has no undo at MVP (FR-ALERTS-9).
- **Error mapping is by stable code, not by message.** `VALIDATION_FAILED` → the note-field error (blank after trim); `FORBIDDEN` → the moderator-access-only state; `CONFLICT` → "this report was already decided" with a link back to the queue; `NOT_FOUND` → a not-found state; `AUTH_REQUIRED` → a redirect to `/login`. Raw Postgres error text never reaches the screen (API conventions).
- **The decision history strip** renders the prior `moderation_actions` rows for this report from the same append-only trail the `/audit` view reads.
- **The layout reuses the mobile alert card's visual pattern** — category accent tile, area / category / description / time lines, `--r-md` (14 px) radius, `--shadow-card` — and the shared token set as CSS custom properties. No new hex value, no third-party UI kit, no separate admin palette.
- **All strings go through the shared i18n bundle** (Bangla primary, English secondary). Every interactive control is ≥ 48 × 48 px with an accessible name.

## Dependencies

### Requires
- `001-moderator-login-and-queue` — the queue read model, the route guard, and the admin shell the detail renders inside
- Unit `001-foundation` — `packages/shared` (`FlagReason`, `ApiErrorCode`, the shared Zod schemas, the i18n contract), the typed Supabase client, and the web-safe token subset
- Unit `002-identity` — the `profiles` row and the uploader's identity fields
- Unit `004-capture` — the `reports` / `report_media` tables, the private Storage bucket and its signed-URL path, and the `area_hierarchy` payload
- Unit `006-alerts` — the `flags` rows and the `hide_reason` derivation inputs

### Enables
- `003-restore-remove-decision` — the decision panel is where the restore / remove write is submitted
- `005-author-auto-hide-batch` — the hide-reason banner on the detail route explains the batch's cause
- `006-moderator-audit-log` — the decision-history strip reads the same append-only trail

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The report has **no** media rows | The media area renders a neutral placeholder; the rest of the page renders normally |
| The signed URL expires while the page is open | The preview shows the neutral placeholder and re-requests a URL on demand; the expired URL is not reused |
| The report has **zero** flags (author auto-hide case) | The flag list renders its empty state ("no flags on this report") and the hide-reason banner explains the author rule; the moderator is not left with an unexplained empty section |
| The report has **many** flags | Every flag is listed — no truncation, no "and N more" — and the list scrolls within the column |
| The description is `null` | No empty gap and no "undefined" text; the description line is omitted |
| The category is `null` | The neutral "uncategorized" placeholder renders in place of the accent tile |
| The uploader's `profiles` row was deleted by the PII purge | The identity block renders the surviving profile id and a "profile deleted" state for the removed fields; the page does not crash |
| The report id in the URL does not exist | The route renders the not-found state (`NOT_FOUND`), not an empty review page |
| A citizen opens `/queue/[reportId]` directly | The console renders the moderator-access-only state and the underlying RPC / function calls return `FORBIDDEN`; no report content is rendered |
| The report was decided by another moderator while the page was open | The submit returns `CONFLICT`; the panel shows the conflict state instead of a second success |
| The signed URL is requested but the storage bucket is unreachable | The media area renders the neutral placeholder; the page's other columns and the decision panel remain usable |
| A flag reason arrives in an unknown enum value | The chip renders the shared "other" / unknown-safe label from i18n; the client never crashes on an unmapped reason |

## Out of Scope

- The restore / remove write, the required-note validation, and the one-row-per-decision guarantee — `003-restore-remove-decision`
- The author-auto-hide batch filter and the queue-side badge — `005-author-auto-hide-batch`
- The audit history view — `006-moderator-audit-log`
- The `moderation_queue` RPC and the `moderation_actions` migration — `bolt-007-moderation-1`
- The `moderation_decide` Edge Function — `bolt-007-moderation-2`
- Editing the report's content, category, or description by a moderator — unit `004` owns the report write path
- A citizen-facing flag composer, appeals, un-remove, or bulk decisions
- Aggregate crime statistics, charts, heatmaps, or hotspot rankings — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- A moderator tier, scoped permissions, or an undo / overturn workflow — FR-MOD-4 keeps one role with full access at MVP

## Implementation

**The report detail screen ships with a signed media preview, the accent tile, the full flag list, and a tested decision panel. The story is `complete`.**

### What ships

- The detail screen exists at `apps/admin/app/queue/[reportId]/page.tsx` (the server route) and `report-detail-client.tsx` (the client), and loads the report through `useReportDetail(reportId)` — a `useQuery` keyed `[...REPORT_DETAIL_QUERY_KEY, reportId]`.
- The decision panel is live: it holds the decision state, calls `useSubmitDecision()`, and the mutation posts to the `moderation_decide` Edge Function through `apps/admin/lib/api.ts`. The Edge Function owns the write and the append-only audit row.
- The report's own action history renders: `formatDecisionLabel(action.decision)` per prior action.

### The signed media preview

This was the story's largest gap and it is now closed.

- **`apps/admin/lib/api.ts` — `signMediaUrl(client, storagePath)`** asks Supabase Storage for a **ten-minute** signed URL on the private `report-media` bucket, and returns `null` rather than throwing when it cannot. The **moderator's own session** and the anon key sign the URL; no service-role credential is involved. The database already permitted this — the `report_media_select_moderator` Storage policy grants a moderator `SELECT` on every object in the bucket (`supabase/migrations/20261105000029_storage_author_token.sql`).
- **`apps/admin/app/queue/[reportId]/media-preview.tsx`** holds the URL in component state. It is never written to a query key, a URL, or a log — the console has no logging at all.
- **The placeholder rule.** A preview that cannot be signed shows a neutral placeholder, never a broken image. The `<img>`/`<video>` element's own `onError` degrades to the same placeholder, so a URL that was signed but has since expired mid-session does not leave a broken image on the page.
- **The re-request.** The placeholder carries a "Try again" control that asks for a **fresh** URL. The expired one is never reused.

### The category accent tile

- **`apps/admin/lib/format.ts` — `formatCategoryAccent(category)`** maps the eleven categories to six accent families (`violet`, `red`, `amber`, `green`, `sky`, `neutral`). A `null` category and an unknown category both fall to `neutral`, so a server that grows a category before the console learns it cannot crash the tile.
- **`apps/admin/app/globals.css`** owns the colours: `.categoryTile` plus one class per family, every one of them an **existing** token custom property. Story `001`'s "no new hex value" rule is honoured — the tile introduces no colour that was not already in the token file.
- **The tile is purely graphical.** It carries no text, because the colour ramps do not invert between themes while the ink ramp does, so a labelled tile would need an ink token that is dark in both themes — and none exists. The category's **name** sits right beside the tile, so the colour is a second signal rather than the only one.

### The guards that now exist

| Criterion | The guard |
|---|---|
| 1 — the signed URL | `apps/admin/lib/api.test.ts` — `signMediaUrl` asks the `report-media` bucket, signs the path it was given, returns the URL, and never signs an empty path |
| 2 — the placeholder and the re-request | `apps/admin/app/queue/[reportId]/media-preview.test.tsx` — an unsignable URL shows the placeholder and renders **no** `<img>`; "Try again" issues a **second** request; a signed URL that fails to load degrades to the placeholder. The causal check was performed: breaking the placeholder branch fails the test |
| 3 — every flag, with its reporter | `report-detail-client.tsx` renders `formatFlagReason(flag.reason)`, `copy.detailFlagReporter` + `flag.flaggerId`, and `formatTimestamp(flag.createdAt)` per flag — no truncation, no "and N more" |
| 4 — the accent tile | `apps/admin/lib/format.test.ts` — every one of the eleven categories gets a family; `null` and an unknown category get `neutral`; violence and property crime are in different families. `apps/admin/lib/designTokens.test.ts` — the tile's colours come from the token file, and a CSS class exists for every family |
| 5 — the uploader identity block | `report-detail-client.tsx` renders the profile id, phone, email, role, and the account state |
| 6 — the identity leaks nowhere | The console has **no** `console.log`/`error`/`warn`/`info` at all; the identity is not in any URL or query key; it lives only in the server payload |
| 7 — no public projection carries it | `supabase/tests/read_models.sql` Test 5g / 5h — the queue carries the uploader, the public feed omits `author_id` |
| 8 — the auto-hide banner | `report-detail-client.tsx` renders `copy.detailAutoHideBanner` when `isAuthorAutoHide(detail.hideReason)` |
| 9 — two choices, a required note, a submit | `apps/admin/app/queue/[reportId]/decision-panel.test.tsx` |
| 10 — the mapped messages | `apps/admin/lib/queries.test.tsx` — the decision panel's error branches; the raw driver message never reaches the screen |

### The two defects this work found and fixed

1. **No signed URL existed anywhere in the console.** The detail screen rendered `media.storagePath` as **text**. The bucket was private and the moderator's policy already allowed the read — only the console never asked. `apps/admin/app/queue/[reportId]/media-preview.tsx` now does.
2. **The flag list omitted the reporter.** The reason and the timestamp were rendered; `flag.flaggerId` was not, so a moderator could see *that* a report was flagged but not *who* flagged it.

### What is still out of scope

- **The console now has a live probe.** `tools/probe-moderation-console.cjs` — **37/37** — calls `moderation_report_detail` over the real PostgREST path with the moderator's own session and asserts the payload the browser receives: the uploader identity block, its account state, the flag reasons and the prior-actions strip. **No acceptance criterion in this story names a live probe**, so its absence never made the story `partial`.
- The restore / remove write's own guarantees belong to story `003`; the audit history view belongs to `006`.
