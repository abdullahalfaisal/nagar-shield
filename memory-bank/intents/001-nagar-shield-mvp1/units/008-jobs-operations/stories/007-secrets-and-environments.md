---
id: 007-secrets-and-environments
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: '2026-11-04T00:00:00Z'
assigned_bolt: null
implemented: true
---

# Story: 007-secrets-and-environments

## User Story

**As a** Nagar Shield maintainer holding the keys to the whole system
**I want** one documented matrix of where every secret lives across local, EAS, Vercel, and the GitHub Environments, and a rotation procedure for each
**So that** the service-role key can never reach a phone or a browser, a leaked credential can be rotated in minutes, and every environment is provisioned from a known list rather than from memory

## Acceptance Criteria

- [ ] **Given** `docs/operations/secrets.md`, **When** it is inspected, **Then** it contains an **environment × variable matrix** covering **local**, **EAS**, **Vercel**, and **GitHub Environments**, with every row naming the variable, where the value lives, and whether the value is **public** or **secret**
- [ ] **Given** the matrix, **When** it is inspected, **Then** `SUPABASE_SERVICE_ROLE_KEY` is placed in **Edge Functions** and **CI only** — it appears in **no** EAS profile, in **no** Vercel environment variable, in **no** local `.env` consumed by the app, and in **no** client-facing configuration
- [ ] **Given** the mobile app, **When** a developer inspects the local environment, **Then** the only variables present are `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_SMS_OTP_ENABLED=false` — the service-role key is not in `apps/mobile/.env`, not in `.env.example`, and not in any EAS profile
- [ ] **Given** the admin console, **When** its Vercel environment variables are inspected, **Then** only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured — `SUPABASE_SERVICE_ROLE_KEY` is **absent from the admin's configuration entirely**, not merely unused
- [ ] **Given** the EAS build profiles, **When** `eas.json` is inspected, **Then** every variable in every profile carries the `EXPO_PUBLIC_` prefix and the **service-role key is never an EAS build env var** — a secret without that prefix is not inlined, but it is still forbidden by policy
- [ ] **Given** the GitHub Environments, **When** they are inspected, **Then** the repository defines the environments `staging` and `production` with **environment-scoped secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `EAS_TOKEN`, `VERCEL_TOKEN`, and the per-environment `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` values) — **not** repository-level secrets — so a workflow targeting `staging` cannot read the production credentials
- [ ] **Given** the artifact scan (`tools/secret-scan.ts`), **When** it runs over the built mobile bundle, the admin bundle, and the Vercel build output, **Then** it asserts **zero** matches for `SUPABASE_SERVICE_ROLE_KEY`, the literal `service_role`, and the service-role JWT marker — the "never in a bundle" invariant is mechanically enforced, not documented-and-hoped
- [ ] **Given** a secret is found in a bundle, **When** the scan reports it, **Then** it names the **file and the pattern** and never prints the matched secret value — the CI log does not become a second copy of the leak
- [ ] **Given** the rotation procedure, **When** it is followed for the service-role key, **Then** the documented steps are: rotate the key in the Supabase dashboard → update the Edge Function secrets (`supabase secrets set`) → update the GitHub **Environment** secrets → redeploy the affected Edge Functions → re-run the artifact scan → confirm the old key no longer authenticates — and the whole procedure is **under 30 minutes**
- [ ] **Given** the rotation procedure, **When** it is followed for the anon key, **Then** the new key is updated in EAS (**all three** profiles), in Vercel, in the GitHub Environment, and in every developer's local `.env`, followed by a rebuild — the anon key is public, but rotating it is still a coordinated operation
- [ ] **Given** the rotation procedure, **When** the **API host certificate** rotates, **Then** the new pin is added to the pin set in the EAS **production** profile **before** the rotation lands, a **backup pin** is always present, the app is rebuilt and redistributed, and the old pin is removed only after the new build is in the field
- [ ] **Given** the matrix's local row, **When** a developer sets up the repo, **Then** `.env.example` lists every variable name with a placeholder and **no** real value, the real `.env` files are gitignored, and a repository secret scan fails the build if a real credential is committed
- [ ] **Given** the free-tier cost constraint, **When** the matrix is inspected, **Then** every row names a **free-tier** service and `EXPO_PUBLIC_SMS_OTP_ENABLED=false` appears in **every** build profile — no paid tier is enabled anywhere and the SMS provider is **not configured at all** (FR-DATA-5 / waiver W-2)
- [ ] **Given** the Edge Functions' environment, **When** it is inspected, **Then** each job function receives `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEOCODE_BASE_URL` as **function secrets** (set with `supabase secrets set`), never as a project-wide default that a future function might read by accident — and the service-role key is the only credential any function holds beyond the project URL

