# Nagar Shield — Session Handover

> Read this first in a fresh session. It says what is **done**, what is
> **broken**, and what to do **next**, in that order.
>
> Last updated: 2026-11-13 · repo: `d:\Projects\E2E Delivery Delivery Engineer Training`
> Flow: specsmd AI-DLC · intent `001-nagar-shield-mvp1` · 62 stories / 27 bolts

---

## 1. Where the project stands

The backend, the Edge Functions, the admin console and the mobile UI shell are
built and verified. **55 of 62 stories still carry `implemented: false`** — the
gaps are concentrated in the mobile app's interactive surfaces.

**The repository now exists** (see §5). The working tree is committed and
pushed-ready, and there is a baseline commit to fall back to.

**The security defect is closed.** The disabled-account write bypass (defect
F) was fixed in migration `20261105000019_disabled_account_write_guard.sql`,
covered by 31 new SQL assertions and an 8-check live API probe. See §3.

**One pre-existing quirk worth knowing.** After `pnpm db:reset`, the
`alerts_feed` read model returns **zero items** — the seeded reports fall
outside the feed's own window. This is not a regression: it reproduces on
an unmodified tree (`git stash` + `db:reset`). The smoke test only asserts
the response *shape*, so it passes silently. If the Alerts screen ever
appears empty in a dev session, this is why.

---

## 2. What is DONE and verified

Every command below was run green against the local Supabase stack.

| Area | Evidence |
|---|---|
| Monorepo | pnpm workspace, 3 apps (`apps/mobile`, `apps/admin`, `packages/shared`), TS strict, ESLint flat config |
| Shared contracts | `packages/shared` — schemas, enums, errors, jobs, reference data; **75 unit tests** |
| Database | **21 migrations**, `supabase/migrations/` — schema, RLS, business functions, read models, storage, jobs |
| RLS + write guards | `supabase/tests/write_guards.sql` — regression suite for 6 probed defects (A–F) |
| SQL test suites | **176 assertions pass** — `schema_contract` (18), `business_rules` (28), `read_models` (52), `write_guards` (78) |
| REST smoke | `tools/smoke-rpc.cjs` — **11/11** |
| Disabled-write guard | `tools/probe-disabled-write.cjs` — **8/8** over the real PostgREST path |
| Biometric gate | `tools/probe-biometric-gate.cjs` — **10/10** over the real PostgREST path |
| Alternate phone | `tools/probe-alternate-phone.cjs` — **9/9** over the real PostgREST path |
| Signup contract | `tools/probe-signup-contract.cjs` — **13/13** over the real GoTrue + PostgREST path |
| Edge Functions | 7 functions — purge-media, purge-deleted-accounts, cleanup-geocode-cache, keep-project-awake, moderation-decide, disable-user, finalize-capture |
| Function smoke | `tools/smoke-functions.cjs` — **32/32** (auth gates, idempotency, audit trail, dry run) |
| Mobile screens | auth wizard, home, more, settings, capture, help-alert, location-sharing, contacts, alerts — 1:1 ported from `prototype ui.html` |
| Admin console | Next.js — login, queue, report detail, users (disable), audit log — **builds clean, 8 routes** |
| i18n | `bn` primary + `en`, full error-code mapping incl. `AUTH_DISABLED` |
| CI | `.github/workflows/ci.yml` — lint → typecheck → shared-test → unit tests → maestro-flow → migration-dry-run → rls-integration → secret-scan |
| Nightly build | `.github/workflows/build.yml` — preview APK + emulator smoke (`maestro/panic-path.yaml`) |
| EAS profiles | `eas.json` — dev / preview / production, APK, cert-pinning, SMS flag off |
| Operations | `docs/operations/runbook.md` (8-stage release ladder), `docs/operations/secrets.md` (matrix + rotation) |
| Release harness | `tools/release-verify.cjs` — 5 assertions, `pnpm release:verify` green on `local` |

### Verification commands

```bash
pnpm typecheck        # 3 workspaces
pnpm lint
pnpm test             # 156 tests
pnpm db:test          # 176 SQL assertions
pnpm db:smoke         # 11 REST checks
pnpm guard:check      # 8 disabled-write probes (live PostgREST)
pnpm biometric:check  # 10 biometric-accounting probes (live PostgREST)
pnpm alternate:check  # 9 alternate-phone constraint probes (live PostgREST)
pnpm signup:check     # 13 signup-contract probes (live GoTrue + PostgREST)
pnpm fn:smoke         # 32 Edge Function checks
pnpm fn:typecheck     # Deno
pnpm data:check       # reference-data mirror
pnpm shared:check     # Edge Functions mirror
pnpm maestro:check    # the nightly emulator flow
pnpm secret:scan
pnpm release:verify
```

