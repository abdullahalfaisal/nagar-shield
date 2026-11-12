# Nagar Shield — Session Handover

> Read this first in a fresh session. It says what is **done**, what is
> **broken**, and what to do **next**, in that order.
>
> Last updated: 2026-11-06 · repo: `d:\Projects\E2E Delivery Delivery Engineer Training`
> Flow: specsmd AI-DLC · intent `001-nagar-shield-mvp1` · 62 stories / 27 bolts

---

## 1. Where the project stands

The backend, the Edge Functions, the admin console and the mobile UI shell are
built and verified. **55 of 62 stories still carry `implemented: false`** — the
gaps are concentrated in the mobile app's interactive surfaces and in one
server-side security defect.

**Nothing is committed.** There is no git repository (see §5). The working
tree is the only copy.

---

## 2. What is DONE and verified

Every command below was run green against the local Supabase stack.

| Area               | Evidence                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo           | pnpm workspace, 3 apps (`apps/mobile`, `apps/admin`, `packages/shared`), TS strict, ESLint flat config                                          |
| Shared contracts   | `packages/shared` — schemas, enums, errors, jobs, reference data; **72 unit tests**                                                             |
| Database           | **19 migrations**, `supabase/migrations/` — schema, RLS, business functions, read models, storage, jobs                                         |
| RLS + write guards | `supabase/tests/write_guards.sql` — regression suite for 5 probed defects (A–E)                                                                 |
| SQL test suites    | **133 assertions pass** — `schema_contract` (18), `business_rules` (28), `read_models` (52), `write_guards` (35)                                |
| REST smoke         | `tools/smoke-rpc.cjs` — **11/11**                                                                                                               |
| Edge Functions     | 7 functions — purge-media, purge-deleted-accounts, cleanup-geocode-cache, keep-project-awake, moderation-decide, disable-user, finalize-capture |
| Function smoke     | `tools/smoke-functions.cjs` — **32/32** (auth gates, idempotency, audit trail, dry run)                                                         |
| Mobile screens     | auth wizard, home, more, settings, capture, help-alert, location-sharing, contacts, alerts — 1:1 ported from `prototype ui.html`                |
| Admin console      | Next.js — login, queue, report detail, users (disable), audit log — **builds clean, 8 routes**                                                  |
| i18n               | `bn` primary + `en`, full error-code mapping incl. `AUTH_DISABLED`                                                                              |
| CI                 | `.github/workflows/ci.yml` — lint → typecheck → shared-test → unit tests → migration-dry-run → rls-integration → secret-scan                    |
| Nightly build      | `.github/workflows/build.yml` — preview APK + emulator smoke                                                                                    |
| EAS profiles       | `eas.json` — dev / preview / production, APK, cert-pinning, SMS flag off                                                                        |
| Operations         | `docs/operations/runbook.md` (8-stage release ladder), `docs/operations/secrets.md` (matrix + rotation)                                         |
| Release harness    | `tools/release-verify.cjs` — 5 assertions, `pnpm release:verify` green on `local`                                                               |

### Verification commands

```bash
pnpm typecheck        # 3 workspaces
pnpm lint
pnpm test             # 121 tests
pnpm db:test          # 133 SQL assertions
pnpm db:smoke         # 11 REST checks
pnpm fn:smoke         # 32 Edge Function checks
pnpm fn:typecheck     # Deno
pnpm data:check       # reference-data mirror
pnpm shared:check     # Edge Functions mirror
pnpm secret:scan
pnpm release:verify
```

Local stack must be up: `npx supabase start` (container `supabase_db_nagar-shield`).
Edge Functions must be served for `fn:smoke`: `pnpm fn:serve`.

---

## 3. What is BROKEN — fix these first

### 🔴 B1 — A disabled account can still write (security defect)

**Story:** `002-identity / 005-remote-account-disable`, AC #2 — "any API write
is attempted → rejected with `AUTH_DISABLED` (HTTP 403)".

Probed on the running database as the `authenticated` role with a
`profiles.disabled_at` set:

| Write path                    | Result                                        |
| ----------------------------- | --------------------------------------------- |
| `profiles` update             | ✅ refused — `ACCOUNT_DISABLED`               |
| `contacts` insert             | ❌ **succeeded**                              |
| `location_shares` insert      | ❌ **succeeded**                              |
| `wrong_number_reports` insert | ❌ **succeeded**                              |
| direct `reports` insert       | ❌ **succeeded**                              |
| direct `report_media` insert  | ❌ **succeeded**                              |
| `finalize_capture` RPC        | ❌ **succeeded** — report + media rows landed |
| `update_category` RPC         | ❌ **succeeded**                              |
| `soft_delete_account` RPC     | ❌ **succeeded**                              |
| `flag_report` RPC             | ✅ refused (report not found, unrelated)      |

