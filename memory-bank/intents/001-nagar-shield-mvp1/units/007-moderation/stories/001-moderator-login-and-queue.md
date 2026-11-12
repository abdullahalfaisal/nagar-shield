---
id: 001-moderator-login-and-queue
unit: 007-moderation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 001-moderator-login-and-queue

## User Story

**As a** Nagar Shield moderator
**I want** to sign in to the internal console with the same Supabase Auth account I already have and land directly on the list of reports waiting for review
**So that** I can start triaging flagged reports within one screen, without the console ever holding a credential more powerful than my own session

## Acceptance Criteria

- [ ] **Given** a Supabase Auth account whose `profiles.role = 'moderator'`, **When** the email and password are submitted on `/login`, **Then** a session is established and the moderator is navigated to `/queue`
- [ ] **Given** the built `apps/admin` output, **When** it is grepped for `SUPABASE_SERVICE_ROLE_KEY`, a `service_role` literal, and the service-role JWT prefix, **Then** there are **zero** matches and the only Supabase variables referenced are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] **Given** a signed-in user whose `profiles.role` is **not** `moderator`, **When** `moderation_queue` is called with that user's JWT, **Then** the response is `{ "error": { "code": "FORBIDDEN" } }` and **no** queue rows are returned in any shape (FR-MOD-1)
- [ ] **Given** a signed-in citizen, **When** `/queue` or `/queue/[reportId]` is opened in the browser, **Then** the console renders the "moderator access only" state, no report data is rendered, and no queue query result is displayed
- [ ] **Given** a signed-in moderator, **When** `moderation_queue` is called, **Then** every returned row has `moderation_status = 'hidden_pending_review'` and **no** `visible`, `restored`, or `removed` report appears (FR-MOD-1)
- [ ] **Given** the `/queue` list renders a row, **When** the row is inspected, **Then** it shows the flag-reason chips (one chip per distinct flag reason), the hide-reason badge, the flag count, and the **masked** uploader handle (e.g. `+8801•••1234`)
- [ ] **Given** the queue has more rows than the current page limit, **When** "Load more" is activated, **Then** the next page is requested with the `next_cursor` returned by the previous response, the new rows are appended, and no row is duplicated or re-fetched
- [ ] **Given** the last page has been loaded (`next_cursor = null`), **When** the queue renders, **Then** no "Load more" control is shown and an end-of-queue state is rendered instead
- [ ] **Given** there are no reports in `hidden_pending_review`, **When** `/queue` renders, **Then** the empty state renders and no error banner is shown
- [ ] **Given** the console is rendered on a desktop viewport, **When** the layout is inspected, **Then** it is the desktop list + rail layout built from the web-safe CSS custom-property subset of `docs/design/design-tokens.md` — no phone frame, no new hex value, and no third-party UI kit

## Technical Notes

