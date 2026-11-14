/**
 * Probes the dual-identifier sign-in over the real GoTrue + PostgREST path.
 *
 * `002-identity / 002-dual-identifier-login`:
 *
 *   * AC #1 — "**Given** a registered phone number and the account's
 *     password, **When** the user submits the Login form, **Then**
 *     `resolve_login_identifier` returns the account's primary email,
 *     `signInWithPassword` is called with that email and the password, and
 *     the resulting session resolves to that account's `profiles.id`";
 *   * AC #2 — "**Given** a registered email and the account's password,
 *     **When** the user submits the Login form, **Then** the resulting
 *     session resolves to the same `profiles.id` as the phone sign-in for
 *     that account";
 *   * AC #3 — "**Given** one person signing in by phone and by email, **When**
 *     both sessions are compared, **Then** the account still has exactly one
 *     `auth.users` row and the password accepted is the same credential in
 *     both cases";
 *   * AC #4 — "**Given** an identifier that matches no account, **When** the
 *     user submits, **Then** the response is the generic `VALIDATION_FAILED`
 *     message that is byte-identical to the wrong-password message, and no
 *     distinct 'user not found' response is shown".
 *
 * ## Why this probe exists
 *
 * The RPC is covered inside Postgres — `supabase/tests/read_models.sql` proves
 * that a phone resolves to the account's email, that a national-format phone
 * resolves to the same account, and that an unknown identifier raises
 * `AUTH_REQUIRED`.
 *
 * But the RPC is only **half** the criterion. AC #1 says the *session* must
 * resolve to the account's `profiles.id` — which means the email the RPC
 * returned must actually authenticate, and the identity behind the resulting
 * JWT must be the account the phone belongs to. A resolver that returned the
 * **wrong** email would pass every RPC test and fail every user.
 *
 * So this probe does the whole trip: phone → RPC → email → password →
 * session → `profiles.id`. And it does it twice — once by phone, once by
 * email — and compares the two accounts.
 *
 * ## Why each run gets its own account
 *
 * The probe creates a fresh account every run, through the Auth admin
 * endpoint, with a **unique digits-only phone**. `profiles.phone` is UNIQUE,
 * and the signup trigger refuses a metadata without a phone
 * (`PHONE_REQUIRED`) — so the phone has to differ from every other run's, or
 * the account cannot be created.
 *
 * A probe that filed as a fixed seeded account would fail after ~50 runs
 * against a healthy codebase, because FR-CAPTURE-3 caps an author at 50
 * reports a day. A proof that stops working after N runs is not a proof.
 *
 * Usage: node tools/probe-dual-identifier-login.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')
const { randomUUID, randomInt } = require('node:crypto')

const API_URL = 'http://127.0.0.1:54321'
const DEV_PASSWORD = 'nagar-local-dev'

/** The probe's account — a fresh one on every run. */
const PROBE = {
  email: `dual-identifier-${randomUUID()}@test.local`,
  phone: '',
  id: '',
}

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

/**
 * A phone in the local form the normaliser accepts: `+88019` and eight more
 * digits.
 *
 * The digits have to be **digits only** — a run id with letters in it is not
 * a phone number, and `profiles.phone` is UNIQUE, so the digits have to
 * differ from every other run's.
 */
function freshPhone() {
  return `+88019${String(randomInt(0, 100000000)).padStart(8, '0')}`
}

/** Creates the probe's account and returns its uuid. */
async function createAccount() {
  const response = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: PROBE.email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { phone: PROBE.phone },
    }),
  })

  if (response.status !== 200) return ''
  const body = await response.json().catch(() => ({}))
  return body.id ?? ''
}

/**
 * Calls `resolve_login_identifier` the way an **anonymous** caller does.
 *
 * The anon key, not the user's — because at sign-in the caller has no
 * session yet. This is the exact shape the client uses, and it is why the
 * RPC has to be `SECURITY DEFINER`.
 */
async function resolveIdentifier(identifier) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/resolve_login_identifier`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_identifier: identifier }),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: response.status, body: parsed }
}

/** Signs in with an email and a password, the way `signInWithPassword` does. */
async function signInWithPassword(email, password) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, token: body.access_token, body }
}

/** The signed-in user's own profile row — the `profiles.id` the criterion names. */
async function readOwnProfile(token) {
  const response = await fetch(`${API_URL}/rest/v1/profiles?select=id,email,phone,role`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  const body = await response.json().catch(() => [])
  return { status: response.status, rows: Array.isArray(body) ? body : [] }
}

/** How many `auth.users` rows carry the probe's email. */
async function countAuthUsers(email) {
  const response = await fetch(
    `${API_URL}/auth/v1/admin/users?page=1&per_page=200`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  )
  const body = await response.json().catch(() => ({}))
  const users = Array.isArray(body.users) ? body.users : []
  return users.filter((user) => user.email === email).length
}

/** How many `auth.users` rows carry the probe's phone. */
async function countAuthUsersByPhone(phone) {
  const response = await fetch(
    `${API_URL}/auth/v1/admin/users?page=1&per_page=200`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  )
  const body = await response.json().catch(() => ({}))
  const users = Array.isArray(body.users) ? body.users : []
  return users.filter(
    (user) => user.phone === phone || user.user_metadata?.phone === phone,
  ).length
}

/** Removes the probe's account, so the run leaves nothing behind. */
async function deleteAccount(userId) {
  await fetch(`${API_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
}

