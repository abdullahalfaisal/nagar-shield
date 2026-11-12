/**
 * An integration smoke test for the Edge Functions.
 *
 * The SQL suites test the database and `tools/smoke-rpc.cjs` tests the
 * PostgREST surface. This tests the **Edge Function** surface:
 *
 *   * the job endpoints refuse an anon / citizen bearer (service-role only)
 *   * the moderator endpoints refuse a citizen bearer
 *   * a moderator's decision reaches the append-only audit trail
 *   * `finalize_capture` is idempotent and stores the resolved area
 *   * the dry run of the media purge deletes nothing
 *
 * Usage: node tools/smoke-functions.cjs
 */

'use strict';

const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const API_URL = 'http://127.0.0.1:54321';
const CONTAINER = 'supabase_db_nagar-shield';

const DEV_PASSWORD = 'nagar-local-dev';
const MODERATOR_EMAIL = 'mod@nagar.local';
const CITIZEN_EMAIL = 'citizen@nagar.local';

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

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

/** Reads a scalar out of the local database as the table owner. */
function queryScalar(sql) {
  const output = execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  );
  return output.trim();
}

async function signIn(email, password) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: localEnv().anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  return body.access_token ?? null;
}

async function callFunction(name, body, bearer) {
  const response = await fetch(`${API_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: localEnv().anonKey,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed, text };
}

async function main() {
  const { anonKey, serviceRoleKey } = localEnv();

  const moderatorToken = await signIn(MODERATOR_EMAIL, DEV_PASSWORD);
  const citizenToken = await signIn(CITIZEN_EMAIL, DEV_PASSWORD);

  record('the moderator can sign in', Boolean(moderatorToken));
  record('the citizen can sign in', Boolean(citizenToken));

  // ---------------------------------------------------------------------
  // 1. The job endpoints are service-role only.
  // ---------------------------------------------------------------------

  const anonPurge = await callFunction('purge-media', {}, anonKey);
  record(
    'the media purge refuses an anon bearer',
    anonPurge.status === 401 || anonPurge.status === 403,
    `HTTP ${anonPurge.status}`,
  );

  const citizenPurge = await callFunction('purge-media', {}, citizenToken ?? '');
  record(
    'the media purge refuses a citizen bearer',
    citizenPurge.status === 401 || citizenPurge.status === 403,
    `HTTP ${citizenPurge.status}`,
  );

  const anonCleanup = await callFunction('cleanup-geocode-cache', {}, anonKey);
  record(
    'the cache cleanup refuses an anon bearer',
    anonCleanup.status === 401 || anonCleanup.status === 403,
    `HTTP ${anonCleanup.status}`,
  );

  const anonAccountPurge = await callFunction('purge-deleted-accounts', {}, anonKey);
  record(
    'the account purge refuses an anon bearer',
    anonAccountPurge.status === 401 || anonAccountPurge.status === 403,
    `HTTP ${anonAccountPurge.status}`,
  );

  const anonHeartbeat = await callFunction('keep-project-awake', {}, anonKey);
  record(
    'the heartbeat refuses an anon bearer',
    anonHeartbeat.status === 401 || anonHeartbeat.status === 403,
    `HTTP ${anonHeartbeat.status}`,
  );

  // ---------------------------------------------------------------------
  // 2. The job runs with the service-role bearer and writes one audit row.
  // ---------------------------------------------------------------------

  const runsBefore = Number(queryScalar("select count(*) from public.job_runs;"));
  const cleanup = await callFunction('cleanup-geocode-cache', {}, serviceRoleKey);
  record(
    'the cache cleanup runs with the service-role bearer',
    cleanup.status === 200 && cleanup.body?.data?.job_name === 'cleanup_geocode_cache',
    `HTTP ${cleanup.status}`,
  );

  const runsAfter = Number(queryScalar("select count(*) from public.job_runs;"));
  record(
    'the job wrote exactly one job_runs row',
    runsAfter === runsBefore + 1,
    `${runsBefore} → ${runsAfter}`,
  );

  const lastRun = queryScalar(
    "select status from public.job_runs order by started_at desc limit 1;",
  );
  record('the job closed its run row as succeeded', lastRun === 'succeeded', lastRun);

  // The heartbeat is the fourth job: it must answer, and it must write its own
  // audit row — a missing heartbeat row is the signal that the project would
  // have paused on inactivity.
  const heartbeatRunsBefore = Number(
    queryScalar("select count(*) from public.job_runs where job_name = 'keep_project_awake';"),
  );
  const heartbeat = await callFunction('keep-project-awake', {}, serviceRoleKey);
  const heartbeatRunsAfter = Number(
    queryScalar("select count(*) from public.job_runs where job_name = 'keep_project_awake';"),
  );

  record(
    'the heartbeat runs with the service-role bearer',
    heartbeat.status === 200 && heartbeat.body?.data?.job_name === 'keep_project_awake',
    `HTTP ${heartbeat.status}`,
  );
  record(
    'the heartbeat wrote its own audit row',
    heartbeatRunsAfter === heartbeatRunsBefore + 1,
    `${heartbeatRunsBefore} → ${heartbeatRunsAfter}`,
  );

  // ---------------------------------------------------------------------
  // 3. The media purge's dry run deletes nothing.
  // ---------------------------------------------------------------------

  const mediaBefore = queryScalar('select count(*) from public.report_media;');
  const dryRun = await callFunction('purge-media', { dry_run: true }, serviceRoleKey);
  const mediaAfter = queryScalar('select count(*) from public.report_media;');

  record(
    'the media purge answers a dry run',
    dryRun.status === 200 && dryRun.body?.data?.dry_run === true,
    `HTTP ${dryRun.status}`,
  );
  record('the dry run deleted nothing', mediaBefore === mediaAfter, `${mediaBefore} → ${mediaAfter}`);

  // A dry run must close its own `job_runs` row. A row left `running` shows
  // up in the runbook's monitor stage as a job that died mid-flight.
  const staleRuns = queryScalar(
    "select count(*) from public.job_runs where status = 'running' and finished_at is null;",
  );
  record(
    'the dry run closed its own audit row',
    Number(staleRuns) === 0,
    `${staleRuns} stale row(s)`,
  );

  // ---------------------------------------------------------------------
  // 4. The moderator endpoints refuse a citizen.
  // ---------------------------------------------------------------------

  const citizenDecide = await callFunction(
    'moderation-decide',
    {
      report_id: '22222222-2222-2222-2222-222222222201',
      decision: 'remove',
      note: 'citizen attempt',
    },
    citizenToken ?? '',
  );
  record(
    'a citizen cannot call moderation-decide',
    citizenDecide.status === 401 || citizenDecide.status === 403,
    `HTTP ${citizenDecide.status}`,
  );

  const citizenDisable = await callFunction(
    'disable-user',
    { user_id: '11111111-1111-1111-1111-1111111111a3', note: 'citizen attempt' },
    citizenToken ?? '',
  );
  record(
    'a citizen cannot call disable-user',
    citizenDisable.status === 401 || citizenDisable.status === 403,
    `HTTP ${citizenDisable.status}`,
  );

  const anonDisable = await callFunction(
    'disable-user',
    { user_id: '11111111-1111-1111-1111-1111111111a3', note: 'anon attempt' },
    anonKey,
  );
  record(
    'an anon cannot call disable-user',
    anonDisable.status === 401 || anonDisable.status === 403,
    `HTTP ${anonDisable.status}`,
  );

  // ---------------------------------------------------------------------
  // 5. finalize_capture — idempotent, and the area is stored.
  // ---------------------------------------------------------------------

  // The idempotency key is **fresh on every run**. A fixed key would make the
  // second run of this suite replay the first run's report — which the
  // moderation step below has already removed — so the replay would return
  // `moderation_status = 'removed'` and the suite would fail on a suite that
  // is behaving correctly. A fresh key per run keeps the idempotency check
  // honest (the retry below still uses the same key) and keeps the suite
  // re-runnable on a working database.
  const clientRequestId = randomUUID();
  const payload = {
    client_request_id: clientRequestId,
    storage_path: `reports/11111111-1111-1111-1111-1111111111a1/${clientRequestId}.jpg`,
    media_type: 'photo',
    byte_size: 2048,
    duration_seconds: null,
    width: 800,
    height: 600,
    lat: 23.7461,
    lng: 90.3774,
    captured_at: new Date().toISOString(),
    description: 'edge function smoke test',
    public_visibility: 'anonymous',
    category: 'theft',
  };

  const first = await callFunction('finalize-capture', payload, citizenToken ?? '');
  record(
    'finalize-capture accepts a valid payload',
    first.status === 200 && Boolean(first.body?.data?.report_id),
    `HTTP ${first.status}`,
  );
  record(
    'the response carries the area hierarchy and the moderation status',
    Boolean(first.body?.data?.area_hierarchy) && first.body?.data?.moderation_status === 'visible',
  );

  const second = await callFunction('finalize-capture', payload, citizenToken ?? '');
  record(
    'finalize-capture is idempotent',
    second.status === 200 && second.body?.data?.report_id === first.body?.data?.report_id,
    `${first.body?.data?.report_id} vs ${second.body?.data?.report_id}`,
  );

  const reportRows = queryScalar(
    `select count(*) from public.reports where client_request_id = '${clientRequestId}';`,
  );
  record('the retried submit created exactly one report row', reportRows === '1', reportRows);

  const mediaRows = queryScalar(
    `select count(*) from public.report_media rm
     join public.reports r on r.id = rm.report_id
     where r.client_request_id = '${clientRequestId}';`,
  );
  record('the retried submit created exactly one media row', mediaRows === '1', mediaRows);

  const storedArea = queryScalar(
    `select r.area_hierarchy ->> 'division' from public.reports r
     where r.client_request_id = '${clientRequestId}';`,
  );
  record('the resolved area was stored on the report', storedArea === 'Dhaka', storedArea);

  // A storage path that belongs to another user is refused.
  const foreignPath = await callFunction(
    'finalize-capture',
    {
      ...payload,
      client_request_id: '77777777-7777-4777-8777-777777777702',
      storage_path: 'reports/11111111-1111-1111-1111-1111111111a3/foreign.jpg',
    },
    citizenToken ?? '',
  );
  record(
    'a foreign storage path is refused',
    foreignPath.status === 403,
    `HTTP ${foreignPath.status}`,
  );

  // An invalid payload is refused by the shared Zod schema.
  const invalid = await callFunction(
    'finalize-capture',
    { ...payload, client_request_id: 'not-a-uuid' },
    citizenToken ?? '',
  );
  record(
    'an invalid payload is refused with VALIDATION_FAILED',
    invalid.status === 400 && invalid.body?.error?.code === 'VALIDATION_FAILED',
    `HTTP ${invalid.status} ${invalid.body?.error?.code ?? ''}`,
  );

  // A description over the cap is refused.
  const tooLong = await callFunction(
    'finalize-capture',
    { ...payload, client_request_id: '77777777-7777-4777-8777-777777777703', description: 'x'.repeat(141) },
    citizenToken ?? '',
  );
  record(
    'a 141-character description is refused',
    tooLong.status === 400,
    `HTTP ${tooLong.status}`,
  );

  // A media file over the cap is refused.
  const tooLarge = await callFunction(
    'finalize-capture',
    { ...payload, client_request_id: '77777777-7777-4777-8777-777777777704', byte_size: 20_000_000 },
    citizenToken ?? '',
  );
  record(
    'an oversized media file is refused with MEDIA_TOO_LARGE',
    tooLarge.status === 413 && tooLarge.body?.error?.code === 'MEDIA_TOO_LARGE',
    `HTTP ${tooLarge.status} ${tooLarge.body?.error?.code ?? ''}`,
  );

  // ---------------------------------------------------------------------
  // 6. The moderator's decision lands in the append-only audit trail.
  // ---------------------------------------------------------------------

  // The report the capture created above is the one the moderator acts on.
  // Picking "any visible report" instead would make the test consume the
  // seed data: the first run would remove the only visible report and every
  // later run would find nothing to moderate.
  const targetReport = first.body?.data?.report_id ?? '';

  if (targetReport) {
    const decide = await callFunction(
      'moderation-decide',
      { report_id: targetReport, decision: 'remove', note: 'edge function smoke test' },
      moderatorToken ?? '',
    );
    record(
      'a moderator can call moderation-decide',
      decide.status === 200,
      `HTTP ${decide.status}`,
    );

    // The count is scoped to THIS run's report. A fixed note would accumulate
    // one row per run — the trail is append-only, so the count only grows —
    // and the assertion would fail on the second run against a perfectly
    // correct trail.
    const auditRows = queryScalar(
      `select count(*) from public.moderation_actions
       where report_id = '${targetReport}' and note = 'edge function smoke test';`,
    );
    record('the decision wrote an append-only audit row', auditRows === '1', auditRows);

    const status = queryScalar(
      `select moderation_status from public.reports where id = '${targetReport}';`,
    );
    record('the report is now removed', status === 'removed', status);
  } else {
    record('a moderator can call moderation-decide', false, 'no visible report to act on');
  }

  // A moderator cannot disable themselves.
  const selfDisable = await callFunction(
    'disable-user',
    { user_id: '11111111-1111-1111-1111-1111111111a2', note: 'self attempt' },
    moderatorToken ?? '',
  );
  record(
    'a moderator cannot disable their own account',
    selfDisable.status === 403,
    `HTTP ${selfDisable.status}`,
  );

  finish();
}

function finish() {
  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length}/${results.length} Edge Function checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
