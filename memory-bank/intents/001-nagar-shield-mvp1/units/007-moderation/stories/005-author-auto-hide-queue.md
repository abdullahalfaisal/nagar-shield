---
id: 005-author-auto-hide-queue
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: ready
priority: should
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 005-author-auto-hide-queue

## User Story

**As a** Nagar Shield moderator
**I want** the reports that were auto-hidden because their **author** was flagged 5+ times in 24 hours to be marked as such in the queue
**So that** I can tell a report that reached the 3-flag threshold apart from one that was swept up by the author's flag history, and judge it on the right basis

## Acceptance Criteria

- [ ] **Given** the `/queue` list renders, **When** a report whose `hide_reason` is `'author_auto_hide'` or `'both'` is inspected, **Then** it carries a **distinct author auto-hide badge** that a report hidden by its own 3-flag threshold never carries — the two kinds of hidden report are separable in the list at a glance (FR-ALERTS-11)
- [ ] **Given** the author auto-hide badge renders, **When** its label and explanation are read, **Then** the reason is stated in **Bangla and English** — that the report's author had **5 or more reports flagged in the last 24 hours** — and the copy names the **author rule**, never the report's own flag count
- [ ] **Given** the queue contains both kinds of hidden report, **When** the moderator compares an author-auto-hidden report with a report hidden by its own 3-flag threshold, **Then** the two are distinguishable by badge, by the flag count shown on the row, and by the explanation text (FR-ALERTS-11 vs FR-ALERTS-7)
- [ ] **Given** an author-auto-hidden report is opened from the group, **When** the moderator restores or removes it, **Then** the decision is submitted **per report** through `moderation_decide` with that report's own required note, and the other reports in the group are left untouched
- [ ] **Given** the author-auto-hidden group holds more than one report, **When** the group's controls are inspected, **Then** there is **no bulk-restore control and no bulk-remove control** — no "restore all", no "remove all", no multi-select, and no shared-note action; every decision is made on one report with its own note
- [ ] **Given** an author-auto-hidden report renders, **When** its row is inspected, **Then** the **author's aggregate 24 h flag count** is shown alongside the badge, and it is labelled separately from the report's **own** flag count so the two numbers cannot be confused
- [ ] **Given** the queue is read, **When** the data source is inspected, **Then** the rows are `reports` where `moderation_status = 'hidden_pending_review'` **AND** the author's 24 h flag count is `>= 5` — the 24 h count is computed from `flags` joined on `reports.author_id`, and it is never confused with the per-report flag count `>= 3`
- [ ] **Given** a moderator's own session reads the queue and the author-auto-hidden group, **When** the read completes, **Then** **no** `reports` row, **no** `flags` row, and **no** `moderation_actions` row is created or changed — a moderator's own read has no write side effect
- [ ] **Given** a caller whose JWT does not belong to a `profiles.role = 'moderator'` account, **When** the queue is called, **Then** the response code is `FORBIDDEN` and no rows are returned; the group filter can only narrow the RPC's result, never widen it
- [ ] **Given** a report was hidden by both rules — its own 3 flags **and** the author's 5-in-24 h — **When** its badge renders, **Then** it carries the **both** badge naming both causes rather than only one of them
- [ ] **Given** an author-auto-hidden report has **zero flags of its own**, **When** its row renders, **Then** it still appears in the group with the badge and the author's 24 h count, and its own flag count renders as `0` — the report is not dropped for having no flags of its own

## Technical Notes

