# Nagar Shield — Session Handover

> Read this first in a fresh session. It says what is **done**, what is
> **broken**, and what to do **next**, in that order.
>
> Last updated: 2026-11-13 · repo: `d:\Projects\E2E Delivery Delivery Engineer Training`
> Flow: specsmd AI-DLC · intent `001-nagar-shield-mvp1` · 54 stories / 27 bolts

---

## 1. Where the project stands

The backend, the Edge Functions, the admin console and the mobile UI shell are
built and verified. **28 of 54 stories still carry `implemented: false`** — the
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
| Shared contracts | `packages/shared` — schemas, enums, errors, jobs, reference data; **84 unit tests** |
| Database | **30 migrations**, `supabase/migrations/` — schema, RLS, business functions, read models, storage, jobs, password-reset OTP, contacts owner default + phone CHECK, author-only `update_category`, nullable all-or-nothing location position, the contact app-user lookup, the **distinct-report** author auto-hide |
| RLS + write guards | `supabase/tests/write_guards.sql` — regression suite for 6 probed defects (A–F) |
| SQL test suites | **386 assertions pass** — `schema_contract` (18), `business_rules` (35), `read_models` (52), `write_guards` (82), `password_reset` (47), `contacts` (47), `report_category` (32), `location_shares` (37), `alert_detail` (36) |
| REST smoke | `tools/smoke-rpc.cjs` — **11/11** |
| Disabled-write guard | `tools/probe-disabled-write.cjs` — **8/8** over the real PostgREST path |
| Biometric gate | `tools/probe-biometric-gate.cjs` — **10/10** over the real PostgREST path |
| Alternate phone | `tools/probe-alternate-phone.cjs` — **9/9** over the real PostgREST path |
| Signup contract | `tools/probe-signup-contract.cjs` — **13/13** over the real GoTrue + PostgREST path |
| Password reset | `tools/probe-password-reset.cjs` — **30/30** over the real GoTrue + mailbox path |
| Contacts CRUD | `tools/probe-contacts-crud.cjs` — **26/26** over the real GoTrue + PostgREST path |
| Report category | `tools/probe-report-category.cjs` — **22/22** over the real GoTrue + PostgREST path |
| Public alert | `tools/probe-public-alert.cjs` — **14/14** over the real GoTrue + PostgREST + Storage path |
| Edge Functions | 8 functions — purge-media, purge-deleted-accounts, cleanup-geocode-cache, keep-project-awake, moderation-decide, disable-user, finalize-capture, password-reset |
| Function smoke | `tools/smoke-functions.cjs` — **32/32** (auth gates, idempotency, audit trail, dry run) |
| Mobile screens | auth wizard, home, more, settings, capture, help-alert, location-sharing, contacts, alerts, report detail — 1:1 ported from `prototype ui.html`. The **location-sharing** screen's CTA now performs a real share. |
| History + alert detail | `app/(app)/history.tsx` (four tabs, one filter object, one query key), `history-map.tsx` (one shared wrapper), `alert-detail.tsx` (the projection omits `author_id` **entirely**) |
| Source scans | `noChartCode.test.ts` (no chart — FR-NG-3 / FR-NG-4 / ADR-010), `noBulkActions.test.ts` (no bulk action — FR-MOD-3), `stationMap.test.ts` (one wrapper, one attribution, the 150 cap) — all **read code only**, and all fail the build |
| Offline queue | `apps/mobile/src/shared/services/` — the sandbox queue, the backoff schedule, the drain, and the drain trigger. **70 new unit tests** across three suites. |
| Permissions | `apps/mobile/src/shared/services/permissions.ts` + `permissionRecovery.ts` — the three-state read, the entry-point degradation rules, and the just-in-time recovery routing. **88 unit tests** across four suites. |
| Location sharing | `apps/mobile/src/shared/services/` — the just-in-time fix, the snapshot payload, the OS share sheet, the fan-out, the intent telemetry, and the app-user lookup. **67 new unit tests** across four suites, plus 37 SQL assertions. |
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
pnpm test             # 467 tests (335 mobile, 84 shared, 48 admin)
pnpm db:test          # 386 SQL assertions
pnpm db:smoke         # 11 REST checks
pnpm guard:check      # 8 disabled-write probes (live PostgREST)
pnpm biometric:check  # 10 biometric-accounting probes (live PostgREST)
pnpm alternate:check  # 9 alternate-phone constraint probes (live PostgREST)
pnpm signup:check     # 13 signup-contract probes (live GoTrue + PostgREST)
pnpm reset:check      # 30 password-reset probes (live GoTrue + mailbox)
pnpm contacts:check   # 26 contacts-CRUD probes (live GoTrue + PostgREST)
pnpm category:check   # 22 report-category probes (live GoTrue + PostgREST)
pnpm alert:check      # 14 public-alert probes (live GoTrue + PostgREST + Storage)
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

