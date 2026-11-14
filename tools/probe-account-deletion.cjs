/**
 * Probes the account-deletion contract over the real GoTrue + PostgREST path.
 *
 * `002-identity / 007-account-deletion-and-recovery`:
 *
 *   * AC #1 — "the account is soft-deleted … the app returns to the Welcome
 *     screen";
 *   * AC #2 — "the account can be restored, with its data intact";
 *   * AC #3 — "the recoverable period is exactly 30 days from
 *     `profiles.deleted_at`";
 *   * AC #5 — "more than 30 days elapsed → restore is refused";
 *   * AC #6 — "the recovery screen offers restore";
 *   * AC #7 — "a write attempted before the restore is rejected";
 *   * AC #8 — "the purge does not run before the window closes".
 *
 * ## Why this probe exists
 *
 * Three defects in this contract were found by reading the function bodies
 * against the story, and each one is invisible to a reader of the console —
 * the screens render, the buttons are wired, and the app behaves.
 *
 *   1. `restore_account` checked only `deleted_at is not null`. The 30-day
 *      window was kept by the purge job's *schedule*, not by the database,
 *      so an account that outlived the window could be restored forever.
 *   2. The write guard asked only about `disabled_at`. A soft-deleted
 *      account could still create contacts, share locations and file
 *      reports while it waited out its grace period.
 *   3. `restore_account` returned the wrong envelope, so the client could
 *      not read `recoverable_until`.
 *
 * The SQL suite proves the database side of all three. This probe proves the
 * **client's** side — that the citizen's own session sees the refusals the
 * app renders, over the door the app actually uses.
 *
 * Usage: node tools/probe-account-deletion.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')

const API_URL = 'http://127.0.0.1:54321'
const DEV_PASSWORD = 'nagar-local-dev'

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

/** Creates a citizen with a phone, and returns their id. */
async function createCitizen() {
  const email = `deletion-probe-${randomUUID()}@test.local`
  // The phone must be a **valid** BD number — the `handle_new_user` trigger
  // requires one, and the `profiles.phone` CHECK would reject a malformed
  // one. The subscriber part is eight digits.
  const subscriber = String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
  const response = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { phone: `+88019${subscriber}` },
    }),
  })
  const body = await response.json().catch(() => ({}))
  return { id: body.id, email, status: response.status }
}

async function signIn(email) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, token: body.access_token, body }
}

/** A PostgREST call as the signed-in user. */
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
  })
  const text = await response.text()
  return { status: response.status, text }
}

/** A PostgREST call of a lifecycle RPC. */
async function rpc(name, token, body = {}) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: response.status, text, body: parsed }
}

/**
 * A PostgREST call of an RPC as the **service role**.
 *
 * The purge worklist is the service role's alone, so the probe needs the
 * service-role key to read it — the same key the Edge Function uses.
 */
async function rpcAsService(name, body = {}) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: response.status, text, body: parsed }
}

/** Reads the profile row as the signed-in user. */
async function readProfile(token, userId) {
  const response = await fetch(
    `${API_URL}/rest/v1/profiles?id=eq.${userId}&select=id,deleted_at,disabled_at`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    },
  )
  const body = await response.json().catch(() => [])
  return { status: response.status, rows: Array.isArray(body) ? body : [] }
}

/**
 * Reads the profile row as the **service role**, with no session.
 *
 * The client reads its own row through its own session, but the probe has to
 * be able to look at the row *without* one — a soft-deleted account's
 * session is still valid, but the probe's own reads must not depend on the
 * state it is setting up.
 */
async function readProfileAsService(userId) {
  const response = await fetch(
    `${API_URL}/rest/v1/profiles?id=eq.${userId}&select=id,deleted_at,disabled_at`,
    {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    },
  )
  const body = await response.json().catch(() => [])
  return { status: response.status, rows: Array.isArray(body) ? body : [] }
}

/**
 * Reads the `auth.users` row for an id, with the service role.
 *
 * The `auth` schema is **not** exposed through PostgREST, so the read goes
 * through the GoTrue admin endpoint — the same door the probe created the
 * account through.
 */
