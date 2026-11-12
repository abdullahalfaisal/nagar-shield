# System Architecture

> High-level architectural decisions and patterns.
> Source: `ARCHITECTURE.md` §D–§N. This file is the **summary**; the repo-root
> `ARCHITECTURE.md` remains the full technical source of truth.

## Architecture Style

**Modular monolith** on Supabase.

- One Postgres database as the system of record.
- Domain modules owned as tables + Edge Functions + shared Zod contracts.
- Two clients: Expo citizen app, Next.js moderator admin. Not a microservice mesh.
- No Kubernetes, no message broker at MVP.

### Domain modules

| Module | Owns |
|---|---|
| `identity` | profiles, roles, remote disable, biometric preference flags |
| `help_seek` | stations, hotlines, wrong-number reports; nearest-thana query with 10 km fallback to `999` |
| `capture` | reports, report_media, area_hierarchy extraction |
| `location` | location_shares audit records |
| `alerts` | feed queries, flags, rate limits |
| `moderation` | queue views, moderation_actions |
| `jobs` | media purge, geocode cache cleanup |

### Layering

```
Client
  → PostgREST / Edge Function gateway
    → Domain services (Capture, Alerts, Moderation, Seek, Location, Identity)
      → Postgres + Storage
```

## API Design

- Base: Supabase project URL. Auth header: `Authorization: Bearer <jwt>`.
- **RPC for multi-step writes** with business rules (`finalize_capture`,
  `flag_report`, `moderation_decide`).
- **Views for read models** (`alerts_feed`, `history_nearby`).
- All mutations authenticated except health.
- Timestamps: ISO-8601 UTC. IDs: UUID v4.

| Area | Method | Path / RPC |
|---|---|---|
| Auth | — | Supabase Auth endpoints |
| Profile | GET/PATCH | `/rest/v1/profiles` |
| Contacts | CRUD | `/rest/v1/emergency_contacts` |
| Capture | POST | `/functions/v1/finalize_capture` |
| History | GET | `/rest/v1/rpc/history_nearby` |
| Alerts | GET | `/rest/v1/rpc/alerts_feed` |
| Flag | POST | `/functions/v1/flag_report` |
| Seek | GET | `/rest/v1/stations`, `hotlines` |
| Wrong number | POST | `/rest/v1/wrong_number_reports` |
| Location audit | POST | `/rest/v1/location_shares` |
| Moderation queue | GET | `/rest/v1/rpc/moderation_queue` |
| Moderation decide | POST | `/functions/v1/moderation_decide` |
| Admin disable | POST | `/functions/v1/disable_user` |

### Status codes

`200/201` success · `400` validation · `401` no session · `403` disabled /
forbidden role · `404` not found · `409` conflict (duplicate flag) · `429`
rate limited · `500` unexpected.

### Versioning

MVP has no public external API versioning. Breaking changes ship as new RPC
names. If a partner API appears later, prefix Edge Functions with `/v1/`.

## State Management

- **Server state:** TanStack Query (reports, alerts, history, contacts).
- **Auth session:** Supabase auth listener + secure token storage.
- **Ephemeral UI:** React local state / context (theme, locale, capture draft).
- **No global Redux** unless complexity forces it — not required for MVP.

## Caching Strategy

- Client-side: TanStack Query stale-while-revalidate. Alerts 60 s foreground
  poll; pause under 20% battery.
- Server-side: `geocode_cache` table for reverse-geocode results.
- Offline: Capture upload queue in the device sandbox.

## Security Patterns

| Risk | Mitigation |
|---|---|
| Injection | Parameterized SQL via PostgREST; Zod validation |
| Broken auth | Verified email; OTP cooldown; remote disable via `profiles.disabled_at` |
| Broken access control | RLS + `profiles.role = 'moderator'` checks |
| Security misconfig | Private storage buckets only; no debug keys in release |
| Sensitive data exposure | Anonymous public projection; encrypted media; EXIF stripped |
| XSS (admin) | React escaping; CSP headers on Next.js |
| Insecure design | No auto-dial; no dispatch claims |
| Rate limits | Flag (10/hour), capture (per-user daily cap), OTP throttles |
| SSRF | Edge Functions geocode host allowlist only |

- TLS 1.3; cert pinning on the API host in release builds.
- Service-role key: Edge Functions + CI only — never in a mobile or browser bundle.
- Storage: private buckets, short-lived signed read URLs.

## Frontend Architecture (Expo)

Feature-first under `apps/mobile`:

- `app/` — Expo Router screens.
- `features/*` — domain UI + hooks + use-cases.
- `shared/ui` — buttons, sheets, typography, panic-grid Help cards.
- `shared/lib` — supabase client, secure store, i18n, permissions, dialer.
- `shared/theme` — light/dark tokens lifted from the prototype.

### Routing

- `(auth)` — login, register, forgot password / OTP.
- `(onboarding)` — skippable safety profile / contacts wizard.
- `(app)` — Home, Capture, Location, History, Alerts, More Help, Settings,
  Contacts.
- Lock / biometric gate wraps returning sessions.

**Home IS the Help Alert surface** (panic-first): Police / Medical / Fire /
Personal Emergency dominant; More Help one level deeper; Capture / Location /
History / Alerts as secondary chips.

### Design contract

The mobile UI is a **1:1 port** of `prototype ui.html`:

- `docs/design/design-tokens.md` — exact color / radius / shadow / type values.
- `docs/design/screen-spec.md` — every screen's copy, layout order, controls.

Implementation must match these values. Where CSS has no clean RN equivalent
(`backdrop-filter`, `background-clip: text`, `repeating-linear-gradient`), use
the documented RN substitute rather than redesigning.

## Build & Deploy

| Environment | Composition |
|---|---|
| Local | Expo dev client + `supabase start` + admin on localhost |
| Staging | Shared Supabase free project + Vercel preview + internal APK |
| Production | Supabase project + Vercel prod + EAS production APK (sideload) |

- Mobile: `eas build -p android --profile preview` → APK → `adb install` or
  device file share.
- Admin: Vercel deploy from `apps/admin`.
- DB: `supabase db push`, reviewed.

CI on every PR: lint + typecheck (mobile, admin, shared, functions) → unit +
shared tests → Supabase migration dry-run + RLS integration tests. Nightly on
`main`: EAS Android APK smoke + Maestro subset.

## Key waivers (locked)

| ID | Decision |
|---|---|
| W-1 | Email-primary Supabase Auth; `profiles.phone` required + unique; dual login = identifier resolution + one password |
| W-2 | Paid SMS OTP feature-flagged **off** for Phase 1 (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`) |
| W-3 | Dhaka-local area table first; online geocode is backup only; Capture never blocks on geocode |
| W-4 | Location Sharing 5 s SLA = share intent / audit write, not carrier delivery |

## Extension points

| Phase 2 capability | Hook left in MVP |
|---|---|
| Live location streaming | `location_shares.mode` (`snapshot` \| `stream`) |
| Alerts push | Feed RPC stays; add FCM topic fanout later |
| Social login | Supabase Auth providers pluggable |
| iOS | Expo multi-platform project; Android policies are source of truth |
| AI media classification | Async job table + Storage event trigger |
| Nearest fire station | `stations` already typed; Help Alert number resolver interface |
| Stronger admin RBAC | `role` expands to `trust_safety` / `admin` |
