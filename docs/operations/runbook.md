# Nagar Shield — Release Runbook

The release progression is a **ladder**, and **no rung may be skipped**:

> **Build → Dev → Verify → Staging → Verify → Prod → Verify → Monitor**

Every rung has a **verification command** and a **pass condition**. A
release that cannot be reproduced from a clean checkout with the documented
commands is not a release.

This document is written for an operator who has never seen the repo.

---

## Prerequisites

State every prerequisite up front — a clean checkout plus these is enough.

| Tool | Version | Install / verify |
|------|---------|------------------|
| Node | 22.19.0 | `node --version` |
| pnpm | 9.15.0 | `corepack enable && pnpm --version` |
| Deno | 2.9.6 | `deno --version` |
| Supabase CLI | 2.122.0 | `npx supabase --version` |
| Docker | 29.6.1 | `docker --version` (the local stack and the CI migration job need it) |
| EAS CLI | latest | `npm i -g eas-cli` |
| Vercel CLI | latest | `npm i -g vercel` |
| Java | 17+ | `java -version` (the Android build needs a JDK) |

Credentials, all of which are **secrets** — see
[`secrets.md`](./secrets.md) for where each one lives and how to rotate it:

```bash
supabase login                # SUPABASE_ACCESS_TOKEN
eas login                     # EAS_TOKEN
vercel login                  # VERCEL_TOKEN
```

Linked projects — one non-production and one production:

```bash
supabase link --project-ref <staging-ref>
supabase link --project-ref <production-ref>
```

Free-tier note: staging may **collapse into a single non-prod project**.
The free tier carries one project comfortably, and the MVP's traffic does
not justify a second one.

---

## The eight stages

### 1. Build

```bash
git clone <repo-url> nagar-shield && cd nagar-shield
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
supabase db push --linked staging
eas build -p android --profile preview --platform android
vercel deploy --prebuilt
```

**Pass condition:** the type / lint / test commands are green, and the
migration applied with no drift.

### 2. Dev

Install the dev-client build against the local / staging stack and exercise
the panic path, Capture, Alerts, and the moderator console.

```bash
adb install -r app-debug.apk
npx supabase start          # the local stack must report healthy
```

**Pass condition:** `adb install` succeeds, the Maestro panic-path flow
passes, and the local stack is healthy.

#### The Maestro panic-path flow

`maestro/panic-path.yaml` is the smoke subset the nightly build runs against
the preview APK on an emulator. It signs in, walks the home grid → Help
Alert → the OS dialer → Capture, and asserts the controls on each screen.

It needs two environment variables:

| Variable           | Value                                    | Why                                            |
| ------------------ | ---------------------------------------- | ---------------------------------------------- |
| `MAESTRO_EMAIL`    | a seeded account, e.g. `citizen@nagar.local` | the `(app)` group redirects a signed-out user |
| `MAESTRO_PASSWORD` | `nagar-local-dev`                        | the seeded dev password                        |

```bash
MAESTRO_EMAIL=citizen@nagar.local MAESTRO_PASSWORD=nagar-local-dev \
  maestro test maestro/panic-path.yaml
```

The flow **does not place a call** and **does not submit a report** — it
asserts that the dialler opened and that the capture screen renders, so a
smoke run leaves no test data behind.

Validate the flow before building an APK:

```bash
pnpm maestro:check
```

The check parses the YAML, verifies every command is a real Maestro command,
confirms the `appId` matches the EAS package, and resolves every selector
against the app — a `testID` that no longer exists, or a Bengali string that
was renamed in `bn.ts`, fails here rather than on the emulator.

### 3. Verify

```bash
pnpm release:verify --env staging
```

**Pass condition:** the artifact secret grep returns **zero** service-role
matches, the migration state matches the repo, and the build's env vars are
the staging ones. The command exits non-zero when any assertion fails.

#### The live database probes

Seven of the checks prove behaviour that only exists over the wire, through
the door the app actually uses. They need the local stack running
(`npx supabase start`) and are wired into the `rls-integration` CI job.

```bash
pnpm guard:check       # a disabled account cannot write
pnpm biometric:check   # the biometric failure accounting
pnpm alternate:check   # the alternate phone constraint
pnpm signup:check      # the signup contract
pnpm reset:check       # the password-reset contract
pnpm contacts:check    # the emergency-contacts CRUD contract
pnpm category:check    # the report-category contract
```