**Why it matters:** the Edge Function refuses a disabled caller
(`_shared/auth.ts` → `authenticateCaller` → `AUTH_DISABLED` → 403), but the
**database is the real boundary**. Direct PostgREST writes bypass it. The
`profiles` guard is the only table that checks `disabled_at`.

**Fix shape:**

1. Add `public.account_is_disabled(uuid)` (SECURITY DEFINER, reads `profiles.disabled_at`).
2. Add the check to the write policies: `contacts`, `location_shares`,
   `wrong_number_reports`, `reports`, `report_media`, and the Storage insert
   policy `report_media_insert_own`.
3. Add the check at the top of `finalize_capture`, `update_category`,
   `soft_delete_account`, `restore_account`.
4. Raise `ACCOUNT_DISABLED` with `errcode = '42501'` — `mapDatabaseError` in
   `supabase/functions/_shared/http.ts` already maps it to `AUTH_DISABLED` → 403.
5. Add regression tests to `supabase/tests/write_guards.sql` (defect F).

> Migrations are **forward-only**. Add a new file
> `supabase/migrations/20261105000019_*.sql` — never edit an applied migration.

### 🟡 B2 — The nightly build references a flow that does not exist

`.github/workflows/build.yml` runs `maestro/panic-path.yaml`. There is no
`maestro/` directory. `docs/operations/runbook.md` names the same flow in
stage 2 and in the CI-gates section.

**Fix:** create `maestro/panic-path.yaml` (the help grid → dialer → capture
subset), or amend the workflow + runbook to match reality.

### 🟡 B3 — Stray scratch files at the repo root

These would be committed: `debug.log`, `final.txt`, `s.txt`, `sm.txt`,
`smoke-out.txt`, `smoke2.txt`, `tool-check.txt`, `tmp-check-i18n.mjs`,
`tmp-cp.txt`, `v1.txt`–`v4.txt`, `w1.txt`–`w2.txt`, `tools-install-specsmd.cjs`,
`specsmd-0.1.74.tgz`.

Also in `tools/`: `.probe-rpc.cjs`, `.probe-finalize.cjs`,
`probe-signup-path.cjs`, `probe-server-side-write.cjs`, `inspect-schema.cjs`,
`inspect-function-acl.cjs` — one-off probes, not part of the harness.

`.gitignore` covers `*.log` and `*.tgz` but none of the rest.

**Fix:** delete them, or add ignore rules. `tools/generate-bolt-plan.cjs`,
`extract-stories.cjs`, `extract-screens.cjs`, `extract-design-tokens.cjs`,
`dump-screen.cjs`, `dump-lines.cjs` are the specsmd toolchain — **keep**.

### 🟡 B4 — `eas.json` still carries placeholders

`<staging-ref>`, `<production-ref>`, `<production-anon-key>`,
`<sha256-pin-set>`. `pnpm release:verify` correctly **fails** on these, so
staging and production builds are blocked until real values land.

---

## 4. What is NOT DONE — 55 of 62 stories

Ordered by dependency. Bolt numbers in brackets.

### 4.1 Identity — unit `002-identity`

| #   | Gap                                                                                                                                                                                                                | Where                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| I1  | **Disable check on session resume.** `useAuthSession` never reads `disabled_at`; no disable screen exists. `AUTH_DISABLED` is mapped in i18n but never surfaced.                                                   | `src/shared/auth/useAuthSession.ts`, new screen in `app/(auth)/` |
| I2  | **Biometric gate.** `expo-local-authentication` is a dependency but imported nowhere; `record_biometric_attempt` RPC has no caller; failure accounting never runs.                                                 | [005]                                                            |
| I3  | **Account deletion + recovery.** `soft_delete_account` / `restore_account` exist; the Settings "Delete account" row has no `onPress`.                                                                              | [006] story 007                                                  |
| I4  | **Alternate-phone step bypassed.** `phone.tsx` routes straight to `register`; `alternate-phone.tsx` is unreachable. **Q-1 in the inception log is stale** — `profiles.alternate_phone` _does_ exist in the schema. | [004] story 001                                                  |
| I5  | `verify-otp` and `reset-password` are declared in the auth `_layout.tsx` but have **no file**.                                                                                                                     | [005]                                                            |

