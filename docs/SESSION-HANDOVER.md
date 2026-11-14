# Nagar Shield — Session Handover

> Read this first in a fresh session. It says what is **done**, what is
> **broken**, and what to do **next**, in that order.
>
> Last updated: 2026-11-14 · repo: `d:\Projects\E2E Delivery Delivery Engineer Training`
> Flow: specsmd AI-DLC · intent `001-nagar-shield-mvp1` · 54 stories / 27 bolts
> Gate: `pnpm verify` → **0** · 1056 unit tests · 476 SQL assertions · 37/37 console probes

---

## 1. Where the project stands

The backend, the Edge Functions, the admin console and the mobile UI shell are
built and verified.

**The stories are now counted three ways, not two: 43 `complete`, 10
`partial`, 1 `planned`.** The middle state is new, and it is the honest one.
An audit of the 23 stories that carried `implemented: false` found that
**none** of them were fully unimplemented: the features had shipped and
worked, and what was missing was the *mechanical guard* each acceptance
criterion named — the byte-identity test, the offline-render assertion, the
boundary check, the reserved CI job, the query invalidation.

Recording those as `planned` would have hidden a lot of real work.
Recording them as `complete` would have been a lie about the criteria. So
`implemented` has a third value, `partial`, and each such story file carries
an `## Implementation` section naming its exact gaps down to the file and
line. **Read a story's `## Implementation` section before working on it** —
it says which guard is missing, not that the screen is missing.

**Only one story is genuinely unbuilt**: the Personal Emergency picker
(`002-personal-emergency-picker`) has no route, no component, and no action.

**The repository now exists** (see §5). The working tree is committed and
pushed-ready, and there is a baseline commit to fall back to.

**The security defect is closed.** The disabled-account write bypass (defect
F) was fixed in migration `20261105000019_disabled_account_write_guard.sql`,
covered by 31 new SQL assertions and an 8-check live API probe. See §3.

**The help-seek surfaces are live.** The More Help sheet, the hotline list, the
thana line, the find-a-station map and the wrong-number report flow all ship
now. Building them surfaced **three real database defects** — an impossible
anonymous report, a missing polymorphic integrity trigger, and a `status`
vocabulary that did not match the story — all fixed by forward-only migrations
031–033. See §4.3.

**The three mobile-side defects are closed.** The feed silently truncated at one page
(the client received `next_cursor` and discarded it), the login screen showed the
literal word *"undefined"* instead of an error message (a hand-built i18n key at
**ten** call sites), and a missing build setting **crashed the whole app** at import
time. Each is fixed, each has a test, and each fix was proved by a **causal check**
that failed when the defect was put back. See §3 M1.

**The alerts feed is `complete`, and it found two more real defects.** The
uncategorized card rendered `'—'` instead of the bundle's placeholder; the
offline behaviour did not exist at all; and the rendering had **no** test.
Closing them exposed the **blank area line** — the database holds
`"thana": null` on degraded captures, the client normalised a null level to
`''`, and the `??` chain stopped there, so the card rendered an empty line —
and the **pulsing dot did not pulse**: it drew a static halo while its own
comment claimed *"the pulse is a React Native `Animated` loop"*. Six causal
checks confirm each guard fires. See §4.6 A4.

**The area chip row is `complete`, and it found two more real defects.** The
row used a plain `View`, so the chips past the screen edge were not clipped
but **unreachable**; the chip list was a **hardcoded array duplicated in two
screens**, with *Mirpur* and *Dhanmondi* written into the screen files; and
the **My division** chip sent a hardcoded `Dhaka`, so it said "My division"
while filtering a division the user might not be in. The row is now a
horizontal `ScrollView`, the list is built from the **`area_lookup`**
reference table (a new area is a **data** change, not a code change in two
files), and the location chips resolve from the **current fix** and are
**disabled** without one — sending no parameter, so the feed keeps its result
set rather than narrowing to an empty area. `resolveAreaFilter` is the
**single** mapping both feed screens use. Two further defects surfaced: the
chip's 28 dp height was **unstated**, so once the label moved into a variable
the tap-target gate could not resolve its box, and the selected chip wore a
flat violet instead of the prototype's `var(--grad-primary)`. See §4.6 A5.

**One pre-existing quirk worth knowing.** After `pnpm db:reset`, the
`alerts_feed` read model returns **zero items** — the seeded reports fall
outside the feed's own window. This is not a regression: it reproduces on
an unmodified tree (`git stash` + `db:reset`). The smoke test only asserts
the response *shape*, so it passes silently. If the Alerts screen ever
appears empty in a dev session, this is why.

**The mobile app shell now proves it boots.** The boot test renders the
provider stack in jsdom and reads the root layout's structure from source;
the AsyncStorage fallback that could put a **refresh token in unencrypted
storage** is gone, because the 2048-byte limit that motivated it is
**Apple's Keychain limit, not Expo's** and Android has none. A device that
cannot write to the Keystore now degrades to **memory-only** with a localized
notice, which is what the story's edge-case table always asked for. See §3
M2.

---

## 2. What is DONE and verified

Every command below was run green against the local Supabase stack.

| Area | Evidence |
|---|---|
| Monorepo | pnpm workspace, 3 apps (`apps/mobile`, `apps/admin`, `packages/shared`), TS strict, ESLint flat config |
| Shared contracts | `packages/shared` — schemas, enums, errors, jobs, reference data; **200 unit tests** |
| Database | **37 migrations**, `supabase/migrations/` — schema, RLS, business functions, read models, storage, jobs, password-reset OTP, contacts owner default + phone CHECK, author-only `update_category`, nullable all-or-nothing location position, the contact app-user lookup, the **distinct-report** author auto-hide, the **anonymous wrong-number reporter**, the **polymorphic entry-integrity trigger**, the wrong-number `details` / `pending` vocabulary, the **moderation decision conflict**, the **30-day restore window**, and the **purge worklist boundary + job privileges** |
| RLS + write guards | `supabase/tests/write_guards.sql` — regression suite for 6 probed defects (A–F) plus the wrong-number integrity guards (I1–I21) |
| SQL test suites | **476 assertions pass** — `schema_contract` (24), `business_rules` (35), `read_models` (57), `write_guards` (103), `account_deletion` (12), `password_reset` (47), `contacts` (47), `report_category` (32), `location_shares` (37), `alert_detail` (36), `moderation_conflicts` (46) |
| REST smoke | `tools/smoke-rpc.cjs` — **11/11** |
| Disabled-write guard | `tools/probe-disabled-write.cjs` — **8/8** over the real PostgREST path |
| Biometric gate | `tools/probe-biometric-gate.cjs` — **10/10** over the real PostgREST path |
| Alternate phone | `tools/probe-alternate-phone.cjs` — **9/9** over the real PostgREST path |
| Dual-identifier sign-in | `tools/probe-dual-identifier-login.cjs` — **17/17** over the real GoTrue + PostgREST path: the phone and the email resolve to **one** `auth.users` row and one `profiles.id` |
| Account deletion | `tools/probe-account-deletion.cjs` — **26/26** over the real GoTrue + PostgREST path: the soft delete, the 30-day window, the restore inside and outside it, the write guard, and the **privilege refusal** — a signed-in citizen's call to the purge worklist is refused with HTTP 403 |
| Signup contract | `tools/probe-signup-contract.cjs` — **13/13** over the real GoTrue + PostgREST path |
| Password reset | `tools/probe-password-reset.cjs` — **30/30** over the real GoTrue + mailbox path |
| Contacts CRUD | `tools/probe-contacts-crud.cjs` — **26/26** over the real GoTrue + PostgREST path |
| Report category | `tools/probe-report-category.cjs` — **22/22** over the real GoTrue + PostgREST path |
| Public alert | `tools/probe-public-alert.cjs` — **14/14** over the real GoTrue + PostgREST + Storage path |
| Moderator console | `tools/probe-moderation-console.cjs` — **37/37** over the real GoTrue + PostgREST path, with the moderator's own session |
| Edge Functions | 8 functions — purge-media, purge-deleted-accounts, cleanup-geocode-cache, keep-project-awake, moderation-decide, disable-user, finalize-capture, password-reset |
| Function smoke | `tools/smoke-functions.cjs` — **36/36** (auth gates, idempotency, audit trail, dry run) |
| Mobile screens | auth wizard, home, more, settings, capture, help-alert, location-sharing, contacts, alerts, report detail — 1:1 ported from `prototype ui.html`. The **location-sharing** screen's CTA now performs a real share. |
| Help-seek surfaces | the shared `MoreHelpSheet`, the hotline list (`more-help`), the thana line (`thana-line`), the find-a-station map (`station-map`), and the wrong-number report sheet — all four stories of the unit's help surfaces land. |
| History + alert detail | `app/(app)/history.tsx` (four tabs, one filter object, one query key), `history-map.tsx` (one shared wrapper), `alert-detail.tsx` (the projection omits `author_id` **entirely**) |
| Source scans | `noChartCode.test.ts` (no chart — FR-NG-3 / FR-NG-4 / ADR-010), `noBulkActions.test.ts` (no bulk action — FR-MOD-3), `stationMap.test.ts` (one wrapper, one attribution, the 150 cap), `themeCoverage.test.ts` (every screen reads the theme, directly or through a component) — all **read code only**, and all fail the build |
| Offline queue | `apps/mobile/src/shared/services/` — the sandbox queue, the backoff schedule, the drain, and the drain trigger. **70 new unit tests** across three suites. |
| Permissions | `apps/mobile/src/shared/services/permissions.ts` + `permissionRecovery.ts` — the three-state read, the entry-point degradation rules, and the just-in-time recovery routing. **88 unit tests** across four suites. |
| Location sharing | `apps/mobile/src/shared/services/` — the just-in-time fix, the snapshot payload, the OS share sheet, the fan-out, the intent telemetry, and the app-user lookup. **67 new unit tests** across four suites, plus 37 SQL assertions. |
| Admin console | Next.js — login, queue, report detail, users (disable), audit log — **builds clean, 8 routes** |
| i18n | `bn` primary + `en`, full error-code mapping incl. `AUTH_DISABLED` |
| Alerts feed | `useInfiniteQuery` with the **cursor as the page parameter** and the area filter alone in the query key; `alertsItems()` flattens the pages and is the only way the screens read the feed. The uncategorized card renders the **localized** placeholder on the neutral `--ink-300` ramp; the offline case is one shared rule (`alertsShowingCachedPage()`) driving one shared notice (`OfflineNotice.tsx`), and **neither** feed screen blanks on error. **17 unit tests** (`alerts.dom.test.ts`). |
| Alert card rendering | `alertCard.test.ts` (25) — the box model, the accent map's single source, the uncategorized placeholder, the empty-description gap, the Bangla / English pair; `offlineNotice.test.ts` (15) — the notice exists, uses the bundle copy, is announced, and is rendered by **both** feed screens off the shared rule; `pulseDot.test.ts` (12) — the 1.5 s pulse, the 6 dp halo, and the paused state. See §4.6 A4. |
| Area filter chips | `AreaChipRow.tsx` is a horizontal `ScrollView` with the prototype's `padding: 0 20px 12px` contract and a non-stretching content container; the chip list is built from **`area_lookup`** by the new `src/shared/api/areaChips.ts`, and `resolveAreaFilter` is the **single** mapping both feed screens use. The **My division** / **My city** chips resolve from the current fix and are **disabled** without one — a disabled chip sends **no** parameter, so the feed keeps its result set. **38 unit tests** (`areaChipRow.test.ts`). See §4.6 A5. |
| Error copy | `errorCopy()` — one place that consults the shared `API_ERROR_I18N_KEYS` map, with an `errors.internal` fallback for an unknown code. **7 unit tests**, against the **real** bundles. |
| Configuration error | `isSupabaseConfigured` + `ConfigErrorView` — a missing build setting shows a localized screen instead of a module-load crash. **10 unit tests**, including one that re-imports the module under `jest.isolateModules()`. |
| Test environments | the mobile suite runs as **two Jest projects** (`node` and `jsdom`); a test opts into jsdom by its **name** (`*.dom.test.ts`), and `jest.dom.setup.js` gives jsdom back the `TextEncoder` / `crypto.subtle` it lacks. |
| App shell | `boot.dom.test.tsx` — **29 tests**: the provider stack is **rendered** in jsdom and the root layout's structure is **read from source** (the provider order, the unconfigured branch, every `<Redirect>` target resolving to a real file). See §3 M2. |
| Session storage | `session-storage.ts` — the session goes to `expo-secure-store` and **nowhere else**; the 2048-byte figure is Apple's Keychain limit, not Expo's, and Android has none (a measured session is ~1550 bytes). A device that cannot write degrades to **memory-only**, with a localized notice. **27 tests**, including one that reads the installed `auth-js` source to assert the `supabase-js` rethrow contract. The FR-AUTH-2 window (30 days remembered / 24 hours otherwise) is enforced here, at the only place a session is read back. |
| Login screen | `apps/mobile/src/__tests__/login.dom.test.tsx` (12), `apps/mobile/src/shared/api/session-window.test.ts` (14), `apps/mobile/src/shared/auth/authService.test.ts` (11), `apps/mobile/src/__tests__/noSocialLogin.test.ts` (11) — the identifier passes through **unchanged**, the Remember-me flag reaches the session write **before** the sign-in and **changes** the window, and no social sign-in method is wired. See §3 M5. |
| Theme coverage | `themeCoverage.test.ts` — **5 tests**: every route screen reaches the theme, directly or **transitively** through a component it renders. |
| CI | `.github/workflows/ci.yml` — lint → typecheck → shared-test → unit tests → maestro-flow → migration-dry-run → rls-integration → secret-scan |
| Nightly build | `.github/workflows/build.yml` — preview APK + emulator smoke (`maestro/panic-path.yaml`) |
| EAS profiles | `eas.json` — dev / preview / production, APK, cert-pinning, SMS flag off |
| Operations | `docs/operations/runbook.md` (8-stage release ladder), `docs/operations/secrets.md` (matrix + rotation) |
| Release harness | `tools/release-verify.cjs` — 5 assertions, `pnpm release:verify` green on `local` |

