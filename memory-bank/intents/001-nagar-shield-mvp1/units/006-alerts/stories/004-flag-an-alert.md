---
id: 004-flag-an-alert
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 004-flag-an-alert

## User Story

**As a** Nagar Shield user who sees an alert that is wrong, misleading, harassing, duplicated, or simply off topic
**I want** to flag it with a reason
**So that** the community's reports stay useful and a moderator can review what the crowd has already caught

## Acceptance Criteria

- [ ] **Given** the user taps the 48 × 48 dp `flag` button on an alert card, **When** the sheet opens, **Then** it is a 1:1 port of the prototype's `#flag-dialog`: the title **এই সতর্কতা রিপোর্ট করুন**, the helper line **সঠিক কারণ বাছাই করুন — মডারেটর পর্যালোচনা করবেন**, the five reason radios, the optional note textarea, the **রিপোর্ট পাঠান** submit button, and the **বাতিল** cancel button
- [ ] **Given** the flag sheet renders, **When** the reason radios are listed, **Then** they are exactly the five values of the fixed enum — `misinformation` (ভুল তথ্য), `harassment` (হয়রানি), `duplicate` (পুনরাবৃত্তি), `off_topic` (অপ্রাসঙ্গিক), `other` (অন্যান্য) — each in the prototype's Bangla / English pair, with **no** free-text reason and no sixth option
- [ ] **Given** the sheet renders, **When** the note field is inspected, **Then** it is **optional**, labelled **ঐচ্ছিক নোট (১৪০ অক্ষর)**, capped at 140 characters, and submitting with it empty succeeds
- [ ] **Given** the user submits a valid reason, **When** the request completes, **Then** a `flags` row is persisted with that reason and the user as the flagger, and the success toast **রিপোর্ট পাঠানো হয়েছে — ধন্যবাদ** is shown with the `check_circle` icon
- [ ] **Given** the user has already flagged this report, **When** they submit the flag again, **Then** the server responds with the `CONFLICT` error code, the app shows the "already reported" state, and the duplicate is **not** counted toward the 3-flag threshold
- [ ] **Given** the user has already flagged **10** reports within the last hour, **When** they attempt an 11th flag, **Then** the server responds with the `FLAG_RATE_LIMIT` error code and `details.retry_after_sec`, and the app shows the Bangla / English rate-limit message with the retry time
- [ ] **Given** a report receives its **3rd distinct** flag, **When** the third flag is committed, **Then** the report's `moderation_status` becomes `hidden_pending_review` and the report **disappears from the public feed** on the next query (FR-ALERTS-7)
- [ ] **Given** the flag rate limit is exceeded, **When** the request path is inspected, **Then** the limit is enforced **server-side only** — the authoritative count is a query against the `flags (flagger_id, created_at)` index inside `flag_report`; a client-side counter may be shown but is never the enforcement point
- [ ] **Given** the server returns an error envelope, **When** the app maps it, **Then** the `code` is switched on to produce the user-visible Bangla / English string — the raw Postgres error text and the raw `message` field are never shown to the user

## Technical Notes

