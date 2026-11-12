/**
 * Runs every SQL test suite against the local Postgres container.
 *
 * The suites are plain `psql` scripts under `supabase/tests/`. Each one wraps
 * itself in a transaction and rolls back, so they leave no residue — which is
 * what lets them run against a live dev database without a fixture step.
 *
 * The suites are copied into the container first: piping them through
 * `docker exec -i` loses the encoding on Windows, and the Bengali strings in
 * the assertions come out as mojibake.
 *
 * Usage:
 *   node tools/run-sql-tests.cjs
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'supabase', 'tests');
const CONTAINER = 'supabase_db_nagar-shield';

const SUITES = [
  'schema_contract.sql',
  'business_rules.sql',
  'read_models.sql',
  'write_guards.sql',
  'password_reset.sql',
];

/** Counts the `| t` / `| f` assertion rows in a psql transcript. */
function countAssertions(output) {
  const passed = (output.match(/\|\s+t$/gm) || []).length;
  const failed = (output.match(/\|\s+f$/gm) || []).length;
  return { passed, failed };
}

function runSuite(suite) {
  const localPath = path.join(TESTS_DIR, suite);
  if (!fs.existsSync(localPath)) {
    throw new Error(`Missing test suite: ${localPath}`);
  }

  // Copy in first — see the note at the top of the file about encoding.
  execFileSync('docker', ['cp', localPath, `${CONTAINER}:/tmp/${suite}`], {
    stdio: 'pipe',
  });

  const output = execFileSync(
    'docker',
    [
      'exec',
      CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      `/tmp/${suite}`,
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );

  const { passed, failed } = countAssertions(output);
  return { suite, passed, failed, output };
}

function main() {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of SUITES) {
    let result;
    try {
      result = runSuite(suite);
    } catch (error) {
      const output = error.stdout ? String(error.stdout) : '';
      const { passed, failed } = countAssertions(output);
      totalPassed += passed;
      totalFailed += failed + 1;
      console.log(`✗ ${suite} — ${failed + 1} failure(s)`);
      console.log(output.split('\n').slice(-20).join('\n'));
      continue;
    }

    totalPassed += result.passed;
    totalFailed += result.failed;
    console.log(
      `${result.failed === 0 ? '✓' : '✗'} ${suite} — ${result.passed} passed, ${result.failed} failed`,
    );
    if (result.failed > 0) {
      console.log(result.output.split('\n').filter((line) => /\|\s+f$/.test(line)).join('\n'));
    }
  }

  console.log(`\n${totalPassed} passed, ${totalFailed} failed`);
  if (totalFailed > 0) process.exit(1);
}

main();
