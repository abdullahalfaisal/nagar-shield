---
unit: 007-moderation
intent: 001-nagar-shield-mvp1
phase: inception
status: ready
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Unit Brief: Moderation

## Purpose

Build the **internal moderator console** — the Next.js admin app under
`apps/admin` — and the `moderation` domain module behind it: the
`hidden_pending_review` queue, the **restore / remove** decision with a
**required note**, the **disable-a-user** action, and the append-only
`moderation_actions` audit trail that records every one of those decisions.

Three properties define this unit, and every screen, RPC, and Edge Function
in it is shaped by them:

1. **The service-role key never reaches the browser.** The admin is a **real
   Supabase user** with `profiles.role = 'moderator'`. It calls the backend with
   the **anon key** and the moderator's own JWT, and authorization is enforced by
   **RLS + an explicit RPC / Edge Function role check** (ARCHITECTURE §F). A
   citizen who calls `moderation_queue` or `moderation_decide` gets
   `FORBIDDEN` — never data, never a partial answer.
2. **Every decision is written down and is irreversible.** A decision without a
   note is rejected with `VALIDATION_FAILED` and writes **no** row. Every
   accepted decision appends exactly one `moderation_actions` row carrying the
   note, the moderator, and the timestamp. The trail is append-only.
3. **The uploader's identity is server-side only.** The console shows it
   because a moderator cannot judge a report without knowing who filed it
   (FR-MOD-2); the public feed never shows it, and this unit must not create a
   path that does.

The console is **moderation-only**. It shows the queue and the decisions. It
shows **no** aggregate crime chart, **no** trend, **no** hotspot ranking, and
**no** dashboard of any kind — the prototype's screen 23 is a **"Coming soon"
placeholder** and is excluded by FR-NG-3 / FR-NG-4 / ADR-010.

---

## Scope

### In Scope

- `supabase/migrations/0006_moderation.sql` — the `moderation_actions` table
  (uuid PK, a nullable `report_id` FK → `reports` and a nullable
  `target_user_id` FK → `profiles` for the `disable_user` rows, the
  `moderator_id` FK → `profiles`, the 3-value `decision` CHECK
  (`restore` | `remove` | `disable_user`), the `note` NOT NULL +
  `char_length(trim(note)) > 0` CHECK, `created_at`), the append-only RLS
  policies (moderator-only select / insert; **no** update, **no** delete), the
  supporting indexes, and the `moderation_queue` RPC
- `moderation_queue(cursor, limit)` RPC — a **moderator-only** read model over
  `reports` + `flags` + `profiles`: the `hidden_pending_review` reports with
  their media, their flag reasons, the **uploader's identity** (server-side
  only — FR-MOD-2), and a derived `hide_reason` that distinguishes a 3-flag
  threshold hide from an **author auto-hide** (FR-ALERTS-11)
- `moderation_decide(report_id, decision, note)` Edge Function — validates the
  note is non-empty, writes the `moderation_actions` row, and transitions the
  report in **one transaction**: `restore` → `restored` (visible again),
  `remove` → `removed` (permanently absent from public feeds)
- `disable_user(user_id, reason)` Edge Function — sets `profiles.disabled_at`
  and writes a `moderation_actions` row with `decision = 'disable_user'`
  (FR-AUTH-7), both in one transaction
- Admin console (`apps/admin`, Next.js App Router): `/login` (moderator sign-in
  via Supabase Auth), `/queue` (the `hidden_pending_review` list), `/queue/[reportId]`
  (the wide two-column review detail + decision form), `/users` (search +
  disable), `/audit` (the `moderation_actions` history view)
- `useModerationQueue()` TanStack Query hook, the queue query key, and the
  post-decision invalidation of the queue, detail, and audit queries
- The admin's **token layer** — the web-safe subset of
  `docs/design/design-tokens.md` as CSS custom properties — plus the desktop
  layout primitives derived from the shared token set
- i18n keys for every new string in `bn` (primary) and `en`, in the shared
  bundle contract from unit `001`

### Out of Scope

- The `reports` / `report_media` schema, RLS, write path, media pipeline, and
  offline upload queue — unit `004`. This unit **reads** `reports` and
  `report_media` and never writes the report content
- The `flags` table, the 3-flag threshold transition, the 10-per-hour rate
  limit, and the author auto-hide **transition** — unit `006`. This unit reads
  the flag rows the citizen side created and surfaces them in the queue
- `profiles`, the role enum, Auth wiring, the disabled-account **in-app gate**
  and its copy, and account deletion — unit `002`. This unit reads `role`,
  reads the uploader's identity, and **sets** `disabled_at`
- The citizen-side **flag-report dialog** — unit `006`. This console reads the
  flag records the citizen app created; it never builds a flag composer
- The public **Alerts feed**, the area chip row, and `history_nearby` — unit
  `006`. This unit only consumes their read models to verify a decision's
  effect
- The 90-day media purge, the geocode-cache cleanup, and the release pipeline —
  unit `008`
- The **Curator** workflow (station / hotline dataset refresh, wrong-number
  report review) — a different internal role on a different cadence; it has no
  unit in Phase 1 and no surface in this console
- Any **aggregate crime-statistics view**: charts, trends, heatmaps, hotspot
  rankings, category distributions, "total crime" counters, and crime
  prediction — **excluded** by FR-NG-3 / FR-NG-4 / ADR-010. The prototype's
  screen 23 is never built
