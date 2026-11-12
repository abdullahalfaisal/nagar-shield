---
id: 005-author-auto-hide
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: ready
priority: should
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 005-author-auto-hide

## User Story

**As a** Nagar Shield user who has seen one reporter's reports repeatedly flagged by the community
**I want** that reporter's recent reports to disappear from the public feed pending review
**So that** one noisy account cannot flood the BD-wide feed with reports that the community has already judged misleading

## Acceptance Criteria

- [ ] **Given** an author has **5 distinct reports** flagged within the last **24 hours**, **When** the 5th of those reports is flagged, **Then** **all** of that author's reports from the last 24 h move to `hidden_pending_review` — not only the flagged one (FR-ALERTS-11)
- [ ] **Given** the 5-flag author auto-hide fires, **When** the author's reports from the last 24 h are counted, **Then** every one of them has `moderation_status = 'hidden_pending_review'`, including reports that carry **zero** flags
- [ ] **Given** a flag write happens, **When** the transaction runs, **Then** the rate-limit check, the flag insert, the 3-flag threshold check, and the 5-flag author auto-hide all execute in **ONE** transaction — a failure at any step rolls the whole write back, so a partially applied hide is impossible
- [ ] **Given** the author's reports were hidden by the auto-hide, **When** the affected author opens History, **Then** the author can still see their own reports — own-report visibility is not affected by the public hide
- [ ] **Given** the author auto-hide fires, **When** the author is notified, **Then** **no** push notification is sent at MVP — there is no FCM fanout, no email, and no in-app notice to the author
- [ ] **Given** the 5-flag author auto-hide fires, **When** the `flag_report` response is read, **Then** it carries `author_hidden: true` (and `report_hidden` reflecting the 3-flag state), so the client invalidates the feed query immediately
- [ ] **Given** an author has fewer than 5 distinct flagged reports in the last 24 h, **When** a flag lands, **Then** the author's **other** reports are left untouched and only the 3-flag threshold applies to the single flagged report
- [ ] **Given** an author has exactly 5 distinct flagged reports in the last 24 h, **When** the 5th flag is committed, **Then** the transition is applied to all of that author's reports from the last 24 h **in the same transaction**, and a test asserts that no report belonging to that author in that window remains `visible` or `restored`
- [ ] **Given** the auto-hide is applied, **When** the public feed is queried, **Then** the hidden reports are absent from `alerts_feed` (only `visible` / `restored` are returned), and a moderator can still see them in the `hidden_pending_review` queue

## Technical Notes

- **The transition is a side effect of `flag_report`, not a separate job.** The whole sequence runs in one Edge Function transaction: (1) authenticate; (2) enforce the 10-flags-per-hour rate limit; (3) insert the flag, mapping the unique violation to `CONFLICT`; (4) if the report now has **≥ 3** flags, set it to `hidden_pending_review`; (5) if the report's author has **5+ distinct flagged reports in the last 24 h**, set **all** of that author's reports from the last 24 h to `hidden_pending_review`.
- **"5 flagged reports" means 5 distinct reports, not 5 flags.** The count is `count(DISTINCT report_id)` over that author's flags in the window. Five flags on one report are one flagged report — and that report was already handled by the 3-flag threshold. This distinction is the whole point of the rule and is asserted by a test.
- **The window is 24 hours and it is the report's age, not the flag's age.** The scope of the hide is the author's reports whose `created_at` (or `captured_at`) falls inside the last 24 h. A report older than 24 h that gets flagged still counts toward the 5-flag tally (the flag itself is recent) but is **not** itself hidden by this rule — it is handled by the ordinary 3-flag path.
- **The hide is `hidden_pending_review`, not `removed`.** The author auto-hide is reversible by a moderator, exactly like the 3-flag hide. `removed` is a moderator-only decision owned by unit `007-moderation`.
- **One transaction, so a partial state is impossible.** The flag insert, the 3-flag transition, and the author auto-hide all commit or all roll back. A unit test forces a failure inside the author-hide step and asserts that the flag row was not inserted and the report's status was unchanged.
- **The public feed and the author's own view are different surfaces.** `alerts_feed` filters to `moderation_status IN ('visible','restored')` and therefore drops the hidden rows. The author's own History includes the caller's own reports regardless of the radius / window filters, so the author still sees what they filed. **Own-report visibility is not affected by the public hide.**
- **The staff-visible view of the author auto-hide belongs to unit `007-moderation`.** This story owns the **transition** and the flag rows that feed the queue — not the moderator's queue UI, the restore / remove decision, or the staff-facing author view.
- **No notification to the author at MVP.** Push is Phase 2; Phase 1 has no FCM fanout for a new report and none for an auto-hide. The author discovers the hidden state through their own History, where the report is still present.
- **The client invalidates the feed on the response flag.** `report_hidden` / `author_hidden` drive `queryClient.invalidateQueries` so the hidden cards leave the feed without waiting for the next 60 s poll.
- **The threshold constants are named constants,** not inline literals: `FLAG_HIDE_THRESHOLD = 3`, `AUTHOR_HIDE_FLAG_COUNT = 5`, `AUTHOR_HIDE_WINDOW_HOURS = 24`, `FLAG_RATE_LIMIT_PER_HOUR = 10`. The values are asserted in a shared test so the client copy, the function, and the docs cannot drift.
- **Testing.** A Supabase-local integration test seeds one author with 5 flagged reports inside 24 h, flags the 5th, and asserts that **all** of the author's reports from the last 24 h are `hidden_pending_review` and that they are absent from `alerts_feed`. A second test asserts that 5 flags on a **single** report do **not** trigger the author auto-hide. A third test asserts the author's own report is still returned by `history_nearby` for that author.