Local stack must be up: `npx supabase start` (container `supabase_db_nagar-shield`).
Edge Functions must be served for `fn:smoke`: `pnpm fn:serve`.

---

## 3. What is BROKEN — fix these first

### ✅ B1 — A disabled account can still write (security defect) — FIXED

**Story:** `002-identity / 005-remote-account-disable`, AC #2 — "any API write
is attempted → rejected with `AUTH_DISABLED` (HTTP 403)".

**The defect.** The Edge Function refused a disabled caller
(`_shared/auth.ts` → `authenticateCaller` → `AUTH_DISABLED` → 403), but the
**database is the real boundary**. A client holding a valid citizen JWT talks
to PostgREST directly, and PostgREST applies the RLS policies and nothing
else. The `profiles` guard was the only table that checked `disabled_at`, so
every other write path stayed open:

| Write path | Before | After |
|---|---|---|
| `profiles` update | ✅ refused | ✅ refused |
| `contacts` insert / update / delete | ❌ succeeded | ✅ `ACCOUNT_DISABLED` |
| `location_shares` insert | ❌ succeeded | ✅ `ACCOUNT_DISABLED` |
| `wrong_number_reports` insert | ❌ succeeded | ✅ `ACCOUNT_DISABLED` |
| direct `reports` insert | ❌ succeeded | ✅ `ACCOUNT_DISABLED` |
| direct `report_media` insert | ❌ succeeded | ✅ `ACCOUNT_DISABLED` |
| Storage `report_media_insert_own` | ❌ succeeded | ✅ refused |
| `finalize_capture` RPC | ❌ succeeded — report + media rows landed | ✅ `ACCOUNT_DISABLED` |
| `update_category` RPC | ❌ succeeded | ✅ `ACCOUNT_DISABLED` |

**The fix** — `supabase/migrations/20261105000019_disabled_account_write_guard.sql`:

1. `public.account_is_disabled(uuid)` — SECURITY DEFINER, STABLE, reads
   `profiles.disabled_at`.
2. `public.caller_is_client()` — the `role` GUC discriminator, the same one
   `profiles_update_guard` already uses, because it is the only role signal
   that survives a SECURITY DEFINER hop. `anon` and `authenticated` are
   clients; everything else is the server.
3. `public.assert_account_not_disabled(uuid)` — the guard itself. Raises
   `ACCOUNT_DISABLED` with `errcode = '42501'`, which `mapDatabaseError` in
   `supabase/functions/_shared/http.ts` already maps to `AUTH_DISABLED` → 403.
   The server is never refused, so `disable_user` and the PII purge still
   work against a disabled row.
4. The guard is applied to the client write policies (`contacts`,
   `location_shares`, `wrong_number_reports`, `reports`, `report_media`,
   `flags`, and the Storage insert policy) **and** to the SECURITY DEFINER
   RPCs (`finalize_capture`, `update_category`). The RPCs needed their own
   check: they run with the owner's privileges, so the policies do not apply
   to the writes they perform.
5. `soft_delete_account` and `restore_account` were deliberately **not**
   guarded — a disabled user must still be able to ask for their own data to
   be deleted, and to recover an account they deleted. Guarding them would
   make the disable a permanent imprisonment with no exit.

**The verification** — three layers:

- `supabase/tests/write_guards.sql` Test G1–G31 — 31 new SQL assertions.
- `tools/probe-disabled-write.cjs` (`pnpm guard:check`) — 8 checks over the
  **real PostgREST path**, which is the door the Edge Function does not own.
- A causal check: with the guard neutered the writes succeed again, so the
  guard is precisely what closes the hole.

> Migrations are **forward-only**. This was a new file —
> `20261105000019_disabled_account_write_guard.sql`. Never edit an applied
> migration.

### ✅ B2 — The nightly build references a flow that does not exist — FIXED

`.github/workflows/build.yml` ran `maestro/panic-path.yaml` and there was no
`maestro/` directory.

**The fix:** `maestro/panic-path.yaml` now exists — the help grid → Help
Alert → the OS dialer → Capture subset. It signs in, asserts the four
emergency tiles and their numbers (Police 999, Medical 999, Fire **102**),
asserts the More Help sheet, confirms the OS dialer opens, and asserts the
capture screen's controls.

It **does not place a call** and **does not submit a report**, so a smoke
run leaves no test data behind. Every text selector matches both Bengali and
English, because the app falls back to Bengali (`DEFAULT_LOCALE`) when the
device locale is neither.