## 4. What is NOT DONE — 28 of 54 stories

Ordered by dependency. Bolt numbers in brackets.

### 4.1 Identity — unit `002-identity`

| # | Gap | Where |
|---|---|---|
| I1 | ✅ **FIXED** — `useAccountStatus` reads `disabled_at` on session resume and every foreground; a disabled account is routed to `app/(auth)/account-disabled.tsx`, which explains the disable and offers delete-or-sign-out. `fromSupabaseError` maps the guard's `ACCOUNT_DISABLED` to `AUTH_DISABLED` before the generic 42501 → FORBIDDEN. | `src/shared/auth/useAccountStatus.ts`, `app/(auth)/account-disabled.tsx` |
| I2 | ✅ **FIXED** — the biometric gate is live: `src/shared/auth/biometricService.ts` wraps `expo-local-authentication`, `useBiometricGate` decides when the gate applies, and `app/(auth)/biometric-gate.tsx` runs the prompt. The thresholds come from the `record_biometric_attempt` RPC (the authority), not from an app-local counter. The Settings toggle now persists `biometric_opt_in`. `pnpm biometric:check` proves the FR-AUTH-5 thresholds over PostgREST (10/10). | [005] |
| I3 | ✅ **FIXED** (folded into I1) — the Settings "Delete account" row now confirms and calls `soft_delete_account`; a soft-deleted account that signs back in lands on `app/(auth)/account-deleted.tsx`, which can restore it inside the 30-day window. | [006] story 007 |
| I4 | ✅ **FIXED** — the alternate-phone step is live: `phone.tsx` routes to `app/(auth)/alternate-phone.tsx` with the **normalised** primary number, the step rejects an alternate equal to the primary (both sides normalised, so `01711-111111` and `+8801711111111` compare equal), and `register.tsx` writes the column after the signup via `setAlternatePhone` — the `handle_new_user` trigger does not carry it. Migration 020 adds the format CHECK the schema never had. `pnpm alternate:check` proves the constraint over PostgREST (9/9); `pnpm signup:check` proves the signup contract (13/13). | [004] story 001 |
| I5 | ✅ **FIXED** — the password-reset OTP flow is live end to end. `app/(auth)/forgot-password.tsx` sends the code; `app/(auth)/verify-otp.tsx` takes it; `app/(auth)/reset-password.tsx` sets the new password and adopts the session. The challenge lives in `public.password_reset_challenges` (migration 021) and the **database owns the code** — bcrypt hash, `extensions.crypt(code, hash) = hash` — because GoTrue's `verify` endpoint accepts only `{type, token_hash}` / `{type, token}` and **silently ignores a 6-digit code**. The GoTrue token is released only after the comparison succeeds. The app owns the mail (`supabase/functions/_shared/mailer.ts`). `pnpm reset:check` proves the whole path over the real GoTrue + mailbox (30/30); `supabase/tests/password_reset.sql` adds 47 DB-side assertions. | [005] story 003 |

### 4.2 Contacts — unit `002-identity`

| # | Gap | Where |
|---|---|---|
| C1 | ✅ **FIXED** — the contacts CRUD is live. `src/shared/api/contacts.ts` gained `createContact`, `updateContact`, `deleteContact`, `makePrimary`, `clearPrimary` and `reorderContacts`; `app/(app)/contact-editor.tsx` is one screen behind add **and** edit; the FAB on `contacts.tsx` opens it; and the wizard's S-04a/b/c capture screens (`app/(auth)/contact-1.tsx` … `contact-3.tsx`, backed by the shared `src/shared/wizard/ContactCaptureScreen.tsx`) now save real contacts, followed by the S-05 location step. **Two database defects were found by probing and fixed by migration**: `contacts.user_id` had no default (the owner was the client's to name — migration 022 gives it `auth.uid()`), and `contacts.phone` had no CHECK constraint at all (migration 023, written against the three-valued trap). `pnpm contacts:check` proves the whole CRUD over the real PostgREST path (26/26) and `supabase/tests/contacts.sql` adds 47 DB-side assertions. | [006] story 006 |

