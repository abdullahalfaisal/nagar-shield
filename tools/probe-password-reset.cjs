/**
 * Probes the password-reset contract over the real Edge Function.
 *
 * `002-identity / 003-email-otp-password-reset`:
 *
 *   * AC #1 — "a request for an OTP for an **unknown** identifier returns the
 *     same response as a request for a known one" (no existence oracle);
 *   * AC #3 — "the OTP is valid for 10 minutes";
 *   * AC #4 — "a wrong OTP is rejected and the attempt is counted";
 *   * AC #5 — "after 3 wrong attempts the identifier is blocked for 30
 *     minutes, and the rejection happens **server-side** even if the
 *     client-side timer is bypassed, and the response carries the remaining
 *     cooldown in `details.retry_after_sec`";
 *   * AC #8 — "a wrong OTP is rejected and **the account is not locked**;
 *     after 3 wrong attempts the identifier is blocked for 30 minutes";
 *   * AC #9 — "the user can set a new password and is signed in with it".
 *
 * The probe reads the code out of the **mailbox**, which is where the user
 * reads it. That is deliberate: the code is never returned in a response, and
 * it is never stored in plaintext, so the mailbox is the only place it can be
 * read from — exactly as it is in production. Reading it from the database
 * would be impossible (only the bcrypt hash is stored), and reading it from
 * GoTrue would not be possible either (GoTrue never sees our code).
 *
 * Usage: node tools/probe-password-reset.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')

const API_URL = 'http://127.0.0.1:54321'

/**
 * The mailbox's HTTP API.
 *
 * The local stack publishes mailpit on 54324 on the host. The Edge Function
 * reaches the same mailbox from inside the container, on 8025.
 */
const MAILBOX_URL = 'http://127.0.0.1:54324'

const PROBE_EMAIL = 'reset-probe@nagar.local'
const PROBE_PHONE = '+8801911000099'

const DEV_PASSWORD = 'nagar-local-dev'
const NEW_PASSWORD = 'nagar-reset-dev'

/** The number of wrong attempts the story allows before the cooldown. */
const MAX_ATTEMPTS = 3

function localEnv() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  })
  const read = (key) => {
    const match = output.match(new RegExp(`${key}="([^"]+)"`))
    return match ? match[1] : ''
  }
  return {
    anonKey: read('ANON_KEY'),
    serviceRoleKey: read('SERVICE_ROLE_KEY'),
  }
}

const { anonKey, serviceRoleKey } = localEnv()

const results = []

