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

Two of the checks prove behaviour that only exists over the wire, through
the door the app actually uses. They need the local stack running
(`npx supabase start`) and are wired into the `rls-integration` CI job.

```bash
pnpm guard:check       # a disabled account cannot write
pnpm biometric:check   # the biometric failure accounting
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

Both create their own throwaway account (`disabled@nagar.local`,
`biometric-probe@nagar.local`) and are safe to re-run.

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
