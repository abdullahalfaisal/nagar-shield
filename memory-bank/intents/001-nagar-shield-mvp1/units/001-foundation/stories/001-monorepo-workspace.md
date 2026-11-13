---
id: 001-monorepo-workspace
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 001-monorepo-workspace

## User Story

**As a** developer on the Nagar Shield team
**I want** a pnpm workspace with strict TypeScript, linting, formatting, and test configuration shared by every app and package
**So that** the mobile app, the admin console, and the shared contracts compile, lint, and test the same way and cannot drift apart

## Acceptance Criteria

- [ ] **Given** a clean checkout of the repository, **When** I run `pnpm install` at the root, **Then** it exits with code 0 and installs dependencies for `apps/mobile`, `apps/admin`, and `packages/shared` as resolved by a single `pnpm-workspace.yaml`
- [ ] **Given** the workspace is installed, **When** I run `pnpm typecheck` at the root, **Then** TypeScript reports zero errors across all three workspaces
- [ ] **Given** the workspace is installed, **When** I run `pnpm lint` at the root, **Then** ESLint reports zero errors and exits with code 0
- [ ] **Given** the workspace is installed, **When** I run `pnpm test` at the root, **Then** every unit and shared contract test suite runs and passes
- [ ] **Given** the root `package.json`, **When** I inspect its `scripts`, **Then** `dev`, `build`, `lint`, `typecheck`, and `test` are each defined and each delegates to the per-package scripts rather than duplicating logic
- [ ] **Given** `tsconfig.base.json`, **When** I read its `compilerOptions`, **Then** `strict` is `true` and every package `tsconfig.json` extends it without overriding `strict` to `false`
- [ ] **Given** a per-package `tsconfig.json`, **When** a module imports `@shared/...`, **Then** the alias declared in `tsconfig.base.json` resolves it to `packages/shared/src/...`
- [ ] **Given** a source file inside `packages/shared`, **When** ESLint scans it, **Then** an import that resolves into `apps/*` is reported as an error and `pnpm lint` exits non-zero
- [ ] **Given** any source file in any workspace, **When** I run `prettier --check`, **Then** every file matches the Prettier configuration (no semicolons, single quotes, trailing commas, print width 100, 2-space indent) and no file is reported
- [ ] **Given** the repository root, **When** I inspect it, **Then** `.gitignore`, `.editorconfig`, and `README.md` exist, and the README documents the three-workspace layout, the prerequisites, and every root script

## Technical Notes

