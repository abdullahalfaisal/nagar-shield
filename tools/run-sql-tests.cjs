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
  'contacts.sql',
  'report_category.sql',
  'location_shares.sql',
  'alert_detail.sql',
];

/** Counts the `| t` / `| f` assertion rows in a psql transcript. */
function countAssertions(output) {
  const passed = (output.match(/\|\s+t$/gm) || []).length;
  const failed = (output.match(/\|\s+f$/gm) || []).length;
  return { passed, failed };
}

/**
 * The names of the assertions that failed.
 *
 * psql's aligned output puts the `f` on its **own line** beneath the test
 * name, so the failing rows are matched by the name line followed by a
 * separator and a lone `f`. A one-line `| f` is the unaligned form, so both
 * are matched.
 */
function failedAssertions(output) {
  const names = [];

  // The aligned form: the test name, a separator row, then a lone `f`.
  const aligned = output.match(/^\s+(Test [^\n]+?)\s*\|\s*\n(?:[-+|\s]*\n)?\s*f\s*$/gm) ?? [];
  for (const block of aligned) {
    const name = block.match(/^\s+(Test [^\n]+?)\s*\|/m)?.[1];
    if (name) names.push(name.trim());
  }

  // The unaligned form: `Test … | f` on one line.
  const unaligned = output.match(/^\s+(Test [^\n|]+?)\s*\|\s*f\s*$/gm) ?? [];
  for (const line of unaligned) {
    const name = line.match(/^\s+(Test [^\n|]+?)\s*\|/)?.[1];
    if (name) names.push(name.trim());
  }

  return [...new Set(names)];
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

      const names = failedAssertions(output);
      for (const name of names) console.log(`  ✗ ${name}`);

      // The error itself is what usually explains a suite that aborts: a
      // syntax error or a missing object stops the script at that point, so
      // the assertions after it never run.
      const stderr = error.stderr ? String(error.stderr) : '';
      const errorLine = stderr.split('\n').find((line) => /ERROR/i.test(line));
      if (errorLine) console.log(`  ${errorLine.trim()}`);

      console.log(output.split('\n').slice(-20).join('\n'));
      continue;
    }

    totalPassed += result.passed;
    totalFailed += result.failed;
    console.log(
      `${result.failed === 0 ? '✓' : '✗'} ${suite} — ${result.passed} passed, ${result.failed} failed`,
    );
    if (result.failed > 0) {
      const names = failedAssertions(result.output);
      if (names.length > 0) {
        for (const name of names) console.log(`  ✗ ${name}`);
      } else {
        console.log(result.output.split('\n').filter((line) => /\|\s+f$/.test(line)).join('\n'));
      }
    }
  }

  console.log(`\n${totalPassed} passed, ${totalFailed} failed`);
  if (totalFailed > 0) process.exit(1);
}

main();
