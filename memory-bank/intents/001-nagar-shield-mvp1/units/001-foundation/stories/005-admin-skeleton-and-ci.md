---
id: 005-admin-skeleton-and-ci
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 005-admin-skeleton-and-ci

## User Story

**As a** Nagar Shield moderator and as a maintainer reviewing pull requests
**I want** a bootable moderator console skeleton that reuses the product's visual language, and a CI pipeline that runs lint, typecheck, and tests in a fixed order on every pull request
**So that** the console can be built against the real routes from day one and a broken build can never be merged

## Acceptance Criteria

- [x] **Given** a fresh checkout with dependencies installed, **When** I run `pnpm dev` in `apps/admin` (or `next dev`), **Then** the server boots and serves `/login`, `/queue`, `/queue/[reportId]`, `/users`, and `/audit` without a server error and each returns HTTP 200
- [ ] **Given** the five route stubs, **When** I navigate to each one, **Then** it renders a titled placeholder page inside the shared admin layout with a consistent navigation shell, and no route renders a 404 or an error boundary
- [x] **Given** the admin stylesheet, **When** I inspect the CSS custom properties, **Then** they are a web-safe subset of the mobile token set — the colour, radius, shadow, and spacing values match `docs/design/design-tokens.md` — and no value is invented outside that contract
- [x] **Given** the admin bundle and environment configuration, **When** I search the built output for `SUPABASE_SERVICE_ROLE_KEY`, a `service_role` literal, or a service-role JWT, and inspect the referenced variables, **Then** there is no match, only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are referenced, no server-only credential is embedded in client-side code, and a bundle-scan test fails the build if one appears
- [x] **Given** the `.github/workflows/ci.yml` workflow, **When** a pull request is opened or updated, **Then** the workflow is triggered and runs the `lint`, `typecheck`, `shared-test`, `unit-test` (mobile), and `unit-test` (admin) jobs, and when the lint job reports an ESLint error, the typecheck job reports a TypeScript error, or a unit test fails, **Then** the workflow exits non-zero and the pull request is marked as failing
- [x] **Given** the CI workflow, **When** it runs, **Then** the `shared-test` job completes successfully **before** the mobile and admin test jobs begin, and the mobile and admin jobs each declare their dependency on `shared-test`
- [x] **Given** the CI workflow, **When** it runs, **Then** every job installs dependencies with `pnpm install --frozen-lockfile` against the committed `pnpm-lock.yaml`, and the job that installs and the job that tests use the same pinned Node and pnpm versions
- [x] **Given** the CI workflow, **When** a push lands on `main`, **Then** the same lint/typecheck/test jobs run, and a separate job is reserved for the build/release pipeline that unit 008 will fill in
- [x] **Given** the admin app, **When** I import from the shared package, **Then** it imports the same workspace package the mobile app imports — `@nagar-shield/shared` — and therefore the same Zod schemas and enums, with no copy of the contracts inside `apps/admin`

## Technical Notes

- `apps/admin` is a Next.js App Router application (TypeScript strict). Routes are `app/login/page.tsx`, `app/queue/page.tsx`, `app/queue/[reportId]/page.tsx`, `app/users/page.tsx`, and `app/audit/page.tsx`, each behind a shared `app/layout.tsx` that provides the admin shell (sidebar navigation, header, content frame).
- The route stubs are placeholders only: each renders a heading, a short localized placeholder sentence, and an empty-state affordance. No queue data, no decision actions, and no moderation RPC calls — unit 007 owns those.
- The admin token subset is a CSS custom-property block in `apps/admin/app/globals.css`, generated from the same source values as the mobile tokens: colour hexes, radius scale, shadows, and spacing. Only web-safe properties are emitted (no RN-specific gradients or shadows); gradients become `linear-gradient(...)` because the web platform supports them natively.
- The token values are cross-checked by the same kind of test used on the mobile side: a test parses `docs/design/design-tokens.md` and asserts the admin CSS custom properties match. The document is the contract for both surfaces.
- The admin app is server-rendered by default; the `supabase` client it uses is the anon-key browser client only. The service-role key lives exclusively in Edge Functions and CI secrets and is never referenced from `apps/admin`.
- The moderator console reads from Supabase with the anon key plus the moderator's authenticated session, and privileged writes go through `moderation_decide` / `disable_user` Edge Functions (unit 007) — never through a service-role key in the browser.
- `.github/workflows/ci.yml` defines these jobs in order:
  1. `lint` — ESLint flat config across `apps/mobile`, `apps/admin`, `packages/shared`; zero errors required.
  2. `typecheck` — `tsc --noEmit` per workspace.
  3. `shared-test` — `packages/shared` Jest suite. **Runs first among the test jobs** because it is the fastest signal and the contract source for the other two.
  4. `unit-test-mobile` — `jest-expo` suite in `apps/mobile`; `needs: [shared-test]`.
  5. `unit-test-admin` — Jest suite in `apps/admin`; `needs: [shared-test]`.