### Verification commands

```bash
pnpm typecheck        # 3 workspaces
pnpm lint
pnpm test             # 1013 tests (669 mobile, 200 shared, 144 admin)
pnpm db:test          # 476 SQL assertions
pnpm db:smoke         # 11 REST checks
pnpm story:index:check # the index, the bolts and the story files agree
pnpm guard:check      # 8 disabled-write probes (live PostgREST)
pnpm biometric:check  # 10 biometric-accounting probes (live PostgREST)
pnpm alternate:check  # 9 alternate-phone constraint probes (live PostgREST)
pnpm dual-identifier:check # 17 dual-identifier sign-in probes (live GoTrue + PostgREST)
pnpm deletion:check   # 26 account-deletion probes (live GoTrue + PostgREST)
pnpm signup:check     # 13 signup-contract probes (live GoTrue + PostgREST)
pnpm reset:check      # 30 password-reset probes (live GoTrue + mailbox)
pnpm contacts:check   # 26 contacts-CRUD probes (live GoTrue + PostgREST)
pnpm category:check   # 22 report-category probes (live GoTrue + PostgREST)
pnpm alert:check      # 14 public-alert probes (live GoTrue + PostgREST + Storage)
pnpm console:check    # 37 moderator-console probes (live GoTrue + PostgREST)
pnpm fn:smoke         # 36 Edge Function checks
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

### 🟡 B4 — `eas.json` still carries hosted-project placeholders

**The `dev` profile is resolved.** It now carries the real local stack's
URL (`http://127.0.0.1:54321`) and the local stack's **anon** key — the
same publishable key `apps/mobile/.env` holds. The anon key is public by
construction (RLS-scoped, not secret), and a development-client build
talks to the local stack, so embedding it is correct.

**The `preview` and `production` profiles still carry five placeholders.**
These are credentials for a **hosted** Supabase project and cannot be
derived from the repository — no Supabase project is linked
(`supabase/.temp/project-ref` does not exist; `supabase projects list`
reports no access token):

| Placeholder | Profile | What the maintainer supplies |
|---|---|---|
| `<staging-ref>` | `preview` | the staging project ref (the slug in `https://<ref>.supabase.co`) |
| `<staging-anon-key>` | `preview` | the staging publishable anon key |
| `<production-ref>` | `production` | the production project ref — also the `EXPO_PUBLIC_API_HOST` |
| `<production-anon-key>` | `production` | the production publishable anon key |
| `<sha256-pin-set>` | `production` | the API host's SHA-256 SPKI digests, comma-separated, **with a backup pin** |

`pnpm release:verify` correctly **fails** on these, so the staging and
production builds are blocked until the values land.

**Two defects in the release gate were found and fixed** in
`tools/release-verify.cjs`:

1. **The staging stage could never pass.** The verifier looked for an EAS
   profile named `staging`, but the staging APK is built from the
   **`preview`** profile (`eas build --profile preview`, runbook line 61).
   `--env staging` therefore always reported *"the staging profile is
   missing from eas.json"* — a false negative that would have blocked a
   correctly-built staging release. The environment is now mapped to the
   profile it is actually built from (`local → dev`, `staging → preview`,
   `production → production`).
2. **The certificate-pinning assertion passed on a placeholder.** The pin
   set was checked by counting comma-separated entries, and
   `<sha256-pin-set>` splits into exactly **one** — so a production
   profile that pinned *nothing* satisfied the assertion and the gate
   reported success. The assertion now rejects an unresolved placeholder
   and requires **at least two** digests: a single pin with no backup is a
   permanent lockout risk, because the rotation procedure needs the next
   certificate's digest to ship *before* the old one expires.

A third gap closed alongside them: the placeholder check only examined
`EXPO_PUBLIC_SUPABASE_URL`, so a profile with a real URL but a placeholder
**anon key** would have built an APK that authenticates against nothing
and passed the gate. Every env value in the profile is now checked.

The gate was proved in **both** directions: with the placeholders in place
`--env local` passes all five assertions and `--env staging` /
`--env production` fail; with real-shaped values substituted temporarily
both hosted stages **pass** all five assertions. The file was restored
afterwards.

**Also:** migrations 031–033 exist in the repo but were not recorded in
the local `supabase_migrations.schema_migrations` table (the DB container
had been recreated), so `--env local` failed its migration assertion. They
are applied and recorded now — the gate reports **36** migrations, matching
`supabase/migrations/` exactly.

---

### ✅ B5 — The story-record gate was blind to its own vocabulary — FIXED

**The defect.** `tools/reconcile-story-index.cjs` maps a story's
`implemented:` frontmatter to an index status. Its mapping accepted
`'true'` → `complete`, `'partial'` → `partial`, and *everything else* →
`planned`. The five moderation stories were written with the **explicit**
spelling `implemented: complete`, which the tool's accepted-values list did
not contain — so the frontmatter regex never matched, the story fell back to
the default `'false'`, and it was reported as **`planned`**.

**Why it matters.** This is the same failure mode the whole records system
was built to prevent, one level down. The tool's job is to catch a story
file that disagrees with the index; instead it **agreed with itself** —
the index said `planned`, the tool computed `planned` from the same broken
parse, and `pnpm story:index:check` printed *"✓ the index matches the story
files."* A gate that derives both sides from the same mistake cannot catch
the mistake. Worse, the headline count was **wrong**: the real total was
**36 `complete` · 17 `partial` · 1 `planned`**, and the gate reported
**31 · 17 · 6** — five `complete` stories silently demoted to `planned`.

**The fix.** `statusFor()` now accepts `'complete'` alongside `'true'`, and
`IMPLEMENTED_VALUES` lists both spellings. The tool's two other
`implemented:` reads (the `status:` derivation and the drift check) were
fixed with it.

**The stronger fix.** The parse no longer *defaults* an unrecognised value
to `'false'`. A story whose `implemented:` is not in the vocabulary is now
a **hard error** naming the value and the file, reported before any count
is computed — because every count below is derived from the same parse and
would be wrong for the same reason. The vocabulary is therefore the thing
that is checked, not just the thing that is consumed.

**The proof.** With the fix in place the check immediately reported the
five stories it had been blind to:

```
✗ the index has drifted from the story files:
  - 001-moderator-login-and-queue: the index says "planned", the story file says "complete"
  ...
  - the index header says "31 complete · 17 partial · 6 planned", the story files say "36 complete · 17 partial · 1 planned"
```

`--write` then corrected the index, the three bolt files and the five
story files' own `status:`, and the check now passes at
**36 `complete` · 17 `partial` · 1 `planned`**.

> **The counts in this subsection are historical.** They describe the state
> when the vocabulary bug was found and fixed. The live counts are in §1
> and are derived by `node tools/reconcile-story-index.cjs`.

The new hard error was proved by **causal check**: writing
`implemented: shipped` into a story file makes the tool fail with

```
- 004-disable-a-user: the story file says "implemented: shipped", which is not one of true, false, partial, planned, complete
```

and the file was restored afterwards.

**The lesson worth keeping.** A derived record is only as trustworthy as
the parser that derives it. The gate proved the *index* and the *story
files* agreed — which is exactly the wrong thing to prove when the
agreement comes from one shared bug. The counter that would have caught it
is the one that does not exist in the tool: **a check that the accepted
vocabulary covers every value the corpus actually uses.** A story file that
says `implemented: complete` is now a first-class value, and a value the
tool does not understand is a reported error rather than a silent default.

---

### ✅ B6 — The console had no live probe, and the seed disagreed with itself — FIXED

**Story:** unit `007-moderation`, all six — the coverage gap the stories'
own "Out of Scope" sections left open.

**The gap.** The console was proven in three places that did **not** meet:
the Edge Functions over the wire (`tools/smoke-functions.cjs`, 36/36), the
four read models from **inside Postgres** (`supabase/tests/read_models.sql`),
and the console's own parsing (the component tests). What none of them could
see is the thing that joins the last two: **the JSON shape the browser
actually receives** from `moderation_queue`, `moderation_report_detail`,
`moderator_search_users` and `moderation_audit_feed`. Those four are called
by the browser over PostgREST with the moderator's **own** session — a
different door, a different credential, and a different authorisation path
from the service-role functions the smoke run proves. A payload that dropped
a key the console renders would produce an empty row, not a failure.

**The fix.** `tools/probe-moderation-console.cjs` — **37/37**, wired into
`pnpm verify` (`console:check`) and into the CI `rls-integration` job.

- The **negative** assertions are the ones that earn their keep: a citizen
  is refused the queue, the detail, the account search and the audit trail.
  That refusal is what makes the console moderator-only.
- The account lookup must stay an **exact** match: an empty query, an
  unmatched query and a **partial** phone prefix must all return nothing.
  The moment it became a fuzzy list, the console would be a user-database
  browser rather than a targeted tool (FR-NG-3).
- The audit row must carry **exactly** the eight specified keys — a dropped
  key, a renamed key and an added key all fail — and **no** report
  contents.
- The **fixture is built, not borrowed.** The probe files its own report
  through the real `finalize-capture`, flags it three times as three
  distinct citizens so the **product's own** threshold moves it into the
  queue, and decides it so the trail has a row. A probe that read whatever
  happened to be in the database would pass on a dirty instance and fail on
  a clean one.

**The defect it found.** The seeded dev accounts disagreed with themselves.
`auth.users.raw_user_meta_data->>'phone'` said `+8801711000001` while
`profiles.phone` said `+8801911000001` — for **both** citizens. The
`handle_new_user` trigger reads the metadata to populate the profile, so the
metadata is the source of truth for a real signup: the seeded account
described a user that could never exist. The `...191...` form is the one the
moderator and every other seeded account use, so the metadata was the typo.
Fixed in `20261105000010_seed_dev_accounts.sql`.

This was invisible until the probe asked Auth and the database the same
question and got two answers. Nothing else in the repository reads the
seeded citizen's phone — the SQL suite and the shared unit test use their
**own** fixtures (`author@test.local`) — so nothing else could have noticed.

**The causal check.** Injecting `'author_id', author_id` into the queue
payload's `jsonb_build_object` makes the probe fail with *"the queue row
does not carry the raw author id"*; the injection was then reverted and the
probe returned to 37/37. The **first** attempt at this check edited the
*detail* function's payload rather than the queue's, and the probe passed —
which is the check's own lesson: a causal check that does not fail has not
proved anything, and the wrong target is as silent as no check at all.

---

### ✅ M1 — Three live mobile defects: a truncated feed, "undefined", and a crash — FIXED

**Story:** unit `006-alerts` (the feed) and the mobile shell (the other two) —
the three defects the audit found on the citizen side.