- A second moderator tier, per-decision permission scopes, an appeal /
  overturn workflow, bulk batch decisions, and a `moderator` role split into
  trust-and-safety + admin — **Phase 2** (FR-MOD-4 keeps one role with full
  access at MVP)
- Push notifications for "a report is waiting" — no FCM fanout in Phase 1

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-MOD-1 | Moderator queue — an internal admin tool lists the `hidden_pending_review` queue; a moderator sees it, a citizen gets `FORBIDDEN` | Must |
| FR-MOD-2 | Report + flag reasons + uploader — the moderator view shows the author identity and the per-flag reasons; the public feed never does | Must |
| FR-MOD-3 | Restore / remove with a **required** note — a decision without a note is rejected; every decision writes a `moderation_actions` row with the note | Must |
| FR-MOD-4 | Single moderator role — at MVP `moderator` is one role with full access; Phase 2 may split trust-and-safety + admin | Must |
| FR-ALERTS-8 | Moderator restore — a restored report reappears in the public feed | Must |
| FR-ALERTS-9 | Moderator remove — a removed report never appears in the public feed | Must |
| FR-AUTH-7 | Remote account disable — a moderator can disable a user; `profiles.disabled_at` is set and the account is rejected with `AUTH_DISABLED` | Must |
| FR-ALERTS-11 | Author auto-hide — the queue must surface the reports that the **5 flagged reports in 24 h** author auto-hide moved to `hidden_pending_review`, with an explanatory badge | **Should** |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|-----------|
| `moderation_actions` | The **append-only audit trail**. One row per moderation decision: a `restore`, a `remove`, or a `disable_user`. The only table this unit owns | `id` uuid PK default `gen_random_uuid()`, `report_id` uuid **nullable** FK → `reports.id` (null on `disable_user` rows), `moderator_id` uuid FK → `profiles.id`, `target_user_id` uuid **nullable** FK → `profiles.id` (set only on `disable_user` rows), `decision` text not null CHECK in (`'restore'`, `'remove'`, `'disable_user'`), `note` text not null CHECK `char_length(trim(note)) > 0`, `created_at` timestamptz not null default now() |
| `reports` | The incident row under review. **Owned by unit `004` — read-only here** except for the single `moderation_status` transition written by `moderation_decide` | `id` uuid PK, `author_id` uuid not null (server-side only), `public_visibility` text not null, `category` text nullable, `description` text nullable, `lat` / `lng` double precision not null, `area_hierarchy` jsonb not null, `captured_at` timestamptz not null, `moderation_status` text not null CHECK in (`'visible'`, `'hidden_pending_review'`, `'restored'`, `'removed'`), `created_at` / `updated_at` timestamptz |
| `profiles` | The identity, role, and account-state record. **Owned by unit `002`** — this unit reads `role` and the uploader's identity, and **writes** `disabled_at` | `id` uuid PK → `auth.users.id`, `phone` text unique not null (E.164), `email` text unique, `role` text CHECK in (`'citizen'`, `'moderator'`) default `'citizen'`, `disabled_at` timestamptz nullable, `deleted_at` timestamptz nullable, `created_at` / `updated_at` timestamptz |
| `flags` | The citizens' flag records — the reason a report is in the queue. **Owned by unit `006` — read-only here** | `id` uuid PK, `report_id` uuid not null FK → `reports.id`, `flagger_id` uuid not null FK → `profiles.id`, `reason` text not null CHECK in (`'misinformation'`, `'harassment'`, `'duplicate'`, `'off_topic'`, `'other'`), `created_at` timestamptz not null, `UNIQUE (report_id, flagger_id)` |
| `report_media` | The media attached to a report, rendered in the review detail through a short-lived signed URL. **Owned by unit `004` — read-only here** | `id` uuid PK, `report_id` uuid not null FK → `reports.id`, `storage_path` text not null, `media_type` text not null, `byte_size` integer not null, `duration_seconds` numeric nullable, `width` / `height` integer nullable |

Notes on the schema:

- **`report_id` is nullable, and the schema needs one more column.**
  `decision = 'disable_user'` is not scoped to a report, so `report_id` is
  null on those rows. A `disable_user` action that cannot name the account it
  disabled would force the audit log to parse free text, so the table also
  carries `target_user_id` uuid FK → `profiles.id` (**nullable**, set only on
  `disable_user` rows). Every `restore` / `remove` row links a report and
  leaves `target_user_id` null; every `disable_user` row links a user and
  leaves `report_id` null. This is the only addition to the entity list.
- **The FKs are `ON DELETE SET NULL`, and the trail survives the purges.**
  `report_id`, `moderator_id`, and `target_user_id` use `ON DELETE SET NULL`,
  so the 90-day media purge (unit `008`) and the account-deletion PII purge
  (unit `002` / `008`) never destroy an audit row — the `decision`, the
  `note`, and the `created_at` survive. The practical consequence is that
  `moderator_id` is nullable **in the schema** while every row written by
  this unit always populates it.
- **Append-only is enforced by the database, not by convention.** RLS grants
  moderators `SELECT` and `INSERT` on `moderation_actions` and grants
  **nothing** on `UPDATE` / `DELETE`; a `BEFORE UPDATE OR DELETE` rule
  (trigger) raises on any attempt to mutate an existing row. Even a
  service-role write path cannot rewrite history through this table.
- **The note is the required floor.** The DB CHECK
  `char_length(trim(note)) > 0` rejects a whitespace-only note. The shared
  Zod schema additionally caps the note at **500 characters** (app rule, not a
  DB constraint) and trims before sending.
