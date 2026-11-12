---
intent: 001-nagar-shield-mvp1
phase: inception
status: units-decomposed
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Nagar Shield MVP Phase 1 — Unit Decomposition

This intent decomposes into **8 units of work**.

The project is `full-stack-web` per `memory-bank/project.yaml`, so the
decomposition uses **domain-driven** backend units (default bolt type
`ddd-construction-bolt`) plus feature-based frontend units (default bolt type
`simple-construction-bolt`).

## Units Overview

### Unit 1: `001-foundation`

- **Purpose**: The monorepo, the shared contract package, and the design
  system that every other unit depends on.
- **Responsibility**: Workspace scaffolding, TypeScript configuration, the
  `packages/shared` contract layer (Zod schemas, enums, error codes), the Expo
  app skeleton with Expo Router groups, and the React Native design tokens
  ported 1:1 from `docs/design/design-tokens.md`.
- **Assigned Requirements**: FR-UX-1, FR-UX-3, FR-UX-4, FR-UX-5 (foundational
  portion), plus the shared contract surface every other unit consumes.
- **Dependencies**: None.
- **Depended by**: All other units.
- **Deliverables**:
  - `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`
  - `packages/shared` — Zod schemas, `ReportCategory`, `FlagReason`,
    `ModerationStatus`, `AreaHierarchy`, API error codes, i18n key contract
  - `apps/mobile` — Expo app, Expo Router groups `(auth)` / `(onboarding)` /
    `(app)`, `shared/theme` (light + dark tokens), `shared/ui` primitives
  - `apps/admin` — Next.js App Router skeleton with the same token set
  - `docs/design/` — the port contract, already generated
  - `.github/workflows/ci.yml` — lint + typecheck + unit
- **Estimated Complexity**: M

### Unit 2: `002-identity`

- **Purpose**: Signup, dual-identifier login, session persistence, biometric
  re-auth, email-OTP password reset, and remote account disable.
- **Responsibility**: The `identity` domain module — `profiles`, roles, remote
  disable, biometric preference flags, and the identifier-resolution RPC.
- **Assigned Requirements**: FR-AUTH-1 … FR-AUTH-7, FR-DATA-6 (account
  deletion), FR-PERMS-1 (permission just-in-time, applied to auth screens).
- **Dependencies**: `001-foundation`.
- **Depended by**: `003-help-seek`, `004-capture`, `005-location`, `006-alerts`,
  `007-moderation`.
- **Deliverables**:
  - `supabase/migrations/0001_identity.sql` — `profiles`, roles, RLS
  - `resolve_login_identifier` RPC
  - Supabase Auth wiring + email-OTP reset
  - Mobile: `(auth)` group screens (Login, Registration, Forgot Password,
    OTP), biometric lock gate, Settings → account section
- **Estimated Complexity**: M

### Unit 3: `003-help-seek`

- **Purpose**: Help Alert (Police / Medical / Fire / Personal Emergency) and
  More Help (hotlines / thana line / find-a-station).
- **Responsibility**: The `help_seek` domain module — curated stations and
  hotlines, the nearest-thana query with its 10 km fallback, and the
  wrong-number report workflow. The panic path itself is client-only.
- **Assigned Requirements**: FR-HELP-1 … FR-HELP-8, FR-SEEK-1 … FR-SEEK-6,
  FR-PERMS-2 (Help Alert fallback when location is denied), FR-PERMS-3
  (battery-saver warning).
- **Dependencies**: `001-foundation`, `002-identity` (contacts for Personal
  Emergency).
- **Depended by**: `006-alerts` (Home surfaces the feed), `007-moderation`
  (wrong-number reports).
- **Deliverables**:
  - `supabase/migrations/0002_help_seek.sql` — `stations`, `hotlines`,
    `wrong_number_reports`
  - `nearest_thana` RPC + `stations` / `hotlines` read models
  - Curated dataset JSON (Dhaka metro) + seed
  - Mobile: Home surface (Help Alert dominant), Help Alert screen, More Help
    bottom sheet, contact picker sheet, thana line, find-a-station map
  - `ACTION_DIAL` intent helper + confirmation sheet with
    `app_open_to_dialer_ms`
- **Estimated Complexity**: M

### Unit 4: `004-capture`

- **Purpose**: Capture an incident as media with GPS, timestamp, optional
  description, and anonymous-by-default visibility.
- **Responsibility**: The `capture` domain module — `reports`, `report_media`,
  area-hierarchy extraction, EXIF stripping, media caps, and the offline upload
  queue.
- **Assigned Requirements**: FR-CAPTURE-1 … FR-CAPTURE-7, FR-HIST-3 (immediate
  visibility), FR-PERMS-1, FR-PERMS-2 (hide camera/mic when denied).