#### 1. The feed silently truncated at one page

`apps/mobile/src/shared/api/alerts.ts` read the feed through `useQuery`. The
`alerts_feed` **RPC** is cursor-paginated — it orders by
`(captured_at DESC, id DESC)` and hands back a `next_cursor` whenever another
page exists — but the client **received the cursor and discarded it**. A feed
longer than one page stopped at the limit, with no indication that more
existed and no way to reach it. The user saw a short feed and no error.

**The fix.** `useInfiniteQuery`, with the **cursor as the page parameter** and
the **area filter alone** in the query key. That split is the whole trick: a
cursor in the key would make every page its own query, and the feed would
reset to page one on every request. `alertsItems()` flattens the pages and is
the only way the screens read the feed — a screen that read
`data.pages[0].items` would be back to one page. The Alerts screen grew a
"load more" control.

#### 2. The user saw the word "undefined" instead of an error message

Ten call sites built the i18n key by hand:

```ts
t(`errors.${appError.code.toLowerCase()}`)   // → "errors.authrequired"
```

while the bundle's key is `errors.authRequired` (camelCase). The key did not
exist, i18next fell back to rendering **the key itself**, and the login screen
showed the literal word *"undefined"* where the error message should have
been. The same bug sat in `forgot-password`, `register`, `reset-password`,
`verify-otp`, `contact-editor`, `contacts` (×2) and `ContactCaptureScreen`.

**The fix.** The correct mapping **already existed** — `API_ERROR_I18N_KEYS`
in `packages/shared`, mapping every code to its bundle key. The screens were
re-deriving it wrongly, ten times. `errorCopy()` in
`apps/mobile/src/shared/i18n/errorCopy.ts` is now the one place that consults
the map, with a fallback to `errors.internal` for a code the app does not know
— a server that grew a code before the app shipped it must still produce a
readable message, not a raw key.

#### 3. A missing build setting crashed the whole app

`apps/mobile/src/shared/api/supabase.ts` **threw at import time** when
`EXPO_PUBLIC_SUPABASE_URL` was missing. That is a *build* fault, not a user
error, and the crash it caused was total: a red screen on **every** route,
before a single screen rendered, because twenty-two modules import that one.

**The fix.** The module no longer throws. It exports `isSupabaseConfigured`,
and the root layout renders `ConfigErrorView` when the build is unconfigured.
The copy says what happened and what to do, and it does **not** blame the
person holding the phone or leak the environment variable names — a build
detail a user cannot act on. A call that somehow gets through fails with a
clear message rather than a `TypeError` about a missing method.

**The causal checks.** Each of the three has one, and each **failed** when the
defect was put back:

| The defect, reintroduced | The guard that failed |
|---|---|
| `queryFn: () => fetchAlerts(query, null)`, `getNextPageParam: () => undefined` | 3 tests — *"follows the cursor and puts the second page into the feed"*, *"reports that there is a next page"*, *"keeps the cursor out of the query key"* |
| `return t(`errors.${code.toLowerCase()}`)` | 3 tests — *"resolves every error code to a message that exists in the bundle"*, *"resolves the code the old template got wrong"*, *"gives the disabled account its own message"* |
| the module-level `throw` | 6 tests — every one in *"the Supabase module"* |

**The test environment had to be split to make this possible.** A React hook
test (`renderHook`) needs a `document`, which the React Native **node**
environment does not have; but the capture and dial tests need `TextEncoder`
and `crypto.subtle`, which **jsdom** does not have. Neither environment could
be turned on for the other: `testEnvironment: 'jsdom'` over the RN preset
fails with *"Cannot redefine property: window"*, and `jest-expo/web` globally
strips the Node globals jsdom omits. So the mobile suite now runs as **two
Jest projects** — `node` and `jsdom` — and a test opts into jsdom by its
**name** (`*.dom.test.ts`). `apps/mobile/jest.dom.setup.js` gives the jsdom
project back the Node globals it lacks.

---

### ✅ M2 — The mobile shell boots, proves it boots, and stops leaking tokens — FIXED

**Story:** `001-foundation / 004-mobile-app-shell` — now `complete`.

#### 1. The AsyncStorage fallback is gone, and a token was never at risk

`apps/mobile/src/shared/api/supabase.ts` fell back to AsyncStorage when a
value exceeded SecureStore's 2048-byte limit. The fallback meant a **refresh
token could land in unencrypted storage on Android**.

**The limit was never the binding constraint.** The 2048-byte figure is
**Apple's Keychain limit, not Expo's** — it appears nowhere in
`expo-secure-store@58.0.2`, not in the TypeScript, not in the Android module
(`SecureStoreModule.kt`), not in the iOS module (`SecureStoreModule.swift`).
Android writes an encrypted blob into `SharedPreferences` and has **no size
limit**, and the story is Android-only.

**And a real session fits.** Measured against the installed client: a minimal
session is **1169 bytes**, the app's real session with its `user_metadata` is
**1550 bytes**, an oversized one **1978 bytes**. All fit in 2048. The refresh
token alone is 43–86 bytes — the old comment's claim that *"the session
refresh token can exceed that"* is false.

**The fallback is removed.** A device that cannot write to the Keystore now
degrades to **memory-only** — exactly the edge case the story's table
specifies — with a localized notice (`SessionPersistenceNotice`, mounted
above the navigator so it shows on every screen, with copy in both bundles).

**The store never throws at `supabase-js`,** and that matters more than the
size question. Verified against the installed source, not assumed:
`signInWithPassword` rethrows a non-`AuthError` out of the method,
`_saveSession` has **no** catch, and `setItemAsync` calls `storage.setItem`
with **no** catch. A storage adapter that throws turns a **successful sign-in**
into an error shown to the user. So the new store **records** the failure and
resolves, and `apps/mobile/src/shared/api/session-storage.test.ts` asserts the
rethrow contract by **reading the installed `auth-js` source** — so a future
`supabase-js` change that breaks the contract fails the build.

#### 2. The boot test — `apps/mobile/src/__tests__/boot.dom.test.tsx` (29 tests)

`@testing-library/react-native` is **not installed**, so a React Native tree
cannot be rendered. The claim is therefore split into the two halves that can
each be tested by the tool that can test them: the provider stack is
**rendered** in jsdom (a descendant hook reads the theme and the locale, for
real), and the root layout's **structure** is read from source (the provider
order, and the unconfigured branch).

**Four causal checks, each of which failed when the break was put back:**

| The break | The guard that failed |
|---|---|
| Swap the two branches' provider order | 2 tests |
| Delete the unconfigured branch | 4 tests |
| Drop the theme's **write** | 1 test |
| Drop the theme's **read** | 1 test |

The order assertion was **vacuous** on its first attempt — it scanned the
whole file with `indexOf` and so found the *unconfigured* branch, and passed
with the two branches' orders swapped. The fix was to locate the branch by
the one thing only the main branch contains (`<ThemedStack`).

#### 3. A theme-coverage scan — `apps/mobile/src/__tests__/themeCoverage.test.ts` (5 tests)

The criterion *"every screen renders in the chosen theme"* had **no guard**.
A screen that hardcodes its background does not read the theme, so the user
who picked the dark theme gets a light screen and nothing complains.

The scan resolves the **transitive** closure over the import graph, because a
screen qualifies if it **or a component it renders** calls `useTheme` —
`app/(auth)/contact-1.tsx` renders `ContactCaptureScreen`, which reads the
theme. A scan that only looked at the route file would flag it, and the
"fix" would be to add a pointless `useTheme` call.

**Causal check:** removing `useTheme` from `apps/mobile/src/shared/ui/SplashView.tsx`
— a shared component two levels below a route — failed the scan and named
`app/index.tsx`. The transitive resolution is real, not a one-level lookup.

#### 4. A SQL suite that broke by one row per run — FIXED

`supabase/tests/alert_detail.sql` failed Test 7.4 (*"the radius filter still
excludes a far-away neighbour report"*) — **not** because the radius filter
broke.

`history_nearby` pages with `limit p_limit + 1` and orders by
`captured_at desc`. The console probe creates a report on every run and never
deletes it, at (23.7461, 90.3774) — about 8 km from this suite's origin, and
therefore *inside* its 10 km radius. Each run left one more row there, every
row newer than the suite's own three-hour-old fixture. Once the accumulated
rows reached the page limit, the fixture was pushed out of the page.

**The failure grew by one row per `pnpm verify`** — the worst way for a test
to break: it passes on a clean machine and fails on a working one.

**The fix** is the one `read_models.sql` already used: `delete from public.reports;`
at the top of the suite, inside its own transaction, so the developer's rows
are untouched once the suite ends. **Causal check:** with the delete
commented out, Test 7.4 failed again; restored, 462 assertions pass.

#### What the story file now says

`004-mobile-app-shell` is `complete`, and its `## Implementation` section
records what ships, the four causal checks, **and the three places where the
story and the code disagree** — recorded rather than silently "fixed":

- **There is no `(onboarding)` group.** The criterion names three groups; the
  app has two. The onboarding steps (`contact-1..3`) live inside `(auth)`.
- **There is no `I18nProvider` or `SupabaseProvider` component.** The story's
  provider order names components that do not exist. The i18n runtime and the
  Supabase client are **module singletons**; the theme is the only React
  provider in the tree.
- **The Home route is `(app)/home.tsx`, not `(app)/index.tsx`** — and it is
  no longer a shell: unit 003 built the real Home screen.

### ✅ M3 — Story `005-admin-skeleton-and-ci`: five guards that were never built — FIXED

**Story:** `001-foundation / 005-admin-skeleton-and-ci`. Five of its nine
acceptance criteria named a guard, a job, or a boundary that did not exist.

#### 1. The bundle-scan test was blind to the credential it exists to catch

The criterion asks for *"a bundle-scan **test** fails the build if one
appears"*. `apps/admin/lib/bundleScan.test.ts` now exists (21 tests) — but
**the first version of it passed with a credential sitting in the file**.

The scan read a *comment-stripped* view of each source file, and stripping
string literals is exactly what a credential is wrapped in. The scan could
not see `SUPABASE_SERVICE_ROLE_KEY` because it could not see any string
literal.

The fix was to give each file **three views** instead of one:

| View | What it holds | What it is for |
|---|---|---|
| `code` | comments stripped, **literals kept** | the leak checks — a credential is only in a literal |
| `bare` | comments **and literals** stripped | the env-var inventory — `process.env.X` has no literal, so it is only visible here |
| `raw` | the original | the bundle scan |

A **positive control** now runs the scanner against synthetic samples of each
credential class, so a blind scan *fails* rather than passing quietly. A
negative claim ("the repo has no credential") cannot distinguish a clean repo
from a blind scan; a positive control can.

#### 2. The secret scan false-positived on the Supabase SDK's own detector

`node tools/secret-scan.cjs apps/admin/.next` reported two `sb_secret_`
findings — from the SDK's **own** `key.startsWith("sb_secret_")` detector,
which ships in every bundle. The CI `secret-scan` job would have failed on
every build.

The scanner now requires **≥20 characters of key material** after the prefix,
so a bare prefix literal is not a finding. The same three-view discipline, the
same bare-prefix rule, and the same documented test-file exemption now live in
`tools/secret-scan.cjs`.

#### 3. The console's three layout constants were invented outside the contract

`--tap-target`, `--rail-width` and `--page-max` sat in `globals.css` under a
comment that said *"not design tokens"*. The fix was to put them **into** the
contract: `docs/design/design-tokens.md` gained **§1.5 Console layout
constants**, and the parity test now asserts the console's constants against
the document's rows.

**The check had a blind spot.** The guard carried an `ADMIN_LAYOUT_CONSTANTS`
allow-list, which quietly exempted exactly the three properties the criterion
was about — removing `--page-max` from the document left the CSS's copy
un-flagged. The allow-list is gone, and there is now a **two-way** check: the
parity test catches a console value that drifts, and the extras test catches a
console property the document does not list — which is what a row *removed*
from the document looks like, since the parity test iterates the document's
rows and would have nothing to check.

#### 4. A dark-theme contrast defect, found by taking the criterion literally

The two raw `#ffffff` literals on the primary and danger buttons had to go.
The naive fix — `var(--surface-white)` — would have been **wrong**:
`--surface-white` is `#11112b` in the dark theme, so the button's label would
have gone near-black on a saturated violet.

The console needed a colour that does not invert between themes. The document
gained **§1.4 Static colours** for exactly that — `--static-white` —
mirroring the mobile theme's `staticColors.white`, which the mobile already
distinguishes for the same reason.

#### 5. No reserved build job, and the `@shared/*` alias question

**The build job.** The criterion says *"a separate job is reserved for the
build/release pipeline that unit 008 will fill in"*. `ci.yml` now declares
one — `name: build (reserved — unit 008)`, `needs: [secret-scan]`,
`if: false` — so the slot is visible in the graph without costing a runner or
failing a pull request. `packages/shared/src/ci-order.test.ts` proves the job
exists, that it is skipped, and that it hangs behind the gate it must clear.

**The alias.** The criterion named `@shared/*` as the mechanism. It is the
wrong mechanism, and the criterion was **amended** to name
`@nagar-shield/shared` — the specifier both apps actually use. `@shared/*` is
a *source* alias that reaches into `packages/shared/src/*` and bypasses the
package's `exports` map and its subpath exports. More decisively, the
criterion names **the mobile app as the reference**, and the mobile does not
use `@shared/*` either — switching the admin alone would have made the
criterion's own comparison false.

`@shared/*` is a live convention in this repository, but it is a **Deno**
convention: the Edge Functions resolve it through
`supabase/functions/deno.json`'s import map, because Deno has no pnpm
workspace and no package resolution to fall back on. Two apps in one pnpm
workspace consume the package by name; a runtime without a package manager
uses an import map.

The **boundary test** the criterion names now exists too:
`packages/shared/src/boundary.test.ts` scans both apps for a local Zod schema
or enum, holds a ~110-name shared vocabulary, and checks that vocabulary
against the package's real exports so it cannot go stale.

#### What the story file now says

`005-admin-skeleton-and-ci`'s `## Implementation` section records each of the
five above, and the story stays **`partial`** on **AC2 alone** — which is
**void, not unmet**. AC2 asks for *placeholder* routes; unit 007 replaced
them with live moderation screens. Making AC2 true would mean undoing unit
007, so closing it is a decision for the story's author (amend the criterion
to describe the shipped behaviour, or retire it as superseded), **not**
something to paper over by writing a stub.