- **No new table is created for the queue.** `moderation_queue` is an RPC over
  `reports` + `flags` + `profiles`, backed by the existing
  `reports (moderation_status)` index, the `flags (report_id)` index, and the
  `profiles` primary key. The queue adds **zero** rows to the schema.

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `moderation_queue` | **RPC — the moderator-only queue read model.** Filters to `moderation_status = 'hidden_pending_review'`; joins the report's media, its flag rows (reason + flagger + timestamp), and the **uploader's identity**; derives `hide_reason`; ordered `captured_at DESC, id DESC`; cursor-paginated. Enforces the moderator role **inside** the function (`SECURITY DEFINER` + an explicit `auth.uid()` + `profiles.role = 'moderator'` check) and returns `FORBIDDEN` for any other caller | `cursor` text nullable, `limit` integer (default 20, max 100) | `{ "data": { "items": [ … ], "next_cursor": "…" \| null } }` — each item carries `id`, `category`, `description`, `captured_at`, `area_hierarchy`, `public_visibility`, `flag_count`, `flag_reasons` (every reason + flagger id + timestamp), `hide_reason` (`'flag_threshold'` \| `'author_auto_hide'` \| `'both'`), `uploader` (profile id + phone + email — server-side only), `media` (path + type + size); a citizen gets `{ "error": { "code": "FORBIDDEN", … } }` |
| `moderation_decide` | **Edge Function — the report decision.** (1) verify the caller's JWT and `profiles.role = 'moderator'` (else `FORBIDDEN`); (2) validate `decision ∈ {restore, remove}` and a non-empty `note` (else `VALIDATION_FAILED`); (3) in **one transaction**: insert the `moderation_actions` row (`moderator_id` taken from the JWT — never from the request body) and transition the report — `restore` → `restored`, `remove` → `removed`; a report already in `restored` / `removed` is rejected with `CONFLICT` and writes **no** second row | `report_id` uuid, `decision` `'restore'` \| `'remove'`, `note` string (non-empty after trim) | `{ "data": { "report_id": "…", "decision": "…", "moderation_status": "restored" \| "removed", "action_id": "…", "created_at": "…" } }`; on failure `{ "error": { "code": "VALIDATION_FAILED" \| "FORBIDDEN" \| "NOT_FOUND" \| "CONFLICT" \| "AUTH_REQUIRED" \| "AUTH_DISABLED", "message": "…", "details": { … } } }` |
| `disable_user` | **Edge Function — the account disable.** (1) verify the caller's JWT and moderator role; (2) validate the target and a non-empty `reason`; (3) in **one transaction**: set `profiles.disabled_at = now()` and insert a `moderation_actions` row with `decision = 'disable_user'`, `target_user_id` = the target, `report_id` = null, and `note` = the reason | `user_id` uuid, `reason` string (non-empty after trim) | `{ "data": { "user_id": "…", "disabled_at": "…", "action_id": "…" } }`; on failure `{ "error": { "code": "VALIDATION_FAILED" \| "FORBIDDEN" \| "NOT_FOUND", … } }` |
| `useModerationQueue` | TanStack Query hook — the queue query keyed by the cursor page, backed by the `moderation_queue` RPC. A successful decision **invalidates** the queue, the detail, and the audit queries so the row leaves the queue and appears in the trail | `{ cursor?: string \| null, limit?: number }` | `{ items, nextCursor, isLoading, isFetching, refetch, invalidate }` |
| `deriveHideReason` | Pure helper (shared package / admin lib) — decides the badge from the queue payload: the report's own flag count `≥ 3` → `'flag_threshold'`; the report's own count `< 3` but its author has `≥ 5` distinct flagged reports in 24 h → `'author_auto_hide'`; both → `'both'`. The server computes the same value authoritatively; the helper only renders it | the queue item's `flag_count` and the server's `hide_reason` | `'flag_threshold'` \| `'author_auto_hide'` \| `'both'` |
| `maskUploaderIdentity` | Display helper — renders the uploader as a masked handle in the **queue list** (e.g. `+8801•••1234`) and the full identity in the **review detail**. The unmasked value is never placed in a URL, a log line, or a query key | the uploader object from the queue payload | a masked string (list) / a labelled field group (detail) |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 6 |
| Must Have | 5 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| US-MOD-01 | Moderator login + queue list — sign in, land on the `hidden_pending_review` queue, paginate it | Must | Planned |
| US-MOD-02 | Report review detail — media preview, every flag reason, the uploader's identity | Must | Planned |
| US-MOD-03 | Restore / remove decision with a required note — one decision, one audit row, one status transition | Must | Planned |
| US-MOD-04 | Disable a user — search, disable with a reason, the account is locked out server-side | Must | Planned |
| US-MOD-05 | Author-auto-hidden batch (the 5-flags-in-24 h case) surfaced in the queue with an explanatory badge | **Should** | Planned |
| US-MOD-06 | Moderator action audit log — the append-only `moderation_actions` history view | Must | Planned |

