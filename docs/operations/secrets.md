# Nagar Shield — Secrets & Environments

The operational counterpart to `memory-bank/standards/tech-stack.md`. That
standard names **where** each variable is allowed; this document names
**which value**, in **which store**, per environment, and **how to rotate**
it.

The rule the matrix encodes: **a variable is either public or secret.**
A public variable carries an `EXPO_PUBLIC_` / `NEXT_PUBLIC_` prefix and is
*expected* in the bundle. A secret variable appears in exactly one of:
Edge Function secrets, a CLI credential store, a gitignored local file, or a
GitHub Environment secret. **Nothing is in between.**

---

## The matrix

| Variable | Local | EAS | Vercel | GitHub Environments | Public? |
|----------|-------|-----|--------|---------------------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile/.env` (gitignored) | `dev`, `preview`, `production` profiles | — | `staging` / `production` | **yes** — inlined into the bundle by design |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env` | all three profiles | — | `staging` / `production` | **yes** — scoped by RLS, not by secrecy |
| `EXPO_PUBLIC_SMS_OTP_ENABLED` | `apps/mobile/.env` = `false` | `false` in all three profiles | — | `false` (asserted) | **yes** — but always `false` in Phase 1 |
| `EXPO_PUBLIC_API_HOST` | `apps/mobile/.env` | `production` only | — | `staging` / `production` | **yes** — the pinned host |
| `EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS` | — (unset in dev) | `production` only | — | `production` | **yes** — a public key pin, not a secret |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/admin/.env.local` | — | Preview + Production | `staging` / `production` | **yes** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/admin/.env.local` | — | Preview + Production | `staging` / `production` | **yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** | **never** | **never** | `staging` / `production` **Environment** secrets only | **no** — Edge Functions + CI only |
| `SUPABASE_PROJECT_REF` | `supabase link --project-ref` | — | — | `staging` / `production` | **no** |
| `SUPABASE_ACCESS_TOKEN` | `supabase login` (CLI credential store) | — | — | `staging` / `production` | **no** |
| `EAS_TOKEN` | `eas login` (CLI credential store) | — | — | `staging` / `production` | **no** |
| `VERCEL_TOKEN` | `vercel login` (CLI credential store) | — | — | `staging` / `production` | **no** |
| `GEOCODE_BASE_URL` | `supabase/functions/.env.local` (gitignored) | — | — | — | **no** — a server-side allowlist URL |
| `nagar_project_url` (Vault) | seeded locally | — | — | — | **no** — encrypted at rest |
| `nagar_service_role_key` (Vault) | seeded locally | — | — | — | **no** — encrypted at rest |

Every row names a **free-tier** service. No paid tier is enabled anywhere,
and no SMS provider is configured at all.

---

## The three layers of defence

The "never in a bundle" invariant is mechanically enforced, not
documented-and-hoped.

1. **Naming** — Expo inlines only `EXPO_PUBLIC_*` and Next.js inlines only
   `NEXT_PUBLIC_*`. A variable without the prefix is not embedded by the
   bundler.
2. **Placement** — the matrix forbids the service-role key from any
   client-targeting store: no EAS profile, no Vercel environment variable, no
   app-facing `.env`, no `.env.example`.
3. **The scan** — `pnpm secret:scan` asserts zero matches for
   `SUPABASE_SERVICE_ROLE_KEY`, the service-role JWT role claim, and the
   `sb_secret_` prefix across the mobile bundle, the admin bundle, and the
   EAS profiles. It also asserts that no third-party analytics or ad SDK is
   present (FR-DATA-5) and that the SMS OTP flag is off.

The scan reports a **file and a pattern**, never the matched value — the CI
log never becomes a second copy of the leak.

---

## The Vault secrets

The `cron` / `pg_net` scheduler reads the service-role credential from the
Supabase **Vault** rather than from a committed migration, because a
migration is in the repository and the key is not.

Seed them once per project, out of band:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co',
  'nagar_project_url',
  'The project URL the scheduler posts to.'
);