- **The group is a slice of the same queue, not a second queue.** The data source is `reports` where `moderation_status = 'hidden_pending_review'` **AND** the author's 24 h flag count is `>= 5` — distinguished from the per-report flag count `>= 3` (FR-ALERTS-11 vs FR-ALERTS-7). The `moderation_queue` RPC already returns every pending report with its server-derived `hide_reason`; the author-auto-hidden group is the slice where `hide_reason ∈ { 'author_auto_hide', 'both' }`. The queue adds **zero** rows to the schema.
- **The two counts come from different joins and are never conflated.** The **per-report** count is `count(flags)` where `flags.report_id = reports.id` — the chip count on the row. The **author's aggregate 24 h count** is `count(distinct flags.report_id)` over the reports authored by that author, with `flags.created_at >= now() - interval '24 hours'`, joined on `reports.author_id` — the badge's number. A report can show `0` on the chip and `5` on the badge, and that is the normal author-auto-hide shape.
- **The server's `hide_reason` is authoritative.** `deriveHideReason()` in the admin lib mirrors the server's derivation for rendering only: the report's own flag count `>= 3` → `'flag_threshold'`; the report's own count `< 3` but the author has `>= 5` distinct flagged reports in 24 h → `'author_auto_hide'`; both → `'both'`. The client never recomputes the statistic from a locally fetched flag list and never shows a number the server did not send.
- **The 24 h window is server-side `now()`.** The client never computes the window boundary and never sends a start timestamp — a client-supplied window would let a moderator widen an author's flag history on demand.
- **The badge explains the cause in Bangla and English.** Both locales come from the shared i18n bundle; no string is hardcoded. Suggested keys: `moderation.queue.badge.authorAutoHide` (**লেখক-স্বয়ংক্রিয় লুকানো** / *Author auto-hidden*), `moderation.queue.badge.flagThreshold` (**৩ ফ্ল্যাগে লুকানো** / *Hidden after 3 flags*), `moderation.queue.badge.both` (**লেখকের নিয়ম ও ৩ ফ্ল্যাগ** / *Author rule and 3 flags*), `moderation.queue.authorAutoHide.explanation` (**এই রিপোর্টটি নিজের ফ্ল্যাগের সংখ্যার কারণে নয়, বরং লেখকের ২৪ ঘণ্টায় ৫টি বা তার বেশি রিপোর্ট ফ্ল্যাগ হওয়ায় স্বয়ংক্রিয়ভাবে লুকানো হয়েছে।** / *This report was hidden automatically because its author had 5 or more reports flagged in the last 24 hours — not because the report itself reached 3 flags.*), `moderation.queue.authorFlagCount` (**লেখকের ২৪ ঘণ্টার ফ্ল্যাগ: ৫** / *Author's flags in 24 h: 5*), `moderation.queue.ownFlagCount` (**নিজের ফ্ল্যাগ: ১** / *Own flags: 1*).
- **The author's 24 h count is per-author moderation context, not an aggregate statistic.** It is one number attached to one author's report row — the same class of number as the per-report flag count. The console states no total, no rate, no trend, no chart, no "top flagged authors" list, and no count spanning users — excluded by FR-NG-3 / FR-NG-4 / ADR-010.
- **The uploader stays masked in the list.** The group's rows use `maskUploaderIdentity()` — a masked handle such as `+8801•••1234`. The unmasked identity lives only in the review detail's server payload and never reaches a URL, a query key, or a log line.
- **There is no bulk action, and the group never offers one.** Every report in the group is restored or removed individually through `moderation_decide` with its own required note. There is no "restore all", no "remove all", and no group-wide action: a shared note across N reports would make the required note meaningless (FR-MOD-3), and one click writing N audit rows is exactly the shape the append-only trail cannot describe. The unit constraint is explicit — **no bulk actions at MVP**.
- **The read is a read.** A moderator's own read of the group writes nothing: no `reports` row changes, no `flags` row is created, and no `moderation_actions` row is written. The group filter is a client-side slice over a `SELECT`-only read model, so this path has no write side effect at all — there is no "mark as seen" and no read receipt.
- **RLS remains moderator-only.** The `moderation_queue` RPC is `SECURITY DEFINER` and re-checks `auth.uid()` against `profiles.role = 'moderator'` inside the function; a citizen gets `FORBIDDEN` and no rows. The group filter never widens what the RPC returns.
- **The pagination is the queue's.** The group does not invent a second cursor. The group is applied to the queue page the moderator is already on, and "Load more" continues the same `(captured_at DESC, id DESC)` cursor. A group with its own cursor over its own ordering would be a second read model for no benefit.
- **The badge is a label, not a control.** Activating it opens the explanation; it never filters, hides, or acts. The only actions on a group row are the per-report link to the review detail and the per-report decision.
- **The layout reuses the shared token set.** The badge, the group header, and the count chip are built from the web-safe CSS custom-property subset of `docs/design/design-tokens.md` (`--amber-500` / `--amber-100` for the author badge, `--red-500` / `--red-100` for the threshold badge, `--r-md`, `--shadow-card`). No new hex value, no third-party UI kit, and no separate admin palette.
- **i18n is a hard requirement.** Bangla primary (native-speaker reviewed) and English secondary, through the shared bundle contract from unit `001`. The console does not start a second i18n system.
- **Accessibility.** The badge is never conveyed by colour alone — it carries a text label and an accessible description of the reason; every interactive control is ≥ 48 × 48 px with an accessible name, and the token contrast pairs are verified at WCAG AA in both themes.

## Dependencies

### Requires
- `001-moderator-login-and-queue` — the `/queue` route, the queue read model, the cursor pagination, and the hide-reason badge slot this group renders inside
- `003-restore-remove-decision` — the per-report restore / remove decision and the required note the group's rows drive
- Unit `001-foundation` — `packages/shared` (`ModerationStatus`, `ApiErrorCode` incl. `FORBIDDEN`, the i18n key contract), the typed Supabase client, the web-safe token subset, and the TanStack Query setup
- Unit `002-identity` — the `profiles` row carrying the author's identity that the masked handle is rendered from
- Unit `004-capture` — the `reports` rows and the `author_id` the 24 h flag count is joined on
- Unit `006-alerts` — the `flags` rows, the 3-flag threshold and the 5-flag-in-24 h author auto-hide transition that put these reports into `hidden_pending_review`

### Enables
- `002-report-review-detail` — the full-width hide-reason banner that explains the same cause on the detail route
- `003-restore-remove-decision` — the queue is the surface whose decisions this group makes
- `006-moderator-action-audit-log` — the group's per-report decisions are the rows the trail lists

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The report has **zero flags of its own** | It still appears in the group with the author auto-hide badge and the author's 24 h count; its own flag count renders as `0` |
| The report has 3+ flags **and** the author crossed 5 in 24 h | `hide_reason = 'both'`; the row carries the both-badge naming both causes |
| The same author has several auto-hidden reports | Each appears as its **own** row with its own counts; the group never merges them into a single item |
| The author's flags age out of the 24 h window | The count drops below 5, the report stays in `hidden_pending_review`, and the badge stops claiming the author rule — the row falls back to the raw flag count |
| The author's count crosses from 4 to 5 while the moderator has the queue open | The report enters the group only after the unit `006` transition runs; the group refreshes on the queue's normal re-read, and the moderator's read creates no row by itself |
| The moderator's own read of the group is inspected for side effects | No `reports`, `flags`, or `moderation_actions` row is created or changed |
| A report in the group is decided by another moderator | The row leaves the group on the next re-read; a second decision on it returns `CONFLICT` and writes no second row |
| The moderator selects all rows in the group | No multi-select and no bulk control exists — the selection affordance is absent, so there is nothing to act on as a group |
| The author account was deleted by the PII purge | The report row survives; the masked handle renders a "profile deleted" state and the page does not crash |
| The group filter is applied while the queue page is still loading | The skeleton renders first; the group never renders a partially-populated list against a stale page |
| The queue request fails because the browser is offline | The mapped error state renders; the group shows the error, never a stale-looking empty group |
| The 24 h count is computed in a different time zone on a moderator's laptop | Irrelevant — the window is the server's `now()`; the client never computes it |

## Out of Scope

- The 3-flag threshold transition, the 5-flag-in-24 h author auto-hide transition, and the `flags` table — unit `006-alerts`
- The citizen-side flag composer and the flag rate limit — unit `006-alerts`
- The review detail route and its full-width hide-reason banner — `002-report-review-detail`
- The restore / remove write, the required-note validation, and the one-row-per-decision guarantee — `003-restore-remove-decision`
- The audit trail view — `006-moderator-action-audit-log`
- The `moderation_queue` RPC and the `hide_reason` derivation — `bolt-007-moderation-1`
- Bulk decisions — "restore all", "remove all", a group-wide action, a multi-select, and a shared note; no bulk action exists at MVP
- Any aggregate crime statistics, charts, per-author trends, cohort views, and a "top flagged authors" ranking — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- A citizen-facing surface that explains why a report was hidden — the public feed never shows moderation reasons or hide causes
- Disabling the author from this group — the disable action and its reason live in `004-disable-a-user`
- A moderator tier, scoped permissions, or an appeal / overturn workflow — FR-MOD-4 keeps one role with full access at MVP