### 4.3 Help-seek — unit `003-help-seek`

| # | Gap | Where |
|---|---|---|
| H1 | `more-help.tsx` — placeholder route. | [009] story 005 |
| H2 | `station-map.tsx` — placeholder route (needs the shared MapLibre wrapper). | [010] story 007 |

### 4.4 Capture — unit `004-capture`

| # | Gap | Where |
|---|---|---|
| P1 | ✅ **FIXED** — the report detail + category edit is live. `src/shared/api/reportDetail.ts` gained `fetchOwnedReport`, `updateCategory` and `signMediaUrl`; `app/(app)/report-detail.tsx` is the new detail screen (media, description, area, capture time, and the category row), with a bottom sheet holding exactly the 11 Bangla-labelled values and no free-text field; and `app/(app)/history.tsx` gained a **My Reports** tab that reads `history_nearby` and opens the detail screen — the entry point AC #1 asks for. The category is the only editable field: the description and the visibility PATCHes are both refused. **A fail-open defect was found by probing and fixed by migration**: `update_category`'s `UPDATE` was scoped to the author's own row, so a non-author's attempt matched zero rows and the function still returned a success envelope claiming the category had been set (migration 024 now raises `FORBIDDEN`, and a report that does not exist is refused the same way so the error cannot be used to enumerate ids). `pnpm category:check` proves the whole contract over the real PostgREST path (22/22) and `supabase/tests/report_category.sql` adds 32 DB-side assertions. | [013] story 003 |
| P2 | ✅ **FIXED** — the offline queue drains. `src/shared/services/queueDrain.ts` is the drain (`isRetryable`, `drainItem`, `drainQueue`) and `src/shared/services/useQueueDrain.ts` is the trigger — an `expo-network` state listener plus an `AppState` transition to `active`, both off the render path and both guarded by an in-flight **ref** so a burst of connectivity events cannot fire a burst of uploads. The Capture screen mounts the hook and surfaces the **"saved on device"** state through a new `StatusBanner`; the overflow warning is an alert, because the screen navigates away the moment a capture is queued and an inline banner would be dismissed unread. The drain runs **sequentially** and the backoff is 30 s / 2 min / 8 min, capped at 3 attempts. **Three defects were found and fixed while building it.** (1) The queue minted a **fresh** `client_request_id` instead of reusing the failed attempt's — which would have let a submit whose response was lost in transit land twice, creating a duplicate report. (2) The attempt counter moved **twice** per attempt, burning two of the three attempts on one failure. (3) The 20-item overflow was **never reported**: `enqueueUpload` truncated the queue on write, so the read-back that looked for the overflow saw an already-truncated queue and the dropped report was lost silently — the eviction is now detected before the write. Two edge cases from the story's table are also honoured: a **wrong device clock** cannot strand a report (`BACKOFF_CEILING_MS` releases an item whose timestamp is unreachable), and **signing out discards the queue** with a warning, because a queued item is scoped to its session. 70 new unit tests. | [014] story 005 |
| P3 | ✅ **FIXED** — the Capture screen degrades instead of breaking. `src/shared/services/permissions.ts` is the typed wrapper: a **three-state** read (`granted` / `denied` / `undetermined`), the `get*PermissionsAsync` APIs only — **reading never prompts** — and a failed query resolves to `denied`, the most restricted reading, because reading "I could not check" as "it is allowed" would render a control that fails on tap. `entryPointAvailability()` is the whole degradation rule as a **pure function**: the video card needs the camera **and** the mic (a silent video is not the evidence being filed), the camera path needs the camera, the gallery path needs the media library, and the file path needs nothing. `usePermissions.ts` re-reads on every foreground, so a revocation made in the OS settings while the app was backgrounded is reflected with no restart and no stale flag. `src/shared/services/permissionRecovery.ts` routes the recovery: `undetermined` → re-trigger the system prompt, `denied` → deep-link to the OS settings page via `expo-linking`, and **the Settings button's label always matches the action it performs**. The Settings screen gained a Permissions section (`src/shared/ui/PermissionRow.tsx`) that names each permission, says what it would unlock, and shows the state. `captureVideo` now requests the **microphone** alongside the camera. The location card degrades to a **manual-entry fallback**, and the manual area rides in the report's description under an `Area: ` prefix — the server has no separate field for it, and the server-resolved `area_hierarchy` stays authoritative. **Two defects were found by the tests and fixed.** (1) The first version of `entryPointAvailability()` gated on `=== 'granted'`, so an **undetermined** permission hid its own entry point — which made the just-in-time prompt *unreachable*, because the card could never be rendered and so could never be tapped. Only `denied` hides now. (2) `composeDescription()` ran its word-boundary cut even when the description already fit, dropping the last word of every description (`'a report Area: Mirpur'` → `'a Area: Mirpur'`). 88 new unit tests. | [014] story 006 |