> US-MOD-05 is **Should** because FR-ALERTS-11 is Should. It is still built in
> Phase 1: the queue's `hide_reason` derivation is what makes the badge
> possible, and without it a moderator sees an author-auto-hidden report with
> no explanation of why it is in the queue. US-MOD-06 is **Must** because the
> append-only trail is a stated constraint of this unit and the audit view is
> the only place a moderator can verify that a decision was recorded — it is
> also how US-MOD-03's "exactly one row per decision" is observed.

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-foundation` | `packages/shared` contracts (the `ModerationStatus` enum, `FlagReason`, `ApiErrorCode` incl. `FORBIDDEN` / `VALIDATION_FAILED` / `CONFLICT` / `AUTH_DISABLED` / `AUTH_REQUIRED`, the shared Zod schemas, the i18n key contract), the typed Supabase client, the **Next.js App Router skeleton** under `apps/admin`, the **shared token set** (the web-safe CSS custom-property subset), and the TanStack Query setup |
| `002-identity` | The `profiles` row and the `role` enum this unit reads to authorize the moderator and to identify the uploader; the `disabled_at` column this unit sets; the Auth identity the console signs in with (the **same** Supabase Auth users, email-primary) |
| `004-capture` | The `reports` / `report_media` tables and their RLS (public select only for `visible` / `restored`), the `moderation_status` column this unit transitions, the **private** Storage bucket and the short-lived signed-URL path used for the media preview, and the `area_hierarchy` payload rendered on the review detail |
| `006-alerts` | The `flags` rows and the 3-flag / 5-flag transitions that put reports into `hidden_pending_review`; the public `alerts_feed` projection this unit's decisions are verified against |

### Depended By

None — this unit is a leaf. It has no downstream consumer; unit `008` depends
on the whole system only for the release pipeline, not on the console.

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Supabase Auth (GoTrue) | Moderator sign-in and session refresh — the admin authenticates as a **real user**, never as a service role | Medium — email/password only for internal accounts; no OTP reset flow in the console; a moderator whose account is disabled gets `AUTH_DISABLED` |
| Supabase Postgres + PostgREST | The `moderation_queue` RPC and the `profiles` / `flags` reads | Low — a small, indexed, cursor-paginated read model |
| Supabase Edge Functions (Deno) | `moderation_decide` and `disable_user` — the only two write paths | Medium — the functions hold the service-role key **server-side**; the browser never sees it. Cold-start latency is on the decision path, not the panic path |
| Supabase Storage (private bucket) | The media preview on the review detail via short-lived signed URLs | Medium — the bucket is private and the URL expires; an expired URL must be re-requested, not cached |
| Vercel Hobby | The console's hosting | Low — an internal, low-traffic tool |
| npm registry | Next.js, `@supabase/supabase-js`, `@tanstack/react-query`, Zod, React Hook Form, Playwright | Low |

---

## Technical Context

### Suggested Technology

Next.js (App Router, TypeScript strict) on Vercel, React 18 + Server
Components for the shell and the route guards, `@supabase/supabase-js` (typed,
from unit `001`) with the **anon key only** for the browser reads and the RPC
call, `@supabase/ssr` for the cookie-backed session (see Notes), TanStack Query
for the queue / detail / audit reads and the post-decision invalidation, React
Hook Form + the shared Zod resolver for the decision note and the disable
reason, CSS custom properties for the token layer (no CSS-in-JS runtime, no
component library), Jest + React Testing Library for the unit tests, **Playwright**
for the admin E2E flows (moderator login → restore / remove), and Supabase local
for the RPC / RLS / Edge Function integration tests.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Admin → Supabase Auth (GoTrue) | API | HTTPS — `POST /auth/v1/token` with the moderator's email + password; the session JWT is attached to every call |
| Admin → PostgREST RPC `moderation_queue` | API | HTTPS — `POST /rest/v1/rpc/moderation_queue` with the moderator's JWT; the RPC returns `{ "data": … }` and `{ "error": { "code": "FORBIDDEN" } }` |
| Admin → Edge Function `moderation_decide` | API | HTTPS — `POST /functions/v1/moderation_decide` with the moderator's JWT; returns the uniform `{ "data": … }` / `{ "error": … }` envelope |
| Admin → Edge Function `disable_user` | API | HTTPS — `POST /functions/v1/disable_user` with the moderator's JWT; same envelope |
| Admin → Supabase Storage (signed read URL) | API | HTTPS — `POST /storage/v1/object/sign/…` for the media preview; **short-lived**, private bucket, never cached beyond the session |
| Admin → `packages/shared` | Package | TypeScript workspace import — the Zod schemas, the enums, the error codes, the i18n keys |
| Admin → TanStack Query | Package | The in-memory cache; `invalidateQueries` drives the post-decision refresh of the queue, the detail, and the audit trail |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `moderation_actions` rows | Postgres table | **Low volume** — a handful per moderator per day at MVP scale | Append-only; survives the 90-day media purge and the account-deletion PII purge through `ON DELETE SET NULL`; never updated, never deleted |
| `moderation_queue` read model | **No new table** — an RPC over `reports` + `flags` + `profiles` | 0 extra rows | n/a |
| Admin session | Browser cookie (`@supabase/ssr`) | 1 session | Until sign-out or expiry; refreshed by the Supabase client |
| TanStack Query cache | In-memory (browser tab) | The current queue page, one detail, one audit page | Until the tab closes or the query is invalidated |
| Media signed URLs | In-memory | 1 per open preview | **Seconds** — re-requested on demand, never persisted |

---

## Admin Console Screens

The console is a **desktop** web app under `apps/admin` (Next.js App Router).
It uses the **same token set as the mobile app** — the web-safe subset of
`docs/design/design-tokens.md` as CSS custom properties — but it is **not** a
phone frame and **not** a port of any prototype screen. The layout is a
**wide two-column review view** on the detail route and a **list + rail**
layout on the queue route. See Notes for why this is a **new surface**.

| Route | Screen | Story | Notes |
|-------|--------|-------|-------|
| `/login` | Moderator sign-in | US-MOD-01 | Email + password via Supabase Auth. No phone resolution, no biometric, no "Remember me" — a browser session. On success the console reads `profiles.role`; a signed-in **citizen** gets a "moderator access only" state and every call still returns `FORBIDDEN` |
| `/queue` | The `hidden_pending_review` queue | US-MOD-01, US-MOD-05 | The list of hidden reports: category accent tile, area, category, description, relative time, flag count, the flag-reason chips, the **hide-reason badge**, and the **masked** uploader handle. Cursor pagination with a "Load more" control. Empty state when the queue is clear |
| `/queue/[reportId]` | Review detail + decision form | US-MOD-02, US-MOD-03 | The **two-column desktop** view. Left: the media preview (signed URL), the area, the category, the description, and the capture time. Right: the flag-reason list, the uploader identity block, and the decision panel (decision choice, **required note**, submit) |
| `/users` | Search + disable | US-MOD-04 | Search a user by phone / email / profile id; open the row; disable with a required reason. Shows the account state and a plain per-user report count (moderation context, never an aggregate chart) |
| `/audit` | Moderator action audit log | US-MOD-06 | The append-only history: decision, the linked report or user, the moderator, the note, the timestamp. Filter by decision and by report. Read-only — there is no edit or delete affordance anywhere in this view |

### The review detail route — the two-column layout contract

| Column | Element | Token / rule |
|--------|---------|--------------|
| Left | Media preview | The report's media through a **short-lived signed URL**; the bucket is private. The preview uses the same radius (`--r-md`, 14 px) and shadow (`--shadow-card`) as the mobile alert card. A missing or expired URL shows a neutral placeholder, never a broken image |
| Left | Report meta | The area (`English · বাংলা` pair), the category (the shared category accent map — `backpack` / `warning` / `local_fire_department` / `medical_services` / `diamond` with their 15 % tints), the description **as written** (plain text), and the capture time. A **null** category renders the neutral "uncategorized" placeholder; a **missing** description renders no empty gap |
| Right | Flag reasons | **Every** flag on the report: the reason (the 5-value enum, Bangla / English pair), the flagger id, and the timestamp. The count is shown as a number next to the heading — a count, never a chart |
| Right | Uploader identity | The full identity from the server: profile id, registered phone, email, and the account state. **Never** in a URL, a query key, or a log line |
| Right | Decision panel | The `restore` / `remove` choice, the **note** textarea (required — the submit is blocked and the field shows the error when the note is blank after trimming), and the submit button. The remove choice is visually distinct and its button label says **permanently** |
| Full width | Hide-reason banner | When the report was auto-hidden by the **author rule** (5 flagged reports in 24 h), a banner explains it: this report is in the queue because its author was auto-hidden, not because it reached 3 flags. The banner is explanatory, **not** a statistic |
| Full width | Decision history | The prior `moderation_actions` rows for this report, rendered from the same append-only trail the `/audit` view reads |

---

## Constraints

- **The service-role key is never used in the admin browser bundle.** This is
  an explicit ARCHITECTURE §F rule. The admin authenticates as a **real
  Supabase user** with `profiles.role = 'moderator'` and relies on **RLS plus
  the RPC / Edge Function role checks**. `apps/admin` reads only
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
  `SUPABASE_SERVICE_ROLE_KEY` must not appear in the admin's environment at
  all, and a **build-output grep** proves it (see Success Criteria). The
  service-role key lives only inside the Edge Functions and CI.
- **A note is required on every decision** (FR-MOD-3). The DB CHECK
  (`char_length(trim(note)) > 0`) is the enforcement point; a decision without
  a note is rejected with `VALIDATION_FAILED` and **writes no
  `moderation_actions` row**. The `disable_user` function's `reason` is
  stored in the same `note` column, so a disable without a reason is rejected
  the same way.
- **The uploader's identity is visible in the console and never exposed
  publicly** (FR-MOD-2). It is returned by the moderator-only RPC, it is never
  written to a public projection, and it never reaches a URL, a query key, or
  a log line.
- **`remove` is permanent.** A removed report never returns to a public feed
  (FR-ALERTS-9). There is no un-remove, no override, and no bulk revert at
  MVP.
- **`restore` returns the report to visibility** (FR-ALERTS-8). The transition
  writes `moderation_status = 'restored'`, which the public read model treats
  as visible (`moderation_status IN ('visible','restored')`).
- **Every action appends to `moderation_actions`** — the audit trail is
  append-only. There is no `UPDATE` or `DELETE` path, and the DB rejects
  mutation of an existing row.
- **A citizen calling the queue RPC or a decision function gets `FORBIDDEN`.**
  The check happens **server-side** in the RPC and in both Edge Functions —
  the console's own UI guards are convenience, never authorization.
- **The console must not become a crime-statistics dashboard** (ADR-010 /
  FR-NG-3 / FR-NG-4). It shows the queue and the decisions, and **no aggregate
  crime chart**: no chart library in the dependency set, no chart component, no
  trend, no heatmap, no hotspot ranking, no category distribution, and no
  "total crime" counter. The only numbers allowed are **per-report** counts
  (the flag count on one report) and a **per-user** count in the `/users` row
  — moderation context about a single item, never an aggregate across users.
- **The moderator role is a single role with full access** at MVP
  (FR-MOD-4). There is no second tier, no scoped permission, and no
  read-only moderator.
- **The console is a desktop surface, not a phone frame.** The review detail
  is a wide two-column layout. The token set is reused as-is — no new hex
  outside `docs/design/design-tokens.md`, no third-party UI kit, no
  phone-frame chrome.
- **The layout is derived, not invented.** The review detail reuses the
  mobile alert card's visual pattern (category accent tile, the
  area / category / description / time lines, the 14 px radius, the card
  shadow) and the shared token set. It introduces **no new design system**.
- **`moderator_id` comes from the JWT**, never from the request body — a
  client cannot write an action row in someone else's name.
- **Every decision is exactly one row.** A repeated decision on a report that
  is already `restored` or `removed` is rejected with `CONFLICT` and writes no
  second row; the action insert and the status transition happen in **one
  transaction**, so a row can never exist without its transition.
- **No bulk actions.** Decisions are per report with a per-decision note.
  There is no "restore all", no mass remove, and no queue-wide operation.
- **All user-facing strings go through i18n**; **Bangla is primary**, English
  is secondary, and no string is hardcoded in either language. The console
  consumes the shared bundle contract from unit `001`; it does not start a
  second i18n system.
- **Every interactive control is ≥ 48 × 48 px** with an accessible name, and
  token contrast pairs are verified at WCAG AA in both themes (inherited from
  unit `001`).
- **Signed URLs are short-lived and never persisted.** The media preview
  re-requests a URL when it expires and never writes it to storage, a query
  key, or a log.
- **`pnpm typecheck`, `pnpm lint`, and `pnpm test` must pass** across the
  workspace, plus the migration dry-run against Supabase local.

---

## Success Criteria

### Functional

- [ ] A **signed-in moderator** sees the `hidden_pending_review` queue — the
      list renders only reports whose `moderation_status =
      'hidden_pending_review'`, and a `visible` / `restored` / `removed`
      report never appears in it (FR-MOD-1)
- [ ] A **signed-in citizen** calling `moderation_queue` or
      `moderation_decide` gets `FORBIDDEN` — asserted by an integration test
      against Supabase local, not only by the UI (FR-MOD-1)
- [ ] The **review detail** shows the media, **every** flag reason, and the
      **uploader's identity** — the flag list is complete (no truncation, no
      "and N more"), and the uploader's id / phone / email are present
      (FR-MOD-2)
- [ ] A decision submitted with an **empty note** is rejected and **no
      `moderation_actions` row is written** — the response code is
      `VALIDATION_FAILED`, the row count is unchanged, and the report's
      `moderation_status` is unchanged (FR-MOD-3)
- [ ] `restore` makes the report **reappear in the public feed** — after the
      decision, `moderation_status = 'restored'` and the report is returned by
      the public `alerts_feed` projection (FR-ALERTS-8)
- [ ] `remove` makes the report **permanently absent from the public feed** —
      after the decision, `moderation_status = 'removed'` and the report is
      never returned by the public feed again, including after a later
      re-query (FR-ALERTS-9)
- [ ] Disabling a user sets `profiles.disabled_at` and the user sees
      **"Your account has been disabled. Contact support."** on next open,
      and their writes are rejected with `AUTH_DISABLED` (FR-AUTH-7)
- [ ] Every decision produces **exactly one** `moderation_actions` row with
      the **note**, the **moderator**, and a **timestamp** — a second decision
      on an already-decided report is rejected with `CONFLICT` and adds no
      row (FR-MOD-3)
- [ ] The queue **surfaces the author-auto-hidden reports** — a report moved
      to `hidden_pending_review` by the 5-flags-in-24 h rule appears in the
      queue with the **explanatory badge**, and the badge states that the
      author rule caused the hide rather than the 3-flag threshold
      (FR-ALERTS-11)
- [ ] The **audit view** lists the `moderation_actions` history in order, and
      there is **no edit or delete affordance** anywhere in it (FR-MOD-3)
- [ ] **No aggregate chart or crime-statistics view exists in the console** —
      asserted by a source scan for chart libraries, chart components, and
      aggregate queries (FR-NG-3 / FR-NG-4 / ADR-010)

### Non-Functional

- [ ] The **admin bundle contains no service-role key** — verified by a
      **build-output grep** for `SUPABASE_SERVICE_ROLE_KEY` and for the
      service-role JWT prefix across the built `apps/admin` output, which must
      return **zero** matches (ARCHITECTURE §F)
- [ ] The admin's environment exposes **only** `NEXT_PUBLIC_SUPABASE_URL` and
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the service-role variable is absent
      from the admin's configuration entirely
- [ ] The review detail renders its media through a **short-lived signed
      URL**; the bucket is never public and the URL is never persisted or
      logged
- [ ] Every interactive control in the console is **≥ 48 × 48 px** with an
      accessible name, and the token contrast pairs it uses are verified at
      **WCAG AA** in both themes
- [ ] The console's layout uses **only** tokens from
      `docs/design/design-tokens.md` — no new hex value is introduced, and
      the review detail matches the mobile alert card's visual pattern
      (category accent tile, area / category / description / time lines, 14 px
      radius, card shadow)
- [ ] The uploader's identity never appears in a **URL, a query key, or a log
      line** — asserted by a source review of the queue and detail code paths
- [ ] The queue's first page loads in **< 2 s** on a warm session, with a
      skeleton while loading (the same responsiveness bar unit `006` sets for
      the citizen feeds)
- [ ] Every new i18n key resolves in `bn` (primary, native-speaker reviewed)
      and `en`

### Quality

- [ ] Supabase-local integration tests cover the `moderation_queue` RPC: the
      `hidden_pending_review` filter, the moderator-only role check returning
      `FORBIDDEN` for a citizen, the flag-reason aggregation, the
      `hide_reason` derivation, and the cursor pagination
- [ ] Supabase-local integration tests cover the `moderation_actions` CHECK
      constraints — an empty / whitespace-only note is rejected, an invalid
      `decision` is rejected, and the append-only trigger rejects an `UPDATE`
      and a `DELETE`
- [ ] Supabase-local integration tests cover `moderation_decide`: the
      empty-note rejection writes **no** row, `restore` → `restored`,
      `remove` → `removed`, the double-decision `CONFLICT`, and the
      one-row-per-decision guarantee
- [ ] Supabase-local integration tests cover `disable_user`: `disabled_at` is
      set, a `moderation_actions` row with `decision = 'disable_user'` is
      written with the reason as its note, and the target's writes are then
      rejected with `AUTH_DISABLED`
- [ ] A **negative RLS test** asserts that a citizen cannot select
      `moderation_actions`, cannot read `profiles` rows they do not own, and
      cannot read another user's uploader identity through the queue
- [ ] A **Playwright** E2E flow covers moderator login → the queue renders →
      open a report → the detail shows the media, the flag reasons, and the
      uploader → submit a decision with an empty note (rejected) → submit it
      with a note (accepted) → the report leaves the queue and appears in the
      audit view
- [ ] A **Playwright** E2E flow covers the `/users` search → disable with a
      reason → the account state flips to disabled
- [ ] A source scan asserts that the console contains **no** chart library,
      **no** chart component, and **no** aggregate crime query (FR-NG-3 /
      FR-NG-4 / ADR-010)
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass, and the migration
      dry-run against Supabase local passes

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-007-moderation-1 | ddd | US-MOD-01, US-MOD-06 | `0006_moderation.sql` — the `moderation_actions` table (the 3-value `decision` CHECK, the non-empty `note` CHECK, `ON DELETE SET NULL` FKs, the append-only trigger), the moderator-only RLS policies, the indexes, and the `moderation_queue` RPC (the role check, the flag aggregation, the `hide_reason` derivation, the cursor pagination) |
| bolt-007-moderation-2 | ddd | US-MOD-03, US-MOD-04 | The `moderation_decide` Edge Function — note validation, the single transaction (action row + status transition), the `CONFLICT` guard, the `restore` / `remove` semantics — and the `disable_user` Edge Function — `disabled_at` + a `disable_user` action row with the reason as its note |
| bolt-007-moderation-3 | simple | US-MOD-01, US-MOD-05 | The admin shell + the token layer (the web-safe CSS custom-property subset from `docs/design/design-tokens.md`), the `/login` route, the `/queue` route (the list, the flag-reason chips, the hide-reason badge, the masked uploader handle, the cursor pagination), and `useModerationQueue()` with the post-decision invalidation |
| bolt-007-moderation-4 | simple | US-MOD-02, US-MOD-03 | The `/queue/[reportId]` review detail — the wide two-column layout (the media preview on the signed URL, the report meta, the complete flag-reason list, the uploader identity block) and the decision panel (the choice, the required note, the submit, the error mapping for `VALIDATION_FAILED` / `FORBIDDEN` / `CONFLICT`) |
| bolt-007-moderation-5 | simple | US-MOD-04, US-MOD-06 | The `/users` route (search, the account row, the disable-with-reason action) and the `/audit` route (the append-only action history with its filters and no edit / delete affordance) |

---

## Notes

- **The prototype's screen 23 ("Charts — Admin App") is a "Coming soon"
  placeholder, and it is EXCLUDED.** The screen shows an `analytics` icon, the
  heading **"Coming soon — admin app"**, and the body copy *"Detailed crime
  analytics live in the separate Nagar Shield admin app. Citizen users see
  live alerts only."* — with the chart markup sitting inside a
  `display: none` block. FR-NG-3 (not a government data platform — no
  aggregation, no published crime stats), FR-NG-4 (not an AI crime-prediction
  tool), and ADR-010 (**"Exclude prototype `S-23` Charts admin — Admin is
  moderation-only; analytics limited to product telemetry, not public crime
  dashboards"**) rule it out. **No chart is built in this console, and the
  console is moderation-only.** The prototype's own copy is the rule the
  build follows: the admin app is a moderation tool, and the analytics the
  placeholder gestures at live *outside* the product. The unit list records
  that screen 23 "has **no unit**" — this unit must not quietly adopt it.
- **The prototype's flag-report dialog belongs to the citizen app, not here.**
  The `#flag-dialog` in the prototype's script blocks (opened by the
  `[data-dialog="flag"]` click handler) is the **citizen's** flag composer:
  the five reason radios, the optional 140-char note, **রিপোর্ট পাঠান**, and
  **বাতিল**. That surface is **unit `006`**'s (it is the Alerts feed's flag
  sheet). This console has **no** flag composer — it **reads** the flag
  records the citizen side created and shows them in the review detail. A
  moderator who could flag a report would be an unlogged write path, and the
  audit trail exists so that every write is attributable.
