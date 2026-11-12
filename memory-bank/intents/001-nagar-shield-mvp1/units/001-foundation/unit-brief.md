---
unit: 001-foundation
intent: 001-nagar-shield-mvp1
phase: inception
status: ready
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Unit Brief: Foundation

## Purpose

Stand up the monorepo, the shared contract package, and the React Native
design system that every other unit builds on. This unit produces the single
source of truth for types, validation, error codes, and visual tokens — so
that later units can be developed independently without contract drift.

## Scope

### In Scope

- pnpm workspace: `apps/mobile`, `apps/admin`, `packages/shared`
- TypeScript strict configuration across every package
- `packages/shared` — Zod schemas, enums, area hierarchy types, API error codes,
  i18n key contract, test factories
- `apps/mobile` — Expo SDK app, Expo Router route groups `(auth)` /
  `(onboarding)` / `(app)`, theme tokens (light + dark), shared UI primitives
  ported 1:1 from the prototype
- `apps/admin` — Next.js App Router skeleton sharing the same token set
- i18n scaffolding (`i18next` + `expo-localization`) with `bn` and `en` bundles
- Supabase client wrapper (`@supabase/supabase-js`, typed) + secure-store
  session persistence helper
- CI workflow: lint + typecheck + unit tests
- Repo hygiene: `.gitignore`, `.editorconfig`, `README.md`, `eas.json` skeleton

### Out of Scope

- Any domain behaviour (auth, help, capture, alerts) — units 002–007
- Any screen beyond the route-group shells and the design-system showcase
- Migrations and Edge Functions
- EAS build profiles with real project IDs (unit 008)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-UX-1 | All UI strings exist in both Bangla and English | Must |
| FR-UX-3 | Dark and light mode supported; choice persisted | Must |
| FR-UX-4 | Minimum 48 × 48 dp tap target on all controls | Must |
| FR-UX-5 | WCAG AA contrast in both modes | Must |

Plus the shared contract surface consumed by every other unit.

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `ReportCategory` | Fixed 11-value incident category enum | `theft`, `assault`, `harassment`, `robbery`, `accident`, `fire`, `medical`, `fraud`, `vandalism`, `suspicious`, `other` |
| `FlagReason` | Fixed 5-value flag reason enum | `misinformation`, `harassment`, `duplicate`, `off_topic`, `other` |
| `ModerationStatus` | Report moderation state machine | `visible`, `hidden_pending_review`, `restored`, `removed` |
| `PublicVisibility` | Public author projection | `anonymous` (default), `identified` |
| `AreaHierarchy` | Reverse-geocode result | `division`, `city`, `thana`, `neighborhood` |
| `ApiErrorCode` | Stable error identifier | `AUTH_REQUIRED`, `AUTH_DISABLED`, `FORBIDDEN`, `VALIDATION_FAILED`, `CONFLICT`, `FLAG_RATE_LIMIT`, `CAPTURE_RATE_LIMIT`, `MEDIA_TOO_LARGE`, `UNSUPPORTED_MEDIA`, `NOT_FOUND`, `INTERNAL` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `parseReportCategory` | Validate a category string | `unknown` | `ReportCategory` |
| `parseAreaHierarchy` | Validate a geocode payload | `unknown` | `AreaHierarchy` |
| `captureDescriptionSchema` | Zod schema, max 140 chars | `string` | `string` |
| `signupSchema` | Zod schema, email + password + E.164 phone | `{email, password, phone}` | typed input |
| `resolveErrorMessage` | Map `ApiErrorCode` → i18n key | `ApiErrorCode` | translation key |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 5 |
| Must Have | 5 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| US-FND-01 | Monorepo workspace and TypeScript configuration | Must | Planned |
| US-FND-02 | Shared contracts package (types, Zod schemas, error codes) | Must | Planned |
| US-FND-03 | Mobile design system (theme tokens + shared UI primitives) | Must | Planned |
| US-FND-04 | Mobile app shell (Expo Router groups, i18n, Supabase client) | Must | Planned |
| US-FND-05 | Admin app skeleton and CI pipeline | Must | Planned |

---

## Dependencies

### Depends On
None — this is the root unit.

### Depended By