`tools/check-maestro-flow.cjs` (`pnpm maestro:check`) validates the flow
without an emulator: the YAML parses, every command is a real Maestro
command, the `appId` matches the EAS package, every `id:` selector refers to
a `testID` that exists in the app, and every Bengali selector is a string
that exists in `bn.ts`. A typo fails CI in seconds instead of the nightly
build after a full APK build.

### ✅ I2 — The biometric gate — FIXED

`expo-local-authentication` was a dependency imported nowhere, and
`record_biometric_attempt` had no caller — so the FR-AUTH-5 thresholds
(3 fails → password, 5 fails in 24 h → auto-disable) were never enforced.

**The fix.** `src/shared/auth/biometricService.ts` wraps the device prompt;
`useBiometricGate` decides when the gate applies; `app/(auth)/biometric-gate.tsx`
runs it. Three decisions worth keeping:

- **The thresholds come from the RPC, not from the app.** An app-local
  counter is cleared by a reinstall and cannot enforce "5 fails in 24 h".
  The app renders the server's answer.
- **A cancelled prompt is not a failure.** A user who dismisses the sheet
  has not failed to identify themselves; counting it would lock biometric
  out after three dismissals for a user who never touched the sensor.
- **The gate is for a returning session only.** A user who just typed their
  password has already proved who they are. The "signed in with a password"
  flag lives in SecureStore and is cleared on background, so the next
  foreground is gated again.

`tools/probe-biometric-gate.cjs` (`pnpm biometric:check`) proves the
thresholds over the **real PostgREST path** — 10 checks, including that the
auto-disable is durable, that a success clears the counter without silently
re-enabling biometric, and that an anonymous caller cannot record an
attempt.

### ✅ I4 — The alternate-phone step was bypassed — FIXED

`phone.tsx` routed straight to `register`, so `alternate-phone.tsx` was
unreachable and the column the story asks for was never written.

**The fix.** `phone.tsx` now routes to the alternate-phone step carrying the
**normalised** primary number; the step rejects an alternate equal to the
primary; `register.tsx` writes the column after the signup and tells the
user if that write fails without failing the signup.

Three decisions worth keeping:

- **The alternate phone is written *after* the signup.** The `profiles` row
  is created by the `handle_new_user()` trigger, which writes `id, email,
  phone, full_name` and nothing else — there is no way to set the column as
  part of the signup. `signUp` therefore returns the new user's id.
- **Both sides of the "must differ" comparison are normalised.** Comparing
  raw strings let `01711-111111` and `+8801711111111` — the same number,
  two spellings — pass the rule.
- **The column is deliberately NOT unique.** A shared family number is
  legitimate, and the story's edge-case table says so. The uniqueness
  guarantee belongs to the *primary* phone only.

Migration 020 adds the format CHECK the schema never had. It is written
against the **three-valued** trap: the obvious form
(`normalise_bd_phone(x) = x`) silently accepts every non-BD number, because
a CHECK rejects only FALSE and `NULL = '…'` is NULL. The shipped form
requires `is not null AND =`. `pnpm alternate:check` is what caught that,
and it is in CI for exactly that reason. The constraint is added **after**
the backfill — a row holding `01712345678` fails the check as written.

`pnpm signup:check` (`tools/probe-signup-contract.cjs`) proves the signup
contract over the **public Auth door** — 13 checks. The ones that earn
their keep are the "gains NO auth.users row" assertions: the `UNIQUE`
constraint on `profiles.phone` lives inside the trigger's transaction, so a
rejected signup rolls the insert back. The SQL suite cannot prove this
half; only the transaction can.

### ✅ B3 — Stray scratch files at the repo root — FIXED

The scratch files were deleted before the baseline commit, so they never
entered history. `.gitignore` now also covers `tmp-*`, `*.tmp`, `scratch/`,
`supabase/.temp/` and `apps/mobile/.expo-export-test/`.

`tools/probe-server-side-write.cjs` was **kept** — `schema_contract.sql` and
migration 011 cite it as the record of the defect it guards against. The
other one-off probes were deleted.

`tools/generate-bolt-plan.cjs`, `extract-stories.cjs`, `extract-screens.cjs`,
`extract-design-tokens.cjs`, `dump-screen.cjs`, `dump-lines.cjs` are the
specsmd toolchain — **kept**.

### 🟡 B4 — `eas.json` still carries placeholders

`<staging-ref>`, `<production-ref>`, `<production-anon-key>`,
`<sha256-pin-set>`. `pnpm release:verify` correctly **fails** on these, so
staging and production builds are blocked until real values land.

---

