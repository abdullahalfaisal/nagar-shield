/**
 * Regenerates the Postgres mirror of the curated reference data from the
 * repo JSON — the single source of truth.
 *
 * The mobile bundle ships a byte-identical copy of the same JSON, so a
 * release can never ship a bundle that disagrees with the server.
 *
 * Usage:
 *   node tools/mirror-reference-data.cjs            # mirror to the local DB
 *   node tools/mirror-reference-data.cjs --check    # verify only, no writes
 *
 * The check mode is what CI runs: it fails the build if the mirror has
 * drifted from the JSON.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'packages', 'shared', 'src', 'data');
const STATIONS_FILE = path.join(DATA_DIR, 'stations.json');
const HOTLINES_FILE = path.join(DATA_DIR, 'hotlines.json');
const SEED_FILE = path.join(ROOT, 'supabase', 'seed.sql');

const CHECK_ONLY = process.argv.includes('--check');
const WRITE_SEED = process.argv.includes('--write-seed');

/** Bangladesh bounds — a station outside them is a data error, not a row. */
const BD_BOUNDS = { minLat: 20.5, maxLat: 26.7, minLng: 87.5, maxLng: 92.7 };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Build-time dataset validation. A missing or malformed field fails the
 * release with the offending entry id and the field named.
 */