### ✅ M4 — A live probe that failed after fifty runs on a healthy codebase — FIXED

`pnpm verify` failed with `CAPTURE_RATE_LIMIT` — a **live probe** failing
against a codebase that was working perfectly.

**The defect.** FR-CAPTURE-3 caps an author at **50 reports per day**. Three
probes filed their fixture as the fixed seeded `citizen@nagar.local`, so every
run spent that account's daily allowance. After about fifty runs the cap was
reached and the probes failed with HTTP 429 — **against a healthy codebase**.

**The failure grew by one report per `pnpm verify`** — the same worst-way-for-a-
test-to-break shape as §3 M2's `alert_detail.sql` fixture, and for the same
reason: the probe left state behind that the next run had to work around.

| Probe | The fixture | Before | After |
|---|---|---|---|
| `tools/probe-public-alert.cjs` | a real capture, via the real RPC | filed as the seeded citizen | a **fresh author** created per run |
| `tools/probe-moderation-console.cjs` | a real capture, via the real Edge Function | filed as the seeded citizen | a **fresh author** created per run |
| `tools/probe-capture-submit.cjs` | a real capture, via the real Edge Function | filed as the seeded citizen | a **fresh author** created per run |

The author is created through the Auth admin endpoint with a unique
digits-only phone (`profiles.phone` is UNIQUE, and the signup trigger refuses
a metadata without one). The **readers** stay fixed seeded accounts — they
only read, so they never spend an allowance.

**The verification** is the point: the seeded citizen was left sitting at
exactly 50 reports, and all three probes still passed. Each fresh author has
exactly **one** report afterwards, and running a probe twice in a row passes
both times.

Two other probes were checked and left alone: `probe-report-category.cjs`
writes its row **directly to the database** with the service role, so the
capture cap does not apply, and `probe-disabled-write.cjs` files as a
**disabled** account — the refusal *is* the assertion, so nothing ever
succeeds and nothing is ever counted.

**The same defect, a second shape.** `flag_report` caps a flagger at **10
flags an hour**, and the moderation-console probe's fixture was flagged by the
fixed seeded `citizen2` and `mod`. After ten runs the flags silently
**stopped counting** — the RPC answered `200` and returned `duplicate`, the
report stayed `visible`, never entered the queue, and the probe failed on a
**count** rather than an error. Fixed the same way: **three throwaway flaggers
per run**, in `tools/probe-moderation-console.cjs` *and* in
`tools/smoke-functions.cjs`, which had the identical defect. The general
rule: **any rate limit is a shared allowance, and a fixed account spends it.**
A writer needs a throwaway account; a reader may keep the seeded one.

### ✅ M5 — Story `002-dual-identifier-login`: two gaps closed, one void, one **much bigger than it said** — FIXED

**Story:** `002-identity / 002-dual-identifier-login`.

The story's `## Implementation` section named three gaps. Two closed. The
third turned out to be **stale**, and one gap was **not named at all**.

| # | The gap as written | What was actually true |
|---|---|---|
| 1 | no component test on the login screen | ✅ closed — `apps/mobile/src/__tests__/login.dom.test.tsx` (12 tests) |
| 2 | "Remember-me's effect on the session is untested" | ✅ closed, and **AC #6 had been failing outright** — see below |
| 3 | "no i18n key-parity gate" | **stale** — the gate already existed |
| — | *not named* | **nothing proved the phone and the email resolve to the same account** |

**Gap 2 was much bigger than it said.** The FR-AUTH-2 30-day window **did
not exist anywhere in the codebase** — `rememberMe` changed nothing about
persistence. AC #6 was not merely untested; it was **false**. The window is
now enforced at the only place a session is read back: `secureStore.getItem`
reads the policy stored *beside* the session, and a session past its window
reads as a miss (and the stale entry is deleted on the way out). The policy
is set **before** `signInWithPassword`, because `supabase-js` writes the
session *as part of* the sign-in — a policy set afterwards is too late for the
first write. Windows: **30 days** remembered, **24 hours** otherwise.

**The unnamed gap was the biggest one.** The story's `## Implementation`
claimed `tools/probe-alternate-phone.cjs` "signs in with the alternate
identifier" — it does not; that probe is about the `profiles.alternate_phone`
**column**. The login-by-phone path had **no** end-to-end guard at all; only
the RPC was covered inside Postgres. `tools/probe-dual-identifier-login.cjs`
(**17 assertions**, wired into `pnpm verify` and into the CI `rls-integration`
job) now resolves a phone over REST as an **anonymous** caller, signs in with
the resolved email, asserts the session's `profiles.id` **and** `profiles.phone`,
signs in by email and asserts the **same** `profiles.id`, asserts exactly one
`auth.users` row, and asserts a wrong password is refused through both paths
with the same status.

**AC #9 had no guard either.** `apps/mobile/src/__tests__/noSocialLogin.test.ts`
(11 tests) now scans the auth screens, both i18n bundles, the Supabase client
and the auth service for a social provider. It reads the **literals** (a
provider name lives in a string, and the code view strips strings), and it
carries **three positive controls** — a synthetic Google button, a synthetic
wired `provider: 'facebook'`, and a plain `"Sign in"` that must not be
flagged. A social provider would be worse than cosmetic: a second credential
system with its own account rows breaks the "one person, one `auth.users` row"
invariant the identity model rests on.

**Two criteria stay open, and they are void, not unmet.** AC #7 and AC #8
describe a login-screen OTP step that **W-1 removed** — the login screen is
email-primary and password-only. Making them true would mean putting a second
credential path back, which is the opposite of the shipped behaviour. The
story stays `partial` on those two, and closing them is the story author's
call (amend the criterion to describe the shipped behaviour, or retire it as
superseded) — the same call recorded for `005-admin-skeleton-and-ci`'s AC2.

**One naming difference is recorded rather than papered over.** The criterion
names `VALIDATION_FAILED`; the codebase uses `AUTH_REQUIRED`, and the *same*
code is returned for an unknown identifier (the resolver, HTTP 401) and for a
wrong password (GoTrue, HTTP 400). The substance of AC #4 — both paths fail
alike, with no "user not found" signal — holds; the code name differs.

### ✅ M6 — Story `007-account-deletion-and-recovery`: the screen told the truth, and the purge told it **too late** — FIXED

**Story:** `002-identity / 007-account-deletion-and-recovery`.

The story's `## Implementation` section named three gaps, all in the recovery
**screen**:

| # | The gap as written | What was actually true |
|---|---|---|
| 1 | "An expired restore is misreported as an internal error." | ✅ the screen's bare `catch { setError(t('errors.internal')) }` threw the failure code away — a citizen whose 30 days had run out was told the app broke, and told to try again, when trying again could never work |
| 2 | "`recoverableUntil` is fetched but never read." | ✅ the deadline was in the payload and on screen nowhere — the 30-day promise was only useful if the citizen knew the date |
| 3 | "The screen has no guard against pressing Restore after the window closed." | ✅ the button stayed live after the window closed |

**The fix is one module.** `apps/mobile/src/shared/api/recovery-window.ts` holds
the window rules and the failure classification as **pure functions**, beside
the shared `recoveryDeadline()` so the app, the purge leg and the database
cannot drift apart. `VALIDATION_FAILED` renders *"the 30-day recovery period
has ended"* in Bangla and English; `CONFLICT` renders the conflict copy; only
an unknown failure is `errors.internal`. The button is disabled once the
window has closed, and the screen states the deadline.

**Two decisions worth recording.**

- **A missing deadline is treated as *open*, not closed.** The app does not
  know when the window ends; the server does. Assuming "closed" on missing
  information would take away a restore the user was entitled to.
- **The device's clock is not the authority.** A device *ahead* of the server
  may show the window closed early — the server would still have honoured the
  restore. That is the safe direction to be wrong in. The opposite case is
  handled as the real answer: the screen believes the server over itself.

**AC #8 was the one that needed a new layer — and it found two real defects.**
AC #8 says *"the PII purge leg scrubs the profile, and the purge does not run
before the window closes"*. The purge leg is unit 008's, but the *promise* is
this story's, so its half of the contract is proved here too. Nothing was
asserting it anywhere. Writing the guard found:

| # | The defect | The fix |
|---|---|---|
| 1 | The purge's window was **one microsecond too narrow**. Its predicate was `deleted_at < now() - interval '30 days'` while the restore refuses at `now() >= deleted_at + interval '30 days'` — the same instant, written with a strict inequality. In the sliver between them the account was **unrecoverable but not yet purgeable**: the citizen's account was gone, the app said the recovery period had ended, and their PII was still on disk with the job refusing to touch it. | Migration `036` makes it `deleted_at <= now() - interval '30 days'`. The three statements of the boundary — the restore's refusal, the shared package's `isRecoveryWindowOpen`, and the purge's worklist — now name the same instant. |
| 2 | The job worklists were executable by **`anon` and `authenticated`**. `job_purge_deleted_accounts` returns every account awaiting its purge and the instant it was deleted; `job_purge_media_candidates` returns arbitrary reports' storage paths. Migration 012 revoked execute only from `public`, which does not remove the **direct** grants Supabase's default privileges give those roles. | Migration `036` revokes from `public`, `anon` **and** `authenticated` explicitly — the three-line pattern migration 015 already used for `job_keep_project_awake_ping`. `schema_contract.sql` now asserts that **no** `job_*` function is client-executable, over the *pattern* so a new worklist cannot be added without the test failing. |

**The privilege leak was live, not theoretical.** The probe's causal check
re-granted the leak, and the failing assertion printed exactly what had been
exposed: another account's id and the instant it was deleted.

**The guards**

| Guard | What it proves |
|---|---|
| `apps/mobile/src/shared/api/recovery-window.test.ts` (18) | The deadline, the floored days, the exclusive boundary, and that a missing deadline is *open* |
| `apps/mobile/src/__tests__/account-deleted.dom.test.tsx` (15) | The **message**, against the real bundles — and the structural half: the screen routes the failure through `restoreErrorCopy`, renders it, and disables the button |
| `packages/shared/src/jobs/jobs.test.ts` (5 new) | `recoveryDeadline` agrees with `ACCOUNT_RECOVERY_WINDOW_DAYS` and with the purge cut-off |
| `supabase/tests/account_deletion.sql` (12) | The purge's half: a 1-day and a 29-day deletion are not candidates, a 31-day one is, the boundary account at exactly 30 days **is**, and the two halves of the promise agree in both directions |
| `supabase/tests/schema_contract.sql` (2 new) | No `job_*` worklist is client-executable; every one is service-role executable |
| `tools/probe-account-deletion.cjs` (**26/26**) | The whole contract over the live stack, including the privilege refusal (HTTP 403) |

