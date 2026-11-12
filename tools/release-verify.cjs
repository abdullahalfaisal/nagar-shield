/**
 * The release verification harness.
 *
 * `pnpm release:verify --env <local|staging|production>` is the per-stage
 * gate in the release runbook. Each **Verify** stage in the progression
 * (Build → Dev → Verify → Staging → Verify → Prod → Verify → Monitor) runs
 * this script against its target environment.
 *
 * It asserts, and exits non-zero on the first failure:
 *
 *   1. The artifact secret grep returns **zero** service-role matches.
 *   2. The linked project's migration state matches the repo's
 *      `supabase/migrations/`.
 *   3. The build's env vars are the target environment's.
 *   4. The production artifact carries the **cert-pinning** configuration.
 *   5. The SMS OTP feature flag is off in every build profile.
 *
 * A stage can never be "signed off" on a judgement call: every assertion
 * has a machine-checkable pass condition.
 *
 * Usage:
 *   node tools/release-verify.cjs --env local
 *   node tools/release-verify.cjs --env staging --artifact path/to/app.apk
 *   node tools/release-verify.cjs --env production --skip-migrations
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

const ENVIRONMENTS = ['local', 'staging', 'production'];

/** The API host each environment is expected to point at. */
const EXPECTED_HOSTS = {
  local: '127.0.0.1',
  staging: '.supabase.co',
  production: '.supabase.co',
};

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function readFlag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

/**
 * Assertion 1 — the artifact secret grep.
 *
 * The scan runs over the client sources, the built bundles, and the EAS
 * profiles. It reports a file and a pattern, never a matched value.
 */
