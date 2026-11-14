---
id: 004-disable-a-user
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
---

# Story: 004-disable-a-user

## User Story

**As a** Nagar Shield moderator
**I want** to find a user by phone, email, or profile id and disable their account with a written reason
**So that** a persistently abusive account is locked out server-side, and the action is recorded with a justification a reviewer can later read

## Acceptance Criteria

- [x] **Given** a moderator searches `/users` by a phone number, email, or profile id, **When** the search runs, **Then** the matching account rows are listed with their account state and a per-user report count
- [x] **Given** the search matches no account, **When** the results render, **Then** the empty state renders and no disable control is offered
- [x] **Given** the disable form is submitted with an empty or whitespace-only reason, **When** the request is sent, **Then** the response code is `VALIDATION_FAILED`, `profiles.disabled_at` is unchanged, and **no** `moderation_actions` row is written
- [x] **Given** a non-empty reason and a valid target, **When** `disable_user` completes, **Then** `profiles.disabled_at` is set for the target and **exactly one** `moderation_actions` row is written with `decision = 'disable_user'`, `target_user_id` = the target, `report_id` = null, and `note` = the reason
- [x] **Given** the target's account is disabled, **When** the citizen opens the app on their next sign-in or session resume, **Then** the message "Your account has been disabled. Contact support." is shown and no write-capable surface is reachable in an enabled state (FR-AUTH-7)
- [x] **Given** the target's account is disabled, **When** any API write is attempted, **Then** the request is rejected with the error code `AUTH_DISABLED` (FR-AUTH-7)
- [x] **Given** the target's `profiles.role` is `moderator`, **When** a disable is attempted, **Then** the request is rejected with `FORBIDDEN`, `disabled_at` is unchanged, and **no** `moderation_actions` row is written — **a moderator cannot disable another moderator at MVP**
- [x] **Given** a disable succeeds, **When** the `/audit` view is opened, **Then** the action appears in the `moderation_actions` history with its decision type, the moderator, the target, the reason, and the timestamp
- [x] **Given** the target account is already disabled, **When** a disable is attempted again, **Then** the response code is `CONFLICT`, `disabled_at` keeps its original value, and **no** second `moderation_actions` row is written

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

## Implementation

**The disable-user flow ships, with the role check, the `NOT_FOUND`/`CONFLICT` distinctions, the write guard, the invalidation, and the citizen-side message all in place. The story is `complete`.**

### What ships

- The users screen exists at `apps/admin/app/users/page.tsx` (the server route) and `users-client.tsx` (the client), and the disable call goes through the sanctioned path: `useDisableAccount()` → `disableAccount(getBrowserClient(), { userId: account.id, note: trimmedNote })`, which posts to the `disable_user` Edge Function.
- **The refusals are distinguished on screen.** `disableErrorMessage` in `apps/admin/lib/queries.ts` branches on the error code: `VALIDATION_FAILED` → `copy.decisionNoteRequired`, `FORBIDDEN` → `copy.usersDisableForbidden`, `CONFLICT` → `copy.errorConflict`, `AUTH_DISABLED` → `copy.errorForbidden`, `AUTH_REQUIRED` → `copy.errorAuthRequired`, and everything else → `copy.errorGeneric`. The `FORBIDDEN` split is deliberate: in the disable panel it means *a moderator cannot be disabled*, not *you lack permission*.
- **A moderator row carries no disable control.** `users-client.tsx` renders `copy.usersDisableForbidden` in place of the form when the target's role is `moderator`.
- The **role check** is server-side: the function refuses a non-moderator target with `FORBIDDEN` before the write, and `NOT_FOUND` and `CONFLICT` are distinguished from a generic failure.
- **A disabled account is guarded from writing.** Migration `supabase/migrations/20261105000019_disabled_account_write_guard.sql` blocks the writes, and `20261105000016_purge_integrity.sql` keeps the trail honest.
- **The invalidation is explicit, by key.** `useDisableAccount().onSuccess` awaits `USERS_QUERY_KEY` and `AUDIT_QUERY_KEY`.
- The bulk-action guard exists: `apps/admin/lib/noBulkActions.test.ts` asserts the console offers no bulk disable — the FR-NG-3 boundary.