- **The prototype has no real admin design, so the console is a NEW surface
  built from existing tokens.** The prototype's screen 23 is a placeholder, not
  a layout; there is no moderator screen, no queue, and no decision form to
  port. The console's layout is therefore **derived** from the shared token
  set plus the **review-detail pattern from the mobile alert card** (the
  category accent tile, the area / category / description / time lines, the
  14 px radius, the card shadow) and the `.list-row` primitive for the queue
  rows. It is a **desktop** layout — a wide two-column review view, not a
  phone frame — and it **must not invent a new design system**: no new hex
  outside `docs/design/design-tokens.md`, no third-party UI kit, no
  phone-frame chrome, no separate admin palette. Visual consistency with the
  mobile app comes from the token set, not from a new design.
- **The console reuses the mobile app's token set as CSS custom properties.**
  The token set is already CSS-native (`--violet-600`, `--ink-950`,
  `--surface-white`, `--r-md`, `--shadow-card`, `--grad-primary`), so the
  admin reads it directly as a web-safe subset; the React Native port in
  unit `001` consumes the same values. A token that has no web use (the
  tap-target dp rules, the RN `Pressable` states) is simply not part of the
  admin's subset — the **values** are identical where they overlap.
- **The queue's `hide_reason` is what makes FR-ALERTS-11 legible.** The
  author auto-hide (5 flagged reports in 24 h) moves **all** of that author's
  reports from the last 24 h into `hidden_pending_review` — including reports
  that have **fewer than 3 flags of their own**. Without a derived reason, a
  moderator would see a report with one flag sitting in a "flagged" queue and
  have no way to know why. The server computes `hide_reason` authoritatively
  (`'flag_threshold'` | `'author_auto_hide'` | `'both'`); the client renders it
  as a badge and an explanatory banner. It is a **per-report** explanation,
  not an aggregate — the console never says "this author has N reports in
  the queue" as a statistic.
