---
id: 003-restore-remove-decision
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 003-restore-remove-decision

## User Story

**As a** Nagar Shield moderator
**I want** to restore or remove a flagged report with a written note, and have that decision recorded exactly once
**So that** every moderation outcome is justified, attributable, and irreversible

## Acceptance Criteria

- [ ] **Given** the note field contains only whitespace, **When** the decision is submitted, **Then** the response code is `VALIDATION_FAILED`, **no** `moderation_actions` row is written, and the report's `moderation_status` is unchanged (FR-MOD-3)
- [ ] **Given** a note with at least one non-whitespace character, **When** a `restore` decision is submitted, **Then** the report's `moderation_status` becomes `restored` and the report is returned by the public `alerts_feed` projection again (FR-ALERTS-8)
- [ ] **Given** a note with at least one non-whitespace character, **When** a `remove` decision is submitted, **Then** the report's `moderation_status` becomes `removed` and the report is **never** returned by the public feed again, including on a later re-query (FR-ALERTS-9)
- [ ] **Given** a decision is accepted, **When** the write completes, **Then** **exactly one** `moderation_actions` row exists for that decision, carrying `report_id`, `moderator_id`, `decision`, `note`, and `created_at` — and the row count for the report is exactly 1, not 0 and not 2
- [ ] **Given** a decision is accepted, **When** the action insert and the status transition are inspected, **Then** both occur in **one transaction** — a row can never exist without its transition and a transition can never happen without its row
- [ ] **Given** the report is already `restored` or `removed`, **When** a decision is submitted for it, **Then** the response code is `CONFLICT`, the report's status is unchanged, and **no** second `moderation_actions` row is written
- [ ] **Given** a decision succeeds, **When** the client resolves, **Then** the queue, the report detail, and the audit queries are invalidated, and the decided report no longer appears in the `hidden_pending_review` queue
- [ ] **Given** a caller whose JWT does not belong to a `profiles.role = 'moderator'` account, **When** `moderation_decide` is called directly, **Then** the response code is `FORBIDDEN` and no row is written
- [ ] **Given** a request body containing a `moderator_id`, **When** the decision is processed, **Then** the stored `moderator_id` is taken from the **JWT**, not from the body — a client cannot write an action in another moderator's name
- [ ] **Given** a `remove` decision is submitted, **When** the confirmation is shown before submission, **Then** the moderator is told the action is permanent, and the `remove` button label states that it is permanent

## Technical Notes

- **`moderation_decide` is an Edge Function**, because it needs the service role to write the audit row and transition the report **atomically**. The service-role key lives only inside the function (and CI) — never in the browser bundle.
- **The note is the required floor, enforced twice.** The client blocks the submit when the note is blank after trimming; the DB CHECK `char_length(trim(note)) > 0` is the enforcement point. The shared Zod schema additionally caps the note at **500 characters** (an app rule, not a DB constraint) and trims before sending.
- **One transaction, two writes.** The function opens a single transaction that (1) inserts the `moderation_actions` row and (2) transitions `reports.moderation_status`. A failure at either step rolls both back, so a partial state is impossible. This is asserted by an integration test that forces a failure after the insert.
- **Exactly one row per decision.** The `CONFLICT` guard is a conditional update (`UPDATE … WHERE moderation_status = 'hidden_pending_review'`), and the insert only runs when the update affected a row. A report already in `restored` / `removed` therefore returns `CONFLICT` and writes nothing.
- **`moderator_id` comes from the verified JWT**, never from the request body — this is the anti-impersonation rule for the audit trail.
- **The decision vocabulary is closed.** `decision ∈ { restore, remove }`; the DB CHECK on `moderation_actions.decision` accepts exactly `{ restore, remove, disable_user }`. An invalid decision is rejected with `VALIDATION_FAILED`.
- **`restore` sets `moderation_status = 'restored'`**, and the public read model treats `moderation_status IN ('visible','restored')` as visible — that is the whole mechanism behind FR-ALERTS-8.
- **`remove` sets `moderation_status = 'removed'`**, which no public projection selects. There is no un-remove, no override, and no bulk revert at MVP.
- **Post-decision invalidation is explicit.** On success the client calls `queryClient.invalidateQueries` for the queue, the detail, and the audit query keys. The decided row leaves the queue on the next fetch; it is not optimistically removed from the cache without a server round-trip.
- **There are no bulk actions.** Every decision is per report with a per-decision note; "restore all" and mass-remove would make the required note meaningless (unit constraint).
- **The audit row and the transition are permanent.** `moderation_actions` is append-only: RLS grants moderators `SELECT` and `INSERT` and grants nothing on `UPDATE` / `DELETE`, and a `BEFORE UPDATE OR DELETE` trigger raises on any mutation attempt.
- **Error envelope.** The function returns the uniform `{ "data": { "report_id", "decision", "moderation_status", "action_id", "created_at" } }` / `{ "error": { "code", "message", "details" } }` shape; the client maps `code` → an i18n string and never renders the raw message.
- **Testing.** Supabase-local integration tests cover the empty-note rejection writing no row, `restore` → `restored`, `remove` → `removed`, the double-decision `CONFLICT`, and the one-row-per-decision guarantee. A Playwright flow covers login → queue → detail → empty note rejected → note accepted → the report leaves the queue and appears in the audit view.