select vault.create_secret(
  '<service-role-key>',
  'nagar_service_role_key',
  'The service-role key the scheduler authenticates with.'
);
```

Then reconcile the schedules:

```sql
select public.refresh_job_schedules();
```

The `anon` and `authenticated` roles have no `USAGE` on the `vault` schema,
so no client key can read either secret. The `run_scheduled_job` function is
`SECURITY DEFINER` with an explicit `EXECUTE` grant to `service_role` only.

---

## Rotation procedures

### The service-role key — under 30 minutes

The key is the highest-value credential in the system: it bypasses every RLS
policy. Rotating it invalidates the old one immediately.

1. **Rotate in the Supabase dashboard** — Project Settings → API Keys →
   regenerate the secret key. The old key stops working at once.
2. **Update the Edge Function secrets**:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new-key> --project-ref <ref>
   ```
   `SUPABASE_URL` and `GEOCODE_BASE_URL` are unchanged.
3. **Update the Vault** — the scheduler reads the key from here:
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'nagar_service_role_key'),
     '<new-key>',
     'nagar_service_role_key',
     'The service-role key the scheduler authenticates with.'
   );
   ```
4. **Update the GitHub Environment secrets** — `staging` and `production`,
   both, under the environment scope (not repository scope).
5. **Redeploy the affected Edge Functions**:
   ```bash
   supabase functions deploy purge-media --project-ref <ref>
   supabase functions deploy purge-deleted-accounts --project-ref <ref>
   supabase functions deploy cleanup-geocode-cache --project-ref <ref>
   supabase functions deploy keep-project-awake --project-ref <ref>
   ```
6. **Re-run the artifact scan** — `pnpm secret:scan`.
7. **Confirm the old key no longer authenticates**:
   ```bash
   curl -X POST "<project-url>/functions/v1/purge-media" \
     -H "apikey: <old-key>" \
     -H "Authorization: Bearer <old-key>" \
     -H "Content-Type: application/json" -d '{}'
   ```
   The response must be `403 FORBIDDEN`.

### The anon key

The anon key is public — it is scoped by RLS, not by secrecy — but rotating
it is still a coordinated operation because it is embedded in every shipped
build.

1. Regenerate the publishable key in the Supabase dashboard.
2. Update **all three** EAS profiles (`dev`, `preview`, `production`).
3. Update Vercel (Preview and Production).
4. Update the GitHub Environment secrets.
5. Update every developer's local `apps/mobile/.env` and
   `apps/admin/.env.local`.
6. Rebuild and redistribute the APK.

### The API host certificate

Certificate pinning is the one rotation where the **new** pin must ship
**before** the old certificate expires, or every installed app locks out.

1. Obtain the new certificate's SHA-256 subject-public-key digest.
2. **Add** it to `EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS` in the EAS **production**
   profile, **alongside** the existing pin. **A backup pin is always
   present** — a pin set with a single digest and no backup is a permanent
   lockout risk.
3. Rebuild the production APK and redistribute it.
4. Wait until the new build is in the field.
5. **Only then** remove the old digest and rebuild again.

The pin set carries an expiry (`2027-12-31`, set in
`apps/mobile/plugins/withCertPinning.js`). Review it as part of the
rotation, not after it.

---

## The local setup

`.env.example` files list every variable name with a placeholder and **no
real value**. The real `.env` files are gitignored, and a repository secret
scan fails the build if a real credential is committed.

| File | Purpose |
|------|---------|
| `apps/mobile/.env.example` | The mobile app's public variables |
| `apps/admin/.env.local.example` | The admin console's public variables |
| `supabase/functions/.env.example` | The Edge Functions' server-side variables |

`supabase/functions/.env.local` holds `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEOCODE_BASE_URL`.
It is **gitignored** and is the only local file that holds the service-role
key.

The geocoder URL is an **allowlist**: there is no user-supplied host, and
the value must point at the configured Nominatim-compatible service. It is
the SSRF closure.
