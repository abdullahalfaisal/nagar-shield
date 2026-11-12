/**
 * Applies every migration in `supabase/migrations/` to the local Postgres
 * container, in filename order.
 *
 * The migrations are written to be re-runnable:
 * `20261105000000_pre_migration_legacy.sql` drops the canonical objects first,
 * so running the whole chain twice leaves the same schema as running it once.
 *
 * Usage:
 *   node tools/apply-migrations.cjs
 *   node tools/apply-migrations.cjs --file 20261105000003_functions.sql   # one file
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_nagar-shield';

function psql(sql, { onErrorStop = true } = {}) {
  const args = [
    'exec',
    '-i',
    CONTAINER,
    'psql',
    '-v',
    `ON_ERROR_STOP=${onErrorStop ? 1 : 0}`,
    '-U',
    'postgres',
    '-d',
    'postgres',
  ];
  return execFileSync('docker', args, {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function main() {
  const singleFileIndex = process.argv.indexOf('--file');
  const files =
    singleFileIndex !== -1
      ? [process.argv[singleFileIndex + 1]]
      : fs
          .readdirSync(MIGRATIONS_DIR)
          .filter((name) => name.endsWith('.sql'))
          .sort();

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    process.stdout.write(`→ ${file} … `);
    try {
      psql(sql);
      recordMigration(file);
      process.stdout.write('ok\n');
    } catch (error) {
      process.stdout.write('FAILED\n');
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
      console.error(output);
      process.exit(1);
    }
  }

  console.log(`\n✓ Applied ${files.length} migration(s)`);

  // The reference data is a MIRROR of the repo JSON, not a hand-written seed.
  // The migrations recreate the tables, so the mirror is re-applied here —
  // that way the schema and the curated data can never drift apart.
  if (!process.argv.includes('--skip-mirror')) {
    console.log('→ mirroring the curated reference data …');
    execFileSync('node', [path.join(__dirname, 'mirror-reference-data.cjs')], {
      stdio: 'inherit',
    });
  }
}

/**
 * Records a migration in the Supabase migration ledger.
 *
 * The tool applies the SQL directly rather than going through
 * `supabase db push`, so the ledger is written here. Without it the ledger
 * drifts from the repo and the release-verification drift check has nothing
 * to compare against.
 */
function recordMigration(file) {
  const version = file.split('_')[0];
  const name = file.replace(/\.sql$/, '');

  psql(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ('${version}', '${name}', array[]::text[])
     on conflict (version) do update
       set name = excluded.name;`,
  );
}

main();
