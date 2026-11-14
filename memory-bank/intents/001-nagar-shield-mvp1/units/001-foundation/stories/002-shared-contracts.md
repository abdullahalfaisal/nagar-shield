---
id: 002-shared-contracts
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
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

**The shared contracts package ships and is consumed by both apps. The story is not `complete` because the boundary guard it names was never built.**

### What ships

- `packages/shared/src/` holds `schemas/`, `enums/`, `errors/`, `types/`, `storage/`, `jobs/`, `testing/`, and `data/`, exported through `packages/shared/src/index.ts`.
- Six jest suites cover it: `data.test.ts`, `enums.test.ts`, `errors.test.ts`, `jobs.test.ts`, `schemas.test.ts`, `storage.test.ts`.
- Both apps import the contracts rather than copying them. `apps/admin/lib/api.ts:1` imports `AppError` and `ApiErrorCode` from `@nagar-shield/shared`; `apps/admin/lib/format.ts:10-11` and `apps/admin/app/queue/[reportId]/page.tsx:5` do the same. `grep -rn "zod|z\.object|z\.enum" apps/admin` returns **zero hits** — no Zod schema is defined inside the admin.
- `apps/admin/next.config.mjs:18` sets `transpilePackages: ['@nagar-shield/shared']`, so the workspace package is bundled rather than re-implemented.

### The gaps

- **The boundary test does not exist.** The story requires a test that *asserts* `apps/admin` and `apps/mobile` contain no local copy of a shared Zod schema. There is no such test anywhere in the repo, and `tools/release-verify.cjs` has no equivalent check. The *property* holds today — but only because nobody has looked. A contributor adding a local `z.object({...})` to the admin would not be caught by any gate.
- **The mobile side is not covered by the same property.** The grep above is evidence, not a guard, and it only covered the admin.

### What closing this needs

1. A boundary test that walks `apps/admin` and `apps/mobile` and fails when a Zod schema or a shared enum is redefined locally — the guard this story exists to create.