**Seven causal checks**, each proved to fail and then restored: the bare catch
(2 tests), the un-disabled button (1), an inclusive client boundary (1), the
misclassified failure (5), the reverted purge predicate (2 SQL assertions),
the re-granted privilege (1 SQL assertion and the probe at 25/26), and the
`anon` grant on a sibling worklist (1 schema contract).

**Unit 008's story was corrected, not just this one.** Its
`002-deleted-account-pii-purge` specified the predicate as `<` **and** said in
its own edge-case table that an account deleted exactly 30 days ago is
"selected and purged". Those two statements contradicted each other, and the
shipped `<` never did that. The story now states the corrected predicate and
carries the detailed account of both defects.

---

## 4. What is NOT DONE — 10 `partial`, 1 `planned`

Ordered by dependency. Bolt numbers in brackets.

> **Read this before the tables below.** The tables record the *defects that
> were found and fixed*. The stories that are still `partial` are recorded in
> their own story files, each under an `## Implementation` section that names
> the exact gap down to the file and line. Those are the honest remaining
> work; the tables here are the history.
>
> **A `partial` story is not a missing screen.** In every case the feature
> ships and works, and the gap is a *guard* — the test, boundary check,
> reserved CI job, or invalidation the acceptance criterion names.
>
> **Every number in this section is derived, not typed.** Run
> `node tools/reconcile-story-index.cjs` to recompute them; `pnpm
> story:index:check` fails the build on any drift. (Note: the tool's own
> vocabulary bug of §3 B5 meant it once reported **31 · 17 · 6** instead of
> **36 · 17 · 1** — five `complete` stories silently demoted to `planned`
> because the parse did not know the word `complete`. It is fixed, and an
> unrecognised value is now a hard error rather than a silent default.)
>
> **The moderation unit is now closed.** All six of unit `007-moderation`'s
> stories are `complete`. `apps/admin` used to declare
> `@tanstack/react-query` and **never import it** — the console hand-rolled
> its fetching, so no query was ever invalidated, and that single omission
> was the reason all five moderation stories failed their "the queries are
> invalidated" criterion. The console now runs on a `QueryClientProvider`
> with a query-key registry (`apps/admin/lib/queries.ts`); the decision and
> disable mutations invalidate the queue, the detail, the users and the audit
> queries **by key**, and a test proves the invalidation actually reaches the
> audit query — because a key-shape mismatch fails *silently* and no error
> message would reveal it. Building it surfaced **four real defects**: the
> dead role guard (`readModeratorRole()` was written and never called — every
> page hardcoded `role="moderator"`), the login screen's promised
> access-only state (which did not exist — a citizen was routed to the queue
> and met a generic error banner), a signed media URL that **no code in the
> console ever requested** (the bucket was private and the detail screen
> rendered the storage path as *text*), and the FR-AUTH-7 message literal,
> which **appeared nowhere in the repository** — the citizen app said
> something else entirely.
>
> The three user-facing defects worth naming here, because they are
> behaviour rather than a missing guard — **all three are now FIXED (§3 M1)**:
>
> | Where | What | State |
> |---|---|---|
> | `apps/mobile/src/shared/api/alerts.ts:94` | The feed computed `next_cursor` and **discarded it** — `useQuery`, not `useInfiniteQuery`, so page 2 was unreachable. | ✅ **FIXED** — `useInfiniteQuery` with the cursor as the page parameter; `alertsItems()` flattens the pages. |
> | `apps/mobile/src/shared/api/supabase.ts:21-27` | The Supabase client **threw at module load** instead of showing a localized configuration error. On a device with a missing `app.json` extra the app died with a raw English stack message. | ✅ **FIXED** — `isSupabaseConfigured` + `ConfigErrorView`; the module never throws. |
> | `apps/mobile/app/(app)/login.tsx:61-63` | `t(\`errors.${appError.code.toLowerCase()}\`)` rendered **`undefined`** — the bundle key is `errors.authRequired`, camelCase. A live user-facing bug, in **ten** call sites. | ✅ **FIXED** — `errorCopy()` consults the shared `API_ERROR_I18N_KEYS` map. |
>
> **By unit**, the shape of the remaining work is uneven:
>
> | Unit | complete | partial | planned |
> |---|---|---|---|
> | `001-foundation` | 4 | 1 | 0 |
> | `002-identity` | 6 | 1 | 0 |
> | `003-help-seek` | 5 | 2 | 1 |
> | `004-capture` | 3 | 4 | 0 |
> | `005-location` | 5 | 0 | 0 |
> | `006-alerts` | 7 | 2 | 0 |
> | `007-moderation` | 6 | 0 | 0 |
> | `008-jobs-operations` | 7 | 0 | 0 |
>
> `001-foundation` is **effectively closed**: **four of its five stories are
> `complete`**, and the fifth (`005-admin-skeleton-and-ci`) is down to a single
> **void** criterion — a placeholder-route requirement that unit 007 superseded
> with live screens. Its five missing guards are all built (§3 M3).

### 4.0 The 11 stories that are not `complete`

Each row's story file carries an `## Implementation` section naming the exact
gap. **Open the story file, not this table, when you pick one up.**

| Story | Unit | State | The gap, in one line |
|---|---|---|---|
| `005-admin-skeleton-and-ci` | 001-foundation | partial | AC2 is **void, not unmet** — unit 007 replaced the route stubs with live screens; closing it means amending or retiring the criterion, never reintroducing the stubs |
| `002-dual-identifier-login` | 002-identity | partial | AC7/AC8 are **void, not unmet** — they describe a login-screen OTP step that W-1 removed (email-primary, password-only); closing them means amending or retiring the criterion, never putting a second credential path back. Both named gaps are closed — see §3 M5 |
| `001-home-and-help-alert-grid` | 003-help-seek | partial | the grid is on its own route, not Home; the numbers are hardcoded, not read from the dataset |
| `002-personal-emergency-picker` | 003-help-seek | **planned** | **nothing exists** — no route, no component, no action |
| `003-bundled-station-hotline-dataset` | 003-help-seek | partial | the drift check compares row **ids**, not values; no APK size check; no byte-identity test |
| `001-capture-screen` | 004-capture | partial | the `capture_open_to_submit_ms` telemetry **does not exist** |
| `002-area-hierarchy-extraction` | 004-capture | partial | `areaHierarchySchema` does not exist; the resolution is cache-first, contradicting the story |
| `004-exif-strip-and-media-caps` | 004-capture | partial | the video path copies the original bytes — no trim, no metadata strip; the cap is 1080, not 1920 |
| `007-storage-upload-and-finalize` | 004-capture | partial | no unit test ties the client's storage path to the server's |
| `001-alerts-feed-list` | 006-alerts | ~~partial~~ **complete** | ✅ **CLOSED in §4.6 A4** — the uncategorized placeholder, the offline indication and the rendering tests all landed; two real defects (the blank area line, the static pulsing dot) were found on the way |
| `002-auto-refresh-and-pull-to-refresh` | 006-alerts | partial | neither the interval nor pull-to-refresh is tested |
| `003-area-filter-chips` | 006-alerts | ~~partial~~ **complete** | ✅ **CLOSED in §4.6 A5** — the row is a horizontal `ScrollView`, the chip list is **data-driven** from `area_lookup`, and the location chips are disabled without a fix |
| `004-flag-an-alert` | 006-alerts | partial | the server returns `duplicate`/`rate_limited`, not the mandated `CONFLICT`/`FLAG_RATE_LIMIT`; `retry_after_sec` is a constant |

**Unit `001-foundation` is down to one `partial`.** It has no subsection below
because it has no "defect that was found and fixed" history — its gaps are
all *guards never built*. Four of its five stories are now `complete`:

| Story | Closed by |
|---|---|
| `001-monorepo-workspace` | a test that the three workspaces share one strict TypeScript base |
| `002-shared-contracts` | the boundary test that no Zod schema is duplicated locally |
| `003-mobile-design-system` | the token-parity test against `design-tokens.md`, the i18n key-parity gate, the tap-target test |
| `004-mobile-app-shell` | §3 M2 — the boot test, the session-store decision, the theme-coverage scan |

**`005-admin-skeleton-and-ci` is the last one, and it is down to one
criterion.** The reserved `build` job, the bundle-scan **test**, the shared
boundary test, the two invented CSS custom properties, and the `@shared/*`
alias question are **all closed** — see §3 M8. What is left is **AC2**, and
it cannot be closed by writing code: the criterion asks for *placeholder*
routes, and unit 007 replaced them with live moderation screens. Making AC2
true would mean undoing unit 007. The criterion is **void, not unmet**, and
closing it is a decision for the story's author: amend it to describe the
shipped behaviour, or retire it as superseded.

### 4.1 Identity — unit `002-identity`

> The rows below record the **defects that were found and fixed**. One of this
> unit's seven stories is still `partial` — `002-dual-identifier-login` (both
> named gaps are closed; the two open criteria are **void**, because they
> describe a login-screen OTP step that W-1 removed — §3 M5).
> `007-account-deletion-and-recovery` is now `complete` (§3 M6): the recovery
> screen reports a closed window truthfully, states the deadline, and the
> purge leg's half of the contract is proved too. See the §4.0 table.

| # | Gap | Where |
|---|---|---|
| I1 | ✅ **FIXED** — `useAccountStatus` reads `disabled_at` on session resume and every foreground; a disabled account is routed to `app/(auth)/account-disabled.tsx`, which explains the disable and offers delete-or-sign-out. `fromSupabaseError` maps the guard's `ACCOUNT_DISABLED` to `AUTH_DISABLED` before the generic 42501 → FORBIDDEN. | `src/shared/auth/useAccountStatus.ts`, `app/(auth)/account-disabled.tsx` |
| I2 | ✅ **FIXED** — the biometric gate is live: `src/shared/auth/biometricService.ts` wraps `expo-local-authentication`, `useBiometricGate` decides when the gate applies, and `app/(auth)/biometric-gate.tsx` runs the prompt. The thresholds come from the `record_biometric_attempt` RPC (the authority), not from an app-local counter. The Settings toggle now persists `biometric_opt_in`. `pnpm biometric:check` proves the FR-AUTH-5 thresholds over PostgREST (10/10). | [005] |
| I3 | ✅ **FIXED** (folded into I1) — the Settings "Delete account" row now confirms and calls `soft_delete_account`; a soft-deleted account that signs back in lands on `app/(auth)/account-deleted.tsx`, which can restore it inside the 30-day window. | [006] story 007 |
| I4 | ✅ **FIXED** — the alternate-phone step is live: `phone.tsx` routes to `app/(auth)/alternate-phone.tsx` with the **normalised** primary number, the step rejects an alternate equal to the primary (both sides normalised, so `01711-111111` and `+8801711111111` compare equal), and `register.tsx` writes the column after the signup via `setAlternatePhone` — the `handle_new_user` trigger does not carry it. Migration 020 adds the format CHECK the schema never had. `pnpm alternate:check` proves the constraint over PostgREST (9/9); `pnpm signup:check` proves the signup contract (13/13). | [004] story 001 |
| I5 | ✅ **FIXED** — the password-reset OTP flow is live end to end. `app/(auth)/forgot-password.tsx` sends the code; `app/(auth)/verify-otp.tsx` takes it; `app/(auth)/reset-password.tsx` sets the new password and adopts the session. The challenge lives in `public.password_reset_challenges` (migration 021) and the **database owns the code** — bcrypt hash, `extensions.crypt(code, hash) = hash` — because GoTrue's `verify` endpoint accepts only `{type, token_hash}` / `{type, token}` and **silently ignores a 6-digit code**. The GoTrue token is released only after the comparison succeeds. The app owns the mail (`supabase/functions/_shared/mailer.ts`). `pnpm reset:check` proves the whole path over the real GoTrue + mailbox (30/30); `supabase/tests/password_reset.sql` adds 47 DB-side assertions. | [005] story 003 |
| I6 | ✅ **FIXED** — the **dual-identifier sign-in** is live end to end, and it had **no** end-to-end guard. The FR-AUTH-2 30-day Remember-me window **did not exist anywhere in the codebase** — `rememberMe` changed nothing about persistence, so AC #6 was **false**, not merely untested. The window is now enforced in `secureStore.getItem`, the only place a session is read back; the policy is stored *beside* the session and set **before** the sign-in (because `supabase-js` writes the session as part of it). `tools/probe-dual-identifier-login.cjs` (**17/17**, wired into `pnpm verify` and CI) now proves the phone and the email resolve to **one** `auth.users` row and one `profiles.id`. `apps/mobile/src/__tests__/noSocialLogin.test.ts` guards FR-AUTH-6. See §3 M5. | [002] story 002 |
| I7 | ✅ **FIXED** — the **recovery screen** now tells the truth. Its bare `catch` reported every restore failure as `errors.internal`, so a citizen whose 30 days had run out was told the app broke, and told to try again, when trying again could never work. `src/shared/api/recovery-window.ts` classifies the failure (`VALIDATION_FAILED` → the window closed; `CONFLICT` → nothing was deleted) and the screen states the deadline and disables the Restore button once the window has closed. A **missing** deadline is treated as *open*, because the server decides, not the app. The purge leg's half of the promise is proved too, and writing that guard found **two live defects**: the purge's window was one microsecond too narrow (an account could be unrecoverable while its PII sat on disk), and the job worklists were executable by **`anon` and `authenticated`** — migration 012 revoked execute only from `public`, which does not remove the direct grants Supabase's default privileges give those roles. Migration `036` fixes both; `schema_contract.sql` now asserts no `job_*` function is client-executable. See §3 M6. | [006] story 007 |