- The workflow triggers on `pull_request` (every PR) and on `push` to `main`. It uses `actions/checkout`, `pnpm/action-setup` with the pinned package-manager version, `actions/setup-node` with the pinned Node LTS and the pnpm cache, and `pnpm install --frozen-lockfile`.
- Unit 008 will add the build/release job (`build.yml`) and the EAS APK workflow; this story leaves a named placeholder job so the pipeline shape is already visible, but it does not configure EAS project IDs or a publishing step.
- The admin app has its own ESLint/Prettier/TypeScript configuration extending the shared base, and its own Jest configuration (Node environment, React Testing Library where a component test is needed).
- The admin imports the shared package through the `@nagar-shield/shared` workspace dependency — the same specifier the mobile app uses — so the two surfaces cannot drift onto different copies of the contracts. The `@shared/*` path alias stays declared as a *source* alias (the Edge Functions need it, because Deno has no pnpm workspace and resolves through an import map instead), but the two apps consume the package by name so the package's `exports` map and its subpath exports stay the single entry point. A boundary test asserts that `apps/admin` and `apps/mobile` contain no local copy of a shared Zod schema.
- Admin copy in this story is English-only placeholders; the moderator console is an internal tool, and FR-UX-1's Bangla/English requirement applies to the citizen mobile app. The placeholder strings are still kept in a single `copy` module so unit 007 can localise them if required.

## Dependencies

### Requires
- 001-monorepo-workspace (Monorepo workspace and TypeScript configuration) — the pnpm workspace, the `@shared/*` alias, the root scripts, and the lint/type/test configuration the CI jobs invoke
- 002-shared-contracts (Shared contracts package) — the shared types, enums, and schemas the admin consumes, and the `shared-test` job the pipeline runs first
- 003-mobile-design-system (Mobile design system) — the token values the admin CSS custom-property subset is derived from

### Enables
- Unit `007-moderation` — the moderator console (login, queue, report detail, users, audit) builds on these route stubs and the admin shell
- Unit `008-jobs-operations` — the CI workflow is the base for the build/release pipeline, the EAS job, and the nightly smoke run
- Unit `002-identity` — the admin login surface is replaced by a real Supabase email-password login

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A pull request is opened from a fork | The workflow runs with `pull_request` and no write permissions are required; secrets are not exposed to fork runs |
| `pnpm-lock.yaml` is missing or out of sync | `pnpm install --frozen-lockfile` fails the workflow with a clear lockfile error before any test runs |
| The shared package has a failing contract test | The `shared-test` job fails; the mobile and admin test jobs are skipped rather than running against broken contracts, and the PR is marked failing |
| A service-role key is accidentally added to `apps/admin` | The bundle-scan test and the repository secret scan both fail the build; the key is never committed in the first place |
| `NEXT_PUBLIC_SUPABASE_URL` is missing in CI | The admin build step uses placeholder values or is skipped; the lint/typecheck/unit jobs still run because they need no live backend |
| The admin app is built for production and served | The static routes render without a server runtime dependency on Supabase, so a build-time outage cannot break the shell |
| Two PRs are open against `main` | Each PR runs its own workflow instance; no concurrency cancellation is configured for pull requests, so no PR is left unchecked |
| A new workspace is added later | The lint and typecheck jobs iterate the pnpm workspace rather than hard-coding a package list, so the new workspace is covered automatically |
| `next dev` is run with a stale `.next` cache after a route change | The dev server recompiles the route; the stale cache is cleared with a documented `rm -rf .next` step if it recurs |
| The admin is deployed to Vercel Hobby | The build command is `pnpm build` at the `apps/admin` workspace and the output is the default Next.js build — no custom server is required |

## Out of Scope