- **Dependencies**: `001-foundation`, `002-identity`.
- **Depended by**: `005-location` (shares the GPS/location helper),
  `006-alerts` (the feed reads reports), `007-moderation` (queue reads
  reports).
- **Deliverables**:
  - `supabase/migrations/0003_capture.sql` — `reports`, `report_media`,
    `area_hierarchy`, `geocode_cache`, PostGIS indexes
  - `finalize_capture` Edge Function (reverse-geocode, Dhaka-local table
    first)
  - Mobile: Capture screen, camera/gallery/file pickers, description field
    with the 140-char counter, offline queue with backoff
- **Estimated Complexity**: L

### Unit 5: `005-location`

- **Purpose**: Share a one-shot location snapshot with one contact or all
  primary contacts.
- **Responsibility**: The `location` domain module — `location_shares` audit
  rows and the snapshot payload builder.
- **Assigned Requirements**: FR-LOC-1 … FR-LOC-4, FR-PERMS-1, FR-PERMS-2
  (manual entry when location is denied).
- **Dependencies**: `001-foundation`, `002-identity` (contacts), `004-capture`
  (shared GPS helper).
- **Depended by**: None.
- **Deliverables**:
  - `supabase/migrations/0004_location.sql` — `location_shares`
  - `location_shares` write path + `location_share_intent_ms` telemetry
  - Mobile: Location Sharing screen, contact picker, OS share-sheet fallback
- **Estimated Complexity**: S

### Unit 6: `006-alerts`

- **Purpose**: The BD-wide Alerts feed with area filters, auto-refresh, and
  flagging; plus the local History view and its map.
- **Responsibility**: The `alerts` domain module — `flags`, feed queries, rate
  limits, and the flag-threshold transition. Also owns `history_nearby` and
  the map surface (both read models over `reports`).
- **Assigned Requirements**: FR-ALERTS-1 … FR-ALERTS-11, FR-HIST-1 …
  FR-HIST-4, FR-UX-2 (Help Alert dominance on Home).
- **Dependencies**: `001-foundation`, `002-identity`, `004-capture` (reports).
- **Depended by**: `007-moderation`.
- **Deliverables**:
  - `supabase/migrations/0005_alerts.sql` — `flags`, feed + history views
  - `alerts_feed`, `history_nearby`, `moderation_queue` RPCs
  - `flag_report` Edge Function (rate limit + threshold transition)
  - Mobile: Alerts feed on Home, area chip row, flag sheet, History screen,
    History map (MapLibre + OSM)
- **Estimated Complexity**: L

### Unit 7: `007-moderation`

- **Purpose**: The internal moderator console — review the hidden queue,
  restore or remove with a note, and disable a user.
- **Responsibility**: The `moderation` domain module — `moderation_actions`,
  the queue view, and the decision workflow.
- **Assigned Requirements**: FR-MOD-1 … FR-MOD-4, FR-AUTH-7 (remote disable),
  FR-ALERTS-8, FR-ALERTS-9, FR-ALERTS-11 (author auto-hide visibility).
- **Dependencies**: `001-foundation`, `002-identity`, `004-capture`,
  `006-alerts`.
- **Depended by**: None.
- **Deliverables**:
  - `supabase/migrations/0006_moderation.sql` — `moderation_actions`
  - `moderation_decide`, `disable_user` Edge Functions
  - `apps/admin` — Next.js moderator console (login, queue, detail, decision)
- **Estimated Complexity**: M

### Unit 8: `008-jobs-operations`

- **Purpose**: The scheduled background work, the media-retention policy, and
  the delivery pipeline.
- **Responsibility**: The `jobs` domain module — media purge, geocode-cache
  cleanup — plus CI, EAS build configuration, and the deployment/verification
  procedure.
- **Assigned Requirements**: FR-DATA-1, FR-DATA-2, FR-DATA-4, FR-DATA-5,
  FR-DATA-6 (purge leg), and the release pipeline.
- **Dependencies**: `001-foundation` … `007-moderation`.
- **Depended by**: None.
- **Deliverables**:
  - `supabase/functions/purge-media/` (90-day hard delete, idempotent)
  - `supabase/functions/cleanup-geocode-cache/`
  - `eas.json` (dev / preview / production profiles)
  - `.github/workflows/ci.yml` + `build.yml`
  - `docs/operations/runbook.md` — build, deploy, verify, monitor
- **Estimated Complexity**: S

## Requirement-to-Unit Mapping

Each FR is assigned to exactly one unit.