### 4.2 Contacts — unit `002-identity`

| # | Gap | Where |
|---|---|---|
| C1 | ✅ **FIXED** — the contacts CRUD is live. `src/shared/api/contacts.ts` gained `createContact`, `updateContact`, `deleteContact`, `makePrimary`, `clearPrimary` and `reorderContacts`; `app/(app)/contact-editor.tsx` is one screen behind add **and** edit; the FAB on `contacts.tsx` opens it; and the wizard's S-04a/b/c capture screens (`app/(auth)/contact-1.tsx` … `contact-3.tsx`, backed by the shared `src/shared/wizard/ContactCaptureScreen.tsx`) now save real contacts, followed by the S-05 location step. **Two database defects were found by probing and fixed by migration**: `contacts.user_id` had no default (the owner was the client's to name — migration 022 gives it `auth.uid()`), and `contacts.phone` had no CHECK constraint at all (migration 023, written against the three-valued trap). `pnpm contacts:check` proves the whole CRUD over the real PostgREST path (26/26) and `supabase/tests/contacts.sql` adds 47 DB-side assertions. | [006] story 006 |

### 4.3 Help-seek — unit `003-help-seek`

> Three of this unit's stories are still `partial`: `001-home-and-help-alert-grid`
> (the grid is on its own route, not Home; the numbers are hardcoded),
> `003-bundled-station-hotline-dataset` (the drift check compares row **ids**,
> not values) and `002-personal-emergency-picker` — the one story in the whole
> project that is genuinely **unbuilt**. See the §4.0 table.

| # | Gap | Where |
|---|---|---|
| H1 | ✅ **FIXED** — the More Help surfaces are live. `src/shared/ui/MoreHelpSheet.tsx` is a **shared** component, so the Home dashed card and the Help Alert screen show the identical six rows in the identical order, and each row opens the surface its category implies: the four hotlines → `/more-help` (the hotline list, read from the **bundle** with `lastVerifiedAt` surfaced through `src/shared/utils/verifiedStamp.ts`), নিকটবর্তী থানা → `/thana-line`, ম্যাপে স্টেশন খুঁজুন → `/station-map`. The row **body** opens the surface; the trailing 48 dp violet icon opens the dialer — one control doing two things would make the rule unobservable. `src/shared/ui/WrongNumberSheet.tsx` is the prototype's `#wrong-number-dialog` (amber `report` icon, five fixed reasons, a 500-character textarea, a 52 dp **রিপোর্ট পাঠান**, a 44 dp **বাতিল**). **A pre-existing defect was fixed**: the inline sheet pushed **both** the thana row and the map row to `/station-map`; the thana row now opens `/thana-line`. | [009] story 005 |
| H2 | ✅ **FIXED** — the Find-a-station map is live on the **shared** wrapper. `app/(app)/station-map.tsx` renders `shared/ui/StationMap` — the same component the History map uses, with the same OSM raster style — so there is no fork and the attribution cannot be dropped. The markers come from the **bundle** (`STATIONS.filter(isActive)`), so the surface works offline. The pin colour encodes the station **type** (police violet / hospital red / fire amber, all from the tokens), and a `bn`/`en` **legend** names the three types — three colours with no key are a colour-blind trap. The callout renders **under** the map, so the attribution stays visible, and shows only what the app knows: name, type, address, call button (C-6). The fix is **just-in-time**; with it denied the map still renders every marker on the Dhaka default with no position pin. **The offline notice is real** — `useRefreshGuard().isOffline` drives it; only the tiles need the network. The wrapper gained an optional per-marker `color` and an `overlayAlign` prop (the legend pins to the top-left so it never covers the stations). | [010] story 007 |
| H3 | ✅ **FIXED** — the thana line is live. `app/(app)/thana-line.tsx` renders the `nearest_thana` RPC's answer **as-is** — the client never re-derives the 10 km rule and never substitutes a number of its own. The RPC (`20261105000003_functions.sql`) applies `ST_DWithin`-equivalent haversine with `<= p_radius_km`, so the boundary is **inclusive**, and it filters `station_type = 'police' and is_active` in SQL. The amber fallback banner renders **before** the call affordance, so the user sees *why* `999` is the target and the target together. A failed lookup renders a **typed** error with manual-dial guidance — never raw Postgres text. | [009] story 006 |
| H4 | ✅ **FIXED** — the wrong-number report flow is live, and **two real database defects were found by probing and fixed by migration**. (1) An **anonymous report was impossible**: `reporter_id` was `not null` and the insert policy was `with check (reporter_id = auth.uid())` — and `auth.uid()` is NULL for an anonymous request, so `NULL = NULL` failed the policy. FR-SEEK-6 says *any user* may report. Migration **031** makes the column nullable and the policy accepts `reporter_id is null or reporter_id = auth.uid()`; the disabled-account guard is **not** weakened (`assert_account_not_disabled()` still runs, and G7/G26 still hold). (2) The **polymorphic integrity trigger did not exist** — the story says `entry_id` "cannot carry a plain FK" and that a CHECK trigger resolves it against the table named by `entry_type`, but there was no trigger, so a report could name a `station` type and carry a **hotline's** slug and land silently. Migration **032** adds the trigger (resolving against the *live* table, so a retired slug is refused). Migration **033** adds the `details` column the story's write path names and renames the status vocabulary to `('pending','reviewed','rejected')`. The reason and the free text are stored as **two fields**, not one concatenated string. The schema also now **uses** `wrongNumberReportSchema`, which was defined and never wired in. | [009] story 008 |

### 4.4 Capture — unit `004-capture`