## Dependencies

### Requires
- `002-report-review-detail` — the decision panel that submits the call
- `001-moderator-login-and-queue` — the moderator session, the queue query, and the post-decision invalidation target
- Unit `001-foundation` — `packages/shared` (`ModerationStatus`, `ApiErrorCode` incl. `VALIDATION_FAILED` / `FORBIDDEN` / `CONFLICT`, the shared Zod decision schema), the TanStack Query setup, and the i18n contract
- Unit `002-identity` — the `profiles.role` the function re-checks, and the JWT whose subject becomes `moderator_id`
- Unit `004-capture` — the `reports.moderation_status` column and the status CHECK this transition writes
- Unit `006-alerts` — the public `alerts_feed` projection that verifies the restore / remove effect
- `supabase/migrations/0006_moderation.sql` — the `moderation_actions` table, its CHECK constraints, the append-only trigger, and the moderator-only RLS policies
- `supabase/functions/moderation_decide/` — the Edge Function (this unit's `bolt-007-moderation-2`)

### Enables
- `006-moderator-audit-log` — the accepted decision is the row the audit view lists
- `004-disable-a-user` — the same one-transaction / one-row pattern is reused for the disable action

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The note is a single space or a tab | Treated as empty after trimming → `VALIDATION_FAILED`, no row, no status change |
| The note is exactly 500 characters | Accepted; the note is stored trimmed |
| The note is 501 characters | Rejected client-side by the shared Zod schema with a field error; the server-side trim/cap guard is the backstop |
| The note is Bangla text with trailing spaces | Trimmed before sending; the stored note has no leading or trailing whitespace |
| The submit button is double-clicked | The second call returns `CONFLICT` (the first already moved the status) and writes no second row; the UI disables the submit while the request is in flight |
| The network drops after the transaction committed | The moderator sees an error, retries, and gets `CONFLICT`; the audit view shows exactly one row — the decision was recorded once |
| The network drops before the transaction committed | The retry succeeds and writes exactly one row; no orphan row exists |
| The report was restored by another moderator moments earlier | `CONFLICT`; the panel shows the already-decided state and no row is added |
| The report was removed by another moderator moments earlier | `CONFLICT`; the panel shows the already-decided state and no row is added |
| A `restore` decision is submitted on a report whose public visibility was `anonymous` | The report reappears in the public feed with its own `public_visibility` value; restoring never changes the visibility setting |
| The request body contains an extra unknown field | It is ignored by the shared Zod schema; it never reaches the database |
| The caller's JWT is valid but the `profiles` row is missing | The role check cannot resolve to `moderator` → `FORBIDDEN`, no row written |
| The Edge Function times out during the transaction | The transaction rolls back — no row and no transition; the client shows a retryable error mapped from the stable code |

## Out of Scope

- The review detail page itself, the media preview, and the flag-reason list — `002-report-review-detail`
- The queue list, the hide-reason badge, and the login flow — `001-moderator-login-and-queue`
- The author-auto-hide badge and batch filter — `005-author-auto-hide-batch`
- Disabling a user — `004-disable-a-user`
- The audit log view — `006-moderator-audit-log`
- The `moderation_actions` migration, the append-only trigger, and the RLS policies — `bolt-007-moderation-1`
- Bulk decisions, "restore all", mass-remove, un-remove, appeals, and overturns
- Editing the report's content, category, or description
- Any aggregate crime statistics or moderation dashboard — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- A second moderator tier, scoped permissions, or a read-only moderator — FR-MOD-4 keeps one role with full access at MVP