### 4.5 Location — unit `005-location`

| # | Gap | Where |
|---|---|---|
| L1 | ✅ **FIXED** — the location share writes. `src/shared/services/shareLocation.ts` is the fan-out: one confirm tap, N recipients, **one** snapshot. The recipients are de-duplicated by contact id, the toggle selects **primaries only** (the prototype's "all your emergency contacts" wording would have been a lie — the build says **আপনার সব প্রাইমারি কন্টাক্ট দেখতে পাবে**), and the per-contact checkboxes are authoritative at confirm time, so **deselection wins**. Each recipient is routed independently: an app user gets a `location_shares` row with `share_channel = 'app'`, everyone else gets the OS share sheet fired **once**. `src/shared/services/snapshotPayload.ts` builds the payload — the `geo:` URI, the Maps URL, and a human-readable timestamp, all from the **same** rounded coordinate so they cannot disagree. `src/shared/services/shareTelemetry.ts` records `location_share_intent_ms` with exactly three fields and no PII. **Two database migrations** landed: 025 made `lat`/`lng` nullable with an all-or-nothing CHECK (a zeroed position would read as a real point in the Gulf of Guinea), and 026 added `resolve_app_contacts` — a `security definer` function that returns the caller's own contact ids that belong to an enabled account, and **nothing else** (no phone, no name, no email, no user id), so `public.profiles` stays owner-scoped. **A failed lookup returns `[]`** — the safe direction: the OS path works with no network and claims nothing. 67 new unit tests, 37 SQL assertions. | [015–017] |
| L2 | ✅ **FIXED** — the location fix is taken **just-in-time**. `src/shared/services/locationFix.ts` exports `takeLocationFix()`, and the screen calls it **from the CTA handler** — never from a mount effect — so the permission prompt fires at the moment the user asked for the share (FR-PERMS-1). The function never throws: a denied permission, a dismissed prompt, a disabled provider, a fix timeout, and a failed permission query all take the degraded branch. The address card renders the **"location unavailable"** state and offers two fallbacks — **manual coordinate entry** and **share without a location** — and **both reach a completed share**. The manual entry is validated strictly (a clamped coordinate is a different place, and the user would not know it moved) and reports `accuracy_m = null`. A share without a location writes a **null** position, never a zeroed one. The absence of background location, streaming, foreground services, and receipts is asserted by a **source scan** (`noBackgroundLocation.test.ts`) that fails the build — a convention is a note in a document; a source scan is a build failure. | [017] story 005 |

### 4.6 Alerts — unit `006-alerts`

| # | Gap | Where |
|---|---|---|
| A1 | ✅ **FIXED** — the History screen is live. `app/(app)/history.tsx` carries the prototype's three segmented tabs — **ধরন** (the rows), **মোট** (the totals) and **বিতরণ** (the per-category counts) — plus the **My Reports** tab that unit `004` added for the author. The prototype's second sentence, *"Detailed map + filters coming soon,"* is **removed**: both ship in Phase 1, so the claim would have been false. The **বিতরণ** tab is a **list of counts** — never a chart, a bar, a percentage or a trend (FR-NG-3 / FR-NG-4 / ADR-010) — and a **source scan** (`src/__tests__/noChartCode.test.ts`) fails the build if a chart library or a chart-shaped identifier appears in the app. The scan reads **code only** — comments and string literals are stripped first — because the rule is *stated in prose* inside the very files it scans; a naive scan would fail on the rule itself. The own-reports branch is **independent of the radius and the window** (FR-HIST-3), and the rows route to the right surface: an own report opens the author's own detail, a neighbour opens the **public** alert detail. | [020] story 006 |
| A2 | ✅ **FIXED** — the public alert detail is live. `app/(app)/alert-detail.tsx` renders the public projection, and the projection **omits `author_id` entirely** — not nulled, not renamed (FR-DATA-3 / FR-NG-5), so there is nothing for a render to pick up. The client type mirrors that, and `src/shared/api/alertDetail.test.ts` asserts the absence of every author-shaped key (`authorId` / `author_id` / `author` / `reporter` / `reporterId`) and that the serialised body contains no author uuid. The media paths are **author-token** paths, and a media whose URL cannot be signed is **dropped** rather than rendered broken. | [021] story 009 |
| A3 | ✅ **FIXED** — the filters, the map, and the author auto-hide are live. **The filters**: one filter object, one query key — the list, the totals, the distribution and the map all move together, and a sheet that changes nothing does not re-query. **The map**: one shared wrapper, no fork — the attribution is owned by the wrapper, only `tile.openstreetmap.org` is contacted, and the marker set is capped at 150 keeping the markers **nearest the centre**. **The author auto-hide**: the transition lives in `public.flag_report` — one transaction, so a partial hide is impossible. **A real defect was found and fixed by migration 030**: the function counted `count(*)` over the author's flags, so **five flags on a single report** fired the auto-hide and swept in the author's other reports — exactly what the story forbids ("five flags on one report are one flagged report"). It now counts `count(distinct f.report_id)`, and the response carries **both** counts side by side (`author_flags_24h` and `author_flagged_reports_24h`) so the distinction is visible rather than implied. The old SQL test had encoded the wrong behaviour and was rewritten, and a new Test 10 asserts the negative case directly. The hide is `hidden_pending_review`, not `removed` — it is a moderator's to reverse. **The author still sees their own hidden reports**; the public hide never touches own-report visibility. | [020–021] |

### 4.7 Moderation — unit `007-moderation`

| # | Gap | Where |
|---|---|---|
| M1 | ✅ **FIXED** — the author-auto-hide queue group is live. `apps/admin/app/queue/page.tsx` gained an **All pending / Author auto-hidden** filter with `aria-pressed`, a derived badge that separates the two causes (`author` / `both`), and the author's 24 h flag count **labelled apart from** the report's own flag count — a context number is not a verdict. The server already carried `hide_reason` and `author_flags_24h`, so **no migration and no new RPC** were needed; the gap was purely in the rendering. The queue offers **no bulk actions** at MVP (FR-MOD-3) — no "restore all", no multi-select, no shared note — and a **source scan** (`apps/admin/lib/noBulkActions.test.ts`) fails the build if one appears. | [024] story 005 |

> The admin console's queue, report detail, restore/remove decision, disable-user
> and audit log are **all built and working**, and the auto-hide group now
> joins them.

---

## 5. Release plumbing

| # | Gap | Note |
|---|---|---|
| R1 | **No git repository.** | ✅ **DONE** — `git init` on `main`, a baseline commit of the verified tree, `.gitattributes` for LF normalization. **Still no remote**: `git remote add origin <url>` before the first push. |
| R2 | Maestro flow `maestro/panic-path.yaml` missing. | ✅ **DONE** — see B2 |
| R3 | Scratch files at the root. | ✅ **DONE** — see B3 |
| R4 | `eas.json` placeholders. | See B4 |
| R5 | `apps/mobile` and `apps/admin` have `.env.example` but **no `.env`** (gitignored). `supabase/functions/.env.local` exists. | ✅ **DONE** — both `.env` files now exist, created from the examples with the local stack's **anon** key (the service-role key is deliberately absent). They are gitignored (`.gitignore:10`), so they stay local. A fresh clone still needs the same two lines written from `.env.example`. |

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
6. ~~**I5** — the two missing auth screens (`verify-otp`, `reset-password`).~~ ✅ **DONE.**
   The password-reset OTP flow is live end to end: the code is generated,
   mailed, compared **in the database** (bcrypt), and only then does GoTrue
   issue the session. The ownership is inverted from the story's original
   description because GoTrue's `verify` endpoint silently ignores a 6-digit
   code — that defect would have shipped a fail-open reset. `pnpm reset:check`
   proves the whole path (30/30).
7. ~~**C1** — contacts CRUD, the rest of unit `002-identity`.~~ ✅ **DONE.**
   The CRUD API layer, the editor, the FAB, and the wizard's three capture
   steps are live. Two database defects the story assumed were already there
   — the `contacts.user_id` default and the `contacts.phone` CHECK — were
   found by the live probe and landed as migrations 022 and 023. The probe
   itself (26/26) is wired into CI. Unit `002-identity` now has five of its
   seven stories complete.
8. ~~**P1 → P2 → P3** — unit `004-capture`.~~ ✅ **ALL THREE DONE.** ~~**P1** —
   report detail + category edit.~~ ✅ **DONE.** The detail screen, the
   category sheet, the API layer and the **My Reports** History tab are live.
   One fail-open defect was found by the live probe and fixed by migration
   024: `update_category` reported success for a write it had not performed,
   so the client's cached category and the database's stored one disagreed
   invisibly. The probe (22/22) is wired into CI. ~~**P2** — offline upload
   queue.~~ ✅ **DONE.** The drain, the drain trigger, the "saved on device"
   state and the overflow warning are live; 70 new unit tests. **Three
   defects** were found while building it — a **fresh** idempotency key on the
   queued item (which would have created duplicate reports), an attempt
   counter that moved **twice** per attempt, and an overflow that was **never
   reported** because the truncation happened before the check. All three are
   fixed and covered by tests. ~~**P3** — capture permission degradation.~~
   ✅ **DONE.** The typed permission wrapper, the pure degradation rules, the
   just-in-time prompts, the Settings recovery surface, and the location
   manual-entry fallback are live; 88 new unit tests. **Two defects** were
   found by the tests — an **undetermined** permission hiding its own entry
   point (which made the just-in-time prompt unreachable, because the card
   could never be tapped), and a description composer that dropped the last
   word of every description. Both are fixed and covered by tests.
9. ~~**L1 → L2** — unit `005-location`.~~ ✅ **BOTH DONE.** ~~**L1** — the
   location share writes.~~ ✅ **DONE.** The fan-out, the payload, the OS
   share sheet, the intent telemetry, and the app-user lookup are live; two
   migrations landed (025 for the nullable all-or-nothing position, 026 for
   the lookup function); 67 new unit tests and 37 SQL assertions. The
   **prototype's "all your emergency contacts" sub-line was a lie** — the
   behaviour is primaries only — and the build says
   **আপনার সব প্রাইমারি কন্টাক্ট দেখতে পাবে**. **One defect was found while
   building it** — the SQL suite's contact-id helper had a parameter named
   `name` that **shadowed** the column `c.name`, so `where c.name = name`
   compared the column to itself and the helper resolved an arbitrary
   contact. The test was failing for a reason that had nothing to do with
   the RPC. ~~**L2** — the location fix.~~ ✅ **DONE.** The fix is a
   function called from the CTA handler, never from a mount effect, so the
   prompt fires just-in-time; a denied permission degrades to manual entry
   or a share without a location, and **both complete a share**. The
   absence of background location, streaming, foreground services, and
   receipts is asserted by a **source scan** that fails the build.
10. ~~**A1 → A2 → A3 → M1** — the alerts and moderation screen surfaces.~~ ✅ **ALL DONE.**
    ~~**A1** — the History screen.~~ ✅ **DONE.** The three prototype tabs plus
    My Reports; the distribution is a **list of counts**, protected by a
    source scan that fails the build on any chart. ~~**A2** — the public alert
    detail.~~ ✅ **DONE.** The projection omits `author_id` **entirely**, and
    the client type mirrors that. ~~**A3** — the filters, the map, and the
    author auto-hide.~~ ✅ **DONE.** One filter object and one query key; one
    shared map wrapper, no fork; and the auto-hide transition in
    `public.flag_report` inside **one** transaction. **A real defect was found
    and fixed by migration 030** — the author tally counted flags, not
    **distinct flagged reports**, so five flags on one report hid an author's
    whole recent output. The old SQL test had encoded the wrong behaviour and
    was rewritten; a new Test 10 asserts the negative case. ~~**M1** — the
    admin auto-hide group.~~ ✅ **DONE.** A UI gap only — the server already
    carried the fields — with a `both` badge and the two flag counts labelled
    apart. **H1 and H2 remain** (see item 11).
11. **H1 → H2 → B4, and the git remote** — the help-seek surfaces and release
    readiness. H2 (`station-map.tsx`) needs the shared MapLibre wrapper; the
    wrapper's cap and attribution are already covered by `stationMap.test.ts`.
    ~~**R5**~~ ✅ **DONE** — the local `.env` files exist (see §5).
    ~~**The memory-bank bolt records**~~ ✅ **DONE** — see §7.
12. Final `pnpm verify` → **one** commit → push.

---

## 7. Memory-bank hygiene — stale records

The memory bank did **not** reflect the built code. This confused the next
session. **The bolt records are now reconciled**; two smaller items remain.

- ~~`memory-bank/bolts/001`–`024` still say `status: planned` with no stage
  artifacts, although the code for their stories **is built**.~~ — **FIXED.**
  An audit of all 27 bolts against the story files' own `implemented` flag
  found **7 stale records** — `005-identity`, `014-capture`, `015-location`,
  `016-location`, `017-location`, `020-alerts`, `021-alerts` — whose stories
  were **all** implemented but whose bolt still said `planned`. Those 7 now
  say `status: complete`, carry `current_stage: null`, the three
  `stages_completed` entries and a `completed` date, and their story
  checkboxes are ticked.
  The other **17** bolts (`001`–`004`, `006`–`013`, `018`, `019`, `022`–`024`)
  say `planned` **correctly** — each still has at least one genuinely
  unimplemented story. A bolt is not `complete` because it looks finished; it
  is `complete` when every story it lists says `implemented: true`.
  The stage artifacts point at the **story files**, because that is where the
  design, the change record and the verification evidence actually live. The
  `ddd-0*.md` files these bolts ask for were **never written**; writing them
  retroactively would have been invented evidence, and a fabricated design
  document is worse than a missing one.
- ~~`memory-bank/story-index.md` lists every story as `planned` except
  `007-secrets-and-environments`.~~ — **FIXED.** The index's Status column is
  now synced from the story files' `implemented` frontmatter, which is the
  authoritative source. 26 stories are `complete`, 28 are `planned`. A
  programmatic cross-check of all 54 story files against the index reports
  **0 mismatches**.
- ~~55 of 62 story files still say `implemented: false`; only the 7 stories of
  unit `008-jobs-operations` say `true`.~~ — **PARTLY FIXED.** 26 story files
  now say `true`; 28 still say `false`. The count is **28 of 54 stories**,
  not 55 of 62 — the "62" figure was itself stale (the index carries 54 rows).
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
                             register, forgot-password, verify-otp,
                             reset-password, account-disabled,
                             account-deleted, biometric-gate,
                             contact-1, contact-2, contact-3,
                             location-permission
apps/mobile/app/(app)/       home, more, settings, capture, help-alert,
                             location-sharing, contacts, contact-editor,
                             alerts, alert-detail, history, history-map,
                             report-detail, more-help*, station-map*
apps/mobile/src/shared/      api/ (supabase, alerts, alertDetail, history,
                             contacts, reportDetail, stations, geocode, flags,
                             errors, profile, account, locationShares,
                             wrongNumber), auth/ (useAuthSession,
                             useAccountStatus, useBiometricGate,
                             biometricService, authService,
                             passwordResetService), wizard/
                             (ContactCaptureScreen), services/
                             (captureFlow, submitCapture, uploadQueue,
                             queueDrain, useQueueDrain, prepareMedia,
                             mediaPipeline, mediaSources, location,
                             dialer, permissions, usePermissions,
                             permissionRecovery, locationFix, osShare,
                             snapshotPayload, shareLocation, shareTelemetry,
                             historyFilters), i18n/ (bn.ts, en.ts), theme/,
                             ui/ (incl. StatusBanner, PermissionRow,
                             HistoryFilterSheet, StationMap)
apps/admin/app/              login, queue, queue/[reportId], users, audit
apps/admin/lib/              copy.ts, format.ts, api.ts
packages/shared/src/         schemas, enums, errors, jobs, data, types
supabase/migrations/         30 forward-only migrations
supabase/tests/              9 SQL suites (386 assertions)
supabase/functions/          8 Edge Functions + _shared/
tools/                       run-sql-tests, smoke-rpc, smoke-functions,
                             mirror-*, secret-scan, release-verify,
                             purge-media-dry-run, check-maestro-flow,
                             check-i18n-keys, probe-disabled-write,
                             probe-biometric-gate, probe-alternate-phone,
                             probe-signup-contract, probe-password-reset,
                             probe-contacts-crud, probe-report-category,
                             probe-public-alert, probe-server-side-write
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
