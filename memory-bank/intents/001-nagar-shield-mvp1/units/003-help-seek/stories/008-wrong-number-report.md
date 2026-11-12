---
id: 008-wrong-number-report
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: should
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 008-wrong-number-report

## User Story

**As a** Nagar Shield user who dialed a number from the app and found it wrong, disconnected, or belonging to someone else
**I want** to report that number in a few taps, without needing an account or a moderator's permission
**So that** the number gets fixed before the next quarterly refresh instead of costing another citizen a wasted call

## Acceptance Criteria

- [ ] **Given** the user taps the "নম্বর ভুল? রিপোর্ট করুন →" link in the More Help sheet, **When** the wrong-number sheet opens, **Then** it is stacked over the More Help sheet (the prototype's `#wrong-number-dialog`) with the amber `report` icon, the title, the helper text, the textarea, a **রিপোর্ট পাঠান** primary action, and a **বাতিল** secondary action
- [ ] **Given** the user taps the report affordance on a thana-line entry, **When** the wrong-number sheet opens, **Then** the sheet is pre-filled with that station as the referenced entry (`entry_type = 'station'`, `entry_id` = the station's id) and the More Help sheet is not behind it
- [ ] **Given** the user has selected a reason and typed optional free-text details, **When** the user submits, **Then** exactly one row is written to `wrong_number_reports` with `entry_type` (`station` or `hotline`), `entry_id`, the reporter (`reported_by`), the reason, the free-text details, `status = 'pending'`, and `created_at`
- [ ] **Given** the user is signed in, **When** the report is written, **Then** `reported_by` is set to that user's profile id; **given** the user is not signed in, **Then** the report is still written with `reported_by = null` and the curator can still triage it
- [ ] **Given** the report is submitted successfully, **When** the write returns, **Then** the sheet closes and the "রিপোর্ট পাঠানো হয়েছে" toast is shown; **given** the write fails, **Then** a typed error is surfaced, the sheet stays open with the entered reason and details intact, and no success toast is shown
- [ ] **Given** a user has already reported the same entry, **When** the same user reports that entry again, **Then** a **second** row is written — duplicates are not rejected, not merged, and not deduplicated
- [ ] **Given** a hotline entry, **When** it is rendered in the More Help sheet and the hotline list, **Then** its `last_verified_at` stamp is surfaced so the user can see how fresh the number is, and the same stamp is shown on a thana-line entry
- [ ] **Given** the report row is read by the curator workflow, **When** the curator lists the pending wrong-number reports, **Then** the row appears with its referenced entry, reason, details, reporter, and creation time, and it is queued for the next quarterly dataset refresh
- [ ] **Given** a signed-in user views the report surface, **When** they read it, **Then** the flow is authenticated but **no** moderator, curator, staff, or approval role is required — no role check, no approval prompt, and no moderation gate stands between the user and the submitted report
- [ ] **Given** the report sheet's controls, **When** accessibility is checked, **Then** the textarea, the reason selector, **রিপোর্ট পাঠান**, and **বাতিল** are each ≥ 48 × 48 dp with accessibility labels in `bn` and `en`, and the sheet is announced as a dialog

## Technical Notes

- **The write path is `reportWrongNumber(entry_type, entry_id, reason, details)`.** It returns `{ "data": { "id": "…", "status": "pending" } }`. The client never writes `status` — the column defaults to `pending` and is curator-owned.
- **`entry_id` is polymorphic, so it cannot carry a plain FK.** `entry_type = 'station'` resolves against `stations.id`; `entry_type = 'hotline'` resolves against `hotlines.id`. Integrity is enforced by a CHECK trigger in `supabase/migrations/0002_help_seek.sql` that resolves the target against the table named by `entry_type` and rejects a report whose target does not exist.
- **The report references the entry; it never edits it.** A report is a *separate* write path. The curated JSON is never mutated at runtime, the number is never hot-patched, and the station/hotline row keeps shipping its last verified value until the next quarterly refresh — the same rule that governs `003-bundled-station-hotline-dataset`.
- **Duplicates are allowed on purpose.** A citizen may report the same entry more than once, and the same user may report the same entry more than once. Each report is an independent signal for the curator; there is no unique constraint on `(reported_by, entry_type, entry_id)` and no client-side dedupe. Reports are closed by the curator, not merged away.
- **`reported_by` is nullable.** FR-SEEK-6 says "any user", and the sheet is reachable from the More Help sheet, so an anonymous report must still be accepted — the row is written with `reported_by = null` and the curator triage does not require an identity.
- **RLS is the authorization mechanism.** A citizen may insert only their own row (`reported_by = auth.uid()` or `null`) and may read only their own reports; the service-role key never reaches the client bundle. There is **no** moderation gate on the insert — the row lands as `pending` and is closed by the curator, not by an approver.
- **The curator workflow has no unit in Phase 1.** The curator is a different internal role on a different cadence: unit `007-moderation` explicitly excludes it (it is not the moderator console), and unit `008-jobs-operations` owns the release pipeline and the quarterly dataset refresh job. This story therefore **writes** the row and makes it queryable; it does not build a triage UI, and the "surfaces to the curator" obligation is met by the row being visible to the curator's read path for the next quarterly refresh.
- **The sheet is the prototype's `#wrong-number-dialog`, stacked over the More Help sheet.** It carries the amber `report` icon, the title, the helper text, the textarea, a 52 dp primary **রিপোর্ট পাঠান**, a 44 dp secondary **বাতিল**, and the "রিপোর্ট পাঠানো হয়েছে" toast on success.
- **The placeholder is illustrative copy, not a dataset claim.** The prototype's placeholder ("উদাহরণ: ১৬১১৬ এর বদলে ১৬১১৭ হওয়া উচিত") is example text; `16116` remains the verified electricity complaint number in the curated dataset and is not changed by any report.
- **`last_verified_at` is surfaced so freshness is visible.** The curator's verification stamp is shown next to the number on the hotline rows and the thana-line entry, so a user can judge how old the number is. A stamp that is more than one quarter old renders as stale (the same "due for verification" signal the refresh report uses) rather than being hidden.
- **The reason is a fixed enum, the details are free text.** The reason selector offers a bounded set (e.g. not connecting / wrong number / belongs to another service / no longer active / other), and the details textarea is optional free text. Both go through the shared Zod schema from unit `001-foundation` before the insert.
- **C-6 — no dispatch or verification claim.** The toast says the report was **sent**, never that the number was corrected, verified, or that anyone was contacted. The curator's decision lands in the next quarterly release.
- **i18n is a hard requirement.** Every string ships in `bn` (primary, native-speaker reviewed) and `en`; no user-facing string is hardcoded in either language.
- **Testing.** A Supabase-local integration test covers the insert + RLS policies (own row inserts, another user's row is rejected, `reported_by = null` is accepted when signed out), the polymorphic `entry_id` integrity trigger (a `station` type pointing at a hotline id is rejected), and the duplicate case (the same user inserting the same entry twice yields two rows). A Jest unit test covers the Zod validation of the reason + details pair. A Maestro flow covers: More Help sheet → report link → fill the sheet → **রিপোর্ট পাঠান** → the success toast.

## Dependencies

### Requires
- Unit `001-foundation` — the `wrong_number_reports` Zod schema, `ApiErrorCode`, the typed Supabase client, `shared/ui/BottomSheet` and `TextField`, and the `bn`/`en` i18n bundles
- `supabase/migrations/0002_help_seek.sql` — the `wrong_number_reports` table with the `entry_type` / `entry_id` / `reported_by` / `reason` / `details` / `status` columns, the polymorphic integrity CHECK trigger, and the insert/select RLS policies
- Unit `002-identity` — the session used to stamp `reported_by` (and its absence, for the signed-out report)
- `003-bundled-station-hotline-dataset` — the `last_verified_at` stamp surfaced in the UI and the entry ids the report references
- `005-more-help-and-hotlines` — the "নম্বর ভুল? রিপোর্ট করুন →" link that opens the sheet
- `006-thana-line-fallback` — the thana-line entry whose report affordance opens the sheet pre-filled with that station

### Enables
- Unit `007-moderation` — the pending wrong-number rows read in the curator / moderator workflow
- Unit `008-jobs-operations` — the quarterly dataset refresh that consumes the curator's verified reports and regenerates the mirror

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user is signed out when they submit | The report is still written with `reported_by = null`; no sign-in prompt blocks the submit |
| The same user reports the same entry twice | Two independent rows are written; the second is not rejected, merged, or deduplicated |
| Two different users report the same entry | Two rows are written, each carrying its own `reported_by` |
| The referenced entry was retired (`is_active = false`) between opening the sheet and submitting | The integrity trigger rejects the insert; the user sees a typed error and the sheet stays open with the entered text intact |
| `entry_type` and `entry_id` disagree (a `station` type pointing at a hotline id) | The polymorphic CHECK trigger rejects the row; no partial or mis-referenced report is stored |
| The user submits with no reason selected | The form does not send; the reason field is marked invalid and the sheet stays open |
| The user submits with an empty details textarea | The report is still accepted — the details are optional and stored as `null` |
| The network is down when the user submits | A typed error is surfaced, the sheet stays open with the entered reason and details, and no success toast is shown |
| The user taps **রিপোর্ট পাঠান** twice quickly | Only one row is written; the second tap is ignored while the first insert is in flight |
| The user dismisses the sheet with **বাতিল** or the backdrop | No row is written and the More Help sheet is revealed behind it, still interactive |
| The referenced entry's `last_verified_at` is more than one quarter old | The stamp is shown as stale rather than hidden, so the user can judge the number's freshness before calling |
| The user reports from the thana line rather than the More Help sheet | The sheet is pre-filled with that station's `entry_type` + `entry_id`; the report is not filed against an arbitrary entry |
| The curator has already closed a previous report for the same entry | The new report is still written as `pending`; the curator closes reports individually |
| The submitted free-text details contain Bangla, emoji, or a very long string | The text is stored as submitted within the field's documented length limit; it is escaped, not truncated mid-word, and never rendered as markup |

## Out of Scope

- The curator's triage UI, the verification decision, and the report's status transitions — the curator workflow has no unit in Phase 1; unit `007-moderation` is the moderator console, not the curator console
- Editing a hotline or station number at runtime, and any hot-patch of the bundled dataset — reports are collected, not applied
- The moderator console, the hidden-report queue, and user disablement — unit `007-moderation`
- The quarterly refresh script and the release pipeline that republishes the dataset — unit `008-jobs-operations`
- Reporting a problem with an **emergency** number (`999` / `102`) or with a personal emergency contact — those are not curated hotline or thana entries
- Uploading a photo, a screenshot, or a voice note as evidence with the report
- Notifications, status tracking, or a reply to the reporter; the only feedback is the "রিপোর্ট পাঠানো হয়েছে" toast
- Rate limiting, throttling, or spam filtering of reports at MVP
- Any claim that a number was corrected, verified, or that the service was contacted — forbidden by C-6
