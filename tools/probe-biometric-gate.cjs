/**
 * Probes the biometric failure accounting over the real PostgREST path.
 *
 * The SQL suite (`supabase/tests/read_models.sql`, Test 6) proves the
 * thresholds inside Postgres. This proves the door the app actually uses:
 * the client calls `record_biometric_attempt` over REST, and the answer it
 * gets back is what the gate screen renders. The thresholds the PRD fixes
 * (FR-AUTH-5) have to hold over that door, not just in the function body.
 *
 * It also checks the two rules that are easy to get wrong:
 *
 *   * a **success** clears the counter — a user who gets in with a
 *     fingerprint must not carry the previous failures forward;
 *   * the auto-disable at 5 failures actually clears `biometric_opt_in`, so
 *     the gate stops being offered on the next launch.
 *
 * Usage: node tools/probe-biometric-gate.cjs
 */

'use strict';

const { execFileSync } = require('node:child_process');

const API_URL = 'http://127.0.0.1:54321';
const DEV_PASSWORD = 'nagar-local-dev';
const PROBE_EMAIL = 'biometric-probe@nagar.local';
const PROBE_PHONE = '+8801911000010';

/** The thresholds the PRD fixes (FR-AUTH-5). */
const FAILS_TO_PASSWORD = 3;
const FAILS_TO_DISABLE = 5;

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

const { anonKey, serviceRoleKey } = localEnv();

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email, password) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, token: body.access_token, body };
}

async function postRpc(name, body, token) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  return { status: response.status, text, parsed };
}

async function patchProfile(userId, changes, token) {
  const response = await fetch(`${API_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(changes),
  });
  const text = await response.text();
  let parsed = [];
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = [];
  }
  return { status: response.status, text, parsed };
}

async function getProfile(userId, token) {
  const response = await fetch(`${API_URL}/rest/v1/profiles?id=eq.${userId}&select=biometric_opt_in,biometric_fail_count`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let parsed = [];
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = [];
  }
  return { status: response.status, parsed };
}

/**
 * Creates the probe account and opts it into biometric sign-in.
 *
 * The seed has no account with `biometric_opt_in` set, and the flag is
 * client-owned, so the probe sets it through the same client path the
 * Settings screen uses.
 */
async function ensureProbeAccount() {
  const adminHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  const list = await fetch(`${API_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: adminHeaders,
  });
  const listBody = await list.json().catch(() => ({}));
  const existing = (listBody.users ?? []).find((u) => u.email === PROBE_EMAIL);

  let userId = existing?.id;

  if (!userId) {
    const created = await fetch(`${API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email: PROBE_EMAIL,
        password: DEV_PASSWORD,
        email_confirm: true,
        // The signup trigger builds `profiles` from the Auth identity, and
        // a profile without a phone is refused (PHONE_REQUIRED).
        user_metadata: { phone: PROBE_PHONE },
      }),
    });

    if (created.status === 200) {
      const body = await created.json().catch(() => ({}));
      userId = body.id || '';
    }
  }

  return userId;
}

async function main() {
  const userId = await ensureProbeAccount();

  if (!userId) {
    console.log('✗ could not create or find the probe account');
    process.exit(1);
  }

  const signedIn = await signIn(PROBE_EMAIL, DEV_PASSWORD);
  if (signedIn.status !== 200) {
    console.log(`✗ the probe account cannot sign in — HTTP ${signedIn.status}`);
    process.exit(1);
  }
  const token = signedIn.token;

  // Opt in, the way the Settings screen does.
  const optIn = await patchProfile(userId, { biometric_opt_in: true }, token);
  record(
    'a client can opt into biometric sign-in',
    optIn.status === 200,
    `HTTP ${optIn.status}`,
  );

  // (1) A success reports a clean counter.
  const success = await postRpc('record_biometric_attempt', { p_success: true }, token);
  const successBody = success.parsed || {};
  record(
    'a successful attempt reports a zero failure count',
    success.status === 200 && successBody.fail_count === 0,
    `HTTP ${success.status} fail_count=${successBody.fail_count}`,
  );

  // (2) Two failures stay under the password threshold.
  const fail1 = await postRpc('record_biometric_attempt', { p_success: false }, token);
  const fail2 = await postRpc('record_biometric_attempt', { p_success: false }, token);
  const fail2Body = fail2.parsed || {};
  record(
    'two failures do not yet fall back to the password',
    fail2.status === 200 &&
      fail2Body.fail_count === 2 &&
      !fail2Body.fallback &&
      fail2Body.biometric_enabled === true,
    `fail_count=${fail2Body.fail_count} fallback=${fail2Body.fallback}`,
  );

  // (3) The third failure crosses the password threshold.
  const fail3 = await postRpc('record_biometric_attempt', { p_success: false }, token);
  const fail3Body = fail3.parsed || {};
  record(
    `the ${FAILS_TO_PASSWORD}rd failure falls back to the password`,
    fail3.status === 200 &&
      fail3Body.fail_count === FAILS_TO_PASSWORD &&
      fail3Body.fallback === 'password',
    `fail_count=${fail3Body.fail_count} fallback=${fail3Body.fallback}`,
  );

  // (4) The fifth failure auto-disables biometric sign-in.
  const fail4 = await postRpc('record_biometric_attempt', { p_success: false }, token);
  const fail5 = await postRpc('record_biometric_attempt', { p_success: false }, token);
  const fail5Body = fail5.parsed || {};
  record(
    `the ${FAILS_TO_DISABLE}th failure auto-disables biometric sign-in`,
    fail5.status === 200 &&
      fail5Body.fail_count === FAILS_TO_DISABLE &&
      fail5Body.biometric_enabled === false,
    `fail_count=${fail5Body.fail_count} enabled=${fail5Body.biometric_enabled}`,
  );

  // (5) The auto-disable is durable — it is written to the profile.
  const afterDisable = await getProfile(userId, token);
  const row = afterDisable.parsed[0] || {};
  record(
    'the auto-disable is persisted to the profile',
    afterDisable.status === 200 && row.biometric_opt_in === false,
    `biometric_opt_in=${row.biometric_opt_in}`,
  );

  // (6) A success clears the counter and re-enables nothing the user did
  //     not ask for — it clears the count, it does not re-enable biometric.
  const reset = await postRpc('record_biometric_attempt', { p_success: true }, token);
  const resetBody = reset.parsed || {};
  const afterReset = await getProfile(userId, token);
  const resetRow = afterReset.parsed[0] || {};
  record(
    'a success clears the failure count',
    reset.status === 200 &&
      resetBody.fail_count === 0 &&
      resetRow.biometric_fail_count === 0,
    `fail_count=${resetBody.fail_count}`,
  );

  record(
    'a success does not silently re-enable biometric sign-in',
    resetRow.biometric_opt_in === false,
    `biometric_opt_in=${resetRow.biometric_opt_in}`,
  );

  // (7) The account can opt back in — the auto-disable is not a life
  //     sentence, and the Settings toggle has to work afterwards.
  const optBackIn = await patchProfile(userId, { biometric_opt_in: true }, token);
  record(
    'the account can opt back in after an auto-disable',
    optBackIn.status === 200,
    `HTTP ${optBackIn.status}`,
  );

  // (8) An anonymous caller cannot use the RPC — the accounting is bound to
  //     the signed-in user.
  const anon = await postRpc('record_biometric_attempt', { p_success: false }, null);
  record(
    'an anonymous caller cannot record an attempt',
    anon.status === 401 || anon.status === 403,
    `HTTP ${anon.status}`,
  );

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} biometric-gate probes passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