- **`moderation_actions` grows a `target_user_id` column.** The brief's entity
  list does not name one, but a `disable_user` action that cannot point at the
  account it disabled would push identity into free-text notes and break the
  audit trail's usefulness. The column is **nullable** and set only on
  `disable_user` rows; `report_id` is likewise nullable and set only on
  `restore` / `remove` rows. This is the one schema addition this unit makes
  beyond the named entity, and it is recorded here deliberately.
- **The `note` carries the `disable_user` reason.** There is one `note`
  column, so the `disable_user` function's `reason` is written there. The
  note stays **required** in all three cases — a disable without a reason is
  rejected exactly like a decision without a note.
- **The audit trail survives the purges, so `moderator_id` is nullable in the
  schema.** `ON DELETE SET NULL` on the FKs means the 90-day media purge and
  the account-deletion PII purge never destroy an audit row — the decision,
  the note, and the timestamp survive. Every row this unit writes populates
  `moderator_id` from the JWT, so a null there only ever means "the moderator's
  account was later deleted".
- **The append-only guarantee is a database property.** There is no `UPDATE`
  or `DELETE` on `moderation_actions` in the API, and the DB refuses to mutate
  an existing row. An audit trail that can be rewritten is not an audit trail.
- **The decision and its audit row are written in one transaction.** A row can
  never exist without its status transition, and a transition can never happen
  without its row. The `moderator_id` is taken from the **JWT**, never from the
  request body, so a client cannot write an action in someone else's name.
