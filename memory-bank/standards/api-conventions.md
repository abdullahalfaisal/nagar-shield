# API Conventions

> API design conventions and response formats.
> Source: `ARCHITECTURE.md` §I.

## API Style

**Supabase-native**: PostgREST for simple CRUD, Postgres RPC for multi-step
business writes, Supabase Edge Functions (TypeScript / Deno) for privileged
orchestration. There is no custom REST layer.

| Need | Mechanism |
|---|---|
| Single-table CRUD with owner RLS | PostgREST on the table |
| Multi-step write with a business rule | Postgres RPC (`SECURITY DEFINER`, explicit `auth.uid()` check) |
| Write needing the service role, storage, or an external call | Edge Function |
| Read model that hides columns (anonymous projection) | View or RPC, not a raw table select |

All requests: `Authorization: Bearer <jwt>`, HTTPS (TLS 1.3).

## Versioning

- MVP: no public external API versioning. Breaking changes ship as **new RPC
  names** (`alerts_feed` → `alerts_feed_v2`); never mutate a shipped contract.
- If a partner-facing API appears, prefix Edge Functions with `/v1/`.

## Response Format

Success — Edge Functions and RPCs return a uniform envelope:

```json
{ "data": { "...": "..." } }
```

`finalize_capture` success:

```json
{
  "data": {
    "report_id": "…",
    "area_hierarchy": { "division": "Dhaka", "city": "Dhaka", "thana": "…", "neighborhood": "…" },
    "moderation_status": "visible"
  }
}
```

- Timestamps: **ISO-8601 UTC** (`2026-11-03T18:00:00.000Z`).
- IDs: **UUID v4**.
- Raw PostgREST table selects are also valid (they return an array), but any
  RPC used by the app returns the `{ "data": … }` envelope for consistency.

## Error Response Format

```json
{
  "error": {
    "code": "FLAG_RATE_LIMIT",
    "message": "Too many flags. Try again later.",
    "details": { "retry_after_sec": 3600 }
  }
}
```

| Field | Rule |
|---|---|
| `code` | Stable, SCREAMING_SNAKE_CASE. Clients switch on this, never on `message`. |
| `message` | English developer-facing summary. **Never** shown raw to a user. |
| `details` | Optional structured context (retry-after, field errors). |

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Zod / CHECK constraint failure |
| `AUTH_REQUIRED` | 401 | Missing or invalid session |
| `AUTH_DISABLED` | 403 | `profiles.disabled_at` is set |
| `FORBIDDEN` | 403 | Authenticated but not permitted (e.g. citizen calling moderator RPC) |
| `NOT_FOUND` | 404 | Row missing or hidden by RLS |
| `CONFLICT` | 409 | Duplicate flag, unique violation |
| `FLAG_RATE_LIMIT` | 429 | >10 flags/hour |
| `CAPTURE_RATE_LIMIT` | 429 | Per-user daily capture cap |
| `MEDIA_TOO_LARGE` | 413 | Exceeds the 1080p / 30 s / size cap |
| `UNSUPPORTED_MEDIA` | 415 | MIME not allowed |
| `GEOCODE_UNAVAILABLE` | 200 | Non-fatal — Capture succeeded, area degraded to `Dhaka` / unknown thana |
| `INTERNAL` | 500 | Unexpected |

Clients map `code` → Bangla/English string via i18n. Raw Postgres error text
never reaches a user.

## Pagination Strategy

- Feed endpoints (Alerts, History) use **cursor pagination** on
  `(captured_at DESC, id DESC)`.
- Request: `?cursor=<iso>&limit=<n>` (default 20, max 100).
- Response: `{ "data": { "items": [...], "next_cursor": "…" | null } }`.
- History additionally takes `radius_km` (default 1), `window_hours` (default
  24), and optional `category`.
- Alerts additionally takes `division` / `city` / `thana` / `neighborhood`
  filters.

## Validation

- **Zod** schemas live in `packages/shared` and are reused by the client and
  the Edge Function / RPC input validation. Update shared before clients
  diverge.
- DB **CHECK** constraints are the second line of defence for enums, length
  caps (`description ≤ 140`), and visibility/role values.
- Storage policies validate MIME type and size on upload.
- Description is plain text only — never HTML, never rendered as rich text.