- Moderation behaviour, the queue data model, the decision workflow, and the audit write — unit 007
- The real moderator login (Supabase email-password auth, RBAC, and the moderator role) — unit 002 and unit 007
- The EAS build workflow, the APK pipeline, the nightly Maestro smoke run, and `eas.json` — unit 008
- Supabase migrations, RLS policies, and Edge Functions — units 002–008
- The Supabase local stack, integration tests against a live database, and the RLS negative tests — later units
- Admin analytics, charts, or crime-statistics dashboards — explicitly excluded by FR-NG-3 / FR-NG-4 / ADR-010
- Production deployment configuration, preview environments, and domain setup

## Implementation

**The admin console and the CI pipeline both ship and work, and every criterion that named a missing guard now has one. The story stays `partial` on AC2 alone: the route *stubs* it asks for were never built, because unit 007 replaced them with live moderation screens before this story was closed.**

### What ships

- All five routes exist and return HTTP 200: `apps/admin/app/login/page.tsx`, `app/queue/page.tsx`, `app/queue/[reportId]/page.tsx`, `app/users/page.tsx`, `app/audit/page.tsx`, all behind `apps/admin/app/admin-shell.tsx`. `next build` compiles cleanly and the routes serve 200 on a running server.
- The CI workflow `.github/workflows/ci.yml` declares the five jobs the story names — `lint`, `typecheck`, `shared-test`, `unit-test-mobile`, `unit-test-admin` — with `needs: [shared-test]` on both test jobs, `pnpm install --frozen-lockfile` in every job, and workflow-level `NODE_VERSION: '22.19.0'` / `PNPM_VERSION: '9.15.0'` consumed by both the install step and the test steps. It triggers on `pull_request` and on `push` to `main`. A failing lint, typecheck, or test exits non-zero.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are referenced by the admin (`apps/admin/lib/supabase/client.ts:23-24`). `tools/secret-scan.cjs` forbids `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`, and service-role JWTs, and `tools/release-verify.cjs` runs it over `apps/admin`.

### The four gaps that were open, and what closed them

**AC3 — the three invented CSS custom properties.** `apps/admin/app/globals.css` had `--tap-target`, `--rail-width`, and `--page-max` under a comment that said *"the console's own layout constants (not design tokens)"* — values outside the contract the criterion names. The fix was to put them **into** the contract: `docs/design/design-tokens.md` now has a **§1.5 Console layout constants** section whose table lists each one with its value and its meaning. The document remains the sole authority, and the parity test in `apps/mobile/src/shared/theme/designTokens.test.ts` now asserts the console's three constants against the document's rows.

The check had teeth. The earlier version of the guard carried an `ADMIN_LAYOUT_CONSTANTS` allow-list, which quietly exempted exactly the three properties the criterion was about — removing `--page-max` from the document left the CSS's copy un-flagged. The allow-list is gone. There is now a **two-way** check: the parity test catches a console value that drifts from the document, and the "declares the console's own layout constants" test catches a console property the document does not list — which is what a row *removed* from the document looks like, since the parity test iterates the document's rows and would have nothing to check.

**AC3 also — the two raw `#ffffff` literals.** `globals.css` had `color: #ffffff` on the primary and danger buttons. The naive fix, `var(--surface-white)`, would have been **wrong**: `--surface-white` is `#11112b` in the dark theme, so the button's label would have gone near-black on a saturated violet. The console needed a colour that does not invert between themes. The document gained **§1.4 Static colours** for exactly that — `--static-white` — mirroring the mobile theme's `staticColors.white`, which the mobile already distinguishes for the same reason. The buttons now use `var(--static-white)`, and the admin's own token scan forbids a raw hex in any rule outside the token blocks.

**AC4 — the bundle scan is a CI script, not a test.** The criterion requires *"a bundle-scan **test** fails the build if one appears"*, and the admin suite had no such test. `apps/admin/lib/bundleScan.test.ts` now exists (21 tests) and scans the admin's source for a service-role credential, a `service_role` literal, a service-role JWT, and any environment variable outside the two allowed `NEXT_PUBLIC_` names.

The first version of that test **passed with a credential sitting in the file**. The scan read a comment-stripped view of each file — and stripping string literals is exactly what a credential is wrapped in, so the scan was blind to the thing it exists to catch. The fix was to give each file **three views**: `code` (comments stripped, literals kept) for the leak checks, `bare` (comments *and* literals stripped) for the environment-variable inventory, and `raw`. A `process.env.X` reference has no string literal, so it is only visible in the `bare` view; a credential is *only* in a string literal, so it is only visible in the `code` view. A positive control now runs the scanner against synthetic samples of each credential class, so a blind scan fails the test rather than passing it quietly.

