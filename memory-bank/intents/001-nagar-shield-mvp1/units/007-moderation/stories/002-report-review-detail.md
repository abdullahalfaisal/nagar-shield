---
id: 002-report-review-detail
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 002-report-review-detail

## User Story

**As a** Nagar Shield moderator
**I want** a single wide review screen that shows the report's media, every flag reason with who raised it and when, and the uploader's identity
**So that** I can judge the report on its merits before deciding to restore or remove it, instead of guessing from a list row

## Acceptance Criteria

- [ ] **Given** a moderator opens `/queue/[reportId]` for a report that has media, **When** the left column renders, **Then** the media preview is loaded through a **short-lived signed Storage URL** and the bucket itself is never public
- [ ] **Given** the signed URL has expired or the media row is missing, **When** the preview area renders, **Then** a neutral placeholder is shown — never a broken image — and the signed URL is re-requested on demand
- [ ] **Given** the report has one or more flags, **When** the right column renders the flag list, **Then** **every** flag row is shown with its reason, its reporter, and its timestamp, with no truncation and no "and N more" (FR-MOD-2)
- [ ] **Given** the report has a `description` and a `category`, **When** the report meta renders, **Then** the description is rendered as plain text and the category is rendered with its shared accent tile; a `null` category renders the neutral "uncategorized" placeholder
- [ ] **Given** the report's uploader has a `profiles` row, **When** the uploader identity block renders, **Then** the profile id, registered phone, and email are present and the account state is shown (FR-MOD-2)
- [ ] **Given** the uploader's identity was rendered, **When** the page source, the URL, the query keys, and the logs are inspected, **Then** the unmasked identity appears in **none** of them — it exists only in the server response payload
- [ ] **Given** the public feed and every public projection, **When** they are queried, **Then** the uploader's identity is **absent** from the payload — the identity is server-side only and is never exposed on a public surface
- [ ] **Given** the report was moved to `hidden_pending_review` by the author auto-hide rule, **When** the detail renders, **Then** the full-width hide-reason banner explains in plain language that the author rule (5 flagged reports in 24 h) caused the hide, not the 3-flag threshold (FR-ALERTS-11)
- [ ] **Given** the decision panel renders, **When** it is inspected, **Then** it offers exactly two choices — `restore` and `remove` — together with a required note field and a submit control
- [ ] **Given** the decision call fails, **When** the response code is `VALIDATION_FAILED`, `FORBIDDEN`, or `CONFLICT`, **Then** the panel renders the matching mapped message for that code — never a raw Postgres or server error string

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

**The report detail screen ships with a working decision panel. The story is not `complete` because the query invalidation the story names is missing — the admin has no TanStack Query — and there is no live probe for the console.**

### What ships

- The detail screen exists at `apps/admin/app/queue/[reportId]/page.tsx` and loads the report through `fetchReportDetail(getBrowserClient(), reportId)` (`page.tsx:52`).
- The decision panel is live: `page.tsx:227` defines `DecisionPanel`, `page.tsx:236` holds the decision state, `page.tsx:258` calls `submitDecision(getBrowserClient(), { reportId, decision, note: trimmedNote })`, and `page.tsx:260` calls `onDecided()` afterwards so the screen refreshes.
- The decision reaches the server through the Edge Function, not a service-role key in the browser. `apps/admin/lib/api.ts` is the only client, and `supabase/functions/moderation-decide/index.ts:10` states the contract: *"The RPC owns the write and the append-only audit row."*
- The report's own action history renders: `page.tsx:202` shows `formatDecisionLabel(action.decision)` per prior action.

### The gaps

- **No query invalidation.** The story asks for the queue and detail queries to be invalidated after a decision. The admin has **no TanStack Query** — `grep -rn "useQuery|useMutation|QueryClient" apps/admin` returns zero hits, despite `@tanstack/react-query` being declared at `apps/admin/package.json:17`. The refresh is the manual `onDecided()` callback (`page.tsx:260`). That works for the one screen that calls it, and it is exactly the kind of thing that is forgotten: **nothing invalidates the audit trail**, so a moderator who decides a report and then opens `/audit` sees the decision only if the audit page happens to re-fetch. The manual reload is per-call-site, and there is no test that would notice a missing one.

- **No live probe for the console.** The moderation function is covered by `tools/smoke-functions.cjs`, but nothing proves the console reaches it and that the audit row appears in the trail the console shows.

- **No test on the decision panel.** Nothing asserts that a decision cannot be submitted without a note, that the note is trimmed, or that the error branches render the right message.

### What closing this needs

1. The admin on TanStack Query, with the decision mutation invalidating the queue, the detail, and the audit queries by key — one invalidation covering all three, which is what a manual callback cannot guarantee.
2. A live probe: sign in as a moderator, open a report, decide it, and assert the audit trail contains the decision.
3. A test on the note-required rule and the error branches.
