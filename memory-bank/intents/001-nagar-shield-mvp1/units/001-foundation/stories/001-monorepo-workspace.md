---
id: 001-monorepo-workspace
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
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

**The workspace, the TypeScript contract, the lint/format/type/test wiring, and the README all ship, and every acceptance criterion is now backed by a guard that fails when the thing it guards breaks.**

### What ships

- The workspace is declared in the root `package.json` (`"workspaces": ["apps/mobile", "apps/admin", "packages/shared"]`) **and** in `pnpm-workspace.yaml` as the globs `'apps/*'` and `'packages/*'` — the globs are what pick up a new workspace folder with no manifest edit, which is what the story's edge-case table names.
- The root manifest is `private: true` with `packageManager: "pnpm@9.15.0"` and `engines.node: ">=18"`. All five scripts the story names are defined — `dev`, `build`, `lint`, `typecheck`, `test` — and each delegates to the per-package scripts. `lint`, `typecheck`, and `test` fan out with `pnpm -r`; `dev` and `build` cannot (several packages would start a dev server at once), so they delegate through `pnpm --filter` to the package that owns the script.
- `tsconfig.base.json` carries the shared compiler contract — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules` — and the `@shared/*` alias. All three workspaces extend it. `apps/mobile` also extends `expo/tsconfig.base`, because the Expo preset owns the React Native lib and JSX settings.
- The ESLint flat config runs across all three workspaces and carries the one-way dependency rule as a `no-restricted-imports` pattern on `packages/shared/src/**/*.ts`. It also carries `consistent-type-imports` as an error, per the Technical Notes.
- Prettier is committed as `.prettierrc.json` with the settings the story names (no semicolons, single quotes, trailing commas, print width 100, 2-space indent). `.prettierignore` says which files Prettier does **not** own: the generated artefacts and the vendored Edge Functions mirror belong to their generators, and the specification trees are prose.
- `README.md` documents the prerequisites, the workspace tree, the one-way dependency rule, how to run each app, and **every** root script.
- `pnpm-lock.yaml` is committed; every CI job installs with `pnpm install --frozen-lockfile`.

### The guards

`packages/shared/src/workspace.test.ts` — 33 tests that assert the configuration rather than merely reading it. Each guard was proved to **fail** when the thing it guards was broken, then restored.

| Guard | What it catches |
|---|---|
| `pnpm-workspace.yaml` carries both globs | A workspace folder added without a manifest edit stops being picked up |
| `strict: true` in the base, and no workspace turns it off | A workspace quietly opting out of the compiler contract |
| The base carries the five named flags | A flag dropped from the shared contract |
| The base's `@shared/*` maps to `./packages/shared/src/*` | The alias pointing somewhere else |
| Every workspace extends the base | A workspace drifting onto its own compiler settings |
| Every workspace's alias lands on the same directory | The alias resolving to two different modules |
| **The alias resolves in every workspace** — a probe file is written and `tsc --noEmit` is run in each | The editor resolving an alias the compiler does not |
| **The Jest mapping agrees with TypeScript's** — the admin's mapping is read from its config, the mobile's from the resolved `jest-expo` preset, and the two are compared | The story's own edge case: an alias that resolves in the editor and fails under Jest |
| **The ESLint boundary fires** — a probe importing `apps/*` is written and ESLint is run on it | A config that carries the rule but does not report anything |
| `pnpm install --frozen-lockfile` exits 0 | A committed lockfile that has drifted from a manifest |
| The `packageManager` pin and the `engines.node` floor | An accidental Node or pnpm bump |
| Every root script is defined and delegates | A script that duplicates a package's logic |
| The README documents **every** root script | A script added to the manifest and forgotten in the README |
| The Prettier settings are the ones the story names | A formatting setting drifting |
| **Every workspace source file matches Prettier** | A file that does not match the formatting contract |

`packages/shared/src/ci-order.test.ts` additionally asserts that the CI workflow runs `pnpm format:check`, so the formatting contract is checked by CI and not only locally.

### The causal checks

Each guard was proved to fail when the thing it guards was broken, then restored:

- `strict: false` in `apps/admin/tsconfig.json` → *"apps/admin does not turn strict off"* fails.
- `strict: false` in `tsconfig.base.json` → *"turns strict on"* fails.
- The base's `@shared/*` pointing at `./packages/shared/WRONG/*` → both *"resolves the shared alias to packages/shared/src"* and *"resolves the alias to the same directory in every workspace"* fail.
- A dependency added to `packages/shared/package.json` without a lockfile update → *"is in sync with the manifests"* fails.
- A mis-formatted line appended to `packages/shared/src/enums/index.ts` → *"has every workspace source file matching the Prettier configuration"* fails, naming the file.
- A probe importing `apps/*` → *"reports an apps/* import as a lint error"* fails.

### What the work changed beyond the guards

- **233 source files were reformatted** to the Prettier contract. The codebase carried semicolons while `.prettierrc.json` said `semi: false` — the config was right and the code was wrong. The shared package was reformatted first and the Edge Functions mirror regenerated, so the byte-for-byte mirror check still passes.
- **Three `consistent-type-imports` violations** in the mobile app were fixed properly rather than suppressed: `supabase.test.ts` and `StationMap.tsx` now import their modules as **types** (the values are still loaded lazily at runtime, which is the point of both), and `errorCopy.ts` uses `import type`.
- **`apps/admin/tsconfig.json` did not extend the shared base at all.** It now does, and `apps/mobile` extends both `expo/tsconfig.base` and the repository base.
- **The `@shared/*` alias was dead** — nothing imported it; the apps used `@nagar-shield/shared`. The alias is now declared in the base and in every workspace, and the guard proves it resolves in all three.
- **`pnpm verify` now runs `pnpm format:check`**, and CI runs it too.