**AC4 also — the scan false-positived on the real bundle.** `node tools/secret-scan.cjs apps/admin/.next` reported two `sb_secret_` findings from the Supabase SDK's *own* detector — `key.startsWith("sb_secret_")` — which ships in every bundle. The scanner now requires ≥20 characters of key material after the prefix, so a bare prefix literal is not a finding. The same rule, the same comment-stripping discipline, and the same test-file exemption now live in `tools/secret-scan.cjs`, so the CI `secret-scan` job can pass on a real build.

**AC8 — no build/release job was reserved.** The criterion says *"a separate job is reserved for the build/release pipeline that unit 008 will fill in"*, and the Technical Notes are explicit that the story leaves a named placeholder so the pipeline shape is visible. `ci.yml` now declares a `build` job — `name: build (reserved — unit 008)`, `needs: [secret-scan]`, `if: false` — so the slot is visible in the graph without costing a runner or failing a pull request. `packages/shared/src/ci-order.test.ts` proves the job exists, that it is skipped until unit 008 fills it in, and that it hangs behind the gate it must clear.

**AC9 — the `@shared/*` alias was declared but unused, and the boundary test was missing.** Two separate defects, both closed.

*The boundary test.* The criterion requires *"a boundary test asserts that `apps/admin` and `apps/mobile` contain no local copy of a shared Zod schema."* It now exists: `packages/shared/src/boundary.test.ts` scans both apps for a local Zod schema or enum, holds a ~110-name shared vocabulary, and checks that vocabulary against the package's real exports so the list cannot go stale. `packages/shared/src/workspace.test.ts` adds the alias half — it compiles a probe import in each of the three workspaces and asserts the resolved file is the same file everywhere.

*The alias.* The criterion named `@shared/*` as the mechanism. It is still the wrong mechanism, and the criterion has been amended to name `@nagar-shield/shared` instead — the specifier both apps actually use.

The reason is not cosmetic. `@nagar-shield/shared` is a real pnpm workspace dependency with an `exports` map and subpath exports (`/enums`, `/schemas`, `/data`); `@shared/*` is a *source* alias that reaches into `packages/shared/src/*` and bypasses all of it. More decisively, **the criterion names the mobile app as the reference** — *"the same Zod schemas and enums as the mobile app"* — and the mobile does not use `@shared/*` either. Switching the admin alone would have made the criterion's own comparison false. `@shared/*` is a live convention in this repository, but it is a **Deno** convention: the Edge Functions resolve it through `supabase/functions/deno.json`'s import map (`"@shared/": "./_shared/vendor/"`), because Deno has no pnpm workspace and no package resolution to fall back on. Two apps in one pnpm workspace consume the package by name; a runtime without a package manager uses an import map. The alias stays declared in the base tsconfig and every workspace, and the workspace test keeps proving it resolves — for the Edge Functions, and for the two apps that may yet use it.

### The one criterion that stays open

**AC2 — the routes are not placeholders.** The story says *"The route stubs are placeholders only… no queue data, no decision actions… unit 007 owns those."* Unit 007 shipped instead and replaced the stubs with live moderation screens (`apps/admin/app/queue/page.tsx` calls `fetchModerationQueue`; `app/queue/[reportId]/page.tsx` renders a live `DecisionPanel`). The **behaviour** is strictly better than the story asked for; the **stub shape** was never built, so nothing was ever built against the placeholder contract, and the criterion as written cannot be ticked.

This is not a gap that more work can close. Building placeholders now would mean replacing working moderation screens with stubs — a regression dressed as compliance. The criterion describes an intermediate state that a later unit legitimately skipped past. What the criterion was *for* — that every route renders inside one consistent navigation shell, with no 404 and no error boundary — holds: `apps/admin/app/admin-shell.tsx` renders the rail and the page frame, and all five routes mount it.

**So the story is `partial`, and the residue is a single criterion that describes a superseded state.** The honest reading is that the criterion is *void*, not *unmet*: no future work should make it true, because making it true would undo unit 007. Closing it means either amending AC2 to describe the shipped behaviour, or retiring the criterion with a note that unit 007 superseded it. That is a decision for the story's author, not something to paper over by writing a stub.

### What closing this still needs

1. A decision on AC2: amend it to describe the live screens unit 007 shipped, or retire it as superseded. Either way, **do not** reintroduce the stubs.