## 4. What is NOT DONE — 55 of 62 stories

Ordered by dependency. Bolt numbers in brackets.

### 4.1 Identity — unit `002-identity`

| # | Gap | Where |
|---|---|---|
| I1 | ✅ **FIXED** — `useAccountStatus` reads `disabled_at` on session resume and every foreground; a disabled account is routed to `app/(auth)/account-disabled.tsx`, which explains the disable and offers delete-or-sign-out. `fromSupabaseError` maps the guard's `ACCOUNT_DISABLED` to `AUTH_DISABLED` before the generic 42501 → FORBIDDEN. | `src/shared/auth/useAccountStatus.ts`, `app/(auth)/account-disabled.tsx` |
| I2 | ✅ **FIXED** — the biometric gate is live: `src/shared/auth/biometricService.ts` wraps `expo-local-authentication`, `useBiometricGate` decides when the gate applies, and `app/(auth)/biometric-gate.tsx` runs the prompt. The thresholds come from the `record_biometric_attempt` RPC (the authority), not from an app-local counter. The Settings toggle now persists `biometric_opt_in`. `pnpm biometric:check` proves the FR-AUTH-5 thresholds over PostgREST (10/10). | [005] |
| I3 | ✅ **FIXED** (folded into I1) — the Settings "Delete account" row now confirms and calls `soft_delete_account`; a soft-deleted account that signs back in lands on `app/(auth)/account-deleted.tsx`, which can restore it inside the 30-day window. | [006] story 007 |
| I4 | ✅ **FIXED** — the alternate-phone step is live: `phone.tsx` routes to `app/(auth)/alternate-phone.tsx` with the **normalised** primary number, the step rejects an alternate equal to the primary (both sides normalised, so `01711-111111` and `+8801711111111` compare equal), and `register.tsx` writes the column after the signup via `setAlternatePhone` — the `handle_new_user` trigger does not carry it. Migration 020 adds the format CHECK the schema never had. `pnpm alternate:check` proves the constraint over PostgREST (9/9); `pnpm signup:check` proves the signup contract (13/13). | [004] story 001 |
| I5 | `verify-otp` and `reset-password` are declared in the auth `_layout.tsx` but have **no file**. | [005] |

### 4.2 Contacts — unit `002-identity`

| # | Gap | Where |
|---|---|---|
| C1 | **Contacts CRUD.** `contacts.tsx` FAB has no `onPress`; `src/shared/api/contacts.ts` is read-only (no insert/update/delete). | [006] story 006 |

### 4.3 Help-seek — unit `003-help-seek`

| # | Gap | Where |
|---|---|---|
| H1 | `more-help.tsx` — placeholder route. | [009] story 005 |
| H2 | `station-map.tsx` — placeholder route (needs the shared MapLibre wrapper). | [010] story 007 |

### 4.4 Capture — unit `004-capture`

| # | Gap | Where |
|---|---|---|
| P1 | **Report detail + category edit.** `update_category` RPC has no caller; `reportDetailTitle` / `editCategory` / `categoryReadOnly` i18n keys are unused. | [013] story 003 |
| P2 | **Offline queue never drains.** `dueItems` / `markAttemptFailed` / `removeFromQueue` exist but nothing retries — a queued report never sends. | [014] story 005 |
| P3 | Capture permission degradation (camera denied → degrade). | [014] story 006 |

### 4.5 Location — unit `005-location`

| # | Gap | Where |
|---|---|---|
| L1 | **Location sharing writes nothing.** The CTA is `router.back()`; no `location_shares` row, no OS share sheet, no telemetry row. | [015–017] |
| L2 | The location fix is hard-coded to `null` — `useCurrentFix` exists but the screen does not use it. | [017] story 005 |

### 4.6 Alerts — unit `006-alerts`

