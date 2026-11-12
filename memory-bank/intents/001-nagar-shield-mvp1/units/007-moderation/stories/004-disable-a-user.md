---
id: 004-disable-a-user
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 004-disable-a-user

## User Story

**As a** Nagar Shield moderator
**I want** to find a user by phone, email, or profile id and disable their account with a written reason
**So that** a persistently abusive account is locked out server-side, and the action is recorded with a justification a reviewer can later read

## Acceptance Criteria

- [ ] **Given** a moderator searches `/users` by a phone number, email, or profile id, **When** the search runs, **Then** the matching account rows are listed with their account state and a per-user report count
- [ ] **Given** the search matches no account, **When** the results render, **Then** the empty state renders and no disable control is offered
- [ ] **Given** the disable form is submitted with an empty or whitespace-only reason, **When** the request is sent, **Then** the response code is `VALIDATION_FAILED`, `profiles.disabled_at` is unchanged, and **no** `moderation_actions` row is written
- [ ] **Given** a non-empty reason and a valid target, **When** `disable_user` completes, **Then** `profiles.disabled_at` is set for the target and **exactly one** `moderation_actions` row is written with `decision = 'disable_user'`, `target_user_id` = the target, `report_id` = null, and `note` = the reason
- [ ] **Given** the target's account is disabled, **When** the citizen opens the app on their next sign-in or session resume, **Then** the message "Your account has been disabled. Contact support." is shown and no write-capable surface is reachable in an enabled state (FR-AUTH-7)
- [ ] **Given** the target's account is disabled, **When** any API write is attempted, **Then** the request is rejected with the error code `AUTH_DISABLED` (FR-AUTH-7)
- [ ] **Given** the target's `profiles.role` is `moderator`, **When** a disable is attempted, **Then** the request is rejected with `FORBIDDEN`, `disabled_at` is unchanged, and **no** `moderation_actions` row is written — **a moderator cannot disable another moderator at MVP**
- [ ] **Given** a disable succeeds, **When** the `/audit` view is opened, **Then** the action appears in the `moderation_actions` history with its decision type, the moderator, the target, the reason, and the timestamp
- [ ] **Given** the target account is already disabled, **When** a disable is attempted again, **Then** the response code is `CONFLICT`, `disabled_at` keeps its original value, and **no** second `moderation_actions` row is written

## Technical Notes

- **`disable_user` is an Edge Function** with the same shape as `moderation_decide`: verify the JWT, re-check `profiles.role = 'moderator'`, validate the target and the reason, then do the write and the audit insert in **one transaction** with the service role. The service-role key stays inside the function — never in the browser bundle.
- **The reason is written to the same `note` column.** `moderation_actions` has one `note` column, so the disable reason is stored there; the note stays required in all three cases, and a disable without a reason is rejected exactly like a decision without a note.
- **`report_id` is null on a `disable_user` row and `target_user_id` is null on a `restore` / `remove` row.** This is why the table carries the extra nullable `target_user_id` FK → `profiles.id`: an audit row that could not name the account it disabled would push identity into free text and break the trail's usefulness.
- **Decision: a moderator cannot disable another moderator.** There is no "are you sure?" override path at MVP — the request is rejected with `FORBIDDEN` and writes nothing. Rationale: FR-MOD-4 keeps a single moderator role with full access at MVP, but an unbounded moderator-to-moderator lockout is an unrecoverable escalation path (a disabled moderator cannot sign in to appeal). Phase 2's trust-and-safety / admin split is where a scoped capability would arrive. The guard is enforced **server-side** in the function; the console additionally hides the disable control on a moderator row as a convenience.
- **The in-app disable gate belongs to unit `002`, not this story.** Unit `002`'s `005-remote-account-disable` owns the copy ("Your account has been disabled. Contact support.") and the client-side disabled state. This story owns the **write** — setting `profiles.disabled_at` — and the server-side `AUTH_DISABLED` enforcement that the gate depends on. The acceptance criteria here assert the observable end-to-end effect; the gate's screen copy and read-only degradation belong to unit `002`.
- **`AUTH_DISABLED` is enforced on the server.** A disabled account's JWT may still be cryptographically valid, so every write path (RLS / RPC guards, Edge Functions) returns `AUTH_DISABLED` with HTTP 403. The client check is a UX convenience; the server is the guarantee.
- **The search is an exact-match lookup on `profiles.phone`, `profiles.email`, or `profiles.id`**, returning only the matching rows. It is not a fuzzy directory and not a bulk listing — the console is a targeted tool, not a user database browser.
- **The per-user report count is moderation context about one account, not an aggregate.** The unit's constraint allows only **per-report** counts (the flag count on one report) and a **per-user** count in the `/users` row. There is no total-crime counter, no distribution, and no chart anywhere on the route.
- **The moderator's identity is taken from the JWT**, so the audit row is always attributable and cannot be forged by the client.
- **All strings go through the shared i18n bundle** (Bangla primary, English secondary). Every interactive control is ≥ 48 × 48 px with an accessible name.
- **Testing.** Supabase-local integration tests cover `disabled_at` being set, the `disable_user` action row carrying the reason as its note, the target's writes then being rejected with `AUTH_DISABLED`, and the moderator-target rejection. A Playwright flow covers `/users` search → disable with a reason → the account state flips to disabled.

