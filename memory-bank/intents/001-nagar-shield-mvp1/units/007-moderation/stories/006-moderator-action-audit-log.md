---
id: 006-moderator-action-audit-log
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
---

# Story: 006-moderator-action-audit-log

## User Story

**As a** Nagar Shield moderator
**I want** an append-only history of every moderation decision — which report or account, which decision, whose call, what note, and when
**So that** I can verify that each decision was recorded exactly once, justify it long after the queue has moved on, and trust that the record cannot be quietly rewritten

## Acceptance Criteria

- [x] **Given** the `/audit` view is opened, **When** the trail renders, **Then** **every** `moderation_actions` row is listed **newest-first**, and each row shows the **report id**, the **moderator**, the **decision** (`restore` / `remove` / `disable_user`), the **note text**, and the **timestamp**
- [x] **Given** a `disable_user` row is rendered, **When** the row is inspected, **Then** it shows the **target user id** in place of the report id — `report_id` is null on those rows, and the row still names the account it acted on rather than leaving the identity in free text
- [x] **Given** the trail holds more rows than the current page limit, **When** the next page is requested, **Then** the list is **cursor-paginated** — the next page is requested with the cursor returned by the previous response, the rows are appended, and no row is duplicated or skipped
- [x] **Given** the last page is loaded (`next_cursor = null`), **When** the trail renders, **Then** no "Load more" control is shown and an end-of-list state renders instead
- [x] **Given** a row names a report, **When** the row is inspected, **Then** it links to that report's **current state** — its review detail, which renders its current `moderation_status` — and the link never carries the report's contents in the URL
- [x] **Given** the audit view renders any row, **When** its controls are inspected, **Then** there is **no delete affordance and no edit affordance** — the trail is read-only, and a correction is a **new row**, never a mutation of an existing one
- [x] **Given** a decision is made from the queue or the review detail, **When** the moderator opens `/audit`, **Then** the new row is present **immediately** — the post-decision invalidation refreshes the audit query, so the decision is observable in the trail without a manual reload
- [x] **Given** a caller whose JWT does not belong to a `profiles.role = 'moderator'` account, **When** the audit read is made, **Then** the response code is `FORBIDDEN` and **no** trail rows are returned in any shape — the audit view is moderator-only (FR-MOD-1)
- [x] **Given** `moderation_actions` holds no rows, **When** `/audit` renders, **Then** an **explicit empty state** is rendered — "no moderation decisions recorded yet" — never a blank table, an empty grid, or a container that renders nothing
- [x] **Given** the trail renders a row, **When** its payload is inspected, **Then** it contains **no raw GPS coordinates and no media payloads** — it references report ids, user ids, the decision, the note, and the timestamp, and never the report's `lat` / `lng`, description, or media
- [x] **Given** a row's note is inspected, **When** it is rendered, **Then** the note text is shown **as written** — trimmed, but never edited, redacted, summarised, or silently truncated — because every decision was written with a non-empty note (FR-MOD-3)
- [x] **Given** the trail's write paths are inspected, **When** `moderation_actions` is checked, **Then** there is **no `UPDATE` and no `DELETE`** on it — RLS grants moderators `SELECT` and `INSERT` only, and the append-only trigger rejects any mutation attempt, so the trail cannot be rewritten from any path

## Technical Notes

