---
stage: implement
bolt: 027-jobs-operations
created: 2026-11-05T15:20:00Z
---

## Implementation Walkthrough: runbook and secrets

### Summary

The release is now a reproducible ladder and every credential now has a
named home. `docs/operations/runbook.md` walks an operator from a clean
checkout through the eight release stages, with one runnable verification
command and one pass condition per stage, a rollback procedure for every
deployed surface, and the free-tier budget written down.
`docs/operations/secrets.md` carries the environment × variable matrix, the
three layers of defence, the Vault secrets, and the three rotation
procedures. The machine-checkable part of both lives in the repo's own
tools, so neither document is prose that can drift from the code.

### Structure Overview

Both documents live under `docs/operations/`. The runbook is organised as
prerequisites → the eight stages → the scheduled jobs → the environment
progression → rollback → the free-tier budget → the CI gates → the secret
scan. The secrets document is organised as the matrix → the three layers
of defence → the Vault secrets → the three rotation procedures → the local
setup. The two verification tools sit alongside the other repo tooling in
`tools/`.

### Completed Work

- [x] `docs/operations/runbook.md` - the eight-stage release progression
      with its verification commands and pass conditions, the prerequisites
      table, the scheduled-job table, the environment progression table, the
      rollback procedures, and the free-tier budget.
- [x] `docs/operations/secrets.md` - the environment × variable matrix, the
      three layers of defence, the Vault secrets and their seeding SQL, the
      service-role / anon / certificate rotation procedures, and the local
      setup table.
- [x] `tools/release-verify.cjs` - the five-assertion per-stage harness
      behind the runbook's Verify stages.
- [x] `tools/purge-media-dry-run.cjs` - the dry-run tool behind the
      staging Verify stage.
- [x] `apps/mobile/.env.example` - the mobile app's public variable names.
- [x] `apps/admin/.env.example` - the admin console's public variable
      names.
- [x] `supabase/functions/.env.example` - the Edge Functions' server-side
      variable names.
- [x] `package.json` - the `release:verify` and `purge:dry-run` scripts.

### Key Decisions

- **The Verify stages call a script, not a checklist.** The runbook's
  pass condition has to be machine-checkable or it is a judgement call, and
  a judgement call is exactly what a release gate must not be. The harness
  asserts five things and exits non-zero on any of them.

- **An unresolved placeholder is a release blocker, not a pass.** The
  committed `eas.json` carries placeholders for the staging and production
  project refs and the pin set. The harness fails when it sees one, because
  a build made from a placeholder ships a dead API URL.

- **The certificate rotation ships the new pin first.** The new digest is
  added alongside the old one, a backup pin is always present, and the old
  digest is removed only after the new build is in the field. Removing the
  old pin first would lock out every device that has not updated.

- **The Vault holds the scheduler's credential, not the migration.** A
  migration is in the repository and the key is not, so the service-role key
  for the `pg_cron` path lives in the Supabase Vault and is read by a
  `SECURITY DEFINER` function that only `service_role` may execute.

- **The matrix's rule is one sentence.** A variable is either public — and
  then it carries an `EXPO_PUBLIC_` / `NEXT_PUBLIC_` prefix and is expected
  in the bundle — or secret, and then it lives in exactly one of four
  places. The middle does not exist.

- **The dry run is a mode of the function, not a flag day.** It performs no
  Storage delete and writes no `purged_at`, so it is safe against
  production at any time.

### Deviations from Plan

- The plan listed the three `.env.example` files under a separate
  deliverable. They are part of the same bolt, but the mobile and functions
  ones did not exist and had to be written; the admin one already existed
  and was left unchanged.

### Dependencies Added

- None.

### Developer Notes

- The runbook's Monitor stage **reads** a stale `running` row; it never
  deletes one. The audit trail is the record, and a row with a null
  `finished_at` is the signal that a job died mid-flight.
- The runbook's free-tier budget names the media purge as the single most
  important control. Without it running from day one, the Storage quota is
  exhausted inside the MVP window and the Capture path starts rejecting
  uploads — and there is no second copy of the media to fall back on.
- The EAS build quota is a release-planning input, not a surprise: the
  free tier carries a limited monthly count and the queue time is measured
  in minutes to hours.
