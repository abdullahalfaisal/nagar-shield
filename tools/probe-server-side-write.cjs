/**
 * A negative security probe for `public.server_side_write`.
 *
 * `server_side_write` is SECURITY DEFINER and executes a caller-supplied
 * statement. Postgres grants EXECUTE on a new function to PUBLIC by default,
 * so unless the function is revoked it is reachable over PostgREST by the
 * **anon** key — which would let any caller run arbitrary SQL as the table
 * owner and bypass every RLS policy in the database.
 *
 * The probe is deliberately reversible: it writes a marker row through the
 * function and then removes it again. If the anon key can do that, the hole
 * is real.
 *
 * Usage: node tools/probe-server-side-write.cjs
 */

'use strict';

const { execFileSync } = require('node:child_process');

const API_URL = 'http://127.0.0.1:54321';
const CONTAINER = 'supabase_db_nagar-shield';
const MARKER = '00000000-0000-4000-8000-00000000feed';

function localEnv() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  });
  const read = (key) => {
    const match = output.match(new RegExp(`${key}="([^"]+)"`));
    return match ? match[1] : '';
  };
  return { anonKey: read('ANON_KEY'), serviceRoleKey: read('SERVICE_ROLE_KEY') };
}

async function callRpc(key, statement) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/server_side_write`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ statement }),
  });
  const text = await response.text();
  return { status: response.status, text };
}

/** Reads the marker row straight from Postgres, as the table owner. */
function readMarkerFromDatabase() {
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
      '-t',
      '-A',
      '-c',
      `select count(*) from public.reports where client_request_id = '${MARKER}';`,
    ],
    { encoding: 'utf8' },
  );
  return Number(output.trim());
}

async function main() {
  const { anonKey } = localEnv();

  // Clean up any residue from an earlier run.
  await callRpc(anonKey, `delete from public.reports where client_request_id = '${MARKER}'`);
  console.log(`residue before the probe: ${readMarkerFromDatabase()} row(s)`);

  const write = await callRpc(
    anonKey,
    `insert into public.reports (author_id, client_request_id, lat, lng)
     values ('11111111-1111-1111-1111-1111111111a1', '${MARKER}', 23.7, 90.3)`,
  );
  console.log(`anon write → HTTP ${write.status}: ${write.text.slice(0, 300)}`);

  const persisted = readMarkerFromDatabase();
  console.log(`marker rows after the anon write: ${persisted}`);

  // Always clean up.
  await callRpc(anonKey, `delete from public.reports where client_request_id = '${MARKER}'`);
  console.log(`marker rows after cleanup: ${readMarkerFromDatabase()}`);

  const escaped = persisted > 0;
  console.log(
    escaped
      ? '\nFAIL: the anon key wrote a report through server_side_write — arbitrary SQL as the owner.'
      : '\nOK: the anon key cannot write through server_side_write.',
  );

  process.exit(escaped ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
