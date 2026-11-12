---
stage: plan
bolt: 027-jobs-operations
created: 2026-11-05T15:00:00Z
---

## Implementation Plan: runbook and secrets

### Objective

Make the release **reproducible** and the credentials **accountable**.

Two stories:

- **006-release-runbook** — one document that walks an operator who has
  never seen the repo from a clean checkout to a verified production
  release, with a runnable verification command and a pass condition at
  every stage.
- **007-secrets-and-environments** — one matrix that says where every
  secret lives in every environment, and a rotation procedure for each
  credential.

### Deliverables

- `docs/operations/runbook.md` — the eight-stage release progression, the
  prerequisites, the rollback procedures, the environment table, and the
  free-tier budget.
- `docs/operations/secrets.md` — the environment × variable matrix, the
  three layers of defence, the Vault secrets, and the three rotation
  procedures.
- `tools/release-verify.cjs` — the machine-checkable gate the runbook's
  Verify stages call.
- `tools/purge-media-dry-run.cjs` — the dry-run tool the staging Verify
  stage calls.
- `apps/mobile/.env.example`, `apps/admin/.env.example`,
  `supabase/functions/.env.example` — the variable names with placeholders
  and no real values.

### Dependencies

- **001-foundation** — the root scripts the runbook calls.
- **008-jobs-operations** — the job functions, the scheduler, and the
  purge whose dry run the staging Verify stage exercises.
- **026-jobs-operations** — `eas.json`, the CI workflows, and the secret
  scan the runbook and the matrix both depend on.

### Technical Approach

**The runbook is a ladder, not a checklist.** The eight stages are Build →
Dev → Verify → Staging → Verify → Prod → Verify → Monitor. Each has one
verification command and one pass condition, and no stage may be skipped —
in particular, a Prod stage without the staging Verify is not permitted,
because the purge dry run against staging is where the migration and the
job behaviour are proven before production sees them.

**Every command in the runbook is real.** The story requires that no
command is aspirational — each one was executed against the local stack
and its actual output recorded. The verification commands are the repo's
own scripts, not invented shell fragments.

**The matrix encodes one rule:** a variable is either public (and carries
an `EXPO_PUBLIC_` / `NEXT_PUBLIC_` prefix and is expected in the bundle) or
secret (and appears in exactly one of: Edge Function secrets, a CLI
credential store, a gitignored local file, or a GitHub Environment secret).
Nothing is in between.

**The release harness makes the matrix mechanical.** Five assertions, each
with a machine-checkable pass condition: the artifact secret grep returns
zero service-role matches, the migration state matches the repo, the
build's env vars are the target environment's, the SMS OTP flag is off in
every profile, and the cert-pinning posture is correct for the stage.

**Rotation is a procedure, not a hint.** The service-role key rotates in
under 30 minutes through a fixed sequence, and the certificate rotation
ships the new pin **before** the old certificate lands — the new pin is
added alongside the old one, always with a backup pin present, and the old
digest is removed only after the new build is in the field.

### Acceptance Criteria

**006-release-runbook**

- [ ] The **Build** stage runs from a clean checkout: clone → install →
      typecheck/lint/test → `supabase db push` → the preview build → the
      Vercel preview deploy, and passes when the checks are green and the
      migration applied with no drift.
- [ ] The **Dev** stage installs the dev-client build with
      `adb install -r app-debug.apk` and exercises the panic path against a
      healthy local stack.
- [ ] The **Verify** stage runs `pnpm release:verify --env staging` and
      exits non-zero when any assertion fails.
- [ ] The **Staging** stage applies the migrations to staging and deploys
      the preview console.
- [ ] The second **Verify** stage exercises the staging end-to-end **and**
      runs the purge in dry-run mode; it passes when the dry run reports
      the expected worklist and exactly one `job_runs` row is written.
- [ ] The **Prod** stage builds the production APK, pushes the migrations,
      and deploys Vercel production.
- [ ] The third **Verify** stage sideloads the production APK and confirms
      the release build rejects an unpinned host.
- [ ] The **Monitor** stage checks the Storage bytes against the 1 GB cap,
      the database size against the 500 MB cap, the last `job_runs` row per
      job, the absence of a stale `running` row, and that the project is
      not paused.
- [ ] The runbook states every prerequisite — tool versions, credentials,
      linked project refs, EAS login — so a clean checkout reproduces the
      same production state.
- [ ] The rollback section names a concrete rollback for each deployed
      surface: the APK, the database (a forward-only compensating
      migration, never a down-migration), the admin console, and the Edge
      Functions.
- [ ] The environment table names the Local → Staging → Production
      composition for mobile, backend, and admin, records that staging may
      collapse into a single non-prod project, and lists the EAS build
      quota as a release-planning input.
- [ ] **No command in the runbook is aspirational** — every one was executed
      against a real stack and its output recorded.

**007-secrets-and-environments**

- [ ] `docs/operations/secrets.md` contains an environment × variable matrix
      covering local, EAS, Vercel, and the GitHub Environments, with every
      row naming the variable, where the value lives, and whether it is
      public or secret.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` appears in the Edge Functions and CI
      **only** — no EAS profile, no Vercel variable, no app-facing `.env`,
      no `.env.example`.
- [ ] The mobile app's local environment carries only the three public
      variables.
- [ ] The admin console's Vercel variables are only the two
      `NEXT_PUBLIC_` ones; the service-role key is absent entirely.
- [ ] Every EAS profile variable carries the `EXPO_PUBLIC_` prefix.
- [ ] The repository defines the `staging` and `production` GitHub
      Environments with **environment-scoped** secrets, not repository-level
      ones.
- [ ] The artifact scan asserts zero matches for the service-role key name,
      the `service_role` literal, and the service-role JWT marker.
- [ ] A finding names the **file and the pattern** and never the value.
- [ ] The service-role rotation procedure is: rotate → `supabase secrets
      set` → the Vault → the GitHub Environments → redeploy the functions →
      re-run the scan → confirm the old key fails — under 30 minutes.
- [ ] The anon-key rotation updates all three EAS profiles, Vercel, the
      GitHub Environment, and every developer's local `.env`, then rebuilds.
- [ ] The certificate rotation adds the new pin **before** the rotation
      lands, always keeps a backup pin, and removes the old pin only after
      the new build is in the field.
- [ ] `.env.example` lists every variable name with a placeholder and no
      real value, the real `.env` files are gitignored, and the repository
      secret scan fails the build on a committed credential.
- [ ] Every matrix row names a free-tier service, the SMS provider is not
      configured at all, and `EXPO_PUBLIC_SMS_OTP_ENABLED=false` appears in
      every build profile.
- [ ] Each job function receives `SUPABASE_URL`,
      `SUPABASE_SERVICE_ROLE_KEY`, and `GEOCODE_BASE_URL` as **function
      secrets**, never as a project-wide default.