- **The flag sheet is the prototype's `#flag-dialog`, ported 1:1.** The sheet chrome is `background: var(--surface-white)`, `border-radius: 24px 24px 0 0`, `padding: 24px 20px calc(20px + 24px)`, `max-width: 390px`; the drag handle is a 40 × 4 dp `var(--ink-200)` pill; each radio row is `padding: 14px 16px`, `background: var(--ink-50)`, `border-radius: 12px`, 14 px type, with the radio's `accent-color: var(--violet-600)`; the submit button is `height: 52px`, `background: var(--grad-primary)`, white text, `border-radius: 14px`, weight 600, 15 px; the cancel button is `height: 44px`, transparent, `var(--ink-500)`, 14 px.
- **The write path is one Edge Function: `flag_report`.** `POST /functions/v1/flag_report` with the user's JWT and `{ report_id, reason }`. It is the **only** write path this unit owns, and it runs the whole sequence in **one transaction**: authenticate → rate limit → insert flag → 3-flag threshold → 5-flag author auto-hide.
- **The 5-value enum has three layers of defence.** The shared `FlagReason` parser in `packages/shared`, the database `CHECK (reason IN ('misinformation','harassment','duplicate','off_topic','other'))`, and the Edge Function's own validation. A value outside the enum is rejected with `VALIDATION_FAILED` and nothing is written.
- **`UNIQUE (report_id, flagger_id)` is what makes "distinct" well defined.** It is also what turns a repeat flag into a `CONFLICT` (HTTP 409) rather than a second count toward the threshold. The duplicate is mapped from the Postgres unique-violation error inside the function — the client never pre-checks.
- **The rate limit is 10 flags per hour per user, enforced inside the function.** The count is `SELECT count(*) FROM flags WHERE flagger_id = auth.uid() AND created_at > now() - interval '1 hour'`, backed by the `flags (flagger_id, created_at)` index. The 11th is rejected with `{ "error": { "code": "FLAG_RATE_LIMIT", "message": "…", "details": { "retry_after_sec": 3600 } } }`. `retry_after_sec` is computed from the oldest flag in the window so the number is honest, not a flat 3600.
- **The client may show a remaining budget, but it is a UX affordance only.** A client counter that drifts from the server is a display bug, not an enforcement hole — the server is the only enforcement point.
- **Error mapping is by `code`, never by `message`.** `CONFLICT` → "আপনি এই রিপোর্টটি আগেই ফ্ল্যাগ করেছেন" / "You have already flagged this report"; `FLAG_RATE_LIMIT` → "আপনি ঘণ্টায় সর্বোচ্চ ১০টি রিপোর্ট করতে পারবেন" / "You can flag at most 10 reports per hour" plus the retry time; `VALIDATION_FAILED` → a generic "সঠিক কারণ বাছাই করুন" / "Please choose a reason"; `AUTH_REQUIRED` / `AUTH_DISABLED` → the sign-in / disabled-account path. The raw `message` is developer-facing and never rendered.
- **The 3-flag threshold is enforced in the same transaction as the insert.** After the insert the function counts the flags on that report; at **≥ 3** it sets `moderation_status = 'hidden_pending_review'`. The response returns `report_hidden: true` so the client invalidates the feed query immediately and the hidden card disappears without waiting for the next poll.
- **A partially applied hide is impossible.** The flag insert, the threshold transition, and the author auto-hide are one transaction; a rollback leaves the flag uninserted as well.
- **The success toast is the prototype's `#flag-toast`.** `bottom: 96px`, centred, `background: var(--ink-950)`, white text, `padding: 12px 20px`, `border-radius: 999px`, 14 px, weight 600, with the 18 dp `check_circle` icon and the copy **রিপোর্ট পাঠানো হয়েছে — ধন্যবাদ**. It auto-dismisses and it never covers the flag button.
- **The helper line states the product rule.** "সঠিক কারণ বাছাই করুন — মডারেটর পর্যালোচনা করবেন" makes clear that this is a citizen report under review — it never claims anyone was notified, dispatched, or escalated (C-6).
- **The note field exists in the UI but is not persisted in Phase 1.** The `flags` entity carries the reason and the reporter only; there is **no** free-text note column in Phase 1. The note is collected for the Phase 1 UI parity and is sent with the request, but the server stores the reason — no column is added outside this unit's migration.
- **Radio group accessibility.** The five reasons form one radio group; the selected radio carries `accessibilityState={{ selected: true }}`, the group has a label, and every row is ≥ 48 × 48 dp.
- **Testing.** Supabase-local integration tests cover the `flags` CHECK, the `UNIQUE (report_id, flagger_id)` constraint, the duplicate → `CONFLICT` mapping, the 3-flag transition, and the 10/hour rate limit with `retry_after_sec`. A Jest test covers the error-code → i18n-key mapping for `CONFLICT`, `FLAG_RATE_LIMIT`, `VALIDATION_FAILED`, `AUTH_REQUIRED`, and `AUTH_DISABLED`. A Maestro flow covers: open Home → tap the flag button → choose a reason → submit → the toast appears.

## Dependencies

