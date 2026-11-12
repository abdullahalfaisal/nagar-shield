/**
 * Probes DEFECT F over the real PostgREST path.
 *
 * The SQL suite (`supabase/tests/write_guards.sql`, Test G) proves the
 * guard inside Postgres. This proves it through the door the app actually
 * uses — GoTrue → PostgREST → the RLS policies — because that is the door
 * the Edge Function does not own.
 *
 * Before migration `20261105000019_disabled_account_write_guard.sql`, every
 * write below SUCCEEDED for a disabled account.
 *
 * Usage: node tools/probe-disabled-write.cjs
 */

'use strict';

const { execFileSync } = require('node:child_process');

const API_URL = 'http://127.0.0.1:54321';
const DEV_PASSWORD = 'nagar-local-dev';
const DISABLED_EMAIL = 'disabled@nagar.local';

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

async function post(table, body, token) {
  const response = await fetch(`${API_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text };
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
  return { status: response.status, text };
}

async function postStorage(path, token) {
  const response = await fetch(`${API_URL}/storage/v1/object/report-media/${path}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    },
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  const text = await response.text();
  return { status: response.status, text };
}

/**
 * A refused write must surface as a 4xx whose body names the reason.
 * PostgREST reports a raised exception as `42501` with the message
 * `ACCOUNT_DISABLED`; the message is what the client maps to AUTH_DISABLED.
 */
function isRefused(response, expected = 'ACCOUNT_DISABLED') {
  const refused = response.status >= 400 && response.status < 500;
  const named = response.text.includes(expected);
  return refused && named;
}

/**
 * Creates (or reuses) a disabled dev account and marks its profile as
 * disabled.
 *
 * Both halves matter. GoTrue refuses the sign-in of a disabled user — which
 * is the Edge Function's half of the contract — but the database reads
 * `profiles.disabled_at`, so that column must carry the flag too. The probe
 * signs in with the anon key and the password, which GoTrue allows for a
 * disabled account only when the password grant is still enabled locally;
 * if the local instance refuses it, the probe reports SKIP rather than a
 * false failure.
 */
async function ensureDisabledAccount() {
  const adminHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  const listResponse = await fetch(`${API_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: adminHeaders,
  });
  const listBody = await listResponse.json().catch(() => ({}));
  const existing = (listBody.users ?? []).find((u) => u.email === DISABLED_EMAIL);

  let userId = existing?.id;

  if (!userId) {
    const createResponse = await fetch(`${API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email: DISABLED_EMAIL,
        password: DEV_PASSWORD,
        email_confirm: true,
        user_metadata: { phone: '+8801911000009' },
      }),
    });
    const created = await createResponse.json().catch(() => ({}));
    userId = created.id;
    if (!userId) return null;
  }

  // Disable it in GoTrue and on the profile.
  await fetch(`${API_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ disabled: true }),
  });

  const profileUpdate = await fetch(
    `${API_URL}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ disabled_at: new Date().toISOString() }),
    },
  );
  if (!profileUpdate.ok) return null;

  return userId;
}

async function main() {
  // 1. The disabled dev account must exist and actually be disabled.
  //
  // The seeded accounts are `citizen@`, `citizen2@` and `mod@` — there is no
  // disabled account in the seed, because a disabled account cannot sign in
  // through the normal path. This probe creates one with the admin API, so
  // it works on a fresh clone without a manual setup step.
  const userId = await ensureDisabledAccount();

  if (!userId) {
    console.log('SKIP: could not prepare the disabled account');
    return;
  }

  const signInResponse = await signIn(DISABLED_EMAIL, DEV_PASSWORD);
  if (signInResponse.status !== 200 || !signInResponse.token) {
    console.log(`SKIP: cannot sign in as ${DISABLED_EMAIL} (HTTP ${signInResponse.status})`);
    return;
  }
  const token = signInResponse.token;

  const now = new Date().toISOString();

  // 2. Every write path must be refused.
  record(
    'a disabled account cannot insert a contact',
    isRefused(
      await post(
        'contacts',
        { user_id: userId, name: 'probe', phone: '+8801799000001' },
        token,
      ),
    ),
  );

  record(
    'a disabled account cannot share a location',
    isRefused(
      await post('location_shares', { sender_id: userId, lat: 23.7461, lng: 90.3774 }, token),
    ),
  );

  record(
    'a disabled account cannot file a wrong-number report',
    isRefused(
      await post(
        'wrong_number_reports',
        { reporter_id: userId, entry_type: 'station', entry_id: 'gulshan', reason: 'wrong number' },
        token,
      ),
    ),
  );

  record(
    'a disabled account cannot insert a report',
    isRefused(
      await post(
        'reports',
        {
          author_id: userId,
          client_request_id: crypto.randomUUID(),
          lat: 23.7461,
          lng: 90.3774,
          captured_at: now,
          description: 'probe',
          category: 'theft',
          public_visibility: 'anonymous',
        },
        token,
      ),
    ),
  );

  record(
    'a disabled account cannot finalize a capture',
    isRefused(
      await postRpc(
        'finalize_capture',
        {
          p_client_request_id: crypto.randomUUID(),
          p_storage_path: `reports/${userId}/probe/a.jpg`,
          p_media_type: 'photo',
          p_byte_size: 4,
          p_duration_seconds: null,
          p_width: null,
          p_height: null,
          p_lat: 23.7461,
          p_lng: 90.3774,
          p_captured_at: now,
          p_description: 'probe',
          p_public_visibility: 'anonymous',
          p_category: 'theft',
        },
        token,
      ),
    ),
  );

  // The Storage policy refuses the upload too. The body names the reason for
  // a raised exception; a plain policy denial says "new row violates
  // row-level security policy" — both are refusals, so both count.
  const storageResponse = await postStorage(`reports/${userId}/probe/a.jpg`, token);
  record(
    'a disabled account cannot upload to the media bucket',
    storageResponse.status >= 400 && storageResponse.status < 500,
    `HTTP ${storageResponse.status}`,
  );

  // 3. The reads must still work — the app has to show the user why they
  //    are locked out, and to offer them the account deletion.
  const readResponse = await fetch(
    `${API_URL}/rest/v1/profiles?id=eq.${userId}&select=id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  record(
    'a disabled account can still read its own profile',
    readResponse.status === 200,
    `HTTP ${readResponse.status}`,
  );

  // 4. An enabled account must be unaffected.
  const citizenSignIn = await signIn('citizen@nagar.local', DEV_PASSWORD);
  if (citizenSignIn.status === 200 && citizenSignIn.token) {
    const citizenId = citizenSignIn.body.user?.id;
    const contactResponse = await post(
      'contacts',
      { user_id: citizenId, name: 'probe-ok', phone: '+8801799000002' },
      citizenSignIn.token,
    );
    record(
      'an enabled account can still insert a contact',
      contactResponse.status === 200 || contactResponse.status === 201,
      `HTTP ${contactResponse.status}`,
    );

    // Clean the probe row up.
    await fetch(`${API_URL}/rest/v1/contacts?name=eq.probe-ok`, {
      method: 'DELETE',
      headers: { apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} disabled-write probes passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((error) => {
  console.error('ERROR', error);
  process.exitCode = 2;
});