| Unit | Reason |
|------|--------|
| `002-identity` | Needs `packages/shared` schemas, the Supabase client, the app shell |
| `003-help-seek` | Needs the theme tokens and the shared UI primitives |
| `004-capture` | Needs the Supabase client, upload helper, shared UI primitives |
| `005-location` | Needs the Supabase client, shared UI primitives |
| `006-alerts` | Needs the Supabase client, TanStack Query setup, map wrapper |
| `007-moderation` | Needs the admin skeleton and the shared token set |
| `008-jobs-operations` | Needs the workspace and the CI workflow |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| npm registry | Expo, Next.js, Zod, TanStack Query, i18next | Low |
| Google Fonts (Inter, Noto Sans Bengali) | Typography | Low — bundle at build time |
| Expo Go / dev client | Local runtime | Low |

---

## Technical Context

### Suggested Technology

Expo SDK (latest stable) + Expo Router, React Native `StyleSheet`,
`expo-linear-gradient`, `@expo/vector-icons` (Material Symbols),
`expo-font`, `expo-secure-store`, `expo-localization`, `i18next` +
`react-i18next`, `@supabase/supabase-js`, `@tanstack/react-query`,
`react-hook-form` + `@hookform/resolvers`, `zod`, `jest-expo` +
`@testing-library/react-native`, ESLint + Prettier, pnpm workspaces.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `packages/shared` → `apps/mobile` | Package | TypeScript workspace import |
| `packages/shared` → `apps/admin` | Package | TypeScript workspace import |
| `apps/mobile` → Supabase | API | HTTPS + `@supabase/supabase-js` |
| `apps/admin` → Supabase | API | HTTPS + `@supabase/supabase-js` |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Theme preference | Device key-value | 1 key | Until changed |
| Locale preference | Device key-value | 1 key | Until changed |
| Session tokens | OS secure store | 1 session | 30 days (Remember me) |

---

## Constraints

- The visual output must match `docs/design/design-tokens.md` **exactly** —
  colour hexes, radius, shadow, and type values are the contract, not a
  starting point.
- The component set must reproduce the prototype's classes
  (`.btn`, `.app-bar`, `.help-card`, `.list-row`, `.toggle`, …) as React
  Native components with identical box models.
- Bangla renders in Noto Sans Bengali, Latin in Inter. Both bundled — no
  runtime font fetch.
- Every interactive primitive must be ≥ 48 dp in both dimensions.
- No third-party UI kit — a hand-built set is the only way to hit a 1:1 port.
- `packages/shared` must not import from `apps/*` (one-way dependency).
- No service-role key may appear in any client bundle.

---

## Success Criteria

### Functional
- [ ] `pnpm install` then `pnpm typecheck` passes across all three workspaces
- [ ] `pnpm test` runs the shared package's contract tests
- [ ] `pnpm lint` passes with zero errors
- [ ] The mobile app launches and renders a design-system showcase route
      showing every shared primitive in light and dark
- [ ] Switching the theme updates every screen and the choice survives a restart
- [ ] Every i18n key resolves in both `bn` and `en`
- [ ] The admin app boots and renders its shell

### Non-Functional
- [ ] Every interactive primitive ≥ 48 × 48 dp
- [ ] Token contrast pairs verified at WCAG AA in both themes
- [ ] App cold start to first render < 2 s on a mid-range emulator

### Quality
- [ ] Shared package contract tests cover every Zod schema and enum parser
- [ ] `docs/design/design-tokens.md` values are represented 1:1 in
      `shared/theme/tokens.ts` — verified by a test that compares the two

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-001-foundation-1 | simple | US-FND-01, US-FND-02 | Workspace + shared contracts |
| bolt-001-foundation-2 | simple | US-FND-03, US-FND-04 | Design system + app shell |
| bolt-001-foundation-3 | simple | US-FND-05 | Admin skeleton + CI |

---

## Notes

- The prototype's fake iOS status bar is **not** ported — the real Android
  status bar replaces it. Everything else is 1:1.
- `docs/design/design-tokens.md` and `docs/design/screen-spec.md` are already
  generated and are the authoritative inputs for this unit.
- Where CSS has no clean RN equivalent, use the documented substitute
  (gradient text → layered `Text`; `backdrop-filter` → translucent fill;
  `repeating-linear-gradient` map stub → tiled placeholder). Do not redesign.