- **`moderation_actions` is the source of truth.** The audit view is a **read** of the table this unit owns; it creates no store, no copy, and no denormalised index of decisions. Every row rendered is the row that `moderation_decide` or `disable_user` wrote **in the same transaction** as the state change it describes, so a row can never exist without its transition and a transition can never happen without its row.
- **The read path is moderator-only, at the database.** The view reads through a **moderator-only RPC** or a **PostgREST `select` under RLS**; either way the policy grants `SELECT` only to `profiles.role = 'moderator'`, and a citizen's request returns `FORBIDDEN` with no rows. The console's route guard is a UX affordance, never the enforcement point.
- **The note is always present.** `note` is `NOT NULL` with the DB CHECK `char_length(trim(note)) > 0`, so a rendered row can never carry an empty justification; the `disable_user` reason is written to the same column (FR-MOD-3). The view renders the stored text as written — it never re-writes, truncates, or re-labels it.
- **The trail is append-only, and the view mirrors that.** The table grants `SELECT` and `INSERT` and **nothing** on `UPDATE` / `DELETE`, and a `BEFORE UPDATE OR DELETE` trigger raises on any attempt to mutate a row. The view therefore ships **no edit, no delete, and no undo** control — there is no element in the DOM that could issue one. A correction is a **new row** with its own note; the earlier row stays visible forever.
- **The ordering is `(created_at DESC, id DESC)` and the cursor is opaque.** The client sends `cursor` (nullable) and `limit` (default 20, max 100); the response carries `next_cursor`. The cursor is an opaque composite of `created_at` + `id`, not an offset — an offset would skip or duplicate rows when a decision is written while the moderator is paging.
- **`created_at` is server-side.** The timestamp is `now()` at insert, inside the decision transaction — never a client clock and never a browser-supplied value — so the trail's ordering is trustworthy and identical for every moderator.
- **`moderator_id` comes from the JWT.** Every row this unit writes populates it from the verified token, so the rendered moderator column is the account that actually decided. The FK is `ON DELETE SET NULL`, so a purged moderator account leaves the row with a null moderator that renders as a "moderator account deleted" state — the row, the decision, the note, and the timestamp all survive.
- **The row links to the report's current state, not to a snapshot.** The link resolves to the review detail for the referenced report id, which renders the report's **current** `moderation_status`; the audit row itself carries no status. A `disable_user` row has a null `report_id` and links to the target account's row on `/users` instead.
- **The audit payload carries no report content.** The row references `report_id`, `target_user_id`, `moderator_id`, `decision`, `note`, and `created_at`. It does **not** carry `lat` / `lng`, `area_hierarchy`, `description`, `public_visibility`, media paths, or signed URLs — the trail points at a report, it never duplicates the report's contents or its raw coordinates. The coding standard is explicit: *"Never log raw GPS coordinates, media payloads, passwords, or tokens."*
- **The note is plain text and is rendered as plain text.** It is never interpolated as markup, never turned into a link, and never used to construct a URL.
- **Post-decision invalidation is what makes the trail immediate.** On a successful `moderation_decide` or `disable_user`, the client invalidates the queue, the detail, and the audit query keys; the audit view's first page is re-read and the new row is at the top because it carries the newest `created_at`. The audit view never optimistically inserts a row — it re-reads the table.
- **The trail has filters, not edits.** Filtering by decision (`restore` / `remove` / `disable_user`) and by report id narrows the read; it never writes and never changes what the trail contains.
- **The empty state is a first-class render.** A trail with no rows renders an explicit "no moderation decisions recorded yet" state with the shared empty-state treatment — never a blank table, an empty grid, or a spinner that never resolves.
- **The layout reuses the shared token set.** The view is the admin's list + rail layout from story `001`, built from the web-safe CSS custom-property subset of `docs/design/design-tokens.md` (`--r-md`, `--shadow-card`, `--ink-900`, `--surface-white`). No new hex value, no third-party UI kit, and no chart.
- **i18n is a hard requirement.** Every string goes through the shared bundle contract from unit `001`, with Bangla primary (native-speaker reviewed) and English secondary. Suggested keys: `moderation.audit.title`, `moderation.audit.column.report`, `moderation.audit.column.moderator`, `moderation.audit.column.decision`, `moderation.audit.column.note`, `moderation.audit.column.timestamp`, `moderation.audit.decision.restore`, `moderation.audit.decision.remove`, `moderation.audit.decision.disableUser`, `moderation.audit.empty.title`, `moderation.audit.empty.body`, `moderation.audit.loadMore`, `moderation.audit.endOfList`, `moderation.audit.moderatorDeleted`, `moderation.audit.reportUnavailable`.
- **Accessibility.** Every interactive control (the filter selects, "Load more", the report link) is ≥ 48 × 48 px with an accessible name; the note cell wraps rather than truncating silently, the table's header cells are scoped, and the token contrast pairs are verified at WCAG AA in both themes.
- **Testing.** Supabase-local integration tests cover the moderator-only select, the citizen-`FORBIDDEN` negative RLS case, the newest-first ordering, the cursor pagination, and the append-only trigger rejecting an `UPDATE` and a `DELETE`. A Playwright flow covers login → queue → decide with a note → the row appears at the top of `/audit` → the view offers no edit or delete control.

## Dependencies