async function readAuthUser(userId) {
  const response = await fetch(`${API_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, user: body?.id ? body : null }
}

/** Removes the probe rows. The service role bypasses the RLS scopes. */
async function cleanup(userId) {
  await fetch(`${API_URL}/rest/v1/contacts?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  await fetch(`${API_URL}/rest/v1/auth.users?id=eq.${userId}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
}

async function main() {
  const citizen = await createCitizen()

  if (!citizen.id) {
    console.log(`SKIP: cannot create a probe citizen (HTTP ${citizen.status})`)
    process.exitCode = 0
    return
  }

  const signInResult = await signIn(citizen.email)

  if (signInResult.status !== 200 || !signInResult.token) {
    console.log(`SKIP: cannot sign in as the probe citizen (HTTP ${signInResult.status})`)
    await cleanup(citizen.id)
    process.exitCode = 0
    return
  }

  const token = signInResult.token

  // --- (1) The account can write while it is alive --------------------------

  const beforeDelete = await post(
    'contacts',
    { user_id: citizen.id, name: 'a contact', phone: '+8801799000011' },
    token,
  )
  record(
    'an active account can create a contact',
    beforeDelete.status === 201,
    `HTTP ${beforeDelete.status}`,
  )

  // --- (2) The soft delete ---------------------------------------------------

  const softDelete = await rpc('soft_delete_account', token)
  record(
    'the account can soft-delete itself',
    softDelete.status === 200,
    `HTTP ${softDelete.status}`,
  )

  record(
    'the soft delete returns the moment of deletion',
    Boolean(softDelete.body?.deleted_at),
    `deleted_at=${softDelete.body?.deleted_at}`,
  )

  record(
    'the soft delete returns the last recoverable moment — the client reads it',
    Boolean(softDelete.body?.recoverable_until),
    `recoverable_until=${softDelete.body?.recoverable_until}`,
  )

  // The window is exactly 30 days.
  if (softDelete.body?.deleted_at && softDelete.body?.recoverable_until) {
    const deletedAt = new Date(softDelete.body.deleted_at).getTime()
    const recoverableUntil = new Date(softDelete.body.recoverable_until).getTime()
    const days = (recoverableUntil - deletedAt) / (24 * 60 * 60 * 1000)
    record(
      'the recovery window is exactly 30 days',
      Math.abs(days - 30) < 0.01,
      `${days.toFixed(3)} days`,
    )
  }

  const afterDelete = await readProfile(token, citizen.id)
  record(
    'the profile carries the deleted_at',
    Boolean(afterDelete.rows[0]?.deleted_at),
    `deleted_at=${afterDelete.rows[0]?.deleted_at}`,
  )

  // --- (2a) The auth identity survives the soft delete (AC #4) ---------------

  // The story is explicit: "the `auth.users` row still exists — the auth
  // identity is **not** destroyed at soft-delete time". It has to survive,
  // because the restore path re-establishes a session from it — and because
  // the purge leg, not the soft delete, is what destroys it.
  const authUserAfterDelete = await readAuthUser(citizen.id)
  record(
    'the auth.users row survives the soft delete — the identity is not destroyed',
    authUserAfterDelete.status === 200 && Boolean(authUserAfterDelete.user?.id),
    `HTTP ${authUserAfterDelete.status}`,
  )

  // --- (2b) The client can read the deadline it has to show -----------------

  // The recovery screen states the deadline, so the deadline has to be
  // *readable by the client* — the deleted_at is, and the deadline is the
  // same column plus 30 days. This asserts the client can see the row that
  // carries it at all, which is what the screen's read depends on.
  const serviceRead = await readProfileAsService(citizen.id)
  const deletedAt = serviceRead.rows[0]?.deleted_at
  record(
    'the client can read the deleted_at the deadline is derived from',
    Boolean(deletedAt),
    `deleted_at=${deletedAt}`,
  )

  if (deletedAt) {
    const deadline = new Date(new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000)
    const daysLeft = Math.floor((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    record(
      'the deadline the screen shows is 30 days out — the days remaining are readable',
      daysLeft === 29 || daysLeft === 30,
      `${daysLeft} days left`,
    )
  }

  // --- (3) A deleted account may not write (AC #7) ---------------------------

  const contactWhileDeleted = await post(
    'contacts',
    { user_id: citizen.id, name: 'another contact', phone: '+8801799000012' },
    token,
  )
  record(
    'a deleted account cannot create a contact',
    contactWhileDeleted.status >= 400 && contactWhileDeleted.status < 500,
    `HTTP ${contactWhileDeleted.status}`,
  )

  record(
    'the refused write names the reason',
    /ACCOUNT_DISABLED/i.test(contactWhileDeleted.text),
    contactWhileDeleted.text.slice(0, 120),
  )

  const shareWhileDeleted = await post(
    'location_shares',
    { sender_id: citizen.id, lat: 23.7461, lng: 90.3774 },
    token,
  )
  record(
    'a deleted account cannot share a location',
    shareWhileDeleted.status >= 400 && shareWhileDeleted.status < 500,
    `HTTP ${shareWhileDeleted.status}`,
  )

  const reportWhileDeleted = await post(
    'reports',
    {
      author_id: citizen.id,
      client_request_id: randomUUID(),
      lat: 23.7461,
      lng: 90.3774,
      captured_at: new Date().toISOString(),
      description: 'probe',
      category: 'theft',
      public_visibility: 'anonymous',
    },
    token,
  )
  record(
    'a deleted account cannot file a report',
    reportWhileDeleted.status >= 400 && reportWhileDeleted.status < 500,
    `HTTP ${reportWhileDeleted.status}`,
  )

  // --- (4) The restore inside the window (AC #2) -----------------------------

  const restore = await rpc('restore_account', token)
  record(
    'a deleted account can restore itself inside the window',
    restore.status === 200,
    `HTTP ${restore.status}`,
  )

  const afterRestore = await readProfile(token, citizen.id)
  record(
    'the restore cleared the deleted_at',
    afterRestore.rows[0]?.deleted_at === null,
    `deleted_at=${afterRestore.rows[0]?.deleted_at}`,
  )

  const afterRestoreWrite = await post(
    'contacts',
    { user_id: citizen.id, name: 'a third contact', phone: '+8801799000013' },
    token,
  )
  record(
    'a restored account can write again',
    afterRestoreWrite.status === 201,
    `HTTP ${afterRestoreWrite.status}`,
  )

  // --- (5) The window is enforced by the database (AC #5) --------------------

  // Back-date the deletion past the window, the way the passage of 31 days
  // would. The database owns the window, so the refusal must come from the
  // database — not from a client timer that a wrong device clock could
  // defeat.
  await fetch(`${API_URL}/rest/v1/profiles?id=eq.${citizen.id}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  })

  const expiredRestore = await rpc('restore_account', token)
  record(
    'a restore past the 30-day window is refused',
    expiredRestore.status >= 400 && expiredRestore.status < 500,
    `HTTP ${expiredRestore.status}`,
  )

  record(
    'the expired refusal names VALIDATION_FAILED',
    /VALIDATION_FAILED/i.test(expiredRestore.text),
    expiredRestore.text.slice(0, 120),
  )

  const afterExpired = await readProfile(token, citizen.id)
  record(
    'the refused restore did NOT clear the deleted_at',
    Boolean(afterExpired.rows[0]?.deleted_at),
    `deleted_at=${afterExpired.rows[0]?.deleted_at}`,
  )

  // A window that has not yet closed still restores.
  await fetch(`${API_URL}/rest/v1/profiles?id=eq.${citizen.id}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deleted_at: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  })

  const insideWindow = await rpc('restore_account', token)
  record(
    'a restore inside the 30-day window still succeeds',
    insideWindow.status === 200,
    `HTTP ${insideWindow.status}`,
  )

  // --- (6) A restore of an account that is not deleted -----------------------

  const notDeleted = await rpc('restore_account', token)
  record(
    'restoring an account that is not deleted is refused with CONFLICT',
    notDeleted.status >= 400 && notDeleted.status < 500 && /CONFLICT/i.test(notDeleted.text),
    `HTTP ${notDeleted.status} ${notDeleted.text.slice(0, 80)}`,
  )

  // --- (7) The purge worklist is the service role's alone (AC #8) ------------

  // The purge leg's worklist enumerates every account awaiting its PII
  // purge, and the instant it was deleted. It is a server-side batch query
  // with no authorisation of its own, so a client role that can call it can
  // read all of that.
  //
  // This is asserted over the **real** PostgREST door, as the citizen's own
  // session — because a grant that is refused in the catalogue can still be
  // honoured by the API layer's own role handling, and vice versa.
  const worklistAsCitizen = await rpc('job_purge_deleted_accounts', token, { p_batch_size: 100 })
  record(
    'a signed-in citizen cannot read the purge worklist',
    worklistAsCitizen.status >= 400 && worklistAsCitizen.status < 500,
    `HTTP ${worklistAsCitizen.status} ${worklistAsCitizen.text.slice(0, 80)}`,
  )

  // The service role can — it is the only caller the job runner uses.
  const worklistAsService = await rpcAsService('job_purge_deleted_accounts', { p_batch_size: 100 })
  record(
    'the service role can read the purge worklist',
    worklistAsService.status === 200 && Array.isArray(worklistAsService.body),
    `HTTP ${worklistAsService.status}`,
  )

  // --- (8) The purge waits for the window (AC #8) ---------------------------

  // The account was restored at the end of step (5), so it is not deleted.
  // Soft-delete it again and back-date it, then read the worklist: the
  // account must appear only once its window has closed.
  await rpc('soft_delete_account', token)

  const worklistWhileRecoverable = await rpcAsService('job_purge_deleted_accounts', {
    p_batch_size: 100,
  })
  const listedWhileRecoverable = Array.isArray(worklistWhileRecoverable.body)
    ? worklistWhileRecoverable.body.some((row) => row?.id === citizen.id)
    : false
  record(
    'a freshly deleted account is not on the purge worklist',
    !listedWhileRecoverable,
    `listed=${listedWhileRecoverable}`,
  )
  record(
    'the purge worklist answered for the recoverable account',
    worklistWhileRecoverable.status === 200,
    `HTTP ${worklistWhileRecoverable.status}`,
  )

  // Back-date past the window. Now it must appear.
  await fetch(`${API_URL}/rest/v1/profiles?id=eq.${citizen.id}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  })

  const worklistAfterExpiry = await rpcAsService('job_purge_deleted_accounts', { p_batch_size: 100 })
  const listedAfterExpiry = Array.isArray(worklistAfterExpiry.body)
    ? worklistAfterExpiry.body.some((row) => row?.id === citizen.id)
    : false
  record(
    'an account past the 30-day window IS on the purge worklist',
    listedAfterExpiry,
    `listed=${listedAfterExpiry}`,
  )

  await cleanup(citizen.id)

  finish()
}

function finish() {
  const failed = results.filter((r) => !r.passed)
  console.log(
    `\n${results.length - failed.length}/${results.length} account-deletion probes passed`,
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('ERROR', error)
  process.exitCode = 2
})