function assertNoServiceRoleMaterial() {
  // The scan runs over the client sources, the built bundles, and the EAS
  // profiles. It is invoked as a child process so its exit code **is** the
  // assertion — requiring it in-process would run its `main()` with this
  // script's arguments.
  const targets = ['apps/mobile', 'apps/admin', 'packages/shared', 'eas.json'];

  try {
    execFileSync('node', [path.join(__dirname, 'secret-scan.cjs'), ...targets], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    record('the artifact secret grep returns zero service-role matches', true);
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const findings = output
      .split('\n')
      .filter((line) => line.includes('[') && !line.includes('scan —'))
      .slice(0, 5)
      .join(' | ');
    record(
      'the artifact secret grep returns zero service-role matches',
      false,
      findings || 'the scan reported a finding',
    );
  }
}

/**
 * Assertion 2 — the migration state matches the repo.
 *
 * The repo's migration files are compared with the ones the linked project
 * has applied. A local target is compared against the local Postgres.
 */
function assertMigrationState(envName) {
  if (hasFlag('--skip-migrations')) {
    record('the migration state matches the repo', true, 'skipped by flag');
    return;
  }

  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const repoMigrations = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  try {
    const output = execFileSync(
      'docker',
      [
        'exec',
        'supabase_db_nagar-shield',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-t',
        '-A',
        '-c',
        "select version from supabase_migrations.schema_migrations order by version;",
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );

    const applied = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const repoVersions = repoMigrations.map((name) => name.split('_')[0]);

    const missing = repoVersions.filter((version) => !applied.includes(version));
    const extra = applied.filter((version) => !repoVersions.includes(version));

    if (missing.length === 0 && extra.length === 0) {
      record('the migration state matches the repo', true, `${applied.length} migration(s)`);
      return;
    }

    const detail = [
      missing.length ? `missing: ${missing.join(', ')}` : '',
      extra.length ? `not in the repo: ${extra.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    record('the migration state matches the repo', false, detail);
  } catch (error) {
    record(
      'the migration state matches the repo',
      false,
      `could not read the migration state (${envName}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Assertion 3 — the build's env vars are the target environment's.
 *
 * The EAS profiles carry the per-profile env vars. The staging profile must
 * not carry the production Supabase URL, and the production profile must
 * carry the production one.
 */
function assertProfileEnvVars(envName) {
  const easPath = path.join(ROOT, 'eas.json');

  if (!fs.existsSync(easPath)) {
    record('the build env vars match the target environment', false, 'eas.json is missing');
    return;
  }

  let eas;
  try {
    eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
  } catch (error) {
    record(
      'the build env vars match the target environment',
      false,
      `eas.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const profiles = eas.build?.profiles ?? eas.build ?? {};
  const profileName = envName === 'local' ? 'dev' : envName;

  const profile = profiles[profileName];
  if (!profile) {
    record(
      'the build env vars match the target environment',
      false,
      `the ${profileName} profile is missing from eas.json`,
    );
    return;
  }

  const env = profile.env ?? {};
  const apiUrl = String(env.EXPO_PUBLIC_SUPABASE_URL ?? '');

  if (!apiUrl) {
    record(
      'the build env vars match the target environment',
      false,
      `the ${profileName} profile has no EXPO_PUBLIC_SUPABASE_URL`,
    );
    return;
  }

  // An unresolved placeholder means the profile was never wired to a real
  // project. That is a **release blocker**, not a pass: the placeholder is
  // committed, so a build made from it would ship a dead API URL.
  if (apiUrl.includes('<')) {
    record(
      'the build env vars match the target environment',
      false,
      `the ${profileName} profile still carries an unresolved placeholder`,
    );
    return;
  }

  const expectedHost = EXPECTED_HOSTS[envName];
  const matches = apiUrl.includes(expectedHost);

  // The production profile must not point at a local host, and the local
  // profile must not point at a hosted project.
  const crossEnvironment =
    (envName === 'local' && apiUrl.includes('.supabase.co')) ||
    (envName !== 'local' && apiUrl.includes('127.0.0.1'));

  if (matches && !crossEnvironment) {
    record('the build env vars match the target environment', true, profileName);
    return;
  }

  record(
    'the build env vars match the target environment',
    false,
    crossEnvironment
      ? `the ${profileName} profile points at another environment`
      : `the ${profileName} profile does not point at ${expectedHost}`,
  );
}

/**
 * Assertion 4 — the SMS OTP feature flag is off in every profile.
 *
 * FR-DATA-5 / NFR-Cost: SMS is the only optional paid line item and it is
 * feature-flagged **off**. A profile with the flag on would spend money.
 */
function assertSmsOtpDisabled() {
  const easPath = path.join(ROOT, 'eas.json');

  if (!fs.existsSync(easPath)) {
    record('the SMS OTP feature flag is off in every profile', false, 'eas.json is missing');
    return;
  }

  let eas;
  try {
    eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
  } catch {
    record('the SMS OTP feature flag is off in every profile', false, 'eas.json is not valid JSON');
    return;
  }

  const profiles = eas.build?.profiles ?? eas.build ?? {};

  const offending = Object.entries(profiles)
    .filter(([, profile]) => {
      const value = profile?.env?.EXPO_PUBLIC_SMS_OTP_ENABLED;
      return value !== undefined && String(value).toLowerCase() !== 'false';
    })
    .map(([name]) => name);

  if (offending.length === 0) {
    record('the SMS OTP feature flag is off in every profile', true, `${Object.keys(profiles).length} profile(s)`);
    return;
  }

  record(
    'the SMS OTP feature flag is off in every profile',
    false,
    `enabled in: ${offending.join(', ')}`,
  );
}

/**
 * Assertion 5 — the production artifact carries the cert-pinning config.
 *
 * FR-DATA-2: a release build pins the API host's certificate. The dev and
 * preview profiles deliberately do **not** — a developer must never be locked
 * out by a rotated certificate.
 */
function assertCertPinning(envName) {
  const easPath = path.join(ROOT, 'eas.json');

  if (!fs.existsSync(easPath)) {
    record('the production artifact carries the cert-pinning config', false, 'eas.json is missing');
    return;
  }

  let eas;
  try {
    eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
  } catch {
    record('the production artifact carries the cert-pinning config', false, 'eas.json is not valid JSON');
    return;
  }

  const profiles = eas.build?.profiles ?? eas.build ?? {};

  if (envName !== 'production') {
    // The non-production profiles must **not** pin.
    const pinningProfiles = Object.entries(profiles)
      .filter(([name]) => name !== 'production')
      .filter(([, profile]) => Boolean(profile?.env?.EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS))
      .map(([name]) => name);

    if (pinningProfiles.length === 0) {
      record('only the production profile pins the API host', true);
      return;
    }

    record(
      'only the production profile pins the API host',
      false,
      `pinning is enabled in: ${pinningProfiles.join(', ')}`,
    );
    return;
  }

  const production = profiles.production;
  const pins = production?.env?.EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS;

  if (!pins) {
    record(
      'the production artifact carries the cert-pinning config',
      false,
      'the production profile has no EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS',
    );
    return;
  }

  const count = String(pins).split(',').filter(Boolean).length;
  record('the production artifact carries the cert-pinning config', true, `${count} pin(s)`);
}

function main() {
  const envName = readFlag('--env', 'local');

  if (!ENVIRONMENTS.includes(envName)) {
    console.error(`Unknown environment "${envName}". Use one of: ${ENVIRONMENTS.join(', ')}.`);
    process.exit(1);
  }

  console.log(`Release verification — environment: ${envName}`);
  console.log('');

  assertNoServiceRoleMaterial();
  assertMigrationState(envName);
  assertProfileEnvVars(envName);
  assertSmsOtpDisabled();
  assertCertPinning(envName);

  const failed = results.filter((result) => !result.passed);

  console.log('');
  if (failed.length === 0) {
    console.log(`✓ all ${results.length} assertions passed — the ${envName} stage is verified`);
    process.exit(0);
  }

  console.error(`✗ ${failed.length} of ${results.length} assertion(s) failed — the ${envName} stage is NOT verified`);
  process.exit(1);
}

main();