### Requires
- `003-restore-remove-decision` — the `restore` / `remove` rows and the required note the trail lists
- `004-disable-a-user` — the `disable_user` rows and the target-account link the trail renders
- `001-moderator-login-and-queue` — the moderator session, the admin shell, and the `/audit` route this view renders inside
- Unit `001-foundation` — `packages/shared` (`ApiErrorCode` incl. `FORBIDDEN` / `AUTH_REQUIRED`, the i18n key contract), the typed Supabase client, the web-safe token subset, and the TanStack Query setup
- Unit `002-identity` — the `profiles` rows that resolve the moderator and the disabled target
- Unit `004-capture` — the `reports` rows whose current state the report link resolves to
- `supabase/migrations/0006_moderation.sql` — the `moderation_actions` table, its CHECK constraints, the append-only trigger, and the moderator-only RLS policies (this unit's `bolt-007-moderation-1`)

### Enables
- `003-restore-remove-decision` — the trail is where the "exactly one row per decision" guarantee is observed
- `004-disable-a-user` — the trail is where a disable is verified as recorded with its reason

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The trail has **no rows at all** | The explicit empty state renders — no blank table, no zero-height container, no endless spinner |
| The trail has exactly one row | The row renders and no "Load more" control is shown |
| `next_cursor` is `null` on the first page | The end-of-list state renders and no pagination request is made |
| A decision is written while the moderator is paging | The cursor pagination never skips or duplicates — the list is re-read from the server and the new row appears at the top of the first page |
| A moderator's account is deleted by the PII purge | The row survives with `moderator_id` null (the FK is `ON DELETE SET NULL`); the moderator cell renders a "moderator account deleted" state and the decision, note, and timestamp remain readable |
| The referenced report was deleted or purged | The row survives with `report_id` null; the report cell renders a "report unavailable" state and the link is disabled — the decision is never lost |
| The target of a `disable_user` row was deleted | The row survives with `target_user_id` null; the target cell renders the deleted state and the decision and reason remain readable |
| The note contains Bangla text, punctuation, or a very long string | The note renders as written and wraps; it is never silently truncated and never interpolated as markup |
| The note contains something that looks like a URL | It renders as plain text — never an anchor, never fetched, never placed in a URL |
| A row arrives with an unknown `decision` value | The cell renders the shared unknown-safe label from i18n; the client never crashes on an unmapped value |
| A citizen calls the audit read directly | The server refuses with `FORBIDDEN` and returns no rows; the console renders the moderator-access-only state |
| The moderator's session expires while `/audit` is open | The next call returns `AUTH_REQUIRED` and the console routes to `/login`; the trail is not rendered with stale rows |
| An `UPDATE` or `DELETE` is attempted on an existing row | The database rejects it — the append-only trigger raises; the view exposes no control that could issue one |
| Two decisions land within the same millisecond | The `(created_at DESC, id DESC)` ordering and the composite cursor keep the order total and stable; no row is duplicated or skipped |
| The audit payload is inspected | It carries ids, the decision, the note, and the timestamp — never raw coordinates, description, or media payloads |

## Out of Scope

- The restore / remove decision, the required-note validation, and the one-row-per-decision guarantee — `003-restore-remove-decision`
- The disable-a-user write and its reason — `004-disable-a-user`
- The queue, the hide-reason badge, and the author-auto-hidden group — `001-moderator-login-and-queue`, `005-author-auto-hide-queue`
- The `moderation_actions` migration, the CHECK constraints, the append-only trigger, and the RLS policies — `bolt-007-moderation-1`
- Editing, deleting, annotating, or expiring a recorded decision — the trail is append-only; a correction is a new row
- Retrying, rolling back, or "un-doing" a decision from the audit view — `remove` is permanent (FR-ALERTS-9)
- An appeal / overturn workflow, a second moderator tier, scoped permissions, and a read-only moderator role — FR-MOD-4 keeps one role with full access at MVP
- CSV / Excel export, a scheduled digest email, and a moderation-event webhook
- Any aggregate crime statistics, charts, decision-rate trends, per-moderator leaderboards, and "total decisions" counters — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- Surfacing the uploader's unmasked identity in the trail — the identity stays in the review detail's server payload; the trail carries ids
- Push notifications for a new audit row — no FCM fanout in Phase 1

## Implementation

**The audit trail ships, is cursor-paginated, is moderator-only, is append-only, and the post-decision invalidation the story names now works. The story is `complete`.**

### What ships

- The trail is written by the RPC in the same transaction as the decision: `supabase/migrations/20261105000003_functions.sql` inserts into `public.moderation_actions`.
- The trail is **append-only**: `supabase/migrations/20261105000008_moderation_integrity.sql:17` defines `public.moderation_actions_append_only()`, and migration `016` re-establishes it. A decision row cannot be updated or deleted.
- The read model is **cursor-paginated** with the same composite cursor format as the other feeds: `supabase/migrations/20261105000013_moderation_console_read_models.sql` defines `public.moderation_audit_feed(p_cursor, p_limit, p_decision)`, ordered by `(created_at DESC, id DESC)`.
- The feed is **moderator-only**: the function raises `FORBIDDEN` unless `public.is_moderator()`, execute is revoked from `public` and `anon` and granted only to `authenticated`, and the decision filter is constrained to the three real decisions (`restore`, `remove`, `disable_user`).
- **The trail carries no report contents.** The comment in the migration is explicit: *"It carries **no** coordinates, **no** description, and **no** media — the trail points at a report, it never duplicates the report's contents."* — and now a **test** holds that line.
- The console screen exists at `apps/admin/app/audit/page.tsx` (the server route) and `audit-client.tsx` (the client), and reads through `useAuditTrail(filter)` — a `useInfiniteQuery` keyed `[...AUDIT_QUERY_KEY, filter]`.
- **The invalidation is explicit, by key.** `useSubmitDecision().onSuccess` awaits `AUDIT_QUERY_KEY` alongside the queue and the detail, and `useDisableAccount().onSuccess` awaits it too. The audit view's first page is re-read and the new row is at the top because it carries the newest `created_at`. The view never optimistically inserts a row — it re-reads the table.

### The guards that now exist

| Criterion | The guard |
|---|---|
| 1 — every row, newest-first, with all five fields | `apps/admin/app/audit/audit-client.tsx` renders the target, the moderator, the decision, the note, and the timestamp per row; `supabase/tests/read_models.sql` Test 9e (the trail is newest-first) |
| 2 — a `disable_user` row names the target user id | `renderTarget()` in `audit-client.tsx` renders `target_user_id` when `report_id` is null |
| 3 — cursor pagination appends | `apps/admin/lib/queries.test.tsx` — the audit key carries the filter, and `getNextPageParam` returns the server's `next_cursor` |
| 4 — the end-of-list state | `audit-client.tsx` renders `copy.auditEnd` and no "Load more" when `hasNextPage` is false |
| 5 — the link to the report's current state | `renderTarget()` links to `/queue/${reportId}` — the id only, never the report's contents |
| 6 — no edit or delete affordance | `audit-client.tsx` renders no mutation control at all; `supabase/tests/read_models.sql` Test 8b/8c (the row cannot be updated or deleted) |
| 7 — the new row is present immediately | `apps/admin/lib/queries.test.tsx` — the decision mutation invalidates the audit key. The **seed uses literal keys**, so a key-shape drift cannot make the test self-consistent |
| 8 — moderator-only | `supabase/tests/read_models.sql` Test 9a — a citizen calling `moderation_audit_feed` is refused |
| 9 — the explicit empty state | `audit-client.tsx` renders `EmptyState` with `copy.auditEmptyTitle` / `copy.auditEmptyBody` |
| 10 — no GPS, no media, no report contents | `supabase/tests/read_models.sql` Test 9b and 9c — the payload carries **exactly** nine keys (`id`, `report_id`, `moderator_id`, `moderator_display_name`, `target_user_id`, `decision`, `note`, `created_at`) and no `lat`, `lng`, `description`, `media`, `area_hierarchy`, `public_visibility`, or `storage_path`. The causal check was performed: adding a `description` key to the payload fails both tests |
| 11 — the note is rendered as written | `audit-client.tsx` renders `action.note` verbatim in a `.tableNote` cell that wraps; `supabase/tests/read_models.sql` Test 9d |
| 12 — no `UPDATE`, no `DELETE` | `supabase/migrations/20261105000008_moderation_integrity.sql` and `supabase/tests/write_guards.sql` (103 assertions, B1–B6) |

### A note on the `pg_trigger_depth()` allowance

`supabase/migrations/20261105000016_purge_integrity.sql` allows an `UPDATE`/`DELETE` on `moderation_actions` when `pg_trigger_depth() > 1`. That allowance is **deliberate and measured**, not a gap: it permits only Postgres's own `ON DELETE SET NULL` referential action when a purged moderator's account is removed. A direct `UPDATE` or `DELETE` against a row is refused by the append-only trigger.

The regression guards for it live in **`supabase/tests/write_guards.sql`** (B1–B6), not in `business_rules.sql` — the migration's comment names the wrong file. That comment is worth correcting in a later pass; it does not affect the guarantee, only the pointer to it.

### The two defects this work found and fixed

1. **The admin declared `@tanstack/react-query` and never imported it.** The audit page fetched on mount and on its own "Load more" click, and — critically — **a decision made in another screen did not invalidate the trail**. A moderator who decided a report and then opened `/audit` could be looking at a feed fetched *before* the decision. The console is now on `apps/admin/lib/queries.ts`.
2. **The "no contents" guarantee was enforced by convention, not by a test.** The SQL comment stated the rule and the query selected only the metadata columns, but nothing asserted that a future column addition would not widen the payload. `supabase/tests/read_models.sql` Test 9b now pins the **exact** key set — not "does not contain `lat`", but "contains these eight keys and no others".

### What is still out of scope

- **The console now has a live probe.** `tools/probe-moderation-console.cjs` — **37/37** — reads `moderation_audit_feed` over the real PostgREST path with the moderator's own session and asserts the payload the browser receives: **exactly** the eight specified keys, no report contents, the decision attributed to the moderator who made it (from the JWT, not the body), the reason as written, the trail newest-first, and the decision filter applied **server-side**. **No acceptance criterion in this story names a live probe**, so its absence never made the story `partial`.
- Editing, deleting, expiring, or undoing a recorded decision; the aggregates; CSV export; and the push notification are all excluded by the story's own "Out of Scope".
