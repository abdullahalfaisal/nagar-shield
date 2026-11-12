# Tech Stack

> Core technology decisions for this project.
> Source: `ARCHITECTURE.md` §C. Deviations require an ADR.

## Languages

| Layer | Language | Notes |
|---|---|---|
| Mobile app | TypeScript (strict) | Expo SDK, Expo Router file-based routes |
| Admin web | TypeScript (strict) | Next.js App Router |
| Backend | TypeScript | Supabase Edge Functions (Deno runtime) |
| Database | SQL | PostgreSQL (Supabase) — migrations in `supabase/migrations` |
| Shared contracts | TypeScript + Zod | `packages/shared` |

All TypeScript packages use `strict: true`. No `any` in domain code — use
`unknown` + narrowing, or a discriminated union.

## Framework

| Concern | Choice | Rationale |
|---|---|---|
| Mobile | Expo (managed) + React Native + Expo Router | Android-first panic app needs dialer intents, camera, secure store, biometrics, sideloadable APKs without a Play listing. Expo gives stable modules + EAS Build free tier. |
| Admin | Next.js (App Router) on Vercel Hobby | Small internal moderation tool (FR-MOD). Clear RBAC boundary; service-role key never reaches a browser. |
| Backend platform | Supabase Free (Auth + Postgres + Storage + Edge Functions) | One free platform covers relational PRD entities (reports ↔ media ↔ flags ↔ moderation). Alternatives (NestJS+Neon+S3, Firebase) add free-tier moving parts or fight the relational model. |
| API surface | PostgREST + RPC + Edge Functions | RPC for multi-step writes with business rules; views for read models. |
| Maps | MapLibre GL + OpenStreetMap tiles | Zero mandatory map billing, attribution-compliant. Google Maps / Mapbox carry billing risk. |
| Validation | Zod (shared package) | Same schemas client + edge; DB CHECK constraints as second line. |
| i18n | `i18next` + `expo-localization` | Bangla + English only (C-8). |
| Server state | TanStack Query | Reports / alerts / history / contacts. |
| Forms | React Hook Form + Zod resolvers | Shared schemas: signup, login, capture description (≤140), contact, flag reason. |
| Package manager | pnpm workspaces | Monorepo: `apps/*`, `packages/*`. |
| Testing | Jest + React Native Testing Library; Maestro (E2E); Playwright (admin) | Jest + RNTL is the default RN testing standard. |
| CI/CD | GitHub Actions + EAS Build | Lean pipeline; fail PR on type/lint/unit/RLS failures. |

## Authentication

- Supabase Auth, **email-primary** identity (ADR-007 / waiver W-1).
- `profiles.phone` (E.164) is a required unique attribute on the profile.
- Login accepts phone **or** email + password → client resolves the identifier
  to the email-primary Auth user, then signs in with the same password.
- Password reset: **email OTP** by default. SMS OTP is feature-flagged off
  (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`) until a funded provider exists (W-2).
- Product copy must not claim "SMS-verified phone" while the flag is off.
- Biometric (fingerprint/face) is a **local device re-auth** for an existing
  session, never a login credential.

## Infrastructure & Deployment

| Piece | Host | Tier |
|---|---|---|
| API / DB / Auth / Storage | Supabase | Free |
| Admin web | Vercel | Hobby |
| Mobile binaries | EAS Build → sideload APK | Free |
| CI | GitHub Actions | Free |
| Maps | OSM tiles via MapLibre | Free (respect tile usage policy) |
| Email OTP | Supabase Auth email | Free |

Cost target: **$0 required infrastructure**. SMS is the only optional paid line
item and is feature-flagged off.

### Environment variables

| Name | Where |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile |
| `EXPO_PUBLIC_SMS_OTP_ENABLED` | Mobile (default `false`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions / CI **only** |
| `NEXT_PUBLIC_SUPABASE_URL` | Admin |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Admin |
| `GEOCODE_BASE_URL` | Edge Functions |

Secrets live in `.env` locally (gitignored), EAS secrets / Vercel / GitHub
Environments in CI. **Never** ship the service-role key to a client bundle.

## Out of scope (Phase 1)

Microservices, Kafka, Redis, Kubernetes, live WebSocket Alerts, multi-region,
iOS app, social login, FCM push, live location streaming, AI media
classification, heatmaps / crime prediction, Charts / crime-stats dashboards.