## Dependencies

### Requires
- `004-flag-an-alert` — the `flag_report` write path and the transaction this story's transition rides in
- Unit `001-foundation` — `packages/shared` (`ModerationStatus`, `ApiErrorCode`) and the shared threshold constants
- Unit `002-identity` — the session that scopes the flag write
- Unit `004-capture` — the `reports` table, the `moderation_status` column, and the write path the hide updates
- `supabase/migrations/0005_alerts.sql` — the `flags` table and its `flags (flagger_id, created_at)` index (this unit's `bolt-006-alerts-1`)

### Enables
- Unit `007-moderation` — the queue of hidden reports this story produces and the staff-facing author view

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The same author has 5 flags on **one** report | The count of **distinct** flagged reports is 1, so the author auto-hide does **not** fire; only the 3-flag threshold applies to that report |
| The author has 4 flagged reports and a 5th flag lands on a report older than 24 h | The 5-flag tally is reached (the flagged report's flag is recent), but the auto-hide scope is the author's reports from the last 24 h — the older report is handled by the ordinary path and is not hidden by this rule |
| The author's 5 flagged reports span two different 24 h windows | Only the flags inside the window count; a tally that only reaches 5 when an out-of-window flag is included does not fire the hide |
| The same report is flagged by the same user twice | The duplicate is rejected with `CONFLICT` and does not count toward the author's tally |
| Two authors are flagged concurrently | Each author's tally is counted independently; one author's hide never touches another author's reports |
| The author has no reports in the last 24 h other than the flagged one | The hide applies to that one report; the author-hide and the 3-flag hide coincide |
| The transaction fails after the flag insert but before the hide commits | The whole transaction rolls back — no flag row exists and no report status changed |
| The author's report was already `removed` by a moderator | The auto-hide update leaves it `removed`; it never resurrects a removed report into `hidden_pending_review` |
| The author's report was already `restored` by a moderator | The auto-hide moves it to `hidden_pending_review` — the auto-hide is a fresh decision based on the tally and does not respect a prior restore |
| The author opens History while their reports are auto-hidden | The author still sees their own reports; own-report visibility is unaffected by the public hide |
| The 5-flag tally is reached while the app is backgrounded | The transition happens server-side regardless of the client's foreground state — the feed simply no longer contains the hidden reports on the next query |

## Out of Scope

- The moderator queue, the restore / remove decision, the moderator's required note, and the staff-visible author auto-hide — unit `007-moderation`
- The 3-flag threshold behaviour itself — `004-flag-an-alert`
- The `flags` table schema and the rate-limit enforcement — `004-flag-an-alert` and `bolt-006-alerts-1`
- Notifying the author — push is **Phase 2**; there is no push, email, or in-app notification to the author at MVP
- Reporting a user, blocking a user, or restricting an account — an auto-hide is a moderation state, not an account sanction (account disable is unit `002`)
- Deleting the author's reports or the flag rows
- A public "author is hidden" badge, an author reputation score, or any per-author statistics in the feed — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- Any moderation dashboard, chart, or trend output over the flags table