| # | Gap | Where |
|---|---|---|
| A1 | `history.tsx` — placeholder route. | [020] story 006 |
| A2 | `alert-detail.tsx` — placeholder route (public alert detail, distinct from the author's own). | [021] story 009 |
| A3 | History filters, history map, author-auto-hide. | [020–021] |

### 4.7 Moderation — unit `007-moderation`

| # | Gap | Where |
|---|---|---|
| M1 | Author-auto-hide queue group. | [024] story 005 |

> The admin console's queue, report detail, restore/remove decision, disable-user
> and audit log are **all built and working**. Only the auto-hide group is missing.

---

## 5. Release plumbing

| # | Gap | Note |
|---|---|---|
| R1 | **No git repository.** | ✅ **DONE** — `git init` on `main`, a baseline commit of the verified tree, `.gitattributes` for LF normalization. **Still no remote**: `git remote add origin <url>` before the first push. |
| R2 | Maestro flow `maestro/panic-path.yaml` missing. | ✅ **DONE** — see B2 |
| R3 | Scratch files at the root. | ✅ **DONE** — see B3 |
| R4 | `eas.json` placeholders. | See B4 |
| R5 | `apps/mobile` and `apps/admin` have `.env.example` but **no `.env`** (gitignored). `supabase/functions/.env.local` exists. | A fresh clone needs the local env files created from the examples. |

---

## 6. Suggested order of work

1. ~~**R1** — `git init` + baseline commit.~~ ✅ **DONE**
2. ~~**B1** — the disabled-write bypass, plus regression tests.~~ ✅ **DONE**
3. ~~**B3** — delete / ignore the scratch files.~~ ✅ **DONE**
4. ~~**B2** — the Maestro panic-path flow.~~ ✅ **DONE**
5. ~~**I1 → I2 → I3** — the identity lifecycle.~~ ✅ **DONE.** I1's
   database-side guard (migration 019) now has its mobile half: the disable
   check on session resume, the disable screen, and the account-deletion and
   restore paths that were already in the database but had no caller. I2's
   biometric gate is live, with the FR-AUTH-5 thresholds read from the RPC
   rather than from an app-local counter.
6. **I5 → C1** — the rest of unit `002-identity`: the two missing auth
   screens (`verify-otp`, `reset-password`) and contacts CRUD. I4 is done:
   the alternate-phone step is reachable, the column is written, and the
   format CHECK exists.
7. **P1 → P2 → P3** — unit `004-capture`.
8. **L1 → L2** — unit `005-location`.
9. **A1 → A2 → A3 → H1 → H2 → M1** — the remaining screen surfaces.
10. **B4, R5, and the git remote** — release readiness.
11. Final `pnpm verify` → **one** commit → push.

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
  (`supabase/migrations/20261105000001_initial_schema.sql:75`) and the wizard
  step now writes it.

**Fix:** when a bolt's work is done, update `bolt.md` (`status: complete`,
`current_stage: null`, the three `stages_completed` entries), flip the story's
`implemented: true`, and correct the story index. Do it as part of the bolt,
not in a separate pass.

---

## 8. Where things live

```text
apps/mobile/app/(auth)/      welcome, phone, alternate-phone, login,
                             register, forgot-password, verify-otp*,
                             reset-password*, account-disabled,
                             account-deleted, biometric-gate
apps/mobile/app/(app)/       home, more, settings, capture, help-alert,
                             location-sharing, contacts, alerts,
                             alert-detail*, history*, more-help*, station-map*
apps/mobile/src/shared/      api/ (supabase, alerts, history, contacts,
                             stations, geocode, flags, errors, profile,
                             account), auth/ (useAuthSession,
                             useAccountStatus, useBiometricGate,
                             biometricService, authService), services/
                             (captureFlow, submitCapture, uploadQueue,
                             prepareMedia, location, dialer), i18n/ (bn.ts,
                             en.ts), theme/, ui/
apps/admin/app/              login, queue, queue/[reportId], users, audit
packages/shared/src/         schemas, enums, errors, jobs, data, types
supabase/migrations/         21 forward-only migrations
supabase/tests/              4 SQL suites (176 assertions)
supabase/functions/          7 Edge Functions + _shared/
tools/                       run-sql-tests, smoke-rpc, smoke-functions,
                             mirror-*, secret-scan, release-verify,
                             purge-media-dry-run, check-maestro-flow,
                             probe-disabled-write, probe-biometric-gate,
                             probe-alternate-phone, probe-signup-contract
maestro/panic-path.yaml      the nightly emulator flow (help → dialer → capture)
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

| # | Question | Impact |
|---|---|---|
| Q-1 | ~~`profiles.alternate_phone`~~ — **resolved**: the column exists **and** the wizard step now persists it (I4 is done). The format CHECK landed in migration 020. | none |
| Q-2 | FR-PERMS-3 battery-saver detection has no first-class Expo API — ship a native module, or downgrade to best-effort? | medium |
| Q-3 | More Help: three categories (FR-SEEK-1) vs six flat rows (prototype). Currently 1:1 to the prototype. | low |
| Q-4 | Video copy says 30 s (PRD-X-4) vs the prototype's 60 s. PRD wins by default. | low |
| Q-5 | Screen 20's dispatch-style failover copy — the 2026-10-12 override forbids it. Brief corrects the copy. | low |
| Q-6 | A distinct **public** alert-detail screen is required (not the author's own report detail). | low |