## Technical Notes

- **The document lives at `docs/operations/secrets.md`** and it is the operational counterpart to `memory-bank/standards/tech-stack.md`'s env-var table. The standards file names **where** each variable is allowed; this document names **which value**, in **which store**, per environment, and **how to rotate** it.
- **The matrix.** The rows are the variables from the tech-stack standard; the columns are the four placement targets:

  | Variable | Local | EAS | Vercel | GitHub Environments | Public? |
  |----------|-------|-----|--------|---------------------|---------|
  | `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile/.env` (gitignored) | `dev`, `preview`, `production` profiles | — | `staging` / `production` (for the build + verify jobs) | **yes** — inlined into the bundle by design |
  | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env` | all three profiles | — | `staging` / `production` | **yes** — the anon key is scoped by RLS, not by secrecy |
  | `EXPO_PUBLIC_SMS_OTP_ENABLED` | `apps/mobile/.env` = `false` | `false` in all three profiles | — | `false` (asserted) | **yes** — but always `false` in Phase 1 |
  | `NEXT_PUBLIC_SUPABASE_URL` | `apps/admin/.env.local` | — | Preview + Production | `staging` / `production` | **yes** |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/admin/.env.local` | — | Preview + Production | `staging` / `production` | **yes** |
  | `SUPABASE_SERVICE_ROLE_KEY` | **never** (not in `.env`, not in `.env.example`) | **never** | **never** | `staging` / `production` **Environment** secrets only | **no** — Edge Functions + CI only |
  | `SUPABASE_PROJECT_REF` | `supabase link --project-ref` | — | — | `staging` / `production` | **no** |
  | `SUPABASE_ACCESS_TOKEN` | `supabase login` (CLI credential store) | — | — | `staging` / `production` | **no** |
  | `EAS_TOKEN` | `eas login` (CLI credential store) | — | — | `staging` / `production` | **no** |
  | `VERCEL_TOKEN` | `vercel login` (CLI credential store) | — | — | `staging` / `production` | **no** |
  | `GEOCODE_BASE_URL` | `supabase/functions/.env.local` (gitignored) | — | — | — | **no** — a server-side allowlist URL |

  The rule the matrix encodes: **a variable is either public (and therefore carries an `EXPO_PUBLIC_` / `NEXT_PUBLIC_` prefix and is *expected* in the bundle) or secret (and therefore appears in exactly one of: Edge Function secrets, a CLI credential store, a gitignored local file, or a GitHub Environment secret). Nothing is in between.**