### Requires
- `001-alerts-feed-list` — the alert card and its 48 × 48 dp `flag` button that opens this sheet
- Unit `001-foundation` — `packages/shared` (`FlagReason` parser, `ApiErrorCode` incl. `CONFLICT` / `FLAG_RATE_LIMIT` / `VALIDATION_FAILED`), the `BottomSheet` primitive, the design tokens, and the `bn` / `en` i18n bundles
- Unit `002-identity` — the session that becomes `flags.flagger_id` and the `AUTH_DISABLED` gate
- Unit `004-capture` — the `reports` row the flag points at and the `reports` write policy the threshold transition uses
- `supabase/migrations/0005_alerts.sql` — the `flags` table, its two indexes, and its RLS policies (this unit's `bolt-006-alerts-1`)
- The `flag_report` Edge Function — this unit's `bolt-006-alerts-2`

### Enables
- `005-author-auto-hide` — the 5-flag author auto-hide rides in the same transaction as this flag write
- `009-alert-detail-screen` — the detail screen's flag action reuses this sheet and this error mapping
- Unit `007-moderation` — the `flags` rows and the `hidden_pending_review` queue this story creates

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user submits with no reason selected | The submit button is disabled (or the client-side validator rejects it) and **no** request is issued; the server would reject it with `VALIDATION_FAILED` regardless |
| The user flags the same report twice | The second attempt returns `CONFLICT`; the "already reported" state is shown, the duplicate is not counted, and the report's flag total is unchanged |
| The user has already used the 10-flag hourly budget | The 11th attempt returns `FLAG_RATE_LIMIT` with `details.retry_after_sec`; the message shows the retry time and no flag row is written |
| The 11th flag is attempted exactly at the hour boundary | The window is `created_at > now() - interval '1 hour'`; the flag that has aged out no longer counts, so the request succeeds if fewer than 10 flags fall inside the window |
| The 3rd distinct flag lands on a report | The report moves to `hidden_pending_review` in the same transaction, `report_hidden: true` is returned, and the card leaves the feed on the next query |
| A report already at `hidden_pending_review` receives a further flag | The flag is recorded (the flagger has not flagged it before) and the report stays hidden; the threshold check does not "un-hide" anything |
| The report was deleted (or purged) between rendering and flagging | The function returns `NOT_FOUND`; the app shows the "report is no longer available" string and closes the sheet |
| The network drops mid-submit | No flag is recorded, a typed error is shown, the sheet stays open with the chosen reason intact, and the user may retry — a retry after the network recovers is a first flag, not a duplicate |
| The user is signed out or their account is disabled | The function returns `AUTH_REQUIRED` / `AUTH_DISABLED`; the app routes to the sign-in or the disabled-account path and no flag row is written |
| The note field contains more than 140 characters | The input is capped at 140 characters client-side and the server rejects an over-long value with `VALIDATION_FAILED` |
| The user cancels the sheet | No request is issued, no flag row is written, and the feed is unchanged |
| The user taps the flag button twice quickly | Exactly one sheet is presented and at most one flag request is issued for that report |

## Out of Scope

- The 5-flag **author** auto-hide — `005-author-auto-hide`
- The moderator queue, the restore / remove decision, and the moderator's note — unit `007-moderation`
- The `flags` table's schema, indexes, and RLS policies beyond this unit's migration — `bolt-006-alerts-1`
- Persisting the optional free-text note as a stored column — Phase 1 stores the reason and the reporter only
- Editing or withdrawing a flag after submission
- Flagging your own report, flagging a comment, or flagging a category — only a public alert can be flagged
- Any notification to the flagged report's author — the author is not notified by push at MVP
- Any copy claiming a moderator or authority has been notified, dispatched, or alerted — forbidden by C-6

## Implementation

**The flag path works end to end and is proven live. The story is not `complete` because the error contract is wrong — the server returns different codes than the story mandates, and the retry delay is a constant rather than a computed one.**

### What ships

- The citizen can flag an alert, and the write path is proven against the running stack: `tools/probe-public-alert.cjs` reports **14/14** assertions.
- The write is refused for the right reasons. The SQL in `supabase/migrations/20261105000030_author_hide_distinct_reports.sql` enforces the distinct-reporter rule: a report can only be auto-hidden after a threshold of *distinct* citizens flag it, and one citizen cannot flag the same report twice to reach the threshold.
- The client handles the refusal: `apps/mobile/src/shared/api/flags.ts:32` models `{ status: 'rate_limited'; retryAfterSec: number }` and `flags.ts:76` reads `body.retry_after_sec`.
- The flag sheet is a real UI primitive: `apps/mobile/src/shared/ui/FlagSheet.tsx`.

### The gaps

- **The error codes do not match the story's contract.** The story mandates `CONFLICT` and `FLAG_RATE_LIMIT`. The shipped code returns `status: 'duplicate'` and `status: 'rate_limited'` — `apps/mobile/src/shared/api/flags.ts:32` types the rate-limited case as the bare string `'rate_limited'`, and the duplicate case likewise. Neither is the `ApiErrorCode` the shared package defines, so the mobile client cannot raise these as the shared `AppError` codes the rest of the app uses. The contract between the server and the shared error enum is broken in a way no test catches.

- **`retry_after_sec` is a hardcoded constant, not a computed one.** `supabase/migrations/20261105000030_author_hide_distinct_reports.sql:69` writes the literal `3600`, and `apps/mobile/src/shared/api/flags.ts:76` falls back to `?? 3600`. The story says the retry delay is **computed from the oldest in-window flag** — so that a client that just tripped the limit is told how long until its own flag expires. The shipped value is a constant that is right only in the common case, and wrong whenever the oldest in-window flag is younger than an hour.

- **No test asserts the contract.** The probe proves the write works and is refused; nothing asserts *which* code comes back or that the retry delay reflects the actual window.

### What closing this needs

1. The server to return the shared `ApiErrorCode` values — `CONFLICT` and `FLAG_RATE_LIMIT` — and the client to model them as `AppError` codes rather than bare status strings.
2. `retry_after_sec` computed from the oldest in-window flag rather than written as `3600`.
3. A test asserting both the code and the computed delay — the guard that keeps the server and the shared error enum in step.