function validateDataset(stations, hotlines) {
  const errors = [];

  const requireString = (entry, field, where) => {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      errors.push(`${where}: entry "${entry.id ?? '(no id)'}" is missing required field "${field}"`);
    }
  };

  for (const station of stations) {
    const where = 'stations.json';
    requireString(station, 'id', where);
    requireString(station, 'name', where);
    requireString(station, 'phone', where);
    if (!['police', 'hospital', 'fire'].includes(station.stationType)) {
      errors.push(`${where}: entry "${station.id}" has invalid stationType "${station.stationType}"`);
    }
    if (
      typeof station.lat !== 'number' ||
      typeof station.lng !== 'number' ||
      Number.isNaN(station.lat) ||
      Number.isNaN(station.lng)
    ) {
      errors.push(`${where}: entry "${station.id}" has invalid coordinates`);
    } else if (
      station.lat < BD_BOUNDS.minLat ||
      station.lat > BD_BOUNDS.maxLat ||
      station.lng < BD_BOUNDS.minLng ||
      station.lng > BD_BOUNDS.maxLng
    ) {
      errors.push(
        `${where}: entry "${station.id}" is outside Bangladesh's bounds ` +
          `(${station.lat}, ${station.lng})`,
      );
    }
    if (typeof station.isActive !== 'boolean') {
      errors.push(`${where}: entry "${station.id}" is missing required field "isActive"`);
    }
  }

  for (const hotline of hotlines) {
    const where = 'hotlines.json';
    requireString(hotline, 'id', where);
    requireString(hotline, 'name', where);
    requireString(hotline, 'phone', where);
    requireString(hotline, 'category', where);
    if (typeof hotline.sortOrder !== 'number') {
      errors.push(`${where}: entry "${hotline.id}" is missing required field "sortOrder"`);
    }
    if (typeof hotline.isActive !== 'boolean') {
      errors.push(`${where}: entry "${hotline.id}" is missing required field "isActive"`);
    }
    if (hotline.lastVerifiedAt === undefined) {
      errors.push(`${where}: entry "${hotline.id}" is missing required field "lastVerifiedAt"`);
    }
  }

  const ids = [...stations.map((s) => s.id), ...hotlines.map((h) => h.id)];
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    errors.push(`duplicate entry ids: ${[...new Set(duplicates)].join(', ')}`);
  }

  if (errors.length > 0) {
    console.error('Dataset validation failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}

/** The bundle size budget — FR-HELP / dataset acceptance criterion. */
const MAX_BUNDLE_BYTES = 100 * 1024;

function checkBundleSize() {
  const bytes = fs.statSync(STATIONS_FILE).size + fs.statSync(HOTLINES_FILE).size;
  if (bytes > MAX_BUNDLE_BYTES) {
    console.error(
      `Dataset adds ${bytes} bytes to the bundle — the budget is ${MAX_BUNDLE_BYTES} bytes.`,
    );
    process.exit(1);
  }
  console.log(`✓ Dataset size ${(bytes / 1024).toFixed(1)} KB (budget 100 KB)`);
}

/**
 * Runs SQL against the local Postgres container and returns stdout.
 * The connection details match `supabase status` for a local stack.
 */
function psql(sql) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_nagar-shield',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-F',
      '\t',
      '-c',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
}

/** Escapes a value for a single-quoted Postgres literal. */
function quote(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Builds the `supabase/seed.sql` body from the JSON.
 *
 * The seed is a GENERATED artefact, not a hand-written file: the JSON is the
 * single source of truth, and a hand-edited seed would drift from the mobile
 * bundle. `supabase db reset` runs the seed, so every clone gets the same
 * curated reference data without a network call.
 */
function buildSeedFile(stations, hotlines) {
  const stationRows = stations.map(
    (station) =>
      `  (${quote(station.id)}, ${quote(station.stationType)}::public.station_type, ${quote(
        station.name,
      )}, ${quote(station.nameBn ?? null)}, ${quote(station.phone)}, ${Number(station.lat)}, ${Number(
        station.lng,
      )}, ${quote(station.address ?? null)}, ${station.isActive})`,
  );

  const hotlineRows = hotlines.map(
    (hotline) =>
      `  (${quote(hotline.id)}, ${quote(hotline.name)}, ${quote(hotline.nameBn ?? null)}, ${quote(
        hotline.phone,
      )}, ${quote(hotline.category)}, ${quote(hotline.description ?? null)}, ${Number(
        hotline.sortOrder,
      )}, ${hotline.isActive}, ${quote(hotline.lastVerifiedAt)}::timestamptz)`,
  );

  return `-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/seed.sql
--
-- The curated station and hotline directory.
--
-- The JSON in \`packages/shared/src/data/\` is the single source of truth — the
-- mobile bundle ships a byte-identical copy. This file is the Postgres mirror
-- of that JSON, and it is GENERATED by \`node tools/mirror-reference-data.cjs
-- --write-seed\`. Never hand-edit it: edit the JSON and regenerate, or the
-- \`--check\` drift guard will fail the build.
--
-- Why a seed file and not a migration: the dataset changes on a curation
-- cadence (a station's phone number changes, a station is retired), not on a
-- schema cadence. Seeding it means \`supabase db reset\` always produces the
-- same reference data, and a production deploy never rewrites curated rows.
--
-- \`supabase db reset\` runs this file automatically after the migrations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Stations
-- -----------------------------------------------------------------------------

insert into public.stations (id, station_type, name, name_bn, phone, lat, lng, address, is_active)
values
${stationRows.join(',\n')}
on conflict (id) do update set
  station_type = excluded.station_type,
  name = excluded.name,
  name_bn = excluded.name_bn,
  phone = excluded.phone,
  lat = excluded.lat,
  lng = excluded.lng,
  address = excluded.address,
  is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- Hotlines
-- -----------------------------------------------------------------------------

insert into public.hotlines (id, name, name_bn, phone, category, description, sort_order, is_active, last_verified_at)
values
${hotlineRows.join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  name_bn = excluded.name_bn,
  phone = excluded.phone,
  category = excluded.category,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  last_verified_at = excluded.last_verified_at;
`;
}

function upsertStatements(stations, hotlines) {
  const statements = [];

  for (const station of stations) {
    statements.push(
      `insert into public.stations (id, station_type, name, name_bn, phone, lat, lng, address, is_active)
       values (${quote(station.id)}, ${quote(station.stationType)}::public.station_type, ${quote(
         station.name,
       )}, ${quote(station.nameBn ?? null)}, ${quote(station.phone)}, ${Number(station.lat)}, ${Number(
         station.lng,
       )}, ${quote(station.address ?? null)}, ${station.isActive})
       on conflict (id) do update set
         station_type = excluded.station_type,
         name = excluded.name,
         name_bn = excluded.name_bn,
         phone = excluded.phone,
         lat = excluded.lat,
         lng = excluded.lng,
         address = excluded.address,
         is_active = excluded.is_active;`,
    );
  }

  for (const hotline of hotlines) {
    statements.push(
      `insert into public.hotlines (id, name, name_bn, phone, category, description, sort_order, is_active, last_verified_at)
       values (${quote(hotline.id)}, ${quote(hotline.name)}, ${quote(
         hotline.nameBn ?? null,
       )}, ${quote(hotline.phone)}, ${quote(hotline.category)}, ${quote(
         hotline.description ?? null,
       )}, ${Number(hotline.sortOrder)}, ${hotline.isActive}, ${quote(hotline.lastVerifiedAt)}::timestamptz)
       on conflict (id) do update set
         name = excluded.name,
         name_bn = excluded.name_bn,
         phone = excluded.phone,
         category = excluded.category,
         description = excluded.description,
         sort_order = excluded.sort_order,
         is_active = excluded.is_active,
         last_verified_at = excluded.last_verified_at;`,
    );
  }

  return statements;
}

/**
 * The mirror check compares the live rows against the JSON. A retired JSON
 * entry that is still active in the database is drift, and so is the reverse.
 */
function checkDrift(stations, hotlines) {
  const problems = [];

  const liveStations = psql(
    "select id::text || '|' || station_type || '|' || name || '|' || phone || '|' || lat || '|' || lng || '|' || is_active from public.stations order by 1;",
  )
    .split('\n')
    .filter(Boolean);

  const liveHotlines = psql(
    "select id::text || '|' || name || '|' || phone || '|' || category || '|' || sort_order || '|' || is_active from public.hotlines order by 1;",
  )
    .split('\n')
    .filter(Boolean);

  const expectedStationIds = new Set(stations.map((s) => s.id));
  const expectedHotlineIds = new Set(hotlines.map((h) => h.id));

  for (const line of liveStations) {
    const id = line.split('|')[0];
    if (!expectedStationIds.has(id)) {
      problems.push(`stations: row "${id}" exists in the database but not in the JSON`);
    }
  }
  for (const line of liveHotlines) {
    const id = line.split('|')[0];
    if (!expectedHotlineIds.has(id)) {
      problems.push(`hotlines: row "${id}" exists in the database but not in the JSON`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`  - ${problem}`);
    return false;
  }
  return true;
}

function main() {
  const stationsPayload = readJson(STATIONS_FILE);
  const hotlinesPayload = readJson(HOTLINES_FILE);

  validateDataset(stationsPayload.stations, hotlinesPayload.hotlines);
  checkBundleSize();
  console.log(
    `✓ Dataset valid — ${stationsPayload.stations.length} stations, ${hotlinesPayload.hotlines.length} hotlines`,
  );

  if (WRITE_SEED) {
    const seed = buildSeedFile(stationsPayload.stations, hotlinesPayload.hotlines);
    fs.writeFileSync(SEED_FILE, seed, 'utf8');
    console.log(`✓ Wrote ${path.relative(ROOT, SEED_FILE)}`);
    return;
  }

  if (CHECK_ONLY) {
    const seed = buildSeedFile(stationsPayload.stations, hotlinesPayload.hotlines);
    const committed = fs.existsSync(SEED_FILE) ? fs.readFileSync(SEED_FILE, 'utf8') : '';
    if (committed !== seed) {
      console.error(
        'supabase/seed.sql has drifted from the JSON. Re-run with --write-seed.',
      );
      process.exit(1);
    }
    console.log('✓ supabase/seed.sql matches the JSON');

    const ok = checkDrift(stationsPayload.stations, hotlinesPayload.hotlines);
    if (!ok) {
      console.error('The Postgres mirror has drifted from the JSON. Re-run without --check.');
      process.exit(1);
    }
    console.log('✓ The Postgres mirror matches the JSON');
    return;
  }

  const statements = upsertStatements(stationsPayload.stations, hotlinesPayload.hotlines);
  psql(statements.join('\n'));
  console.log(`✓ Mirrored ${statements.length} rows into Postgres`);
}

main();
