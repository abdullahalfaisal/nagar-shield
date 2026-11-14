# Nagar Shield

A citizen-safety app for Bangladesh: capture an incident, alert nearby
people, and reach the right emergency number — in Bangla and English.

The repository is a **pnpm workspace** with three packages. The shared
contracts package owns the schemas, the enums, and the error vocabulary; the
two apps consume it rather than copying it, so the mobile app, the admin
console, and the Edge Functions validate the same payloads and speak the same
error codes.

## Prerequisites

| Tool         | Version     | Notes                                                                                                         |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------- |
| Node         | LTS (>= 18) | The root `engines.node` field is the floor. CI pins an exact version.                                         |
| pnpm         | 9.15.0      | The root `packageManager` field is the pin. Use `corepack enable` so the pinned version is the one that runs. |
| Supabase CLI | optional    | Only for the local database, the SQL suites, and the Edge Functions.                                          |
| Deno         | optional    | Only for `pnpm fn:typecheck`.                                                                                 |

## The workspace layout

```
apps/mobile        @nagar-shield/mobile   Expo Router app (React Native)
apps/admin         @nagar-shield/admin    Next.js moderator console
packages/shared    @nagar-shield/shared   Zod schemas, enums, error codes, fixtures
supabase           —                      Migrations, SQL test suites, Edge Functions
tools              —                      Mirrors, probes, and the story-index reconciler
memory-bank        —                      The stories, the standards, and the unit briefs
```

Every package extends `tsconfig.base.json`, so the compiler contract —
`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames` and
`isolatedModules` — is the same everywhere.

### The one-way dependency rule

**`packages/shared` must not import from `apps/*`.** The dependency runs one
way: the shared package owns the contract, and the apps consume it.

The rule is enforced mechanically, by two signals that must **both** hold:

- an ESLint `no-restricted-imports` rule scoped to `packages/shared/src`;
- a unit test in `packages/shared` that scans its own source.

Either one failing fails the build.

The reason is not tidiness. The Edge Functions mirror copies
`packages/shared/src` into `supabase/functions/_shared/vendor/` — but the
Edge Runtime mounts **only** the `supabase/` directory. An import from
`apps/*` resolves in the workspace and fails only inside the container, which
is exactly the kind of failure that reaches production.

## Running the apps

```bash
pnpm install            # once, at the root
pnpm mobile             # the Expo app
pnpm admin              # the moderator console
pnpm shared             # the shared contracts
```

## The root scripts

| Script                       | What it does                                               |
| ---------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                   | Start the admin console's dev server.                      |
| `pnpm build`                 | Build the admin console for production.                    |
| `pnpm typecheck`             | `tsc --noEmit` across all three workspaces.                |
| `pnpm lint`                  | ESLint across all three workspaces.                        |
| `pnpm test`                  | Every unit and shared-contract suite.                      |
| `pnpm format`                | Prettier, writing the changes.                             |
| `pnpm format:check`          | Prettier, reporting the differences.                       |
| `pnpm verify`                | **The full gate** — see below.                             |
| `pnpm db:reset`              | Recreate the local database and reseed it.                 |
| `pnpm db:test`               | The SQL suites, against the local stack.                   |
| `pnpm db:smoke`              | The REST read models and the RPCs.                         |
| `pnpm fn:serve`              | Serve the Edge Functions locally.                          |
| `pnpm fn:smoke`              | The Edge Function smoke checks.                            |
| `pnpm fn:typecheck`          | `deno check` over the Edge Function sources.               |
| `pnpm data:check`            | Verify the seeded reference data has not drifted.          |
| `pnpm data:write-seed`       | Regenerate the seed from the curated dataset.              |
| `pnpm shared:check`          | Verify the Edge Functions mirror has not drifted.          |
| `pnpm shared:mirror`         | Regenerate the Edge Functions mirror.                      |
| `pnpm story:index:check`     | Verify the story index matches the story files.            |
| `pnpm story:index:write`     | Recompute the story index from the story files.            |
| `pnpm secret:scan`           | Scan the sources and the built bundles for secrets.        |
| `pnpm release:verify`        | The release gate.                                          |
| `pnpm maestro:check`         | Validate the Maestro flows.                                |
| `pnpm purge:dry-run`         | Report what the media purge would delete.                  |
| `pnpm guard:check`           | Prove a disabled account cannot write.                     |
| `pnpm biometric:check`       | Prove the biometric failure accounting.                    |
| `pnpm alternate:check`       | Prove the alternate phone's format constraint.             |
| `pnpm dual-identifier:check` | Prove the phone and email sign-ins resolve to one account. |
| `pnpm signup:check`          | Prove the signup contract end to end.                      |
| `pnpm reset:check`           | Prove the password-reset contract end to end.              |
| `pnpm contacts:check`        | Prove the emergency-contacts CRUD contract.                |
| `pnpm category:check`        | Prove the report-detail category contract.                 |
| `pnpm alert:check`           | Prove the public alert contract.                           |
| `pnpm capture:check`         | Prove the capture submit contract.                         |
| `pnpm deletion:check`        | Prove the account-deletion contract.                       |
| `pnpm console:check`         | Prove the moderator console contract.                      |
| `pnpm mobile`                | Run a command in the mobile app.                           |
| `pnpm admin`                 | Run a command in the admin console.                        |
| `pnpm shared`                | Run a command in the shared package.                       |

The `*:check` probes each drive one contract against a running stack, so
they need `pnpm db:reset` to have run first.

### `pnpm verify` — the gate

```
typecheck → lint → format:check → test → data:check → shared:check
          → story:index:check → db:test → db:smoke → dual-identifier:check
          → alert:check → console:check → maestro:check → fn:typecheck
```

It must exit `0`. The individual steps can be run on their own while
working on one area; the gate is what CI runs.

## Where the contracts live

| Document                                    | What it owns                                                     |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `memory-bank/standards/api-conventions.md`  | The error codes, their HTTP statuses, and the response envelope. |
| `memory-bank/standards/coding-standards.md` | The naming, the fixture rules, and the dependency direction.     |
| `memory-bank/standards/tech-stack.md`       | The chosen toolchain, and what was deliberately not chosen.      |
| `ARCHITECTURE.md`                           | The system shape, the data model, and the read models.           |
| `memory-bank/intents/`                      | The stories. The story file is the spec.                         |

The story index at `memory-bank/story-index.md` is **derived**, not typed:
`pnpm story:index:check` fails when it drifts from the story files.