`guard:check` proves that a moderator-disabled account is refused every
write path — contacts, location shares, wrong-number reports, reports,
`finalize_capture`, and the media bucket — while its own profile read and
an enabled account's insert still work.

`biometric:check` proves the FR-AUTH-5 thresholds over PostgREST: two
failures stay under the password fallback, the third answers
`fallback: 'password'`, the fifth clears `biometric_opt_in`, a success
resets the counter without silently re-enabling biometric, and an anonymous
caller cannot record an attempt at all.

`alternate:check` proves the `profiles.alternate_phone` format constraint
over PostgREST: a valid E.164 number is stored, the local format and a
non-BD number are refused, a refused write leaves the stored value
untouched, the column can be cleared, and — the rule that is easy to break
by accident — the column is **not** unique, so two accounts may hold the
same family number.

The non-BD assertion is the one that earns its keep. The obvious form of
the CHECK — `normalise_bd_phone(value) = value` — silently accepts every
non-BD number, because `normalise_bd_phone` returns NULL for one, `NULL =
'…'` is NULL, and a CHECK constraint only rejects FALSE. This probe is what
caught that.

`signup:check` proves the signup contract over the **public Auth door** —
the same door the app uses. A valid signup creates exactly one `auth.users`
row and exactly one `profiles` row carrying the same id, the stored phone is
the E.164 form, and the role is `citizen`. A duplicate phone is refused with
a `23505` unique violation on `profiles_phone_key`, a non-BD number is
refused with a `23502` `PHONE_REQUIRED`, and an already-registered email is
refused with a `422`.

The "gains NO auth.users row" assertions are the ones that earn their keep
here. The `UNIQUE` constraint on `profiles.phone` lives inside the signup
trigger's transaction, so a rejected signup rolls the insert back. If the
uniqueness guarantee were only an application-level pre-flight, a race
between two signups would leave a second Auth identity behind with no
profile — an account that exists but cannot be used. The SQL suite cannot
prove this half; only the transaction can.

Note that the story's `check_phone_available` pre-flight RPC does **not**
exist. The uniqueness guarantee is entirely the `UNIQUE` constraint inside
the trigger, which is the stronger guarantee — the pre-flight could only
ever have been advisory.

`reset:check` proves the password-reset contract end to end: a code is
generated, mailed, read back out of the mailbox, and redeemed. A wrong code
is refused and the refusal reports the remaining attempts; a third failure
opens a 30-minute cooldown that **refuses the correct code too**; a fresh
code is accepted and returns a session; the new password signs in and the
old one is rejected; the code cannot be redeemed twice; and a superseded
code is refused.

Two of those assertions earn their keep. The cooldown one proves the refusal
is server-side rather than a client countdown — a client that ignores its own
timer gains nothing. The replay one proves the challenge is consumed, so a
code captured from the mailbox is worthless once it has been used.

The probe reads the code out of the **mailbox**, which is the only place it
can be read from in production too. It needs the mail transport configured;
the local stack's own mail server is the default, and a deployment with no
transport at all fails loudly with `password_reset_mail_unconfigured`
rather than pretending the code was delivered.

All five create their own throwaway account (`disabled@nagar.local`,
`biometric-probe@nagar.local`, `alt-phone-a@nagar.local` and
`alt-phone-b@nagar.local`) and are safe to re-run. `signup:check` uses
`signup-probe@nagar.local` and two siblings, and cleans up after itself:
both the Auth users **and** the orphaned profile rows, because migration
016's `ON DELETE SET NULL` leaves the profile behind still holding the phone.
`reset:check` uses `reset-probe@nagar.local` and leaves it behind on
purpose — it changes the account's password each run, so deleting it would
break the next run's sign-in assertion.

`contacts:check` is the odd one out: it creates **no** account. It signs in
as two **seeded** citizens (`citizen@nagar.local` and
`citizen2@nagar.local`) because the owner-scoping criteria are only
meaningful when there is somebody else to scope against, and it cleans up
its own rows (`name = like 'probe-*'`) on the way out.