- **`SUPABASE_SERVICE_ROLE_KEY` is confined to Edge Functions and CI.** The four job functions need it because they cross the RLS boundary by design (deleting Storage objects, scrubbing PII on rows no client may read, writing `job_runs`). The CI pipeline needs it for the Supabase-local RLS tests. It is in **no** client bundle, **no** Vercel configuration, **no** EAS profile, and **no** app-facing `.env`.
- **The "never in a bundle" invariant has three layers of defence:**
  1. **Naming** — Expo inlines only `EXPO_PUBLIC_*` and Next.js inlines only `NEXT_PUBLIC_*`, so a variable without the prefix is not embedded by the bundler.
  2. **Placement** — the matrix forbids the service-role key from any client-targeting store (EAS, Vercel, the app's local `.env`).
  3. **Proof** — `tools/secret-scan.ts` greps the built artifacts for `SUPABASE_SERVICE_ROLE_KEY`, the literal `service_role`, and the service-role JWT marker (`"role":"service_role"`), and the scan is a **CI gate** (`005-ci-pipeline`) and a **release-verify assertion** (`006-release-runbook`).
- **The anon key is public by design, not by accident.** The Supabase anon key is safe to expose because every table's RLS is the actual boundary; the job_runs table has **zero** policies, so even the anon key cannot read it. The matrix says this explicitly so nobody "hardens" it by moving it into a secret store and breaking the mobile client.
- **The GitHub Environments are scoped, not global.** The repository defines `staging` and `production` environments, and the secrets live in the **environment**, not at the repository level. A workflow that declares `environment: staging` therefore cannot read the production service-role key. The EAS token and the service-role key are per-environment; the `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` values differ per environment because they point at different Supabase projects.
- **The rotation procedure** is written as an ordered checklist with a verification step at the end, because a rotation that is not verified is a guess. The service-role rotation is: rotate in the Supabase dashboard → `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new> --project-ref <ref>` → update the GitHub Environment secret → `supabase functions deploy <fn> --project-ref <ref>` (the functions read the secret at invocation, but a redeploy forces a cold start) → `pnpm secret:scan` → confirm the old key is rejected. The target is **under 30 minutes**, because the anon key stays valid and the mobile client is unaffected — the service-role key is not in any client.
- **The anon-key rotation is a coordinated operation** and the document says so: it touches the EAS `dev`, `preview`, and `production` profiles, the Vercel Preview and Production environments, the GitHub Environments, and every developer's local `.env`, followed by a rebuild. The document names the order (backend first, then the client stores, then the rebuild) so the client never points at a revoked key for longer than one build cycle.
- **The certificate rotation is a planned-maintenance procedure**, not an incident: add the new pin to the pin set in the EAS **production** profile → rebuild → redistribute → confirm the new pin works in the field → remove the old pin in the next release. A **backup pin** is always present in the pin set, which is what makes this a non-event.
- **The local setup is `.env.example` + gitignored `.env`.** `.env.example` lists every variable **name** with a placeholder value and a one-line comment naming its owner. The real values live in `.env` / `.env.local` / `supabase/functions/.env.local`, all gitignored. A repository-level secret scan fails the build if a real credential is committed — the same scan family as the artifact scan, applied to the working tree.
- **The Edge Function secrets are set per function, not project-wide.** `supabase secrets set --project-ref <ref> SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEOCODE_BASE_URL=...` sets the values on the project, but the four job functions are the **only** consumers of `SUPABASE_SERVICE_ROLE_KEY` in that project, and the document names each of them. No future function inherits it by accident because the document records the intended consumer set and the CI secret scan fails if a new function references it without being listed.
- **Cost.** Every row names a **free-tier** service: Supabase Free, Vercel Hobby, EAS Build free tier, GitHub Actions free tier, OSM tiles, Supabase Auth email OTP. The **only** optional paid line item is the SMS provider, and it is **not configured at all** — `EXPO_PUBLIC_SMS_OTP_ENABLED=false` in every build profile, and the provider's `SMS_PROVIDER_*` variables appear in **no** environment until a provider is funded (waiver W-2).
- **The rotation table** in the document is short and explicit:

  | Secret | Trigger | Blast radius | Target time | Verification |
  |--------|---------|--------------|-------------|--------------|
  | `SUPABASE_SERVICE_ROLE_KEY` | suspected exposure or routine | Edge Functions + CI only — **no** client is affected | **< 30 min** | artifact scan clean; the old key is rejected by the API |
  | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | suspected exposure or routine | the mobile client — a rebuild is required | **< 1 h** | the app authenticates against the new key on a rebuilt APK |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | suspected exposure or routine | the admin console | **< 30 min** | the console loads and the moderator queue renders |
  | EAS token | suspected exposure | build capacity only | **< 15 min** | `eas whoami` succeeds with the new token |
  | Vercel token | suspected exposure | deploy ability only | **< 15 min** | `vercel whoami` succeeds with the new token |
  | API host certificate | planned rotation | the mobile client — a rebuild is required | scheduled | the new pin is in the field before the old pin is removed |

## Dependencies

### Requires
- Unit `001-foundation` — the pnpm workspace, the `.env.example` contract, the gitignore rules, and the CI workflow whose secret-scan job enforces the invariant
- Unit `001-foundation` story `004-mobile-app-shell` — the `EXPO_PUBLIC_*` reading convention and the repository-level scan test that already forbids a `service_role` reference under `apps/mobile`
- Unit `001-foundation` story `005-admin-skeleton-and-ci` — the admin console's env-var surface and the bundle-scan test that guards it
- `memory-bank/standards/tech-stack.md` — the authoritative env-var list and the placement rules this document expands
- `memory-bank/standards/system-architecture.md` — the "service-role key: Edge Functions and CI only" rule and the private-bucket requirement
- `004-eas-build-profiles` — the three EAS profiles and the artifact the scan inspects
- `005-ci-pipeline` — the `secret-scan` CI job and the GitHub Environments the workflow targets
- `006-release-runbook` — the environment-progression table (Local → Staging → Production) whose credentials this matrix maps
- `bolt-008-jobs-operations-2` — the four Edge Functions whose environment receives the service-role key

### Enables
- `001-media-purge-job` — the job whose function receives the service-role key and whose secret placement this document records
- `002-deleted-account-pii-purge` — the job whose function receives the service-role key and whose secret placement this document records
- `006-release-runbook` — the operator who runs the release ladder needs to know which credentials each environment expects
- `005-ci-pipeline` — the CI job whose GitHub Environment secrets this document enumerates

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A developer copies a staging `.env` into `apps/mobile/.env` and adds the service-role key "just to test" | The repository secret scan fails the build, and the local scan flags the file — the key is never needed on the client, so its presence there is always a mistake |
| The Vercel project has `SUPABASE_SERVICE_ROLE_KEY` set from an earlier experiment | The matrix says the variable must be **absent from the admin's configuration entirely**, not merely unused; the operator deletes it, and the artifact scan asserts its absence from the build output |
| A workflow needs the service-role key but forgets `environment: staging` | The workflow fails with a missing-secret error instead of silently running without it; the GitHub Environment is a **required** declaration, not a convention |
| The service-role key is rotated while a long job is running | The in-flight job fails its Storage or Postgres call, the single `job_runs` row closes as `failed` with a non-null `error_detail`, and the next run re-selects the unfinished work — the job is resumable, so a mid-run rotation costs one failed run and no data |
| The anon key is rotated and the old APK is still on a user's device | The old APK's requests are rejected by the API; the runbook schedules a rebuild and a redistribution, and the document records the rebuild as a required step rather than an optional one |
| The API host certificate rotates without a new pin being added | The production build rejects the new certificate (pinning is doing its job); the procedure adds the pin, rebuilds, redistributes, and only then removes the old pin — the backup pin exists for exactly this case |
| A developer runs `eas build` locally with the service-role key exported in the shell | EAS does not inline a variable without the `EXPO_PUBLIC_` prefix, and the artifact scan still asserts the key is absent from the bundle — the belt-and-braces check catches an operator's mistake |
| A new Edge Function is added and needs privileged access | The document names the intended consumer set, so adding a fifth consumer of the service-role key is a **documented, reviewed** change — and the CI secret scan flags an unlisted reference |
| The EAS free-tier quota runs out and a build is blocked | The quota is a free-tier limit, not a secret concern; the rotation matrix records that the EAS token's blast radius is build capacity only |
| The Supabase project pauses and the service-role key appears to "stop working" | The pause is an inactivity pause, not a credential problem; the heartbeat and the monitor stage detect it — the rotation procedure is **not** the fix and the document says so |
| A secret is accidentally pasted into a GitHub Actions workflow file | The repository secret scan fails the build, and the commit is reverted — GitHub Environment secrets are the only place a value is stored |
| The `secret-scan` job finds a match in a bundle | It prints the file and the pattern and fails the job; the value is never echoed, so the CI log does not become a second copy of the leak |
| A teammate needs the staging credentials | The document states that staging credentials live in the `staging` GitHub Environment and in the Supabase dashboard, and that a teammate requests access through the repository owner — credentials are never pasted into a chat or a ticket |
| A developer works offline with no access to the secret stores | The local environment has only the public values plus the anon key; the job functions are not needed locally, so nothing is blocked |
| The scan pattern list is expanded to catch a new leak shape | The patterns live in one place in `tools/secret-scan.ts` and are reviewed as part of the CI change; the document points at that file so the two never diverge |

## Out of Scope

- The implementation of `tools/secret-scan.ts` — `bolt-008-jobs-operations-4`; this story owns the policy it enforces and the matrix it documents
- The CI workflow's job definitions and the failing-PR mechanics — story `005-ci-pipeline`
- The EAS profile definitions themselves — story `004-eas-build-profiles`
- The release ladder and its per-stage verification commands — story `006-release-runbook`
- The Edge Function implementations and their env-var reads — `bolt-008-jobs-operations-2`
- A secrets-management service (Vault, Doppler, Infisical) and a paid CI runner — the free tier is the plan
- Encrypting the local `.env` at rest on a developer machine — the file is gitignored and the machine is the developer's
- An automated rotation schedule with a KMS — rotation is a documented, manual procedure in Phase 1
- Onboarding automation that provisions every environment from a script
- A formal access-review cadence and a quarterly access audit
- The SMS provider's configuration — it is **not configured at all** while the flag is off (waiver W-2)