> Four of this unit's seven stories are still `partial`: `001-capture-screen`
> (the `capture_open_to_submit_ms` telemetry does not exist),
> `002-area-hierarchy-extraction` (`areaHierarchySchema` does not exist; the
> resolution is cache-first, contradicting the story),
> `004-exif-strip-and-media-caps` (the video path copies the original bytes —
> no trim, no metadata strip; the cap is 1080, not 1920) and
> `007-storage-upload-and-finalize` (no unit test ties the client's storage
> path to the server's). See the §4.0 table.

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

> **Two of this unit's nine stories are still `partial`:** 
> `002-auto-refresh-and-pull-to-refresh`
> (neither the interval nor pull-to-refresh is tested)
> and `004-flag-an-alert` (the server returns `duplicate`/`rate_limited`, not
> the mandated `CONFLICT`/`FLAG_RATE_LIMIT`; `retry_after_sec` is a constant).
> See the §4.0 table.

| # | Gap | Where |
|---|---|---|
| A1 | ✅ **FIXED** — the History screen is live. `app/(app)/history.tsx` carries the prototype's three segmented tabs — **ধরন** (the rows), **মোট** (the totals) and **বিতরণ** (the per-category counts) — plus the **My Reports** tab that unit `004` added for the author. The prototype's second sentence, *"Detailed map + filters coming soon,"* is **removed**: both ship in Phase 1, so the claim would have been false. The **বিতরণ** tab is a **list of counts** — never a chart, a bar, a percentage or a trend (FR-NG-3 / FR-NG-4 / ADR-010) — and a **source scan** (`src/__tests__/noChartCode.test.ts`) fails the build if a chart library or a chart-shaped identifier appears in the app. The scan reads **code only** — comments and string literals are stripped first — because the rule is *stated in prose* inside the very files it scans; a naive scan would fail on the rule itself. The own-reports branch is **independent of the radius and the window** (FR-HIST-3), and the rows route to the right surface: an own report opens the author's own detail, a neighbour opens the **public** alert detail. | [020] story 006 |
| A2 | ✅ **FIXED** — the public alert detail is live. `app/(app)/alert-detail.tsx` renders the public projection, and the projection **omits `author_id` entirely** — not nulled, not renamed (FR-DATA-3 / FR-NG-5), so there is nothing for a render to pick up. The client type mirrors that, and `src/shared/api/alertDetail.test.ts` asserts the absence of every author-shaped key (`authorId` / `author_id` / `author` / `reporter` / `reporterId`) and that the serialised body contains no author uuid. The media paths are **author-token** paths, and a media whose URL cannot be signed is **dropped** rather than rendered broken. | [021] story 009 |
| A3 | ✅ **FIXED** — the filters, the map, and the author auto-hide are live. **The filters**: one filter object, one query key — the list, the totals, the distribution and the map all move together, and a sheet that changes nothing does not re-query. **The map**: one shared wrapper, no fork — the attribution is owned by the wrapper, only `tile.openstreetmap.org` is contacted, and the marker set is capped at 150 keeping the markers **nearest the centre**. **The author auto-hide**: the transition lives in `public.flag_report` — one transaction, so a partial hide is impossible. **A real defect was found and fixed by migration 030**: the function counted `count(*)` over the author's flags, so **five flags on a single report** fired the auto-hide and swept in the author's other reports — exactly what the story forbids ("five flags on one report are one flagged report"). It now counts `count(distinct f.report_id)`, and the response carries **both** counts side by side (`author_flags_24h` and `author_flagged_reports_24h`) so the distinction is visible rather than implied. The old SQL test had encoded the wrong behaviour and was rewritten, and a new Test 10 asserts the negative case directly. The hide is `hidden_pending_review`, not `removed` — it is a moderator's to reverse. **The author still sees their own hidden reports**; the public hide never touches own-report visibility. | [020–021] |
| A4 | ✅ **FIXED** — the alerts feed is `complete`. Three gaps closed, and **two real defects found on the way**. **(1) The uncategorized card rendered `'—'`.** The bundle already carried `alerts.uncategorized` = `অকার্যনির্দিষ্ট — Uncategorized`; the card used a literal instead. It now renders the localized placeholder and falls back to the **neutral `--ink-300` ramp** for the accent border, the icon tint and the category text. The repo's hardcoded-string scan **did not** catch it — `'—'` is one character with no space — so the guard added is behavioural, not lexical. **(2) The offline behaviour did not exist.** `apps/mobile/src/shared/ui/OfflineNotice.tsx` is new, and `alertsShowingCachedPage()` in `apps/mobile/src/shared/api/alerts.ts` is the **one rule** both feed screens render it from — and it needs **both** halves (the query is in error **and** a cached page with rows exists), so a cold start with no network shows the empty state rather than an offline notice over nothing. The feed never blanks. **(3) The rendering tests.** `alertCard.test.ts` (25), `offlineNotice.test.ts` (15) and `pulseDot.test.ts` (12). **The two defects:** the **area line rendered blank** — the database holds `"thana": null` on degraded captures, the client boundary normalises a null level to `''`, and the old `??` chain stopped there (an empty string is not nullish); the rule now lives in **one** function, `formatAreaHierarchy()`, used by four surfaces. And the **pulsing dot did not pulse** — `PulseDot.tsx` rendered a static halo while its own comment claimed *"the pulse is a React Native `Animated` loop"*; it now runs a real `Animated.loop` over the prototype's 1.5 s period, and when paused it **stops the animation outright** and renders no halo (a still-pulsing dot says the feed is still refreshing, falsely). Six **causal checks** confirm each guard fires. The honest residue is recorded in the story file: the Bangla half of the area line is **server-side only** (`area_lookup` is not in the public projection), and the **screenshot comparison** the Testing note asks for needs a device harness this repo does not have. | [018] story 001 |
| A5 | ✅ **FIXED** — the area chip row is `complete`. Three gaps closed, and **two real defects found on the way**. **(1) The row clipped.** `AreaChipRow.tsx` used a plain `View`, so on a narrow phone with a dozen areas the chips past the edge were not clipped but **unreachable** — no gesture brought them into view. The row is now a horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}`, the prototype's `padding: 0 20px 12px` contract on the content container, and `flexGrow: 0` on both the scroll view and the container (a `ScrollView`'s content stretches to the viewport by default, which would make the row swallow the feed beneath it). The chips keep `flexShrink: 0`, so a chip never squeezes to fit. **(2) The chip list was a hardcoded array in two screens.** `alerts.tsx` and `home.tsx` each carried their own five-chip array — the same one, twice — with **Mirpur** and **Dhanmondi** written into the screen files. The list is now built from the **`area_lookup`** reference table, so a new area is a **data** change, not a code change in two files. **(3) The location chips lied.** They sent `{ division: 'Dhaka' }` — a **hardcoded** division — so the chip said "My division" while filtering a division the user might not be in. They now resolve from the **current fix** (just-in-time, never at app open, never on the panic path), and with no fix they are **disabled** — rendered, marked unavailable, not pressed — and `resolveAreaFilter` sends **no** parameter for a disabled chip, so the feed keeps the result set it had rather than narrowing to an empty area. **The filter is now one shared mapping**: `resolveAreaFilter` in the new `src/shared/api/areaChips.ts` is the single function both feed screens use, so a narrowed feed can never come from a second, divergent mapping. The selection is a chip **id**, not a chip object, because the list is data-driven and a held chip could stop existing. **The two defects:** the chip's `height: 28` was unstated, so once the label moved into a variable the tap-target gate could not resolve the chip's box and reported it unmeasurable — the gate was right and the primitive was wrong; and the selected chip wore a flat violet rather than the prototype's `var(--grad-primary)`, which is now rendered through `expo-linear-gradient` as a **theme token** so it keeps AA contrast in both modes. **Five causal checks** confirm each guard fires, including the tap-target scanner's own brace tracking. The honest residue is recorded in the story file: the **Maestro flow** the Testing note asks for does not exist, the `neighborhood` selection comes from the Home search bar (unit `003` owns it), and the chip labels are the English area names. | [018] story 003 |

### 4.7 Moderation — unit `007-moderation`

| # | Gap | Where |
|---|---|---|
| M1 | ✅ **FIXED** — the author-auto-hide queue group is live. `apps/admin/app/queue/page.tsx` gained an **All pending / Author auto-hidden** filter with `aria-pressed`, a derived badge that separates the two causes (`author` / `both`), and the author's 24 h flag count **labelled apart from** the report's own flag count — a context number is not a verdict. The server already carried `hide_reason` and `author_flags_24h`, so **no migration and no new RPC** were needed; the gap was purely in the rendering. The queue offers **no bulk actions** at MVP (FR-MOD-3) — no "restore all", no multi-select, no shared note — and a **source scan** (`apps/admin/lib/noBulkActions.test.ts`) fails the build if one appears. | [024] story 005 |
| M2 | ✅ **FIXED** — the console runs on TanStack Query. `apps/admin/app/providers.tsx` holds a module-scope `QueryClient` (so the cache survives navigation) and `apps/admin/lib/queries.ts` owns the key registry: `['admin','queue']`, `['admin','report-detail']`, `['admin','audit']`, `['admin','users']`. The **decision** and **disable** mutations invalidate by key — the queue, the detail, the users and the audit queries — and `apps/admin/lib/queries.test.tsx` proves the invalidation actually **reaches** the audit query. That test seeds the cache with **literal** keys rather than the constants, so a key-shape drift cannot make the test self-consistent: breaking `AUDIT_QUERY_KEY` to `['audit']` fails three tests, and dropping the audit invalidation fails the mutation test. | [022–024] |
| M3 | ✅ **FIXED** — the moderation **detail** screen shows the media. `apps/admin/lib/api.ts` gained `signMediaUrl(client, storagePath)`, which asks Supabase Storage for a **ten-minute** signed read URL on the private `report-media` bucket with the **moderator's own session** — never a service-role key, and never a persisted URL. The URL lives in component state only; a preview that cannot be signed (or that fails mid-session) degrades to a neutral placeholder, never a broken image, and a "Try again" control requests a **fresh** URL. The *database* already permitted the read (`report_media_select_moderator`); only the console never asked. | [023] story 002 |
| M4 | ✅ **FIXED** — the FR-AUTH-7 message is the PRD's literal. "Your account has been disabled. Contact support." **appeared nowhere in the repository** — the citizen app said *"This account has been disabled, so it can no longer send reports or share your location."* The PRD's string is now a single fixed i18n key (`apps/mobile/src/shared/i18n/en.ts` + `bn.ts`), the disable screen renders it, and `apps/mobile/src/shared/i18n/disabledAccountCopy.test.ts` pins it — no reason, no identifier, no timestamp, and never a claim that the account was deleted. | [024] story 004 |
| M5 | ✅ **FIXED** — the console's **role guard** is live. `readModeratorRole()` was written and **never called**: every page hardcoded `role="moderator"` on `<AdminShell>`, so the shell's guard was dead code. A `ModeratorGate` server component now resolves the role from the session, and a scan test fails the build if a page hardcodes it again. The **login** screen's promised access-only state did not exist either — a citizen was routed to the queue and met a generic error banner — so the citizen branch now renders the access-only card, extracted so the login page and the shell render the **identical** card. | [022] story 001 |
| M6 | ✅ **FIXED** — the console's **read models** are proven over the wire. `tools/probe-moderation-console.cjs` calls the four moderator-only RPCs the browser calls — `moderation_queue`, `moderation_report_detail`, `moderator_search_users`, `moderation_audit_feed` — with a moderator's **own** session, and asserts the JSON **shape** the browser receives. It is wired into `pnpm verify` (`console:check`) and into the CI `rls-integration` job. **37/37**. See §3 B6. | [022–024] |

> **All six of unit `007-moderation`'s stories are `complete`.** The queue,
> report detail, restore/remove decision, disable-user, author-auto-hide
> group and audit log all ship, and each acceptance criterion now has the
> guard it names — a test, a scan, or a SQL assertion.
>
> The console now also has a **live probe** (`pnpm console:check`, 37/37),
> which closes the gap the stories' own "Out of Scope" sections left: the
> Edge Functions were proven over the wire, the SQL suites proved the read
> models from inside Postgres, and the component tests proved the console's
> own parsing — but nothing joined the last two, so the **JSON shape the
> browser actually receives** was unproven. The probe joins them.

---

## 5. Release plumbing

| # | Gap | Note |
|---|---|---|
| R1 | **No git repository.** | ✅ **DONE** — `git init` on `main`, a baseline commit of the verified tree, `.gitattributes` for LF normalization. **Still no remote**: `git remote add origin <url>` before the first push. |
| R2 | Maestro flow `maestro/panic-path.yaml` missing. | ✅ **DONE** — see B2 |
| R3 | Scratch files at the root. | ✅ **DONE** — see B3 |
| R4 | `eas.json` placeholders. | 🟡 **BLOCKED ON THE MAINTAINER** — see B4. The *detection* is built and proven (the gate fails on an unresolved placeholder); only the five hosted-project values are missing. |
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
11. ~~**H1 → H2** — the help-seek surfaces.~~ ✅ **BOTH DONE.** ~~**H1** —
    the More Help sheet and the hotline list.~~ ✅ **DONE.** The sheet is a
    **shared** component, so both entry points show the identical six rows in
    the identical order, and each row opens its own category surface. The row
    **body** opens the surface; the trailing 48 dp icon opens the dialer.
    ~~**H2** — the find-a-station map.~~ ✅ **DONE.** One wrapper, no fork — the
    same `shared/ui/StationMap` the History map uses, so the attribution
    cannot be dropped from one of them. The markers come from the **bundle**,
    the pin colour encodes the station **type**, and a `bn`/`en` legend names
    the three types. The callout renders under the map so the attribution
    stays visible. **Three more stories came with them**: the thana line
    (H3) and the wrong-number report flow (H4), which is where the three
    database defects were found. ~~**R5**~~ ✅ **DONE** — the local `.env`
    files exist (see §5).
    ~~**The memory-bank bolt records**~~ ✅ **DONE** — see §7.
12. ~~**S1 — reconcile the story records.**~~ ✅ **DONE.** The stories are now
    counted **three** ways, not two: `complete`, `partial`, `planned`. The
    binary `implemented` flag could not carry the truth — an audit found
    that **none** of the 23 stories marked `false` were unbuilt; the
    features shipped and worked, and what was missing was the *mechanical
    guard* each acceptance criterion named (the test, the boundary check,
    the reserved CI job). A `partial` story now **must** carry an
    `## Implementation` section naming its exact gaps, and the tooling
    rejects it if it does not — otherwise `partial` would decay into a
    softer way of saying "planned". Result: **36 `complete` · 17
    `partial` · 1 `planned`**, every number derived from the story files
    by `tools/reconcile-story-index.cjs`, and the index's Status column,
    the header count, the bolt checkboxes, the bolt `status:` and each
    story's own `status:` are all **derived, not typed**. A `partial`
    story's `## Implementation` section says **which guard is missing**,
    not that the screen is missing. Result (at the time of the fix): **36
    `complete` · 17 `partial` · 1 `planned`** — see §1 for the live counts.
13. ~~**S2 — wire the moderator console onto TanStack Query.**~~ ✅ **DONE.**
    `apps/admin` declared `@tanstack/react-query` and **never imported it**;
    the console hand-rolled its fetching with `useState` + `useEffect` and
    reloaded through per-call-site callbacks, so **no query was ever
    invalidated** — the single reason all five moderation stories failed
    their "the queries are invalidated" criterion. The console now runs on a
    `QueryClientProvider` with a key registry (`apps/admin/lib/queries.ts`),
    and the decision and disable mutations invalidate the queue, the detail,
    the users and the audit queries **by key**. Building it surfaced **four
    real defects**: the dead role guard, the missing access-only state on
    the login screen, the signed media URL that **no console code ever
    requested**, and the FR-AUTH-7 message literal, which appeared nowhere
    in the repository. Unit `007-moderation` is now **6/6 `complete`**.
    Result (at the time of the fix): **36 `complete` · 17 `partial` · 1
    `planned`** — see §1 for the live counts.
14. ~~**S3 — write a live probe for the moderator console.**~~ ✅ **DONE.**
    `tools/probe-moderation-console.cjs` — **37/37**, wired into `pnpm verify`
    (`console:check`) and into the CI `rls-integration` job. It calls the
    four moderator-only RPCs the **browser** calls, with the moderator's own
    session, and asserts the JSON shape the browser receives — the join
    between the SQL suites (which cannot see the payload) and the component
    tests (which cannot see the wire). The fixture is **built**, not
    borrowed, so the probe is re-runnable and cannot be satisfied by another
    run's leftovers. It found a real defect: the seeded dev accounts'
    `auth.users` metadata and `profiles` rows carried **different** phone
    numbers — see §3 B6.
15. ~~**The three mobile-side defects.**~~ ✅ **ALL THREE DONE.** See §3 M1
    for the full account.
    1. ~~**`apps/mobile/src/shared/api/alerts.ts:94` — `useQuery` →
       `useInfiniteQuery`.**~~ ✅ **DONE.** The list query received
       `next_cursor` and **discarded it**, so page 2 was unreachable and the
       feed silently truncated. Now `useInfiniteQuery`, with the cursor as
       the **page parameter** and the area filter alone in the query key.
    2. ~~**`apps/mobile/app/(app)/login.tsx:61-63` — the error key.**~~ ✅
       **DONE.** The template `t(`errors.${appError.code.toLowerCase()}`)`
       rendered `undefined` because the bundle key is `errors.authRequired`
       (camelCase). The mapping already existed — `API_ERROR_I18N_KEYS` in
       `packages/shared` — and **ten** call sites were re-deriving it wrongly.
    3. ~~**`apps/mobile/src/shared/api/supabase.ts:21-27`** — a module-level
       `throw` on a missing URL took the **whole app** down at import
       time.~~ ✅ **DONE.** The failure is now localized to a
       configuration-error screen.
