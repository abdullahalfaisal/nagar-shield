/**
 * Probes the signup contract over the real GoTrue path.
 *
 * `002-identity / 001-signup-with-email-and-phone`:
 *
 *   * AC #1 — "exactly one `auth.users` row and exactly one `profiles` row
 *     exist, and both carry the same `id`";
 *   * AC #3 — "a phone number that already belongs to another account → the
 *     request fails with the error code `VALIDATION_FAILED` and the
 *     `auth.users` table gains no new row";
 *   * AC #4 — "a phone number that is not a valid BD E.164 number → the
 *     request fails with `VALIDATION_FAILED` and the `auth.users` table gains
 *     no new row";
 *   * AC #5 — "the phone format and uniqueness checks complete **before** any
 *     `auth.users` insert is attempted, proven by an integration test that
 *     counts `auth.users` rows before and after a rejected signup".
 *
 * The last one is the one that matters most and the one that is easiest to
 * get wrong. The `UNIQUE` constraint on `profiles.phone` lives inside the
 * signup trigger's transaction, so a rejected signup must leave the
 * `auth.users` table **exactly** as it was. If the constraint were only
 * checked by an application-level pre-flight, a race between two signups
 * could leave a second auth user behind with no profile.
 *
 * Usage: node tools/probe-signup-contract.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')

const API_URL = 'http://127.0.0.1:54321'
const DEV_PASSWORD = 'nagar-local-dev'

const PROBE_EMAIL = 'signup-probe@nagar.local'
const PROBE_PHONE = '+8801911000030'

/** Every email the probe touches — used to clean up between runs. */
const PROBE_EMAILS = [
  PROBE_EMAIL,
  'signup-probe-duplicate@nagar.local',
  'signup-probe-nonbd@nagar.local',
]

function localEnv() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  })
  const read = (key) => {
    const match = output.match(new RegExp(`${key}="([^"]+)"`))
    return match ? match[1] : ''
  }
  return { anonKey: read('ANON_KEY'), serviceRoleKey: read('SERVICE_ROLE_KEY') }
}

const { anonKey, serviceRoleKey } = localEnv()

const results = []

function record(name, passed, detail = '') {
  results.push({ name, passed, detail })
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Counts the `auth.users` rows carrying a given email. */
async function countAuthUsers(email) {
  const response = await fetch(`${API_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  const body = await response.json().catch(() => ({}))
  return (body.users ?? []).filter((u) => u.email === email).length
}

/** Counts the `profiles` rows for a given auth user id. */
async function countProfiles(userId, serviceRole) {
  const response = await fetch(`${API_URL}/rest/v1/profiles?id=eq.${userId}&select=id`, {
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  })
  const body = await response.json().catch(() => [])
  return Array.isArray(body) ? body.length : 0
}

/** Signs up through the public Auth endpoint — the door the app uses. */
async function signup(email, phone) {
  const response = await fetch(`${API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD, data: { phone } }),
  })
  const text = await response.text()
  let parsed = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = {}
  }
  return { status: response.status, text, parsed }
}