### 4.2 Contacts — unit `002-identity`

| #   | Gap                                                                                                                          | Where           |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| C1  | **Contacts CRUD.** `contacts.tsx` FAB has no `onPress`; `src/shared/api/contacts.ts` is read-only (no insert/update/delete). | [006] story 006 |

### 4.3 Help-seek — unit `003-help-seek`

| #   | Gap                                                                        | Where           |
| --- | -------------------------------------------------------------------------- | --------------- |
| H1  | `more-help.tsx` — placeholder route.                                       | [009] story 005 |
| H2  | `station-map.tsx` — placeholder route (needs the shared MapLibre wrapper). | [010] story 007 |

### 4.4 Capture — unit `004-capture`

| #   | Gap                                                                                                                                                     | Where           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| P1  | **Report detail + category edit.** `update_category` RPC has no caller; `reportDetailTitle` / `editCategory` / `categoryReadOnly` i18n keys are unused. | [013] story 003 |
| P2  | **Offline queue never drains.** `dueItems` / `markAttemptFailed` / `removeFromQueue` exist but nothing retries — a queued report never sends.           | [014] story 005 |
| P3  | Capture permission degradation (camera denied → degrade).                                                                                               | [014] story 006 |

### 4.5 Location — unit `005-location`

| #   | Gap                                                                                                                             | Where           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| L1  | **Location sharing writes nothing.** The CTA is `router.back()`; no `location_shares` row, no OS share sheet, no telemetry row. | [015–017]       |
| L2  | The location fix is hard-coded to `null` — `useCurrentFix` exists but the screen does not use it.                               | [017] story 005 |

### 4.6 Alerts — unit `006-alerts`

| #   | Gap                                                                                           | Where           |
| --- | --------------------------------------------------------------------------------------------- | --------------- |
| A1  | `history.tsx` — placeholder route.                                                            | [020] story 006 |
| A2  | `alert-detail.tsx` — placeholder route (public alert detail, distinct from the author's own). | [021] story 009 |
| A3  | History filters, history map, author-auto-hide.                                               | [020–021]       |

### 4.7 Moderation — unit `007-moderation`

| #   | Gap                           | Where           |
| --- | ----------------------------- | --------------- |
| M1  | Author-auto-hide queue group. | [024] story 005 |

> The admin console's queue, report detail, restore/remove decision, disable-user
> and audit log are **all built and working**. Only the auto-hide group is missing.

---

## 5. Release plumbing — not started

| #   | Gap                                                                                                                        | Note                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| R1  | **No git repository.** `git rev-parse` → _not a git repository_. No `.git` anywhere up the tree, no remote.                | `git init` + `git remote add origin <url>` + a baseline commit. **Do this before more work** — there is no safety net today. |
| R2  | Maestro flow `maestro/panic-path.yaml` missing.                                                                            | See B2                                                                                                                       |
| R3  | Scratch files at the root.                                                                                                 | See B3                                                                                                                       |
| R4  | `eas.json` placeholders.                                                                                                   | See B4                                                                                                                       |
| R5  | `apps/mobile` and `apps/admin` have `.env.example` but **no `.env`** (gitignored). `supabase/functions/.env.local` exists. | A fresh clone needs the local env files created from the examples.                                                           |

---

## 6. Suggested order of work

1. **R1** — `git init` + baseline commit. Five minutes, removes all risk.
2. **B1** — the disabled-write bypass, plus regression tests in `write_guards.sql`.
   This is the only true security defect.
3. **B3** — delete / ignore the scratch files (do it before the baseline commit
   so they are never in history).
4. **I1 → I2 → I4 → I5 → I3 → C1** — unit `002-identity` in full.
5. **P1 → P2 → P3** — unit `004-capture`.
6. **L1 → L2** — unit `005-location`.
7. **A1 → A2 → A3 → H1 → H2 → M1** — the remaining screen surfaces.
8. **B2, B4, R5** — release readiness.
9. Final `pnpm verify` → **one** commit → push.

---

## 7. Memory-bank hygiene — stale records

The memory bank does **not** reflect the built code. This confuses the next
session.

- `memory-bank/bolts/001`–`024` still say `status: planned` with no stage
  artifacts, although the code for their stories **is built**. Only bolts
  `025`–`027` have `implementation-plan.md` / `implementation-walkthrough.md` /
  `test-walkthrough.md` and `status: complete`.
- `memory-bank/story-index.md` lists every story as `planned` except
  `007-secrets-and-environments`.
- 55 of 62 story files still say `implemented: false`; only the 7 stories of
  unit `008-jobs-operations` say `true`.
- `memory-bank/intents/001-nagar-shield-mvp1/inception-log.md` **Q-1 is stale** —
  it asks whether `profiles.alternate_phone` should exist. The column exists
  (`supabase/migrations/20261105000001_initial_schema.sql:75`).

**Fix:** when a bolt's work is done, update `bolt.md` (`status: complete`,
`current_stage: null`, the three `stages_completed` entries), flip the story's
`implemented: true`, and correct the story index. Do it as part of the bolt,
not in a separate pass.