- **The role check is server-side, and the UI guard is only a convenience.**
  A citizen who opens the console sees a "moderator access only" state — but
  the real enforcement is the `FORBIDDEN` returned by `moderation_queue` and
  by both Edge Functions, each of which re-checks `profiles.role` for the
  calling JWT. The integration test asserts the server behaviour, not the
  screen.
- **The moderator session is a browser session, and it still carries the
  anon key.** The console signs in with the same Supabase Auth users the
  mobile app uses (email + password — no phone resolution, no biometric, no
  OTP reset flow, no "Remember me"). The session is held in a cookie via
  `@supabase/ssr` so the App Router's Server Components can read the role
  before rendering; the browser-side client still uses the **anon key** and
  the moderator's own JWT, and every privileged call re-checks
  `profiles.role` server-side. A server-side session does **not** license a
  service-role client — the admin must not hold one.
- **The service-role key stays in the Edge Functions.** `moderation_decide`
  and `disable_user` run server-side with the service role so they can
  transition a report and write an audit row atomically; the **browser** only
  ever holds the anon key and the moderator's own JWT. The build-output grep
  in the Success Criteria is the mechanical proof, and it is the check that
  catches the most damaging possible mistake in this unit.
- **Signed URLs are short-lived and the preview must survive expiry.** The
  media preview re-requests a signed URL when it expires and shows a neutral
  placeholder rather than a broken image; the URL is never persisted to
  storage, a query key, or a log.
- **The uploader identity is masked in the list and full in the detail.** The
  queue list shows a masked handle; the review detail shows the full identity.
  Either way the value stays in the response payload — it never reaches a URL,
  a query key, or a log line, and it never reaches a public projection.
- **No bulk actions, at MVP.** Decisions are per report with a per-decision
  note. "Restore all" and mass-remove are explicitly out of scope — they
  would make the required note meaningless.
- **Cross-unit boundaries at a glance.** Unit `002` owns `profiles`, the role
  enum, and the disabled-account **in-app gate** (the copy *"Your account has
  been disabled. Contact support."* lives there). Unit `004` owns `reports`,
  `report_media`, the Storage bucket, and the `moderation_status` CHECK.
  Unit `006` owns `flags`, the flag thresholds, and the public feed. **This
  unit owns** `moderation_actions`, `moderation_queue`, `moderation_decide`,
  `disable_user`, and the admin console.