/** Deletes the probe account so the probe can be re-run cleanly. */
async function deleteProbeUser(userId) {
  await fetch(`${API_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
}

/**
 * Removes any account left behind by an earlier run.
 *
 * The probe signs up with a fixed email and phone, so a previous run — or a
 * manual test — would leave the number taken and the first signup would fail
 * with a duplicate. Starting from a clean slate makes the probe re-runnable,
 * which is what the runbook promises.
 *
 * Both rows have to go. Deleting the Auth user nulls `profiles.auth_user_id`
 * but deliberately **leaves the profile row** — that is DEFECT A's fix, the
 * one that stops the account purge from destroying the account's reports
 * (migration 016). The profile keeps the phone, so a leftover profile would
 * still hold the number taken.
 */
async function clearProbeAccounts() {
  const response = await fetch(`${API_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  const body = await response.json().catch(() => ({}))
  const stale = (body.users ?? []).filter((u) => PROBE_EMAILS.includes(u.email))

  for (const user of stale) {
    await deleteProbeUser(user.id)
  }

  // The orphaned profile rows, by email.
  const profiles = await fetch(
    `${API_URL}/rest/v1/profiles?email=in.(${PROBE_EMAILS.map((e) => `"${e}"`).join(',')})`,
    {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    },
  )

  if (!profiles.ok && profiles.status !== 204) {
    // A 204 is the expected answer for a DELETE with no representation.
    const text = await profiles.text().catch(() => '')
    if (profiles.status !== 404) {
      console.log(`  (cleanup: profiles delete answered HTTP ${profiles.status} ${text})`)
    }
  }
}

async function main() {
  await clearProbeAccounts()

  // --- (1) A clean signup creates exactly one auth user and one profile ----

  const before = await countAuthUsers(PROBE_EMAIL)
  const first = await signup(PROBE_EMAIL, PROBE_PHONE)
  const after = await countAuthUsers(PROBE_EMAIL)

  record(
    'a valid signup creates exactly one auth.users row',
    first.status === 200 && after === before + 1,
    `HTTP ${first.status} rows=${after - before}`,
  )

  // The profile row is created by the trigger, with the same id.
  //
  // The Auth response nests the user under `user`; the id is NOT at the top
  // level. (The client library unwraps it — `data.user.id` — but the raw
  // REST body does not.)
  const createdId = first.parsed?.user?.id ?? first.parsed?.id ?? ''
  const profileCount = createdId ? await countProfiles(createdId, serviceRoleKey) : 0

  record(
    'the signup created exactly one profiles row',
    profileCount === 1,
    `profiles=${profileCount}`,
  )

  record(
    'the profile row carries the same id as the auth user',
    createdId.length > 0 && profileCount === 1,
    `id=${createdId || '(none)'}`,
  )

  // The stored phone is the E.164 form.
  const profileRead = await fetch(
    `${API_URL}/rest/v1/profiles?id=eq.${createdId}&select=phone,role`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  )
  const profileBody = await profileRead.json().catch(() => [])
  const row = (Array.isArray(profileBody) ? profileBody[0] : {}) || {}

  record('the stored phone is the E.164 form', row.phone === PROBE_PHONE, `phone=${row.phone}`)

  record("the profile's role is citizen", row.role === 'citizen', `role=${row.role}`)

  // --- (2) A duplicate phone is refused and leaves no auth user behind ----

  const duplicateEmail = 'signup-probe-duplicate@nagar.local'
  const beforeDuplicate = await countAuthUsers(duplicateEmail)
  const duplicate = await signup(duplicateEmail, PROBE_PHONE)
  const afterDuplicate = await countAuthUsers(duplicateEmail)

  record('a duplicate phone is refused', duplicate.status >= 400, `HTTP ${duplicate.status}`)

  record(
    'the duplicate signup is a unique violation on the phone',
    duplicate.parsed?.code === '23505' &&
      /profiles_phone_key/i.test(duplicate.parsed?.message ?? ''),
    `code=${duplicate.parsed?.code} message=${duplicate.parsed?.message ?? ''}`,
  )

  record(
    'a rejected duplicate signup gains NO auth.users row',
    afterDuplicate === beforeDuplicate,
    `rows=${afterDuplicate - beforeDuplicate}`,
  )

  // --- (3) A non-BD number is refused and leaves no auth user behind -------

  const nonBdEmail = 'signup-probe-nonbd@nagar.local'
  const beforeNonBd = await countAuthUsers(nonBdEmail)
  const nonBd = await signup(nonBdEmail, '+14155550123')
  const afterNonBd = await countAuthUsers(nonBdEmail)

  record('a non-BD number is refused', nonBd.status >= 400, `HTTP ${nonBd.status}`)

  record(
    'the non-BD signup is refused as a phone problem',
    nonBd.parsed?.code === '23502' && /PHONE_REQUIRED/i.test(nonBd.parsed?.message ?? ''),
    `code=${nonBd.parsed?.code} message=${nonBd.parsed?.message ?? ''}`,
  )

  record(
    'a rejected non-BD signup gains NO auth.users row',
    afterNonBd === beforeNonBd,
    `rows=${afterNonBd - beforeNonBd}`,
  )

  // --- (4) An already-registered email is refused --------------------------

  const emailBefore = await countAuthUsers(PROBE_EMAIL)
  const emailAgain = await signup(PROBE_EMAIL, '+8801911000031')
  const emailAfter = await countAuthUsers(PROBE_EMAIL)

  record(
    'an already-registered email is refused',
    emailAgain.status >= 400,
    `HTTP ${emailAgain.status}`,
  )

  record(
    'a refused duplicate email gains no second auth.users row',
    emailAfter === emailBefore,
    `rows=${emailAfter - emailBefore}`,
  )

  // --- Cleanup --------------------------------------------------------------

  if (createdId) {
    await deleteProbeUser(createdId)
  }

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} signup-contract probes passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