## Dependencies

### Requires
- `001-moderator-login-and-queue` — the moderator session and the admin shell the `/users` route renders inside
- Unit `001-foundation` — `packages/shared` (`ApiErrorCode` incl. `AUTH_DISABLED` / `FORBIDDEN` / `VALIDATION_FAILED` / `CONFLICT`, the shared Zod disable schema), the typed Supabase client, and the i18n contract
- Unit `002-identity` — the `profiles` table, the `role` enum, and the `disabled_at` column this story sets; unit `002`'s `005-remote-account-disable` owns the in-app gate that consumes `disabled_at`
- Unit `004-capture` — the `reports` rows whose per-user count is displayed on the account row
- `supabase/migrations/0006_moderation.sql` — the `moderation_actions` table, the `target_user_id` column, the CHECK constraints, the append-only trigger, and the moderator-only RLS policies
- `supabase/functions/disable_user/` — the Edge Function (this unit's `bolt-007-moderation-2`)

### Enables
- `006-moderator-audit-log` — the `disable_user` action is one of the three decision types the audit view filters on

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The reason is whitespace only | `VALIDATION_FAILED`; `disabled_at` unchanged; no action row |
| The target's role is `moderator` | `FORBIDDEN`; `disabled_at` unchanged; no action row; the console hides the disable control on that row |
| The target is already disabled | `CONFLICT`; the original `disabled_at` is preserved (the original disable time and moderator remain the truthful record); no second row |
| The target does not exist | `NOT_FOUND`; nothing is written |
| The moderator disables their own account | `FORBIDDEN` (the target is a moderator); the moderator cannot lock themselves out of the console |
| The search matches multiple accounts with the same partial phone prefix | The search is an exact match, so it returns the single matching row; a partial string returns no rows rather than a fuzzy list |
| The target has no phone but has an email | The account is still found by email and can be disabled |
| The target is soft-deleted (`deleted_at` is set) | The disable sets `disabled_at` alongside it; the two columns are independent and neither is cleared by the other |
| The citizen's app is already open when the disable lands | The next write fails with `AUTH_DISABLED` and the app routes to the disable screen; the disable message is not shown while offline |
| The Edge Function times out mid-transaction | The transaction rolls back — `disabled_at` unchanged and no action row |
| The reason contains sensitive text | The reason is never shown in the citizen app; it stays in the console's audit trail, readable only by moderators |
| The user list request is made with a citizen's JWT | The read is refused server-side (`FORBIDDEN`); the console renders the access-only state and no account rows |

## Out of Scope

- The in-app disable screen, its copy, and the read-only degradation of the citizen surfaces — unit `002`'s `005-remote-account-disable`
- The queue, the review detail, and the restore / remove decision — `001-moderator-login-and-queue`, `002-report-review-detail`, `003-restore-remove-decision`
- The audit log view — `006-moderator-audit-log`
- The `moderation_actions` migration and the append-only trigger — `bolt-007-moderation-1`
- Undisabling an account, re-enabling a user, and the appeal / overturn workflow — not built at MVP
- A moderator tier split, scoped permissions, or a moderator-to-moderator disable override — FR-MOD-4 keeps one role with full access at MVP
- Account deletion and the PII purge — units `002` and `008`
- A user directory browser, a bulk user list, user exports, and CSV reporting
- Aggregate crime statistics, charts, heatmaps, and hotspot rankings — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- Sending the citizen a notification about the disable — no push, email, or in-app notice at MVP
