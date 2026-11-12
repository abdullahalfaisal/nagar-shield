/**
 * Probes the alternate phone over the real PostgREST path.
 *
 * `002-identity / 001-signup-with-email-and-phone` AC #10 requires that a
 * valid alternate number "is stored in the nullable, non-unique
 * `profiles.alternate_phone` column, and a second account may store the same
 * alternate number without a uniqueness error".
 *
 * The SQL suite proves the constraint inside Postgres. This proves the door
 * the app actually uses — the client PATCHes `profiles` over REST with the
 * owner's JWT — because the constraint and the write guard are two different
 * things and only the pair proves the client's path works.
 *
 * It also checks the two rules that are easy to get wrong:
 *
 *   * the alternate phone is **not unique** — two accounts may hold the same
 *     number, because a shared family number is legitimate;
 *   * the value must be E.164 — the local format the app's own placeholder
 *     invites (`01712345678`) is refused by the database, and the client
 *     normalises before it writes.
 *
 * Usage: node tools/probe-alternate-phone.cjs
 */

'use strict';

const { execFileSync } = require('node:child_process');

const API_URL = 'http://127.0.0.1:54321';
const DEV_PASSWORD = 'nagar-local-dev';

const PROBE_A_EMAIL = 'alt-phone-a@nagar.local';
const PROBE_A_PHONE = '+8801911000020';
const PROBE_B_EMAIL = 'alt-phone-b@nagar.local';
const PROBE_B_PHONE = '+8801911000021';

/** The number both accounts will try to share — the non-uniqueness proof. */
const SHARED_ALTERNATE = '+8801911000099';

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

/** Creates the probe account if it is not already there. */
async function ensureAccount(email, phone) {
  const adminHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  const list = await fetch(`${API_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: adminHeaders,
  });
  const listBody = await list.json().catch(() => ({}));
  const existing = (listBody.users ?? []).find((u) => u.email === email);

  if (existing?.id) return existing.id;

  const created = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      // The signup trigger builds `profiles` from the Auth identity, and a
      // profile without a phone is refused (PHONE_REQUIRED).
      user_metadata: { phone },
    }),
  });

  if (created.status !== 200) return '';
  const body = await created.json().catch(() => ({}));
  return body.id || '';
}

/** PATCHes `profiles` as the signed-in owner — the app's own write path. */
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

async function getAlternate(userId, token) {
  const response = await fetch(
    `${API_URL}/rest/v1/profiles?id=eq.${userId}&select=alternate_phone`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  const text = await response.text();
  let parsed = [];
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = [];
  }
  return { status: response.status, parsed };
}

async function main() {
  const userA = await ensureAccount(PROBE_A_EMAIL, PROBE_A_PHONE);
  const userB = await ensureAccount(PROBE_B_EMAIL, PROBE_B_PHONE);

  if (!userA || !userB) {
    console.log('✗ could not create the probe accounts');
    process.exit(1);
  }

  const signedInA = await signIn(PROBE_A_EMAIL, DEV_PASSWORD);
  const signedInB = await signIn(PROBE_B_EMAIL, DEV_PASSWORD);

  if (signedInA.status !== 200 || signedInB.status !== 200) {
    console.log(
      `✗ the probe accounts cannot sign in — HTTP ${signedInA.status} / ${signedInB.status}`,
    );
    process.exit(1);
  }

  const tokenA = signedInA.token;
  const tokenB = signedInB.token;

  // (1) The column starts empty — the signup trigger does not carry it.
  const initial = await getAlternate(userA, tokenA);
  const initialRow = initial.parsed[0] || {};
  record(
    'the alternate phone starts empty',
    initial.status === 200 && initialRow.alternate_phone === null,
    `alternate_phone=${initialRow.alternate_phone}`,
  );

  // (2) A valid E.164 alternate number is stored.
  const stored = await patchProfile(userA, { alternate_phone: SHARED_ALTERNATE }, tokenA);
  const storedRow = (stored.parsed && stored.parsed[0]) || {};
  record(
    'a valid alternate number is stored',
    stored.status === 200 && storedRow.alternate_phone === SHARED_ALTERNATE,
    `HTTP ${stored.status} alternate_phone=${storedRow.alternate_phone}`,
  );

  // (3) A second account may store the SAME alternate number — the column is
  //     deliberately not unique.
  const shared = await patchProfile(userB, { alternate_phone: SHARED_ALTERNATE }, tokenB);
  const sharedRow = (shared.parsed && shared.parsed[0]) || {};
  record(
    'a second account may store the same alternate number',
    shared.status === 200 && sharedRow.alternate_phone === SHARED_ALTERNATE,
    `HTTP ${shared.status} alternate_phone=${sharedRow.alternate_phone}`,
  );

  // (4) The local format is refused — the CHECK wants E.164. The client
  //     normalises before it writes, so this is what a bypassed client sees.
  const localFormat = await patchProfile(userA, { alternate_phone: '01712345678' }, tokenA);
  record(
    'the local format is refused by the database',
    localFormat.status >= 400,
    `HTTP ${localFormat.status}`,
  );

  // (5) A non-BD number is refused too.
  const nonBd = await patchProfile(userA, { alternate_phone: '+14155550123' }, tokenA);
  record('a non-BD number is refused by the database', nonBd.status >= 400, `HTTP ${nonBd.status}`);

  // (6) The refused writes left the value untouched.
  const afterRefusals = await getAlternate(userA, tokenA);
  const afterRow = afterRefusals.parsed[0] || {};
  record(
    'a refused write leaves the stored value untouched',
    afterRefusals.status === 200 && afterRow.alternate_phone === SHARED_ALTERNATE,
    `alternate_phone=${afterRow.alternate_phone}`,
  );

  // (7) The alternate phone can be cleared — the user must be able to remove
  //     one they no longer want shared.
  const cleared = await patchProfile(userA, { alternate_phone: null }, tokenA);
  const clearedRow = (cleared.parsed && cleared.parsed[0]) || {};
  record(
    'the alternate phone can be cleared',
    cleared.status === 200 && clearedRow.alternate_phone === null,
    `HTTP ${cleared.status} alternate_phone=${clearedRow.alternate_phone}`,
  );

  // (8) An anonymous caller cannot write the column.
  const anon = await patchProfile(userA, { alternate_phone: SHARED_ALTERNATE }, null);
  record(
    'an anonymous caller cannot write the alternate phone',
    anon.status === 401 || anon.status === 403,
    `HTTP ${anon.status}`,
  );

  // (9) A client cannot write another account's alternate phone — the row is
  //     scoped to the owner by RLS.
  const foreign = await patchProfile(userB, { alternate_phone: '+8801911000098' }, tokenA);
  record(
    "a client cannot write another account's alternate phone",
    foreign.status === 200 && foreign.parsed.length === 0,
    `HTTP ${foreign.status} rows=${foreign.parsed.length}`,
  );

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} alternate-phone probes passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