`contacts:check` proves the emergency-contacts CRUD over the real
GoTrue → PostgREST → RLS path: a contact can be created and the owner comes
from the session, the timestamps come from the database, a forged `user_id`
is refused, reading another user's contact by id or by `user_id` returns an
**empty set**, patching or deleting another user's row affects **no rows**,
the order is `is_primary` then `sort_order` and is identical on a second
read, a sixth contact beyond the wizard three is accepted (no cap), a
non-BD phone is refused with no row written, deleting the only primary
leaves zero primaries with the rest of the list intact, a duplicate phone
is accepted, and an empty name is refused.

Two of those assertions earn their keep. The RLS negative ones are the
point of the probe — a write that RLS filters out is **not** an error in
PostgREST: an UPDATE answers `200` with an empty representation and a
DELETE answers `204` with no body. The assertions therefore test the
**effect** (no rows affected, the other user's row unchanged), never the
status code. And the non-BD phone one is what caught the missing
`contacts_phone_format` CHECK — the same three-valued trap that migration
020 fixed for `profiles.alternate_phone`: the obvious form of the
constraint silently accepts every non-BD number, because a CHECK rejects
only FALSE and `NULL = '…'` is NULL.

`category:check` is the second probe that creates **no** account. It signs
in as two **seeded** citizens (`citizen@nagar.local` and
`citizen2@nagar.local`) — the author check is only meaningful when there is
somebody else to be checked against — and cleans up its own rows
(`description = 'probe-report'`) on the way out.

`category:check` proves the report-detail category contract over the real
GoTrue → PostgREST → `update_category` RPC path: a report starts with a
`NULL` category and that is a valid report, the author sets a category and
the stored value equals it, changing it replaces the old value with no trace
of it, all 11 of the fixed values are accepted, a value outside the 11 is
refused with no row written, and the report is in the author's own History
**immediately** with `is_own = true` and no pending-review gate. It also
proves the two things the SQL suite cannot: that the description and the
visibility are **not** editable after submit (both PATCHes are refused over
the wire), and that the History projection carries no `author_id`.

The assertion that earns its keep is the **non-author's refusal**. The
shipped `update_category` was fail-**open**: its `UPDATE` was scoped to the
author's own row, so a non-author's attempt matched zero rows, the write was
a no-op, and the function still returned a success envelope claiming the
category had been set. The client cached that value and showed it, so the
user's screen and the database disagreed with nothing to show the
disagreement. Migration `20261105000024_update_category_forbidden.sql` now
raises `FORBIDDEN` (42501) for a non-author — and for a report that does not
exist, so the error cannot be used to enumerate report ids.

### 4. Staging

```bash
supabase db push --linked staging
vercel deploy --prebuilt
```

Install the internal APK on a device.

**Pass condition:** the console loads and the moderator queue renders.

### 5. Verify

Exercise the staging end-to-end **and run the purge against staging**.

```bash
pnpm release:verify --env staging
pnpm purge:dry-run -- --url https://<staging-ref>.supabase.co --key <service-role-key>
```

**Pass condition:** the dry run reports the expected worklist, and exactly
**one** `job_runs` row is written for the invocation.

> **A Prod stage without this staging Verify is not permitted.** The dry run
> is where the migration and the job behaviour are proven before production
> sees them.

### 6. Prod

```bash
eas build -p android --profile production --platform android
supabase db push --linked production
vercel deploy --prod
```

**Pass condition:** the production artifact embeds the **cert-pinning**
configuration and the production env vars, and the artifact grep is still
clean.

### 7. Verify

```bash
adb install app-release.apk
pnpm release:verify --env production
```

Walk the panic path on the installed build.

**Pass condition:** the release build **rejects an unpinned host**, and the
panic path opens the dialer.

### 8. Monitor

Check the free-tier gauges and the job audit trail.

```bash
# The Storage gauge against the 1 GB free-tier cap.
supabase inspect db table-sizes --linked production --schema public

# The database size against the 500 MB free-tier cap.
docker exec supabase_db_nagar-shield psql -U postgres -d postgres -t -A \
  -c "select pg_size_pretty(pg_database_size('postgres'));"

# The last job_runs row per job — every one must read 'succeeded'.
docker exec supabase_db_nagar-shield psql -U postgres -d postgres -c \
  "select distinct on (job_name) job_name, status, started_at, finished_at, error_detail
     from public.job_runs order by job_name, started_at desc;"

# A stale 'running' row is a signal, not a bug — read it, never delete it.
docker exec supabase_db_nagar-shield psql -U postgres -d postgres -c \
  "select id, job_name, started_at from public.job_runs
    where status = 'running' and finished_at is null
    order by started_at;"
```

**Pass condition:** Storage is under 1 GB, the database is under 500 MB,
the last `job_runs` row **per job** reads `succeeded`, there is no stale
`running` row, and the Supabase project is **not paused**.

> A `running` row with a null `finished_at` means the job died mid-flight.
> The monitor **reads** it. It never deletes it — the audit trail is the
> record.

---

## The scheduled jobs

The scheduler is Supabase Cron / `pg_cron`, driven by the
`public.job_schedules` table.

| Job | Cadence | Why |
|-----|---------|-----|
| `purge_media` | daily (`17 3 * * *`) | The 90-day window is long; a daily run keeps a missed purge recoverable within a day |
| `purge_deleted_accounts` | daily (`23 3 * * *`) | The 30-day recovery window is short |
| `cleanup_geocode_cache` | weekly (`41 4 * * 0`) | The cache grows slowly and the 90-day TTL is forgiving |
| `keep_project_awake` | every 6 h (`11 */6 * * *`) | Well inside the free tier's inactivity-pause window |

The minute offsets are deliberately spread so the jobs never pile onto the
same minute.

```bash
# Reconcile cron.job with the declared schedules — idempotent.
docker exec supabase_db_nagar-shield psql -U postgres -d postgres \
  -c "select public.refresh_job_schedules();"

# The cron run history.
docker exec supabase_db_nagar-shield psql -U postgres -d postgres \
  -c "select jobid, status, return_message, start_time
       from cron.job_run_details order by runid desc limit 20;"
```

The **external-scheduler fallback** hits the **same** function URLs with the
same service-role bearer, so the two paths are interchangeable:

```bash
curl -X POST "<project-url>/functions/v1/purge-media" \
  -H "apikey: <service-role-key>" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" -d '{}'
```

---

## The offline upload queue

The queue lives in the **app sandbox** — a JSON file at
`Paths.cache/nagar-shield-media/upload-queue.json`. It is never in
AsyncStorage and it never holds the session token; the token is read fresh
from the session at drain time.

| Rule | Value |
|---|---|
| The bound | **20** items. The 21st evicts the **oldest**, and the eviction is reported to the user — a report is never dropped silently. |
| The backoff | **30 s → 2 min → 8 min**, then the item is kept on the device. |
| The attempt budget | **3**. After the third failure the item is retained with the "saved on device" state and is not retried automatically. |
| The trigger | **connectivity regain** (`expo-network`) and **app foreground** (`AppState` → `active`). |
| The drain | **Sequential** — one item at a time, in order. |
| The idempotency key | Minted **once**, when the capture is first submitted, and reused for every retry of that item. |

**Operational notes.**

- **A queued report is evidence, not an error.** The UI shows "Saved on
  device — will retry when network returns" as a *state*. There is no error
  toast and no failure dialog; the evidence is safe and the user is told the
  truth about it.
- **A wrong device clock cannot strand a report.** The backoff is a floor,
  not a wall: an item whose stored timestamp is more than 30 minutes ahead of
  the current time is treated as due regardless. The schedule itself tops out
  at 8 minutes, so the ceiling only fires for a genuinely unreachable
  timestamp.
- **Signing out discards the queue.** A queued item is scoped to the session
  that created it and must never be uploaded under another account. The
  Settings screen warns the user how many reports were discarded.
- **A duplicate report is a privacy problem.** If a report appears twice in
  History, the idempotency key was not reused — the retry sent a fresh
  `client_request_id`, so `finalize_capture` saw no existing
  `(author_id, client_request_id)` pair and inserted a second row.

---

## The device permissions

The Capture screen adapts to what the phone will let it do. It never prompts
at launch and never blocks a submit on a missing permission.

| Permission | Needed for | If it is denied |
|---|---|---|
| **Camera** | the photo card's camera path, and the video card | the video card and the camera path are **hidden**; the gallery and file paths survive |
| **Microphone** | the video card | the video card is **hidden** — a silent video is not the evidence being filed; the photo card survives |
| **Photos and videos** | the photo card's gallery path | the gallery path is hidden; the camera and file paths survive |
| **Location** | the auto-detected address | the location card shows a **manual-entry fallback**; the submit still succeeds |

**Operational notes.**

- **No prompt at first launch.** The prompts fire at the moment the entry
  point is tapped — just-in-time. The screen reads the permission state on
  every render and on every foreground, and **reading never prompts**.
- **Only a `denied` permission hides an entry point.** An `undetermined`
  permission still shows its card, because the prompt fires on the tap.
  Hiding it would make the prompt unreachable.
- **A failed permission query is treated as `denied`.** The app must never
  read "I could not check" as "it is allowed" — the entry point would be
  offered, the tap would fail, and the user would see a broken control.
- **The Settings button's label always matches its action.** "Ask again"
  re-triggers the system prompt; "Open system settings" opens the OS page.
  On Android, a permission denied with "don't ask again" will not prompt
  again, so the settings page is the only route back — and the copy says so.
- **The app never grants a permission.** The user flips the switch in the OS
  settings page. The app re-reads the live state on the next foreground, so
  the entry points reappear without a restart.
- **The manual area is a hint, not a location.** It rides in the report's
  description under an `Area: ` prefix. The server-resolved
  `area_hierarchy` stays authoritative.

**Diagnosing a "the camera is off but the card is still there" report.**
Check the permission state the app read, not the OS state. The card is hidden
only when the app *reads* the permission as `denied`. A stale read is
impossible by construction — the state is re-read on every foreground — so a
card that is still there means the OS still reports the permission as usable
(typically `undetermined`).

---

## The location share

The Location Sharing screen sends one snapshot to N recipients. It is an
**audit of what the sender did**, never a receipt of what the recipient did.

| Rule | Value |
|---|---|
| The channels | `app` (an in-app `location_shares` row) and `os_share_sheet` (the OS share sheet). `share_channel` is a **channel label**, never a delivery status. |
| The mode | Always `snapshot`. The column is the Phase-2 streaming hook; a one-value CHECK enforces it. |
| The position | `lat` / `lng` are **all-or-nothing** — both null for a "share without location", never a zeroed pair. A zeroed position reads as a real point in the Gulf of Guinea. |
| The accuracy | `accuracy_m` is nullable. A manual coordinate entry has no honest accuracy, and `0` would be a fabrication. |
| The recipient | `recipient_contact_id` is the sender's own contact, or **null** for an OS recipient — the sheet may have gone to an app with nothing to do with the contact list. |
| The prompt | **Just-in-time.** The location permission fires at the confirm tap, never on mount. |
| The fallback | A denied permission degrades to **manual coordinate entry** or **share without location**. Both complete a share. |
| The telemetry | `location_share_intent_ms` measures the confirm tap to the intent firing. Carrier delivery and recipient open time are **never** measured and **never** claimed. |

**Operational notes.**

- **Nagar Shield is not a tracking app.** There is no `watchPositionAsync`,
  no background location permission, no background location task, and no
  foreground service. The absence is asserted by a **source scan**
  (`noBackgroundLocation.test.ts`), so adding one fails the build. The scan
  covers the whole `src` tree **and** `app.json`, so a permission declared
  in the Expo config fails too.
- **The copy may never claim a receipt.** No "delivered", no "read", no
  "seen", no **পৌঁছেছে**, no **দেখেছে**. The app cannot know any of these
  (ADR-005), so the copy scan fails the build on a claim in any of the three
  receipt forms.
- **A failed app-user lookup falls back to the OS share sheet.** That is the
  safe direction: the OS path works with no network and claims nothing. A
  lookup failure must never mean "send this to nobody".
- **The app-user lookup reveals nothing.** `resolve_app_contacts` returns the
  matching **contact ids** and nothing else — no phone, no name, no email, no
  user id. `public.profiles` stays owner-scoped; nothing is loosened.
- **A disabled or deleted account is not a reachable in-app recipient.** The
  snapshot would land in an account nobody can read, so that recipient goes
  down the OS path instead.
- **The `location_shares` table is never public.** It appears in no feed, no
  view, no RPC output, and no admin projection, and a second user cannot
  read another user's rows.

**Diagnosing "the share says sent but nobody received it."**
Nothing is wrong. The app fired the share and stopped — it has no visibility
into the target the user picked and no visibility into the carrier. The
confirmation says **shared / sent** precisely because that is the only claim
the app can earn.

---

## The location audit table

The `location_shares` contract is asserted **inside** Postgres by
`supabase/tests/location_shares.sql` — 37 assertions covering the mode
CHECK, the nullable all-or-nothing position, the channel enum, the RLS, the
disabled-account guard, and the app-user lookup.

```bash
pnpm db:test
```

The suite impersonates a **client** — `set local role authenticated` plus
the JWT claims, the way PostgREST does. The superuser has `BYPASSRLS`, so a
count taken outside the impersonation would see everything and prove
nothing; the negative tests count **inside** the impersonated session.

Two of the fixtures are worth knowing about, because both were bugs in the
tests before they were bugs in the code:

- **The contact-id helper's parameter must not shadow a column name.** A
  parameter named `name` shadows the column `c.name`, so `where c.name =
  name` compares the column to itself — always true — and the helper
  resolves an arbitrary contact. The test then fails for a reason that has
  nothing to do with the behaviour under test.
- **The helper must be scoped to the owner.** Contact names are unique
  within one user's list, not across the table. A helper that matched on the
  name alone would resolve another citizen's contact whenever the two share
  a name.

---

## The environment progression

| Surface | Local | Staging | Production |
|---------|-------|---------|------------|
| **Mobile** | Expo dev client → `http://127.0.0.1:54321` | `preview` APK → the staging project | `production` APK → the production project |
| **Backend** | `supabase start` (Docker) | the staging project | the production project |
| **Admin** | `next dev` | Vercel **Preview** | Vercel **Production** |
| **Jobs** | manual invocation | `pg_cron` on the staging project | `pg_cron` on the production project |

**EAS build quota** is a release-planning input, not a surprise. The free
tier carries a limited number of builds per month and the queue time is
measured in minutes to hours. Schedule the production build against the
**remaining** quota, and expect the queue — a build that sits for hours is a
release-plan fact, not an incident.

---

## Rollback

Migrations are **forward-only**. There is no down-migration, and there
never will be one — a down-migration that drops a column destroys the data
the forward migration was written to protect.

| Surface | Rollback |
|---------|----------|
| **Mobile APK** | Reinstall the **previous** APK: `adb install -r <previous>.apk`. The `versionCode` in `app.config.ts` is incremented, so the older build is always installable. |
| **Database** | A **forward-only compensating migration** — a new file in `supabase/migrations/` that reverses the change in data terms. Never a down-migration, never a manual `DROP`. |
| **Admin console** | The **previous** Vercel deployment: `vercel rollback <deployment-url>`. |
| **Edge Functions** | Redeploy the previous version: `supabase functions deploy <name> --project-ref <ref>`. The function's own version history is the record. |

---

## The free-tier budget

| Resource | Cap | What keeps it inside |
|----------|-----|---------------------|
| Storage | 1 GB | The 90-day media purge, plus the per-file byte caps |
| Database | 500 MB | The per-file media caps and the weekly geocode-cache eviction |
| Project availability | pauses on inactivity | The 6-hourly `keep_project_awake` heartbeat |
| EAS builds | a limited monthly count | One nightly preview build; the PR path never triggers a build |
| SMS | not configured at all | `EXPO_PUBLIC_SMS_OTP_ENABLED=false` in every profile |

The media purge is the **single most important** free-tier control. Without
it running from day one, the Storage quota is exhausted inside the MVP
window and the Capture path starts rejecting uploads. There is no second
copy of the media to fall back on.

---

## The CI gates

The PR pipeline is the precondition for every stage. It fails the PR on a
type, lint, unit, migration, RLS, or secret failure — never a warning.

```
lint ─┐
typecheck ─┼─> shared-test ─> unit-test-mobile ─┐
           │                 unit-test-admin  ─┼─> migration-dry-run ─> rls-integration ─> secret-scan
           │                 unit-test-functions ─┘
```

The **nightly** build (`.github/workflows/build.yml`) is a smoke test, not a
release: it builds the `preview` APK, runs the Maestro panic-path subset,
and scans the APK for secrets. It never deploys.

---

## The secret scan

```bash
pnpm secret:scan                                # the client sources and the EAS profiles
pnpm secret:scan apps/admin/.next               # the built admin bundle
pnpm secret:scan path/to/app-release.apk        # a built APK
```

The scan reports a **file and a pattern**, never the matched value. A
finding is a release blocker.
