---
id: 005-admin-skeleton-and-ci
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 005-admin-skeleton-and-ci

## User Story

**As a** Nagar Shield moderator and as a maintainer reviewing pull requests
**I want** a bootable moderator console skeleton that reuses the product's visual language, and a CI pipeline that runs lint, typecheck, and tests in a fixed order on every pull request
**So that** the console can be built against the real routes from day one and a broken build can never be merged

## Acceptance Criteria

- [ ] **Given** a fresh checkout with dependencies installed, **When** I run `pnpm dev` in `apps/admin` (or `next dev`), **Then** the server boots and serves `/login`, `/queue`, `/queue/[reportId]`, `/users`, and `/audit` without a server error and each returns HTTP 200
- [ ] **Given** the five route stubs, **When** I navigate to each one, **Then** it renders a titled placeholder page inside the shared admin layout with a consistent navigation shell, and no route renders a 404 or an error boundary
- [ ] **Given** the admin stylesheet, **When** I inspect the CSS custom properties, **Then** they are a web-safe subset of the mobile token set — the colour, radius, shadow, and spacing values match `docs/design/design-tokens.md` — and no value is invented outside that contract
- [ ] **Given** the admin bundle and environment configuration, **When** I search the built output for `SUPABASE_SERVICE_ROLE_KEY`, a `service_role` literal, or a service-role JWT, and inspect the referenced variables, **Then** there is no match, only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are referenced, no server-only credential is embedded in client-side code, and a bundle-scan test fails the build if one appears
- [ ] **Given** the `.github/workflows/ci.yml` workflow, **When** a pull request is opened or updated, **Then** the workflow is triggered and runs the `lint`, `typecheck`, `shared-test`, `unit-test` (mobile), and `unit-test` (admin) jobs, and when the lint job reports an ESLint error, the typecheck job reports a TypeScript error, or a unit test fails, **Then** the workflow exits non-zero and the pull request is marked as failing
- [ ] **Given** the CI workflow, **When** it runs, **Then** the `shared-test` job completes successfully **before** the mobile and admin test jobs begin, and the mobile and admin jobs each declare their dependency on `shared-test`
- [ ] **Given** the CI workflow, **When** it runs, **Then** every job installs dependencies with `pnpm install --frozen-lockfile` against the committed `pnpm-lock.yaml`, and the job that installs and the job that tests use the same pinned Node and pnpm versions
- [ ] **Given** the CI workflow, **When** a push lands on `main`, **Then** the same lint/typecheck/test jobs run, and a separate job is reserved for the build/release pipeline that unit 008 will fill in
- [ ] **Given** the admin app, **When** I import from the shared package, **Then** it uses the `@shared/*` path alias and the same Zod schemas and enums as the mobile app, with no copy of the contracts inside `apps/admin`

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
- The admin imports the shared package through the `@shared/*` alias; contracts are never duplicated inside `apps/admin`. A boundary test asserts that `apps/admin` and `apps/mobile` contain no local copy of a shared Zod schema.
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