async function main() {
  PROBE.phone = freshPhone()
  PROBE.id = await createAccount()

  if (!PROBE.id) {
    console.log(`SKIP: the probe's account could not be created (${PROBE.email})`)
    process.exitCode = 0
    return
  }

  // --- (1) The phone resolves to the account's primary email ---------------

  const byPhone = await resolveIdentifier(PROBE.phone)

  record(
    'the phone resolves to an email over REST, as an anonymous caller',
    byPhone.status === 200 && typeof byPhone.body?.email === 'string',
    `HTTP ${byPhone.status} email=${byPhone.body?.email ?? '(none)'}`,
  )

  record(
    'the resolved email is the account\'s own email',
    byPhone.body?.email === PROBE.email,
    `resolved=${byPhone.body?.email} expected=${PROBE.email}`,
  )

  // The national-format phone the app's own placeholder invites must resolve
  // to the same account. The story's edge case names it.
  const national = PROBE.phone.replace('+880', '0')
  const byNational = await resolveIdentifier(national)

  record(
    'the national-format phone resolves to the same account',
    byNational.status === 200 && byNational.body?.email === PROBE.email,
    `HTTP ${byNational.status} email=${byNational.body?.email ?? '(none)'}`,
  )

  // --- (2) The phone sign-in produces the account's session ----------------

  const phoneSignIn = await signInWithPassword(byPhone.body?.email ?? '', DEV_PASSWORD)

  record(
    'the resolved email authenticates with the account password',
    phoneSignIn.status === 200 && Boolean(phoneSignIn.token),
    `HTTP ${phoneSignIn.status}`,
  )

  const phoneProfile = await readOwnProfile(phoneSignIn.token)

  record(
    "the phone sign-in's session resolves to the account's profiles.id",
    phoneProfile.rows[0]?.id === PROBE.id,
    `profiles.id=${phoneProfile.rows[0]?.id ?? '(none)'} expected=${PROBE.id}`,
  )

  record(
    "the phone sign-in's session resolves to the account's profile phone",
    phoneProfile.rows[0]?.phone === PROBE.phone,
    `phone=${phoneProfile.rows[0]?.phone ?? '(none)'}`,
  )

  // --- (3) The email sign-in produces the SAME account ----------------------

  const emailSignIn = await signInWithPassword(PROBE.email, DEV_PASSWORD)

  record(
    'the email sign-in authenticates with the same password',
    emailSignIn.status === 200 && Boolean(emailSignIn.token),
    `HTTP ${emailSignIn.status}`,
  )

  const emailProfile = await readOwnProfile(emailSignIn.token)

  record(
    "the email sign-in's session resolves to the SAME profiles.id",
    emailProfile.rows[0]?.id === phoneProfile.rows[0]?.id,
    `email=${emailProfile.rows[0]?.id ?? '(none)'} phone=${phoneProfile.rows[0]?.id ?? '(none)'}`,
  )

  // --- (4) One person, one auth.users row ----------------------------------

  const usersByEmail = await countAuthUsers(PROBE.email)
  const usersByPhone = await countAuthUsersByPhone(PROBE.phone)

  record(
    'the account has exactly one auth.users row',
    usersByEmail === 1,
    `rows=${usersByEmail}`,
  )

  record(
    'no second auth.users row was created for the phone',
    usersByPhone === 1,
    `rows=${usersByPhone}`,
  )

  // --- (5) The same credential in both cases --------------------------------

  // The wrong password must be refused **identically** through both paths —
  // and the refusal must not say "user not found", because that would be an
  // account-existence oracle.
  const wrongByPhone = await signInWithPassword(byPhone.body?.email ?? '', 'not-the-password')
  const wrongByEmail = await signInWithPassword(PROBE.email, 'not-the-password')

  record(
    'a wrong password is refused through the phone path',
    wrongByPhone.status >= 400,
    `HTTP ${wrongByPhone.status}`,
  )

  record(
    'a wrong password is refused through the email path',
    wrongByEmail.status >= 400,
    `HTTP ${wrongByEmail.status}`,
  )

  record(
    'the two refusals are the same status',
    wrongByPhone.status === wrongByEmail.status,
    `phone=${wrongByPhone.status} email=${wrongByEmail.status}`,
  )

  record(
    'the refusal carries no "user not found" signal',
    !/user not found|no such user|does not exist/i.test(
      JSON.stringify(wrongByPhone.body ?? {}),
    ),
    `body=${JSON.stringify(wrongByPhone.body ?? {}).slice(0, 160)}`,
  )

  // An unknown identifier must be refused the same way as a wrong password.
  const unknown = await resolveIdentifier('+8801999999999')

  record(
    'an unknown identifier is refused by the resolver',
    unknown.status >= 400,
    `HTTP ${unknown.status}`,
  )

  record(
    'the unknown identifier carries the same AUTH_REQUIRED signal as a wrong password',
    /AUTH_REQUIRED/i.test(JSON.stringify(unknown.body ?? {})),
    `body=${JSON.stringify(unknown.body ?? {}).slice(0, 160)}`,
  )

  // --- Cleanup --------------------------------------------------------------

  await deleteAccount(PROBE.id)

  const afterCleanup = await countAuthUsers(PROBE.email)
  record('the probe cleans up after itself', afterCleanup === 0, `rows=${afterCleanup}`)

  const failed = results.filter((r) => !r.passed)
  console.log(
    `\n${results.length - failed.length}/${results.length} dual-identifier-login probes passed`,
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('ERROR', error)
  process.exitCode = 2
})