---

## 8. Where things live

```text
apps/mobile/app/(auth)/      welcome, phone, alternate-phone, login,
                             register, forgot-password
apps/mobile/app/(app)/       home, more, settings, capture, help-alert,
                             location-sharing, contacts, alerts,
                             alert-detail*, history*, more-help*, station-map*
apps/mobile/src/shared/      api/ (supabase, alerts, history, contacts,
                             stations, geocode, flags, errors), auth/,
                             services/ (captureFlow, submitCapture,
                             uploadQueue, prepareMedia, location, dialer),
                             i18n/ (bn.ts, en.ts), theme/, ui/
apps/admin/app/              login, queue, queue/[reportId], users, audit
packages/shared/src/         schemas, enums, errors, jobs, data, types
supabase/migrations/         19 forward-only migrations
supabase/tests/              4 SQL suites (133 assertions)
supabase/functions/          7 Edge Functions + _shared/
tools/                       run-sql-tests, smoke-rpc, smoke-functions,
                             mirror-*, secret-scan, release-verify,
                             purge-media-dry-run
docs/design/                 design-tokens.md, screen-spec.md
docs/operations/             runbook.md, secrets.md
memory-bank/                 intents/, bolts/, standards/, story-index.md
prototype ui.html            the design source of truth
```

`*` = placeholder route.

### Conventions

- Migrations are **forward-only**. New file, never edit an applied one.
- The **shared package** is the single source of truth for schemas, error
  codes and enums. The Edge Functions import a mirrored copy —
  `pnpm shared:mirror` regenerates it, `pnpm shared:check` proves no drift.
- The design contract is `docs/design/design-tokens.md` +
  `docs/design/screen-spec.md`. The prototype is `prototype ui.html`.
- Error codes live in `packages/shared/src/errors/index.ts`. `AUTH_DISABLED` →
  HTTP 403 already mapped end to end.
- Secrets: `docs/operations/secrets.md`. The service-role key never enters a
  client bundle.
- Reference data is mirrored 3 ways (mobile bundle → `supabase/seed.sql` →
  Postgres). `pnpm data:check` proves no drift.

---

## 9. Local dev quick reference

```bash
npx supabase start                    # the stack (db, auth, rest, storage)
pnpm fn:serve                         # Edge Functions on :54321/functions/v1
pnpm verify                           # the full gate (see §2 for each part)

docker exec supabase_db_nagar-shield psql -U postgres -d postgres   # SQL
npx supabase status -o env            # the anon + service-role keys
```

Dev accounts: `mod@nagar.local` / `citizen@nagar.local`, password
`nagar-local-dev`.

---

## 10. Open decisions still unanswered

| #   | Question                                                                                                                                     | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Q-1 | ~~`profiles.alternate_phone`~~ — **resolved**: the column exists. The remaining choice is whether the wizard step persists it or is dropped. | low    |
| Q-2 | FR-PERMS-3 battery-saver detection has no first-class Expo API — ship a native module, or downgrade to best-effort?                          | medium |
| Q-3 | More Help: three categories (FR-SEEK-1) vs six flat rows (prototype). Currently 1:1 to the prototype.                                        | low    |
| Q-4 | Video copy says 30 s (PRD-X-4) vs the prototype's 60 s. PRD wins by default.                                                                 | low    |
| Q-5 | Screen 20's dispatch-style failover copy — the 2026-10-12 override forbids it. Brief corrects the copy.                                      | low    |
| Q-6 | A distinct **public** alert-detail screen is required (not the author's own report detail).                                                  | low    |