- **The console is a real Supabase user, not a service-role client.** `/login` uses the same Supabase Auth project as the citizen app, so a moderator is an ordinary `auth.users` row with `profiles.role = 'moderator'`. The console signs in with email + password only — no phone resolution, no biometric, no OTP reset flow, no "Remember me".
- **The session is cookie-backed via `@supabase/ssr`** so the App Router Server Components can read `profiles.role` before rendering the shell. The browser-side client still uses the **anon key** plus the moderator's own JWT; a server-side session never licenses a service-role client.
- **The service-role key is absent from the admin's environment entirely**, not merely unused. `apps/admin` reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The mechanical proof is the **build-output grep** in CI (and the bundle-scan test added by unit `001`'s `005-admin-skeleton-and-ci`), which must return zero matches for `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, and the service-role JWT prefix.
- **Authorization is server-side; the UI guard is convenience.** The `moderation_queue` RPC is `SECURITY DEFINER` and re-checks `auth.uid()` against `profiles.role = 'moderator'` inside the function. The "moderator access only" screen is a UX affordance, never the enforcement point. The citizen-`FORBIDDEN` case is asserted by a Supabase-local integration test, not by a UI test.
- **`moderation_queue` is a read model, not a table.** It filters `reports` on `moderation_status = 'hidden_pending_review'`, joins the report's `report_media`, aggregates the `flags` rows, joins the uploader's `profiles` row, and derives `hide_reason`. It adds **zero** rows to the schema and is backed by the existing `reports (moderation_status)`, `flags (report_id)`, and `profiles` primary-key indexes.
- **Pagination is cursor-based on `(captured_at DESC, id DESC)`**, matching the API conventions for the citizen feeds. Request `cursor` (nullable) and `limit` (default 20, max 100); response `{ "data": { "items": [...], "next_cursor": "…" | null } }`. The cursor is an opaque composite of `captured_at` + `id`, not an offset — an offset would skip or duplicate rows when a report leaves the queue mid-scroll.
- **`useModerationQueue()` is the TanStack Query hook** that backs the list. Its query key is `['moderation', 'queue', { cursor, limit }]` and it exposes `{ items, nextCursor, isLoading, isFetching, refetch, invalidate }`. A successful decision invalidates the queue, the detail, and the audit queries so the row leaves the queue and appears in the trail.
- **The queue row uses the mobile alert card's visual pattern** — category accent tile, the area / category / description / time lines, `--r-md` (14 px) radius, `--shadow-card` — and the `.list-row` primitive. It is **not** a port of a prototype screen: the prototype has no moderator surface. No new hex value is introduced; the token subset is read as CSS custom properties from `apps/admin/app/globals.css`.
- **`maskUploaderIdentity()` renders the masked handle in the list only.** The unmasked value stays in the response payload — it never reaches a URL, a query key, or a log line.
- **i18n.** Every string on `/login` and `/queue` goes through the shared bundle contract from unit `001`, with Bangla (`bn`) primary and English (`en`) secondary. The console does not start a second i18n system.
- **Accessibility.** Every interactive control (nav items, "Load more", the login submit, the queue row link) is ≥ 48 × 48 px with an accessible name; the token contrast pairs used are verified at WCAG AA in both themes.
- **Performance.** The first queue page loads in **< 2 s** on a warm session, with a skeleton row while loading.
- **Testing.** Supabase-local integration tests for the RPC (the status filter, the citizen-`FORBIDDEN` role check, the flag-reason aggregation, the `hide_reason` derivation, the cursor pagination) plus a Playwright flow (moderator login → the queue renders).

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ModerationStatus`, `FlagReason`, `ApiErrorCode` incl. `FORBIDDEN`, the shared Zod schemas, the i18n key contract), the typed Supabase client, the Next.js App Router skeleton under `apps/admin`, the web-safe token subset, and the TanStack Query setup
- Unit `002-identity` — the `profiles` row and the `role` enum that authorizes the moderator; the Supabase Auth identity the console signs in with
- Unit `004-capture` — the `reports` / `report_media` tables and their RLS (read-only here)
- Unit `006-alerts` — the `flags` rows and the 3-flag / 5-flag transitions that put reports into `hidden_pending_review`
- `supabase/migrations/0006_moderation.sql` — the `moderation_queue` RPC (this unit's `bolt-007-moderation-1`)
- Unit `001-foundation` `005-admin-skeleton-and-ci` — the `/login`, `/queue`, `/queue/[reportId]`, `/users`, `/audit` route stubs, the admin shell, and the bundle-scan test

### Enables
- `002-report-review-detail` — the queue row is the entry point to the review detail
- `003-restore-remove-decision` — the queue is the surface the decision invalidates
- `005-author-auto-hide-batch` — the hide-reason badge and the batch filter build on the queue read model
- `006-moderator-audit-log` — the audit view is reached from the same admin shell navigation

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A citizen signs in successfully at `/login` | The console reads `profiles.role`, renders the "moderator access only" state, and every subsequent `moderation_queue` / `moderation_decide` call returns `FORBIDDEN` server-side |
| The moderator's session expires while `/queue` is open | The next `moderation_queue` call returns `AUTH_REQUIRED`; the console routes to `/login` and the queue is not rendered with stale data |
| A moderator's `profiles.role` is changed to `citizen` mid-session | The next `moderation_queue` call returns `FORBIDDEN`; the console shows the access-only state rather than an empty list |
| The queue is empty | The empty state renders; no error banner and no "Load more" control |
| `next_cursor` is `null` on the first page | The end-of-queue state renders and no pagination request is made |
| A report leaves the queue (another moderator decided it) while the moderator is paging | The cursor pagination never skips or duplicates: the list is re-fetched from the server, and the already-decided report is simply absent |
| The `limit` parameter exceeds 100 | The RPC clamps to 100 rather than erroring; the client never sends more than 100 |
| The moderator opens `/queue` before the session cookie is established | The route redirects to `/login`; no queue RPC is fired unauthenticated |
| The `moderation_queue` RPC is called with a valid JWT but a `profiles` row that no longer exists | The role check cannot resolve to `moderator`, so the call returns `FORBIDDEN` |
| The admin's `NEXT_PUBLIC_SUPABASE_ANON_KEY` is misconfigured at build time | The build fails or the first call returns `AUTH_REQUIRED`; the console never silently falls back to a service-role client |
| The signed-URL / Storage path is not involved on the queue route | The queue row shows the media thumbnail path reference only; the signed URL is requested on the detail route (story `002`) |

## Out of Scope

- The review detail route, the decision form, and the required note — `002-report-review-detail` and `003-restore-remove-decision`
- The author-auto-hide badge's batch filter and its plain-language copy — `005-author-auto-hide-batch`
- Disabling a user and the `/users` route — `004-disable-a-user`
- The audit trail view — `006-moderator-audit-log`
- The `moderation_actions` table, the append-only trigger, and the RLS policies — the `bolt-007-moderation-1` migration
- The `moderation_decide` / `disable_user` Edge Functions — `bolt-007-moderation-2`
- Any aggregate crime statistics, charts, trends, heatmaps, hotspot rankings, or category distributions — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- A second moderator tier, scoped permissions, a read-only moderator, or an appeal / overturn workflow — FR-MOD-4 keeps one role with full access at MVP
- Push notifications for "a report is waiting" — no FCM fanout in Phase 1
- The Curator workflow, OTP reset flow in the console, and account self-service from the console