- **FR-AUTH-1** … **FR-AUTH-7** → `002-identity`
- **FR-CAPTURE-1** … **FR-CAPTURE-7** → `004-capture`
- **FR-HELP-1** … **FR-HELP-8** → `003-help-seek`
- **FR-SEEK-1** … **FR-SEEK-6** → `003-help-seek`
- **FR-LOC-1** … **FR-LOC-4** → `005-location`
- **FR-HIST-1** … **FR-HIST-4** → `006-alerts`
- **FR-ALERTS-1** … **FR-ALERTS-11** → `006-alerts`
- **FR-MOD-1** … **FR-MOD-4** → `007-moderation`
- **FR-DATA-1** → `008-jobs-operations`
- **FR-DATA-2** → `008-jobs-operations`
- **FR-DATA-3** → `004-capture`
- **FR-DATA-4** → `008-jobs-operations`
- **FR-DATA-5** → `008-jobs-operations`
- **FR-DATA-6** → `002-identity` (deletion + recovery window), purge leg in
  `008-jobs-operations`
- **FR-PERMS-1** → `002-identity` (auth screens); just-in-time pattern
  enforced by `004-capture`, `005-location`
- **FR-PERMS-2** → `003-help-seek` (Help Alert fallback) and `004-capture`
  (hide camera/mic)
- **FR-PERMS-3** → `003-help-seek`
- **FR-UX-1** → `001-foundation` (i18n scaffolding)
- **FR-UX-2** → `006-alerts` (Home composition) with `003-help-seek` (the
  dominant cards)
- **FR-UX-3** → `001-foundation`
- **FR-UX-4** → `001-foundation`
- **FR-UX-5** → `001-foundation`

## Unit Dependency Graph

```text
                    ┌────────────────────┐
                    │  001-foundation    │
                    │  monorepo, shared, │
                    │  design tokens     │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  002-identity      │
                    │  auth, profiles    │
                    └─────────┬──────────┘
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼──────┐ ┌──────▼───────┐ ┌─────▼────────┐
    │ 003-help-seek  │ │ 004-capture  │ │ 005-location │
    │ help + more    │ │ reports      │ │ snapshot     │
    └─────────┬──────┘ └──────┬───────┘ └──────────────┘
              │               │
              │        ┌──────▼────────┐
              │        │ 006-alerts    │
              │        │ feed+history  │
              │        └──────┬────────┘
              │               │
              │        ┌──────▼────────┐
              └───────▶│ 007-moderation│
                       └───────────────┘
                              │
                    ┌─────────▼──────────┐
                    │ 008-jobs-operations│
                    │ purge, CI, EAS     │
                    └────────────────────┘
```

## Execution Order

| Step | Unit | Rationale |
|---|---|---|
| 1 | `001-foundation` | Everything depends on the workspace, the shared contracts, and the design tokens. |
| 2 | `002-identity` | Every other unit needs a profile row and a session. |
| 3 | `003-help-seek` + `004-capture` | Independent of each other — can run in parallel. These are the two highest-value surfaces (the panic path and the capture path). |
| 4 | `005-location` | Needs the shared GPS helper from `004-capture`. |
| 5 | `006-alerts` | Reads reports written by `004-capture`. |
| 6 | `007-moderation` | Reads reports + flags from `004-capture` / `006-alerts`. |
| 7 | `008-jobs-operations` | Needs the full schema to purge and the full app to build. |

## Independence Validation

| Unit | Developable separately | Clear interface | Failure isolation | Deployable alone |
|---|---|---|---|---|
| `001-foundation` | Yes | Package exports | Yes | Yes (workspace only) |
| `002-identity` | Yes | `profiles` + Auth | Yes | Yes |
| `003-help-seek` | Yes | `stations` / `hotlines` + `nearest_thana` | Yes | Yes |
| `004-capture` | Yes | `reports` + `finalize_capture` | Yes | Yes |
| `005-location` | Yes | `location_shares` | Yes | Yes |
| `006-alerts` | Yes | `alerts_feed` / `history_nearby` / `flag_report` | Yes | Yes |
| `007-moderation` | Yes | `moderation_queue` / `moderation_decide` | Yes | Yes |
| `008-jobs-operations` | Yes | Scheduled functions + CI | Yes | Yes |

## Notes

- Unit 8 is grouped separately because the purge job and the delivery pipeline
  span the whole system and are not a feature surface.
- `006-alerts` owns both the national feed and the local History because both
  are read models over the same `reports` table and share the map component —
  splitting them would duplicate the query and the map code.
- The "Charts / crime-stats" prototype screen has **no unit**. It is excluded
  by FR-NG-3 / FR-NG-4 / ADR-010.
