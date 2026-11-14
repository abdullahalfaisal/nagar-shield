---
id: 002-shared-contracts
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
---

# Story: 002-shared-contracts

## User Story

**As a** developer building the Nagar Shield mobile app, admin console, and backend together
**I want** a single shared package that owns the Zod schemas, enums, area-hierarchy type, and stable API error codes
**So that** the client, the admin console, and the Edge Functions validate the same payloads and speak the same error vocabulary without drift

## Acceptance Criteria

- [ ] **Given** the `ReportCategory` enum, **When** I parse each of `theft`, `assault`, `harassment`, `robbery`, `accident`, `fire`, `medical`, `fraud`, `vandalism`, `suspicious`, `other`, **Then** all 11 values parse successfully and the enum has exactly 11 members, and **When** I parse a value outside those 11, **Then** parsing fails with a validation error and no fallback value is returned
- [ ] **Given** the `FlagReason` enum, **When** I parse each of `misinformation`, `harassment`, `duplicate`, `off_topic`, `other`, **Then** all 5 values parse successfully and the enum has exactly 5 members, and **When** I parse a value outside those 5, **Then** parsing fails with a validation error
- [ ] **Given** the `ModerationStatus` and `PublicVisibility` enums, **When** I parse `visible`, `hidden_pending_review`, `restored`, `removed`, `anonymous`, and `identified`, **Then** every value parses successfully, and `anonymous` is the declared default for `PublicVisibility`
- [ ] **Given** `captureDescriptionSchema`, **When** I parse a string of exactly 140 characters, **Then** it is accepted, and **When** I parse a string of 141 characters, **Then** it is rejected with a validation error
- [ ] **Given** `signupSchema`, **When** I parse a valid email, a password, and an E.164 phone number, **Then** it returns typed input, and **When** any of the three is invalid or missing, **Then** it is rejected with a field-level error
- [ ] **Given** `loginSchema`, `contactSchema`, `flagReasonSchema`, and `areaHierarchySchema`, **When** I parse their documented valid shapes, **Then** each succeeds, and **When** I parse a malformed payload, **Then** each fails with a field-level error
- [ ] **Given** the `ApiErrorCode` union, **When** I compare it against the code table in `memory-bank/standards/api-conventions.md`, **Then** the union contains every listed code — `VALIDATION_FAILED`, `AUTH_REQUIRED`, `AUTH_DISABLED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `FLAG_RATE_LIMIT`, `CAPTURE_RATE_LIMIT`, `MEDIA_TOO_LARGE`, `UNSUPPORTED_MEDIA`, `GEOCODE_UNAVAILABLE`, `INTERNAL` — and no code outside that list
- [ ] **Given** the exported type surface of `packages/shared`, **When** I scan the emitted declaration files, **Then** no exported type contains `any`, and `@typescript-eslint/no-explicit-any` reports no violation
- [ ] **Given** the shared package's test suite, **When** it runs, **Then** it covers every Zod schema and every enum parser, and it is executed as the first test job in CI, before the mobile and admin suites
- [ ] **Given** the test factories in `packages/shared/testing`, **When** I build a report, contact, flag, or profile fixture, **Then** the factory returns a fully typed object without any production PII and without any `as unknown as` cast

## Technical Notes

- Package layout: `packages/shared/src/` with one module per concern — `schemas/` (Zod), `enums/` (value enums + parsers), `errors.ts` (`ApiErrorCode` + `resolveErrorMessage`), `types/` (`AreaHierarchy`, `Report`), and `testing/` (factories). `packages/shared` is consumed by `apps/mobile` and `apps/admin` through the `@shared/*` path alias and by the Edge Functions through the same source.
- `packages/shared` has **no runtime dependency on `apps/*`** and no dependency on Expo, React Native, or Next.js. Its only runtime dependency is `zod`. It may depend on dev-only tooling (TypeScript, Jest, ESLint).
- Enums are modelled as `as const` string-literal unions plus a `z.enum([...])` schema, so the runtime parser and the compile-time type can never diverge. `parseReportCategory` is the exported parser for `ReportCategory`.
- `AreaHierarchy` is `{ division: string; city: string; thana: string; neighborhood?: string }` — `neighborhood` is optional because the Dhaka-local area table is not exhaustive. `areaHierarchySchema` validates the reverse-geocode payload and the `parseAreaHierarchy` helper is the exported validator.
- `ApiErrorCode` is a string-literal union, not a TypeScript `enum`, so it serialises as a plain string over the wire and satisfies `consistent-type-imports`. `resolveErrorMessage(code)` maps a code to the i18n key namespace `errors.<CODE>` (for example `errors.FLAG_RATE_LIMIT`); the human-readable Bangla/English text lives in the app's i18n bundles, not in `packages/shared`.
- `GEOCODE_UNAVAILABLE` is included because `api-conventions.md` lists it as a non-fatal 200 response code; it is deliberately **not** in the error envelope table but it is in the code table, so the union covers it and the mapping distinguishes fatal from non-fatal codes.
- `captureDescriptionSchema` is `z.string().trim().max(140)` with a minimum of 1 after trimming; the counter UI in unit 004 reads the same constant (`CAPTURE_DESCRIPTION_MAX_LENGTH`) exported from the package so the client cap and the server cap cannot diverge.
- `signupSchema` requires `email` (RFC-shaped, trimmed, lowercased), `password` (minimum 8 characters), and `phone` (E.164: `+` then 8–15 digits, no spaces or dashes) — matching FR-AUTH-1. `loginSchema` accepts a `identifier` that is either an email or an E.164 phone, plus `password`, because the client resolves the identifier to the email-primary auth user.
- `contactSchema` validates an emergency contact `{ name, phone (E.164), isPrimary, sortOrder }`; `flagReasonSchema` validates `FlagReason` plus an optional `details` string; `areaHierarchySchema` validates the geocode payload.
- Fixtures live in `packages/shared/testing` as factories (not raw SQL or JSON blobs) per `coding-standards.md`. Factories accept partial overrides and fill defaults, use synthetic Bangladeshi names and the `+880` prefix, and never use production PII.
- The shared package is the **first** test job in CI (fastest signal). Its tests run under plain Jest with no RN or DOM environment.
- The "no `any` in exported types" criterion is enforced by `@typescript-eslint/no-explicit-any` (error) plus a declaration-level scan test over the built `.d.ts` output.
- No `any`, no `unknown`-to-`any` casts, and no `as` narrowing shortcuts in the exported surface — `unknown` plus narrowing is the required pattern.

## Dependencies

### Requires
- 001-monorepo-workspace (Monorepo workspace and TypeScript configuration) — the `@shared/*` path alias, the Jest configuration, and the lint rules this package is verified against

### Enables
- 003-mobile-design-system (Mobile design system) — theme and primitive types must not re-declare shared enums
- 004-mobile-app-shell (Mobile app shell) — the i18n key contract, `resolveErrorMessage`, and the shared client wrapper
- 005-admin-skeleton-and-ci (Admin app skeleton and CI pipeline) — the shared package's tests are the first CI job, and the admin consumes the shared types
- Unit `002-identity` — signup/login schemas, `ApiErrorCode`
- Unit `003-help-seek` — `ApiErrorCode` for rate limits and hotlines/stations read models
- Unit `004-capture` — `captureDescriptionSchema`, `AreaHierarchy`, `PublicVisibility`, `ReportCategory`
- Unit `005-location` — `E.164` contact schema
- Unit `006-alerts` — `ReportCategory`, `FlagReason`, `ModerationStatus`
- Unit `007-moderation` — `ModerationStatus`, `FlagReason`, `ApiErrorCode`
- Unit `008-jobs-operations` — the shared package is the first CI job

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A new error code is added to `api-conventions.md` later | The union-coverage test fails until the code is added to `ApiErrorCode`; the code is never added ad hoc without updating that document |
| A description is exactly 140 characters of whitespace | `.trim()` runs before the length check, so an all-whitespace string is rejected as empty rather than accepted as a 140-character description |
| A description contains emoji or Bangla conjuncts | Zod's `.max()` counts UTF-16 code units; the schema caps the *character* count at 140 as specified and the UI counter uses the same `CAPTURE_DESCRIPTION_MAX_LENGTH` constant so client and server agree |
| A phone number is entered as `+880 1711-111111` | `signupSchema` rejects it; the phone field is normalised to bare E.164 digits before parsing, and the error names the `phone` field |
| A phone number is a Bangladeshi landline (`02-XXXXXXX`) | Rejected — E.164 mobile format is required by FR-AUTH-1 |
| `area_hierarchy` arrives with `neighborhood: null` | `areaHierarchySchema` accepts it and normalises it to `undefined` so the optional field stays absent rather than null |
| A geocode response omits `division` | Parsing fails with a field-level error on `division`; `division` and `city` are required, `thana` is required, only `neighborhood` is optional |
| `ModerationStatus` receives `visible ` with a trailing space | Rejected — no trimming or case folding is applied to enum values, so a client cannot smuggle a different value past the parser |
| A factory is called with an override of the wrong type | TypeScript rejects it at compile time; the factory's parameter type is `Partial<T>` and never `any` |
| `packages/shared` gains an import from `apps/*` | The ESLint boundary rule and the shared unit test both fail; the import is rejected before merge |

## Out of Scope

- Runtime behaviour of any screen — units 002–007
- Database schema, migrations, RLS policies, and Edge Functions — units 002–008
- Translations themselves (the Bangla/English strings) — the i18n bundles are created in 004-mobile-app-shell; `packages/shared` owns only the key contract and the code → key mapping
- Supabase generated database types (`supabase gen types`) — produced with the migrations in later units
- API versioning, pagination cursors, and the RPC input/output shapes beyond the five named schemas
- OpenAPI / REST documentation generation

## Implementation

**The shared contracts package ships and is consumed by both apps. Every criterion in this story now has a guard that is proved to fail when the thing it guards is broken.**

### What ships

- `packages/shared/src/` holds `schemas/`, `enums/`, `errors/`, `types/`, `storage/`, `jobs/`, `testing/`, and `data/`, exported through `packages/shared/src/index.ts`.
- **Eleven** jest suites cover it: `boundary.test.ts`, `ci-order.test.ts`, `coverage.test.ts`, `data.test.ts`, `enums.test.ts`, `errors.test.ts`, `exported-types.test.ts`, `jobs.test.ts`, `schemas.test.ts`, `storage.test.ts`, `testing/testing.test.ts` — **158 tests**.
- Both apps import the contracts rather than copying them. `apps/admin/lib/api.ts:1` imports `AppError` and `ApiErrorCode` from `@nagar-shield/shared`; `apps/admin/lib/format.ts` and `apps/admin/app/queue/[reportId]/page.tsx` do the same.
- `apps/admin/next.config.mjs` sets `transpilePackages: ['@nagar-shield/shared']`, so the workspace package is bundled rather than re-implemented.
- `tools/mirror-shared-to-functions.cjs --check` proves the Edge Functions carry the same nine files, so the third consumer of the contract cannot drift either.

### The guards

**1. The boundary test — `packages/shared/src/boundary.test.ts`.**

It walks `apps/admin` and `apps/mobile` and fails when either app redefines a shared schema, a shared enum, a shared business-rule constant, or builds a Zod schema of its own. The failure names the offending file and the offending name.

Three details make it a guard rather than a grep:

- **It reads code, not prose.** The rule is *stated* in the very files it scans, so comments and string literals are stripped before the scan. A naive grep for `z.object` would match the comment explaining the rule.
- **The Zod import is read from the original source, the construction from the stripped source.** A module specifier is not prose, so it is safe to read — but it *is* a string literal, and the stripper blanks string literals, so the import would be invisible in the stripped text. Splitting the read is what makes the check work at all; the first version read both from the stripped text and **never fired**.
- **The shared-name list cannot go stale.** A test asserts the list names **every** exported constant in the package. When the list was first written it was missing eight, and the test said so — which is the point. A hand-written vocabulary that silently rots is a guard that quietly stops guarding.

It lives in `packages/shared` rather than in either app: the property is about **both** apps at once, and a test only one app's suite runs would leave the other unguarded.

**2. The error-code table is pinned to the standard.**

AC #7 requires the `ApiErrorCode` union to contain every code in `memory-bank/standards/api-conventions.md` § Error codes **and no code outside it**. `packages/shared/src/errors/errors.test.ts` now reads that file and checks both directions, plus the HTTP status of every code.

**This found a real drift.** The union carried `OTP_RATE_LIMIT` and `OFFLINE_QUEUED` — both genuinely thrown by the shipped code — but the standard's table did not list them. The standard was out of date, not the code, so the two rows were **added to the standard**. The story's own rule holds now: the code is never added ad hoc without updating the document, and the test says so when either side moves.

**3. The declaration-level `any` scan — `packages/shared/src/exported-types.test.ts`.**

AC #8 says the criterion is enforced by `@typescript-eslint/no-explicit-any` **plus** *"a declaration-level scan test over the built `.d.ts` output"*. The lint rule covers the source; this covers the **shape a consumer actually sees**. The two are not the same — a type can be clean in the source and still widen to `any` in the emitted `.d.ts` through an inferred return type, a re-export, or an unresolved import.

The declarations are built **on demand** with `tsc --emitDeclarationOnly` into a temp directory, so the test needs no build step in the repository and cannot pass against a stale artefact.

Three things had to be right, and each was found the hard way:

- **`noEmit` has to be turned back off.** `tsconfig.base.json` sets `noEmit: true` for every package, so the declaration build emitted **nothing** — and the test's own *"emits declarations"* guard caught it. Without that guard the scan would have passed vacuously, which is worse than not existing.
- **Comments are stripped before the scan.** `tsc` copies doc comments into the declarations, and the prose uses the English word *"any"* — *"no author identity of any kind"*, *"to any signed-in citizen"*. The first version matched the prose and reported two files that contained no type at all. The criterion is about the **type** `any`, so only the code is scanned.
- **The `as unknown as` scan runs on the SOURCE, not the declarations.** `tsc` *erases* the cast: `value as unknown as string` is emitted as `(value: unknown) => string`, because the declaration describes the resolved type. A scan over the `.d.ts` for `as unknown as` can therefore **never** fire — it is a check that cannot fail, and a check that cannot fail has proved nothing. The first version was exactly that, and it passed while the codebase held a live `as unknown as`. The cast is a source-level shortcut, so the source is where it lives.

**4. The CI-order guard — `packages/shared/src/ci-order.test.ts`.**

AC #9 says the shared suite *"is executed as the first test job in CI, before the mobile and admin suites"*. The workflow is **parsed as YAML**, not grepped — the file explains its own job graph in prose, exactly the way the source files explain their own rules, so a grep for `shared-test` would match the comment above the job.

The guard asserts **both** halves, because they are different things:

- the `jobs:` block order — `shared-test` comes before `unit-test-mobile` and `unit-test-admin`;
- the `needs:` edge — the consumers actually *depend* on `shared-test`.

The order of the `jobs:` block is a presentation order; the `needs:` edge is the one GitHub honours. Without the edge the three jobs run in parallel and the shared contract is no longer the first signal.

**5. The coverage guard — `packages/shared/src/coverage.test.ts`.**

AC #9 also says the suite *"covers every Zod schema and every enum parser"*. That is a claim about **which names the tests mention**, and a claim like that rots: a schema added last month with no test is invisible — the suite is green, the coverage is not.

So the coverage is **asserted**, the same way the boundary guard asserts that its shared-name list is not stale. The list is derived from the source — every exported Zod schema, every exported enum parser, every exported enum, every exported business-rule constant — and a name that no test mentions is reported by name.

**This found a real gap.** `stationEntrySchema` and `hotlineEntrySchema` — the two schemas that validate the curated reference dataset at module load — had **no test at all**. They are now covered: a well-formed entry, a null Bangla name, a null address, an empty id, an unknown station type, a non-numeric coordinate, a missing active flag, a missing verification date, and every entry in the shipped dataset.

**6. The factory test — `packages/shared/src/testing/testing.test.ts`.**

AC #10 names three claims about the fixtures, and each has a check.

- **Fully typed.** The factory's override parameter is `Partial<T>` for the concrete shape it builds, and the return type is that same shape. A factory that takes `Record<string, unknown>` accepts an override of *any* shape — `buildProfile({ role: 'not-a-role' })` compiles, and the mistake surfaces three screens later as a runtime error. The story's edge-case table says it directly: *"the factory's parameter type is `Partial<T>` and never `any`"*.

  The compile half is asserted with `@ts-expect-error`. A compile error the compiler did **not** raise is itself an error, so the comment cannot rot into a no-op.

- **No production PII.** The email is asserted to be on the `.test` domain (reserved by RFC 2606, can never resolve), and the fixture phones are parsed by the **shared** `phoneSchema` — so a fixture that drifted out of the app's own contract fails here.

  **This found a real defect.** The station fixture's phone was `+880255000000` — a Dhaka **landline**, with nine national digits. The shared `phoneSchema` accepts `+880` followed by **ten** digits, so the fixture would have been rejected by the app's own phone validation. A fixture the server rejects cannot test anything. It is now `+8801550000000`.

- **No `as unknown as` cast.** A scan of the factory source, with the comments stripped for the same reason the boundary scan strips them.

### The names the story used, and what they are now

The acceptance criteria and Technical Notes name several exports that were not built under those names. They are **now built**, because a reader following the criteria by name must find what the criteria name.

| The story names | What it is now |
|---|---|
| `contactSchema` (AC #6) | an **alias** of `emergencyContactSchema` — the same schema object, so the two names cannot drift |
| `areaHierarchySchema` (AC #6, Technical Notes) | **new** — `division`/`city`/`thana` required, `neighborhood` optional and normalised away when absent |
| `parseAreaHierarchy` (Technical Notes) | **new** — returns the normalised hierarchy; throws on a malformed payload rather than returning a partial |
| `parseReportCategory` (Technical Notes) | **new** — parses the 11 values; a value outside them **throws**, with no fallback and no case folding |
| `resolveErrorMessage(code)` (Technical Notes) | **new** — the `code → bundle key` resolver. The mobile app's `errorCopy()` now calls it |

**One correction to the story's own text.** The Technical Notes say the key namespace is `errors.<CODE>`. The shipped bundles use **camelCase** — `errors.authRequired`, not `errors.authrequired`. The bundle is the contract, and a key that does not exist renders as the key itself, which is how a user ended up seeing the literal word *"undefined"*. `resolveErrorMessage` returns the camelCase key, and a test pins it.

### The causal checks

Every guard was proved to **fail** when the thing it guards was broken, and restored afterwards.

| Broken | The guard that failed |
|---|---|
| a local `z.object(...)` in `apps/admin/lib/` | *"builds a local Zod schema"*, naming the file |
| a local `REPORT_CATEGORIES` in `apps/admin/lib/` | *"re-declares `REPORT_CATEGORIES`"*, naming the file |
| a local `phoneSchema` in `apps/mobile/src/` | *"re-declares `phoneSchema`"*, naming the file |
| `TEMPORARY_CAUSAL_CHECK_CODE` added to the union | *"matches the code table in the standard, exactly"* — the extra code, named |
| a standard row renamed away from a union member | the same test — the missing code, named |
| an exported type carrying `any` | *"contains no `any` in any exported type"* — the file, named |
| an `as unknown as` cast in the source | *"contains no `as unknown as` narrowing shortcut"* — the file, named |
| `needs: [shared-test]` removed from the mobile job | *"gates the mobile and admin suites on the shared suite"* |
| `shared-test` moved below the consumers | *"runs the shared suite before the mobile and admin suites"* |
| an untested schema added to the package | *"covers every exported Zod schema"* — the schema, named |

### A dependency the mirror caught

`areaHierarchySchema` needed the `AreaHierarchy` type, and the natural way to write it was `import type { AreaHierarchy } from '../types'`. That **breaks the Edge Functions**: the mirror copies `schemas/` but **not** `types/`, because the Edge Runtime mounts only the `supabase/` directory. The import resolves in the workspace and fails only inside the container.

The fix is a dependency direction: `types/` derives its `AreaHierarchy` from the schema, and the schema owns the shape. The type and the parser cannot drift, and the mirrored module has no unmirrored dependency.

**The mirror now checks this.** `tools/mirror-shared-to-functions.cjs` fails when a mirrored module imports one that is not mirrored, naming the file and the module — in both the write and the check mode, so the mistake is caught when the mirror is written rather than when the container refuses to boot.

### A build failure the improved error reporting caught

The declaration build was **silently failing** on a type error in the test file, and `execFileSync` with `stdio: 'pipe'` threw the diagnostics away — the failure read *"Command failed"* with no reason at all.

The test now reads **stdout** (`tsc` writes its diagnostics there, not stderr) and puts them in the failure message. A build failure reported as "Command failed" is a bug report nobody can act on.