### The citizen-side message

Criterion 5 names an **exact string**: *"Your account has been disabled. Contact support."* (FR-AUTH-7 in `prd.md`).

The citizen app had a disable screen with a *different* message — *"This account has been disabled, so it can no longer send reports or share your location."* — and the PRD's literal appeared **nowhere in the repository**. The message is now the PRD's string, as a single fixed i18n key with a Bangla primary:

- `apps/mobile/src/shared/i18n/en.ts` — `disabled.message: 'Your account has been disabled. Contact support.'`
- `apps/mobile/src/shared/i18n/bn.ts` — the Bangla primary
- `apps/mobile/app/(auth)/account-disabled.tsx` — the screen renders it as the subtitle

It is a **fixed** message. It never embeds the moderator's reason, the disabling timestamp, or any identifier — the reason lives in the moderator console's audit trail and nowhere else.

### The guards that now exist

| Criterion | The guard |
|---|---|
| 1 — the search lists rows | `users-client.tsx` renders each match with its account state chip and the per-user report count |
| 2 — the empty state | `users-client.tsx` renders `EmptyState` when the search matches nothing; no disable control is offered |
| 3 — a blank reason writes nothing | the submit is disabled when the trimmed reason is empty, and the DB CHECK rejects it; `supabase/tests/business_rules.sql` |
| 4 — exactly one row, `report_id` null | `tools/smoke-functions.cjs` and `supabase/tests/read_models.sql` Test 8a |
| 5 — the citizen sees the message | `apps/mobile/src/shared/i18n/disabledAccountCopy.test.ts` — the English string **is** the PRD literal; the Bangla bundle carries it; it is a fixed string with no reason, no identifier, and no timestamp; it never claims the account was deleted; it points at support |
| 6 — `AUTH_DISABLED` on every write | `supabase/migrations/20261105000019_disabled_account_write_guard.sql` and `supabase/tests/write_guards.sql` (103 assertions) |
| 7 — a moderator cannot disable a moderator | the Edge Function refuses before the write; `tools/smoke-functions.cjs`; the console hides the control as a convenience |
| 8 — the action appears in `/audit` | `apps/admin/app/audit/audit-client.tsx` renders the decision type, the moderator, the target, the reason, and the timestamp; the invalidation is in `apps/admin/lib/queries.test.tsx` |
| 9 — `CONFLICT` on a re-disable | `tools/smoke-functions.cjs` and `supabase/tests/moderation_conflicts.sql` |

### The three defects this work found and fixed

1. **The admin declared `@tanstack/react-query` and never imported it.** The users list was refreshed by a hand-written `onDisabled()` callback, so a moderator who disabled a user was not guaranteed to see the consequence reflected. The console is now on `apps/admin/lib/queries.ts`.
2. **The disable screen's error branches were completely untested.** The copy constants could have been swapped, or a branch dropped, and nothing would have noticed. `apps/admin/lib/queries.test.tsx` now has a `describe` block per code.
3. **The PRD's message literal appeared nowhere in the repository.** The citizen app said something else entirely. The string is now the PRD's, and a test pins it.

### What is still out of scope

- **The console now has a live probe.** `tools/probe-moderation-console.cjs` — **37/37** — calls `moderator_search_users` over the real PostgREST path and asserts the account row the console renders: the account state, the per-user report count (checked against the database), and the **exact-match** boundary — an empty query, an unmatched query and a partial phone prefix all return nothing, because the moment the lookup became a fuzzy list the console would be a user-database browser rather than a targeted tool (FR-NG-3). **No acceptance criterion in this story names a live probe**, so its absence never made the story `partial`.
- Undisabling, appeals, a moderator tier split, and the aggregates are excluded by the story's own "Out of Scope".