- Workspace layout is fixed by `memory-bank/standards/coding-standards.md`: `apps/mobile`, `apps/admin`, `packages/shared`. `pnpm-workspace.yaml` declares `packages: ['apps/*', 'packages/*']` so a new workspace folder is picked up without editing the manifest.
- Root `package.json` is `private: true` and pins the package manager (`packageManager: pnpm@<version>`) plus `engines.node` so CI and developer machines resolve the same toolchain.
- `tsconfig.base.json` carries the shared compiler contract: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules`, `verbatimModuleSyntax`, `jsx: react-jsx`, and `paths: { '@shared/*': ['packages/shared/src/*'] }`. Each package extends it and only adds its own `include`/`outDir`/platform libs.
- ESLint flat config (`eslint.config.mjs`) uses `typescript-eslint` with type-checked rules. Per `coding-standards.md`: `@typescript-eslint/no-explicit-any` = error, `no-unused-vars` = error (ignore `_`-prefixed), `consistent-type-imports` = error, `no-floating-promises` = error, `no-console` = warn in `apps/mobile` and `apps/admin`, and `import/no-default-export` off for the Expo Router `app/` directory only.
- The one-way dependency rule (`packages/shared` must not import from `apps/*`) is enforced mechanically, not by convention: a `no-restricted-imports` pattern set in the shared package's ESLint block, plus a unit test in `packages/shared` that scans its own source for `apps/` import specifiers. Either signal failing is enough to fail the build.
- Prettier config is committed as `.prettierrc` (or `prettier` key in `package.json`) and is checked in CI via `prettier --check`; ESLint is used for semantic rules and `eslint --fix` for auto-fixing.
- `.gitignore` covers `node_modules/`, `.expo/`, `dist/`, `.next/`, `coverage/`, `*.tsbuildinfo`, `.env` and `.env.*` (with `!.env.example`), `.eas/`, and editor/OS noise. `.env.example` files are committed per workspace so the variable *names* are discoverable without committing values.
- `.editorconfig` sets `charset = utf-8`, `end_of_line = lf`, `indent_style = space`, `indent_size = 2`, `insert_final_newline = true`, `trim_trailing_whitespace = true` — Bangla copy requires UTF-8 and LF.
- `README.md` covers: prerequisites (Node LTS, pnpm, optional Supabase CLI), the workspace tree, the root scripts, how to run each app, where the design token contract and API conventions live, and the one-way dependency rule.
- Testing is configured per package: Jest for `packages/shared` and `apps/admin`, `jest-expo` + `@testing-library/react-native` for `apps/mobile`. Jest `moduleNameMapper` mirrors the `@shared/*` alias so path resolution behaves the same as in TypeScript.
- No Turborepo/Nx — the toolchain is plain pnpm + TypeScript + ESLint + Prettier per `memory-bank/standards/tech-stack.md`.

## Dependencies

### Requires
- None (first story in the unit and in the intent)

### Enables
- 002-shared-contracts (Shared contracts package)
- 003-mobile-design-system (Mobile design system)
- 004-mobile-app-shell (Mobile app shell)
- 005-admin-skeleton-and-ci (Admin app skeleton and CI pipeline)
- Every later unit (`002-identity` … `008-jobs-operations`) — they all build inside this workspace and inherit the same lint/type/test contract

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `pnpm-lock.yaml` is out of sync with a `package.json` | `pnpm install --frozen-lockfile` fails in CI with a lockfile mismatch; a developer runs `pnpm install` locally to regenerate the lockfile and commits it |
| A new workspace is added under `apps/` or `packages/` | The `pnpm-workspace.yaml` glob picks it up with no manifest edit; root scripts that iterate workspaces include it automatically |
| A path alias resolves in the editor but fails under Jest | Jest `moduleNameMapper` maps `@shared/(.*)` to `<rootDir>/packages/shared/src/$1`; the alias test in `packages/shared` fails until both mappings agree |
| `packages/shared` imports from `apps/*` | The ESLint boundary rule reports an error **and** the shared unit test fails; `pnpm lint` exits non-zero |
| Developer Node version differs from CI | CI pins Node LTS and the root `engines.node` range warns on mismatch; the install step still fails fast rather than producing a subtly different tree |
| A workspace depends on another workspace package by a version range instead of `workspace:*` | `pnpm install` fails to resolve, forcing the `workspace:*` protocol so local edits are always picked up |
| A Prettier/ESLint conflict (same rule configured in both) | ESLint is the single source of truth for lint rules; the Prettier config only owns formatting, and the ESLint config disables any conflicting stylistic rule |
| `pnpm test` is run with no workspace installed | The script fails fast with a clear "run `pnpm install` first" message rather than reporting per-package failures |

## Out of Scope

- CI workflow definition — `.github/workflows/ci.yml` belongs to 005-admin-skeleton-and-ci
- Domain contracts, schemas, and enums — belong to 002-shared-contracts
- Design tokens and UI primitives — belong to 003-mobile-design-system
- Any domain behaviour (auth, help, capture, alerts, moderation) — units 002–007
- EAS build profiles, `eas.json`, and release pipelines — unit 008
- Turbo/Nx task orchestration, Docker/compose stacks, and npm registry publishing of the shared package

## Implementation

**The pnpm workspace, the TypeScript configuration, and the lint/type/test wiring all ship and work. The story is not `complete` because several of its acceptance criteria name a guard that was never built.**

### What ships

- The workspace is declared in the root `package.json` (`"workspaces": ["apps/mobile", "apps/admin", "packages/shared"]`) with `packageManager: "pnpm@9.15.0"` and `engines.node: ">=18"`. `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r --if-present test` all fan out across the three workspaces.
- The root `package.json` carries the full gate chain in `verify`: typecheck, lint, test, `data:check`, `shared:check`, `story:index:check`, `db:test`, `db:smoke`, `alert:check`, `maestro:check`, `fn:typecheck`.
- `pnpm-lock.yaml` is committed, and every CI job installs with `pnpm install --frozen-lockfile`.
- ESLint flat config runs across all three workspaces; `pnpm lint` is clean.

### The gaps

- **No root-level `tsconfig.base.json` contract test.** The shared TypeScript configuration is applied by each workspace's own `tsconfig.json`, and `pnpm typecheck` passes — but there is no test that asserts the three workspaces still extend the same base with the same strictness flags. A workspace could quietly relax `strict` and the gate would still be green.
- **The lockfile is not checked for drift against the workspace manifests outside CI.** `--frozen-lockfile` fails the CI job, but a local `pnpm install` can silently update `pnpm-lock.yaml`, and nothing in the local gate catches a committed lockfile that has drifted from a manifest.
- **The story's acceptance criteria are about the *configuration* being right; several of them are satisfied by reading the files rather than by an assertion that would fail if the configuration regressed.** Nothing enforces `strict: true` across the workspaces, the `node` engine floor, or the `packageManager` pin.

### What closing this needs

1. A test that reads all three `tsconfig.json` files and asserts they share one base with `strict: true` — the guard that would catch a workspace quietly opting out of strictness.
2. A check that the committed `pnpm-lock.yaml` is in sync with the manifests, runnable locally as well as in CI.
3. An assertion on the `engines.node` floor and the `packageManager` pin, so a Node or pnpm version bump is a deliberate edit rather than an accident.