function record(name, passed, detail = '') {
  results.push({ name, passed, detail })
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Calls the Edge Function and returns the parsed envelope. */
async function callFunction(body) {
  const response = await fetch(`${API_URL}/functions/v1/password-reset`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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

/**
 * Reads the most recent code out of the mailbox.
 *
 * The message body carries the code twice — once in the Bangla half and once
 * in the English half — so the first six-digit run is taken.
 */
async function readLatestCode() {
  const response = await fetch(`${MAILBOX_URL}/api/v1/messages?limit=5`)
  const body = await response.json().catch(() => ({}))
  const messages = body.messages ?? []

  for (const message of messages) {
    const full = await fetch(`${MAILBOX_URL}/api/v1/message/${message.ID}`)
    const detail = await full.json().catch(() => ({}))
    const text = detail.Text ?? ''
    const match = text.match(/\b(\d{6})\b/)
    if (match) return match[1]
  }

  return ''
}

/** Waits for the mail to arrive. The send is async from the probe's side. */
async function waitForCode(attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    const code = await readLatestCode()
    if (code) return code
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return ''
}

/** Creates the probe account, or clears a leftover from an earlier run. */
async function ensureAccount() {
  await clearProbeAccounts()

  const response = await fetch(`${API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: PROBE_EMAIL,
      password: DEV_PASSWORD,
      data: { phone: PROBE_PHONE },
    }),
  })
  const body = await response.json().catch(() => ({}))
  return body?.user?.id ?? body?.id ?? ''
}

/**
 * Removes the probe account.
 *
 * Both rows have to go: deleting the Auth user nulls `profiles.auth_user_id`
 * but deliberately leaves the profile row behind (migration 016 — DEFECT A's
 * fix), and the leftover profile would still hold the phone number.
 */
async function clearProbeAccounts() {
  const list = await fetch(`${API_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  const body = await list.json().catch(() => ({}))
  const stale = (body.users ?? []).filter((u) => u.email === PROBE_EMAIL)

  for (const user of stale) {
    await fetch(`${API_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    })
  }

  await fetch(`${API_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(PROBE_EMAIL)}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })

  // The challenges too — a leftover challenge would make the first request
  // look like it did not supersede anything.
  await fetch(
    `${API_URL}/rest/v1/password_reset_challenges?account_email=eq.${encodeURIComponent(PROBE_EMAIL)}`,
    {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    },
  )
}

/** Signs in with a password, through the public Auth door. */
async function signIn(email, password) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}

/** Reads the challenge row for the probe account. */
async function readChallenge() {
  const response = await fetch(
    `${API_URL}/rest/v1/password_reset_challenges?account_email=eq.${encodeURIComponent(PROBE_EMAIL)}&select=*&order=created_at.desc&limit=1`,
    {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    },
  )
  const body = await response.json().catch(() => [])
  return Array.isArray(body) ? (body[0] ?? null) : null
}

async function main() {
  const userId = await ensureAccount()
  record('the probe account exists', Boolean(userId), `id=${userId || '(none)'}`)

  // --- (1) The no-oracle rule ---------------------------------------------

  const unknown = await callFunction({ identifier: 'nobody-here@nagar.local' })
  const known = await callFunction({ identifier: PROBE_EMAIL })

  record(
    'a request for an unknown identifier answers HTTP 200',
    unknown.status === 200,
    `HTTP ${unknown.status}`,
  )

  record(
    'the unknown identifier gets the same body as a known one',
    unknown.parsed?.data?.sent === true && known.parsed?.data?.sent === true,
    `unknown=${JSON.stringify(unknown.parsed?.data)} known=${JSON.stringify(known.parsed?.data)}`,
  )

  record(
    'the unknown identifier gets the same status as a known one',
    unknown.status === known.status,
    `${unknown.status} vs ${known.status}`,
  )

  // --- (2) The code is delivered, and the challenge is recorded ------------

  const code = await waitForCode()
  record('the code was delivered to the mailbox', /^\d{6}$/.test(code), `code=***`)

  const challenge = await readChallenge()

  record('a challenge row was written', Boolean(challenge), `id=${challenge?.id ?? '(none)'}`)

  if (challenge) {
    const ttlMinutes = (new Date(challenge.expires_at) - new Date(challenge.created_at)) / 60000
    record(
      'the challenge is valid for 10 minutes',
      Math.abs(ttlMinutes - 10) < 0.5,
      `ttl=${ttlMinutes.toFixed(2)}min`,
    )

    record(
      'the challenge starts with no attempts and no cooldown',
      challenge.attempts === 0 && !challenge.cooldown_until,
      `attempts=${challenge.attempts} cooldown=${challenge.cooldown_until ?? 'null'}`,
    )

    // The code is stored as a bcrypt hash, never in plaintext. This is the
    // property that makes the table useless to anyone who dumps it.
    record(
      'the code is stored as a bcrypt hash, never in plaintext',
      typeof challenge.code_hash === 'string' &&
        challenge.code_hash.startsWith('$2') &&
        !challenge.code_hash.includes(code),
      `hash=${String(challenge.code_hash).slice(0, 7)}…`,
    )

    record(
      'the GoTrue token is stored separately from the code',
      typeof challenge.token_hash === 'string' &&
        /^[0-9a-f]{32,64}$/.test(challenge.token_hash) &&
        challenge.token_hash !== challenge.code_hash,
      `token=${String(challenge.token_hash).slice(0, 8)}…`,
    )
  }

  // --- (3) A wrong code is refused and the attempt is counted --------------

  const wrong1 = await callFunction({
    identifier: PROBE_EMAIL,
    code: '000000',
    new_password: NEW_PASSWORD,
  })

  record(
    'a wrong code is refused',
    wrong1.status >= 400 && wrong1.parsed?.error?.code === 'VALIDATION_FAILED',
    `HTTP ${wrong1.status} code=${wrong1.parsed?.error?.code ?? '?'}`,
  )

  record(
    'the response reports the remaining attempts',
    wrong1.parsed?.error?.details?.attempts_remaining === MAX_ATTEMPTS - 1,
    `remaining=${wrong1.parsed?.error?.details?.attempts_remaining ?? '?'}`,
  )

  const afterWrong1 = await readChallenge()
  record(
    'the failed attempt was counted server-side',
    afterWrong1?.attempts === 1,
    `attempts=${afterWrong1?.attempts}`,
  )

  // The account is not locked after one wrong attempt.
  const stillSignsIn = await signIn(PROBE_EMAIL, DEV_PASSWORD)
  record(
    'the account is not locked after one wrong attempt',
    stillSignsIn.status === 200,
    `HTTP ${stillSignsIn.status}`,
  )

  // --- (4) The third failure opens the cooldown ----------------------------

  const wrong2 = await callFunction({
    identifier: PROBE_EMAIL,
    code: '000000',
    new_password: NEW_PASSWORD,
  })
  const afterWrong2 = await readChallenge()
  record(
    'the second failed attempt is counted',
    afterWrong2?.attempts === 2,
    `attempts=${afterWrong2?.attempts}`,
  )

  const wrong3 = await callFunction({
    identifier: PROBE_EMAIL,
    code: '000000',
    new_password: NEW_PASSWORD,
  })
  const afterWrong3 = await readChallenge()

  record(
    'the third failure is rate-limited',
    wrong3.status === 429 && wrong3.parsed?.error?.code === 'OTP_RATE_LIMIT',
    `HTTP ${wrong3.status} code=${wrong3.parsed?.error?.code ?? '?'}`,
  )

  record(
    'the cooldown is opened server-side',
    Boolean(afterWrong3?.cooldown_until),
    `cooldown_until=${afterWrong3?.cooldown_until ?? 'null'}`,
  )

  const cooldownMinutes = afterWrong3?.cooldown_expires_at
    ? (new Date(afterWrong3.cooldown_expires_at) - new Date(afterWrong3.cooldown_until)) / 60000
    : 0
  record(
    'the cooldown lasts 30 minutes',
    Math.abs(cooldownMinutes - 30) < 0.5,
    `cooldown=${cooldownMinutes.toFixed(2)}min`,
  )

  // --- (5) The cooldown holds even against the CORRECT code ----------------
  //
  // This is AC #5's sharp edge: the refusal is server-side, so a client that
  // ignores its own timer gains nothing by sending the right code.

  const correctDuringCooldown = await callFunction({
    identifier: PROBE_EMAIL,
    code,
    new_password: NEW_PASSWORD,
  })

  record(
    'the correct code is refused while the cooldown runs',
    correctDuringCooldown.status === 429 &&
      correctDuringCooldown.parsed?.error?.code === 'OTP_RATE_LIMIT',
    `HTTP ${correctDuringCooldown.status} code=${correctDuringCooldown.parsed?.error?.code ?? '?'}`,
  )

  const retryAfter = correctDuringCooldown.parsed?.error?.details?.retry_after_sec
  record(
    'the response carries the remaining cooldown',
    typeof retryAfter === 'number' && retryAfter > 1700 && retryAfter <= 1800,
    `retry_after_sec=${retryAfter ?? '?'}`,
  )

  // The password was never changed by the refused attempt.
  const oldStillWorks = await signIn(PROBE_EMAIL, DEV_PASSWORD)
  record(
    'the refused attempt did not change the password',
    oldStillWorks.status === 200,
    `HTTP ${oldStillWorks.status}`,
  )

  // --- (6) The success path, after the cooldown is lifted ------------------
  //
  // The cooldown is a server-side rule, so the probe clears it the same way
  // an operator would — by deleting the challenge row — rather than by
  // waiting 30 minutes.

  await clearProbeAccounts()
  await ensureAccount()

  await callFunction({ identifier: PROBE_EMAIL })
  const freshCode = await waitForCode()
  record('a fresh code was issued', /^\d{6}$/.test(freshCode), 'code=***')

  const verified = await callFunction({
    identifier: PROBE_EMAIL,
    code: freshCode,
    new_password: NEW_PASSWORD,
  })

  record(
    'the correct code is accepted',
    verified.status === 200 && verified.parsed?.data?.ok === true,
    `HTTP ${verified.status}`,
  )

  record(
    'the response carries a session',
    typeof verified.parsed?.data?.access_token === 'string' &&
      verified.parsed?.data?.access_token.length > 20,
    `access_token=${verified.parsed?.data?.access_token ? 'present' : 'missing'}`,
  )

  // --- (7) The new password works and the old one does not -----------------

  const newWorks = await signIn(PROBE_EMAIL, NEW_PASSWORD)
  record('the new password signs in', newWorks.status === 200, `HTTP ${newWorks.status}`)

  const oldFails = await signIn(PROBE_EMAIL, DEV_PASSWORD)
  record(
    'the old password is rejected',
    oldFails.status === 400 && oldFails.body?.error_code === 'invalid_credentials',
    `HTTP ${oldFails.status} code=${oldFails.body?.error_code ?? '?'}`,
  )

  // --- (8) The code cannot be redeemed twice -------------------------------

  const replay = await callFunction({
    identifier: PROBE_EMAIL,
    code: freshCode,
    new_password: 'another-password',
  })

  record(
    'the code cannot be redeemed twice',
    replay.status >= 400,
    `HTTP ${replay.status} code=${replay.parsed?.error?.code ?? '?'}`,
  )

  const afterReplay = await signIn(PROBE_EMAIL, 'another-password')
  record(
    'the replayed code did not change the password',
    afterReplay.status === 400,
    `HTTP ${afterReplay.status}`,
  )

  // --- (9) A superseded code is refused ------------------------------------
  //
  // The story's edge-case table: "only the newest challenge is valid; the
  // previous code is rejected as invalid rather than accepted".

  await clearProbeAccounts()
  await ensureAccount()

  await callFunction({ identifier: PROBE_EMAIL })
  const firstCode = await waitForCode()
  await callFunction({ identifier: PROBE_EMAIL })
  const secondCode = await waitForCode()

  record(
    'a second request issues a different code',
    Boolean(firstCode) && Boolean(secondCode) && firstCode !== secondCode,
    'codes differ',
  )

  const superseded = await callFunction({
    identifier: PROBE_EMAIL,
    code: firstCode,
    new_password: NEW_PASSWORD,
  })

  record(
    'the superseded code is refused',
    superseded.status >= 400,
    `HTTP ${superseded.status} code=${superseded.parsed?.error?.code ?? '?'}`,
  )

  // --- Cleanup --------------------------------------------------------------

  await clearProbeAccounts()

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} password-reset probes passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