16. **Close the remaining `partial` stories, highest leverage first.** The
    order below is by *number of stories closed per unit of work*:
    1. ~~**`004-mobile-app-shell`**~~ ✅ **DONE** — see §3 M2. The boot test
       (29 tests), the session-store decision (27 tests) and the
       theme-coverage scan (5 tests). The story's `## Implementation` section
       now records what ships **and** the three places where the story and
       the code disagree (no `(onboarding)` group; no `I18nProvider` or
       `SupabaseProvider` component; the Home route is `home.tsx`, not
       `index.tsx`).
    2. ~~**`005-admin-skeleton-and-ci`**~~ ✅ **DONE, apart from one void
       criterion** — see §3 M3. The reserved `build` job, the bundle-scan
       **test** (21 tests, with a positive control so a blind scan cannot
       pass), the shared boundary test, the two invented CSS custom
       properties, and the `@shared/*` alias question (the criterion was
       amended to name `@nagar-shield/shared` — the specifier both apps use).
       The story stays `partial` on **AC2 alone**, and AC2 is **void, not
       unmet**: it asks for placeholder routes that unit 007 replaced with
       live screens. Closing it is a decision for the story's author, **not**
       something to paper over by writing a stub.
    3. ~~**`002-dual-identifier-login`**~~ ✅ **DONE, apart from two void
       criteria** — see §3 M5. The login-screen component test (12 tests), the
       Remember-me session-window test (14 tests), the auth-service ordering
       test (11 tests) and the no-social-login scan (11 tests) are all built.
       **A gap the story did not name was the real one**: the FR-AUTH-2
       30-day window **did not exist**, so AC #6 was *false*, and the
       login-by-phone path had **no** end-to-end guard — `pnpm
       dual-identifier:check` (17/17) is now the live proof. The story stays
       `partial` on **AC7 and AC8 alone**, and both are **void, not unmet**:
       they describe a login-screen OTP step that W-1 removed. Closing them
       is a decision for the story's author, **not** something to paper over
       by putting a second credential path back.
    4. ~~**`007-account-deletion-and-recovery`**~~ ✅ **DONE** — see §3 M6.
       The recovery screen reports a closed window truthfully and states the
       deadline, and the purge leg's half of the contract is proved too —
       which found **two live defects**: the purge's window was one
       microsecond too narrow, and the job worklists were callable by
       `anon` and `authenticated` (migration 036 fixes both).
    5. The remaining `partial` stories, one at a time, each against its own
       `## Implementation` section. ~~**`001-alerts-feed-list`**~~ ✅
       **DONE** — see §4.6 A4. The uncategorized placeholder, the offline
       indication and the rendering tests all landed, and the work found
       **two real defects** on the way (the blank area line, the static
       pulsing dot). ~~**`003-area-filter-chips`**~~ ✅ **DONE** — see §4.6
       A5. The row is a horizontal `ScrollView`, the chip list is
       data-driven from `area_lookup`, the location chips are disabled
       without a fix, and the work found **two real defects** on the way
       (the unstated chip height, the flat violet in place of the
       prototype's gradient). `006-alerts` has **two** stories left —
       `002-auto-refresh-and-pull-to-refresh` and `004-flag-an-alert` —
       and after that `004-capture` (four) and `003-help-seek` (two, plus
       the one genuinely unbuilt story).
    6. **`002-personal-emergency-picker`** — one of the genuinely unbuilt
       stories. It has no route, no component and no action.
17. **B4, and the git remote.** ~~**B4** — fill the `eas.json`
    placeholders.~~ 🟡 **PARTIALLY DONE.** The `dev` profile now carries the
    real local stack's URL and anon key. The `preview` and `production`
    profiles still need five hosted-project values — the staging ref and
    anon key, the production ref and anon key, and the SHA-256 pin set
    (with a backup pin). No Supabase project is linked, so these are a
    **credentials** decision, not a code decision: the maintainer who owns
    the hosted projects supplies them. **Two defects in the release gate
    itself were found and fixed** in the process — the staging stage looked
    for a profile named `staging` when the staging APK is built from
    `preview`, and the certificate-pinning assertion counted
    `<sha256-pin-set>` as one valid pin. See §3 for the full account.
    **The git remote is still unset** — the push needs the remote URL.
18. Final `pnpm verify` → **one** commit → push.

---

## 7. Memory-bank hygiene — the records are now derived

The memory bank did **not** reflect the built code. That confused the next
session twice: first because the bolts said `planned` while the code was
built, then because the story index said `planned` while the code was built.
The fix was not to hand-edit the records again — it was to make the records
**derived**, so that they cannot drift from the code they describe.

**The authoritative source is each story file's `implemented` frontmatter.**
Everything else — the index's Status column, the index's header count, each
bolt's story checkboxes, each bolt's `status:`, and each story's own
`status:` — is computed from it by `tools/reconcile-story-index.cjs`.

**But a derived record is only as good as the parser that derives it.**
The tool once accepted only `true`/`false`/`partial`/`planned` in the
`implemented:` field, so a story written as `implemented: complete` fell
through to the default and was reported as **`planned`** — and because the
index was derived from the *same* parse, the gate agreed with itself and
reported no drift. Five `complete` stories were demoted and the headline
count was wrong by exactly five. The parse no longer defaults silently: an
unrecognised value is a **hard error** naming the value and the file. See
§3 B5 for the full account and the causal check.

- ~~`memory-bank/bolts/001`–`024` still say `status: planned` with no stage
  artifacts, although the code for their stories **is built**.~~ — **FIXED,
  and now enforced.** The bolt's `status:` is `complete` only when **every**
  story it lists is `complete`; a bolt that delivers a `partial` story is
  `planned` because the work is not finished, but its checkbox for that
  story **is** ticked — a `partial` story *is* delivered, it ships and works.
  The 15 bolts whose checkboxes disagreed with the story files
  (`001`–`003` foundation, `004`/`006` identity, `007`/`008` help-seek,
  `011`–`013` capture, `018`/`019` alerts, `022`–`024` moderation) were
  rewritten, and the tool now fails the build if they drift again.
  The `ddd-0*.md` design files these bolts ask for were **never written**;
  writing them retroactively would have been invented evidence, and a
  fabricated design document is worse than a missing one. The stage artifacts
  point at the **story files**, because that is where the design, the change
  record and the verification evidence actually live.
- ~~`memory-bank/story-index.md` lists every story as `planned` except
  `007-secrets-and-environments`.~~ — **FIXED, and now enforced.** The Status
  column and the header count are rewritten from the story files by
  `node tools/reconcile-story-index.cjs --write`, and
  `pnpm story:index:check` fails the build on any drift. The counts are
  **40 `complete` · 13 `partial` · 1 `planned`** — 54 files, 54 rows, no
  duplicates, no orphans, **0 mismatches**.
- ~~55 of 62 story files still say `implemented: false`; only the 7 stories of
  unit `008-jobs-operations` say `true`.~~ — **FIXED.** The "62" figure was
  itself stale (the index carries 54 rows). All **54** story files now carry a
  state that is true: **31 `implemented: true`**, **17 `implemented: partial`**,
  **6 `implemented: planned`**. The binary flag was replaced by a three-state
  one because it could not carry the truth — see §6 item 12.
- ~~A story's own `status:` could contradict its own `implemented:`.~~ —
  **FIXED.** `004-graceful-degradation` said `status: ready` with
  `implemented: true`. The story's `status:` is now derived too, and the
  tool reports the contradiction.
- ~~A `partial` story with no record of its gaps is just a softer way of
  saying "planned".~~ — **FIXED.** Every `partial` story must carry an
  `## Implementation` section naming the exact gaps, and the tool rejects
  it if the section is missing. This was proved causally: stripping the
  section from `003-area-filter-chips` makes the gate exit 1 with
  *"003-area-filter-chips: is marked \"partial\" but has no
  \"## Implementation\" section naming the gaps"*; restoring it returns the
  gate to green.
- `memory-bank/intents/001-nagar-shield-mvp1/inception-log.md` **Q-1 is stale** —
  it asks whether `profiles.alternate_phone` should exist. The column exists
  (`supabase/migrations/20261105000001_initial_schema.sql:75`) and the wizard
  step now writes it.

**Fix:** the story file's `implemented` frontmatter is the **only** place a
state is written by hand. Everything else — the index, the header count, the
bolt checkboxes, the bolt `status:`, the story's `status:` — is derived.
After changing a story's state, run:

```bash
node tools/reconcile-story-index.cjs --write   # rewrite the derived records
pnpm story:index:check                        # prove they agree
```

Do it as part of the bolt, not in a separate pass.

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
                             report-detail, more-help, thana-line,
                             station-map
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
                             historyFilters, degradation, refreshGuard,
                             useDegradedHelp, dialConfirmation), i18n/
                             (bn.ts, en.ts), theme/, ui/ (incl. StatusBanner,
                             PermissionRow, HistoryFilterSheet, StationMap,
                             MoreHelpSheet, WrongNumberSheet, AreaChipRow,
                             AlertCard), utils/ (verifiedStamp)
apps/admin/app/              login, queue, queue/[reportId], users, audit
apps/admin/lib/              copy.ts, format.ts, api.ts
packages/shared/src/         schemas, enums, errors, jobs, data, types
supabase/migrations/         37 forward-only migrations
supabase/tests/              11 SQL suites (476 assertions)
supabase/functions/          8 Edge Functions + _shared/
tools/                       run-sql-tests, smoke-rpc, smoke-functions,
                             mirror-*, secret-scan, release-verify,
                             purge-media-dry-run, check-maestro-flow,
                             check-i18n-keys, reconcile-story-index,
                             probe-disabled-write, probe-biometric-gate,
                             probe-alternate-phone, probe-signup-contract,
                             probe-dual-identifier-login,
                             probe-password-reset, probe-contacts-crud,
                             probe-report-category, probe-public-alert,
                             probe-server-side-write, probe-capture-submit,
                             probe-account-deletion
maestro/panic-path.yaml      the nightly emulator flow (help → dialer → capture)
docs/design/                 design-tokens.md, screen-spec.md
docs/operations/             runbook.md, secrets.md
memory-bank/                 intents/, bolts/, standards/, story-index.md
prototype ui.html            the design source of truth
```

> **`tools/reconcile-story-index.cjs` is the memory-bank's source of truth.**
> Run `node tools/reconcile-story-index.cjs --write` after changing a story's
> `implemented` frontmatter; it rewrites the index's Status column, the
> header count, the bolt checkboxes, the bolt `status:` and each story's own
> `status:`. `pnpm story:index:check` proves they agree.

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
| Q-7 | `002-dual-identifier-login`'s **AC7 and AC8** describe a login-screen OTP step that **W-1 removed** — the login screen is email-primary and password-only. They are **void, not unmet**: making them true would mean putting a second credential path back. Amend the criterion to describe the shipped behaviour, or retire it as superseded — the same call as `005-admin-skeleton-and-ci`'s AC2. | low |
| Q-8 | `002-dual-identifier-login`'s **AC #4** names `VALIDATION_FAILED`; the codebase uses `AUTH_REQUIRED`, and the *same* code is returned for an unknown identifier (HTTP 401) and a wrong password (HTTP 400). The substance of the criterion holds — both paths fail alike, with no "user not found" signal — but the code name differs. | low |
| Q-9 | **The job worklists are now service-role only.** Migration `036` revokes execute on `job_purge_deleted_accounts`, `job_purge_media_candidates` and `job_geocode_cache_evictions` from `anon` and `authenticated`, because they returned other users' rows and the previous `REVOKE … FROM public` did not remove Supabase's direct grants. If any *other* part of the platform is expected to call a worklist directly — a dashboard, a cron-invoked Edge Function that is not the service role — it must be re-granted explicitly. Today nothing is: the job runner is the only caller. | low |
