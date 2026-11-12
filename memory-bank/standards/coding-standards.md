# Coding Standards

> Code style, patterns, and quality standards for this project.
> Source: `ARCHITECTURE.md` §E, §F, §O + user custom instructions.

## Code Formatting

- **Prettier** with no semicolons, single quotes, trailing commas, 100-char
  print width, 2-space indent.
- **ESLint** flat config with `typescript-eslint` strict type-checked rules.
- Biome is **not** used — Prettier + ESLint is the pair.
- Formatting is enforced by `eslint --fix` / `prettier --check` in CI.

## Linting Rules

| Rule | Level |
|---|---|
| `@typescript-eslint/no-explicit-any` | error |
| `@typescript-eslint/no-unused-vars` | error (ignore `_`-prefixed) |
| `@typescript-eslint/consistent-type-imports` | error |
| `@typescript-eslint/no-floating-promises` | error |
| `import/no-default-export` (mobile screens) | error — Expo Router requires named default per route file, so this rule is off for `app/` |
| `no-console` | warn in `apps/mobile` and `apps/admin`; allowed in Edge Functions (structured logs) |

## Naming Conventions

| Kind | Convention | Example |
|---|---|---|
| Files | kebab-case | `emergency-contact-picker.tsx` |
| Components | PascalCase, file matches component | `HelpCard.tsx` |
| Functions / vars | camelCase | `resolveLoginIdentifier()` |
| Constants | SCREAMING_SNAKE_CASE | `FLAG_HIDE_THRESHOLD = 3` |
| Types / interfaces | PascalCase | `AreaHierarchy`, `ReportCategory` |
| Database tables | snake_case, plural | `emergency_contacts` |
| DB columns | snake_case | `public_visibility` |
| API error codes | SCREAMING_SNAKE_CASE | `FLAG_RATE_LIMIT` |
| i18n keys | dot.case.namespaced | `help.police.title` |
| Supabase RPC | `snake_case` verb_noun | `finalize_capture`, `alerts_feed` |
| Edge Function dirs | kebab-case | `supabase/functions/flag-report/` |

## File & Folder Organization

```
nagar-shield/
├── apps/
│   ├── mobile/          # Expo citizen app
│   │   ├── app/         # Expo Router screens (file-based routes)
│   │   ├── features/    # domain UI + hooks + use-cases
│   │   ├── shared/
│   │   │   ├── ui/      # presentational components
│   │   │   ├── lib/     # supabase client, secure store, i18n, permissions, dialer
│   │   │   └── theme/   # light/dark tokens (from prototype)
│   │   └── assets/
│   └── admin/           # Next.js moderator console
├── packages/
│   └── shared/          # Zod schemas, types, enums, API codes, i18n key contract
├── supabase/
│   ├── migrations/      # SQL schema + RLS
│   ├── functions/       # Edge Functions
│   ├── seed/            # stations, hotlines, sample reports
│   └── config.toml
├── tools/               # scripts: seed, geocode check, media purge dry-run
├── memory-bank/         # specsmd AI-DLC artifacts
├── docs/design/         # port contract from prototype ui.html
└── .github/workflows/
```

Rules:

- `apps/mobile` — **only** citizen UX and device integrations.
- `apps/admin` — **only** moderation / trust tooling.
- `packages/shared` — **single source of truth** for contracts. Update shared
  before clients diverge.
- `supabase/` — schema, policies, privileged workflows.
- Presentational components stay dumb; feature hooks own data fetching.

## Testing Strategy

| Level | Tool | Scope |
|---|---|---|
| Unit | Jest | Domain helpers: rate-limit math, dialer number selection, area filter, Zod schemas |
| Shared | Jest (packages/shared) | Runs first in CI — fastest feedback |
| Integration | Supabase local + SQL / Node | RLS policies, RPC contracts, flag threshold transition |
| E2E mobile | Maestro on Android emulator | Panic path (open → confirm → dialer intent), Capture happy path, Alerts filter |
| E2E admin | Playwright | Moderator login → restore/remove |
| Security | Supabase local | RLS negative tests (cannot read anonymous `author_id`; cannot moderate as citizen), signed-URL expiry, OTP cooldown |

Rules:

- Shared package tests run **first** in CI (fastest signal).
- Fixtures live in `packages/shared/testing` — factories, not raw SQL blobs.
- **Never** use production PII in fixtures.
- Seed scripts produce ~60 synthetic reports across 8 Dhaka areas.

## Error Handling Patterns

- **Result / typed errors** across API boundaries. A `Result<T, AppError>` shape
  rather than thrown exceptions at the domain edge.
- Server errors use a stable envelope:

  ```json
  { "error": { "code": "FLAG_RATE_LIMIT", "message": "Too many flags.", "details": { "retry_after_sec": 3600 } } }
  ```

- Clients map `code` → Bangla/English string. **Never** surface raw Postgres
  errors to a user.
- Stable error codes: `AUTH_DISABLED`, `FLAG_RATE_LIMIT`, `MEDIA_TOO_LARGE`,
  `VALIDATION_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `OFFLINE_QUEUED`.
- Domain functions are small and focused. Prefer composition over inheritance.
- Add a brief comment only where the "why" is non-obvious.

## Logging Standards

- Edge Functions emit **structured JSON** logs: request id, hashed user id,
  action.
- **Never** log raw GPS coordinates, media payloads, passwords, or tokens.
- Admin actions always write `moderation_actions.note`.
- Mobile uses structured app logs; Sentry is an optional later add.

## Accessibility

- Material **48×48 dp** minimum tap target on every interactive control
  (FR-UX-4 / PRD-X-3).
- WCAG **AA** contrast in both light and dark themes; AAA on panic-critical
  surfaces (FR-UX-5).
- Every control has an accessibility label. The prototype's `aria-label`s are
  the contract for the RN `accessibilityLabel` values.

## i18n

- **All** user-facing strings go through i18n (Bangla + English). No
  hardcoded English-only UI in features (rule 8 of ARCHITECTURE §O).
- Bangla strings use **Noto Sans Bengali**; Latin uses **Inter**.
- Native-speaker review on every string; no machine translation (FR-UX-1).

## Product Rules the Code Must Obey

These are not style rules — violating them is a product defect:

1. **Never auto-dial.** Only open the OS dialer after explicit confirmation.
   Never claim a call connected.
2. **Never build dispatch, heatmaps, crime prediction, or public author
   profiles.**
3. **Prefer RLS + RPC** over ad-hoc client privilege. No service-role keys in
   apps.
4. **Help Alert stays offline-capable** for number display + dialer intent.
   Ship curated Dhaka stations/hotlines in the app bundle.
5. **Capture must not block.** Failed uploads queue locally with backoff; max
   3 attempts then retry later.
6. **Anonymous is the default** public visibility; server still stores
   `author_id`.
7. **Category is optional** at Capture; editable later by the author.
8. **Media caps:** 1080p / 30 s video, images compressed before upload.
9. **Alerts poll** every 60 s in foreground only; pause under 20% battery.
10. **Flag threshold = 3** to hide; moderator restore/remove requires a note.
11. **Do not implement Charts / Total Crime dashboards** from the HTML prototype.
12. **Panic path first.** If a change risks Home → dialer latency or clarity,
    reject it.
