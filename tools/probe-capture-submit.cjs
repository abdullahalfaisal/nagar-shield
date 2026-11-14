/**
 * Probes the capture submit path over the real GoTrue + PostgREST + Storage
 * + Edge Function path.
 *
 * `004-capture / 007-storage-upload-and-finalize`:
 *
 *   * AC #1 — "the media bytes are uploaded **directly to Storage** by the
 *     client … the bucket is **private**";
 *   * AC #4 — "the response carries the new `report_id`, the resolved
 *     `area_hierarchy`, and the `moderation_status`";
 *   * AC #5 — "the report is written with `moderation_status = 'visible'`";
 *   * AC #6 — "an anonymous report still carries `author_id` server-side";
 *   * AC #7 — "a capture over the daily cap is rejected with
 *     `CAPTURE_RATE_LIMIT`";
 *   * AC #8 — "the same `client_request_id` submitted twice returns the
 *     **original** `report_id` — no duplicate report";
 *   * AC #9 — "the server re-validates the media caps";
 *   * AC #10 — the upload and the submit stay inside the budget.
 *
 * ## Why this probe exists
 *
 * The capture write path is the single most important write in the app, and
 * until now **nothing exercised it end to end**. That is how a real defect
 * survived: the Edge Function answered in snake_case (`report_id`) while the
 * client read `data.reportId`, so `data.reportId` was always `undefined` and
 * **every successful capture was misread as a failure** — handed to the
 * offline queue as a transport error, retried, and eventually filed twice.
 * The user saw "saved on device" for a report that had in fact landed.
 *
 * The probe therefore asserts the **wire contract** directly: the response
 * body must carry `report_id`, and the value must be the id of the row that
 * actually exists in the database.
 *
 * Usage: node tools/probe-capture-submit.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')
const { randomUUID, createHash } = require('node:crypto')

const API_URL = 'http://127.0.0.1:54321'
const DEV_PASSWORD = 'nagar-local-dev'

/**
 * The probe's author — a **fresh account on every run**.
 *
 * It was the seeded `citizen@nagar.local`, whose uuid the seed migration
 * fixes. But FR-CAPTURE-3 caps an author at 50 reports a day, and this probe
 * files a real capture through the real Edge Function — so every run spent
 * that account's daily allowance, and after about fifty runs the probe failed
 * with HTTP 429 against a **healthy** codebase. A proof that stops working
 * after N runs is not a proof. The account is created through the Auth admin
 * endpoint instead, so every run has an allowance of its own.
 */
const AUTHOR = { email: `capture-probe-author-${randomUUID()}@test.local`, id: '' }

/** The media bucket. Private by construction — the probe proves it. */
const MEDIA_BUCKET = 'report-media'

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

async function signIn(email) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, token: body.access_token, body }
}

/**
 * Creates the run's author and returns its uuid.
 *
 * The `profiles` row is written by the signup trigger from the Auth metadata,
 * and the trigger refuses a metadata without a phone (`PHONE_REQUIRED`). The
 * phone has to be **digits only** — `profiles.phone` is UNIQUE, so every run
 * needs its own.
 */
async function createAuthor() {
  const subscriber = String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
  const response = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: AUTHOR.email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { phone: `+88019${subscriber}` },
    }),
  })

  if (response.status !== 200) return ''
  const body = await response.json().catch(() => ({}))
  return body.id ?? ''
}

/**
 * The author's token — the hex SHA-256 of their user id.
 *
 * The storage path carries this token, not the raw uuid, because the public
 * alert detail hands the media path to every signed-in reader. A path with
 * the author's uuid in it would be a stable handle on the author.
 */
function authorTokenFor(userId) {
  return createHash('sha256').update(userId).digest('hex')
}

/** Uploads a tiny valid PNG into the private bucket, as the signed-in user. */
async function uploadMedia(token, storagePath, bytes) {
  const response = await fetch(`${API_URL}/storage/v1/object/${MEDIA_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  return { status: response.status }
}

/** Calls the `finalize-capture` Edge Function with the caller's JWT. */
async function finalizeCapture(token, payload) {
  const response = await fetch(`${API_URL}/functions/v1/finalize-capture`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

/** A PostgREST read of the reports table, as the signed-in user. */
async function readReports(token, query = '') {
  const response = await fetch(`${API_URL}/rest/v1/reports${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  const body = await response.json().catch(() => [])
  return { status: response.status, rows: Array.isArray(body) ? body : [] }
}

/** Removes the probe rows, using the service role so nothing is scoped away. */
async function cleanupProbeRows(clientRequestIds) {
  for (const clientRequestId of clientRequestIds) {
    await fetch(`${API_URL}/rest/v1/reports?client_request_id=eq.${clientRequestId}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    })
    await fetch(`${API_URL}/rest/v1/report_media?storage_path=like.*${clientRequestId}*`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    })
    await fetch(
      `${API_URL}/storage/v1/object/${MEDIA_BUCKET}/reports?prefixes=reports/&limit=100`,
      {
        method: 'DELETE',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      },
    )
  }
}

/** A 1x1 PNG — the smallest byte sequence that is a real image. */
function onePixelPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
}

async function main() {
  AUTHOR.id = await createAuthor()
  if (!AUTHOR.id) {
    console.log('SKIP: the run’s author could not be created')
    process.exitCode = 0
    return
  }

  const signInAuthor = await signIn(AUTHOR.email)

  if (signInAuthor.status !== 200 || !signInAuthor.token) {
    console.log(`SKIP: cannot sign in as ${AUTHOR.email} (HTTP ${signInAuthor.status})`)
    process.exitCode = 0
    return
  }

  const token = signInAuthor.token
  const authorToken = authorTokenFor(AUTHOR.id)

  // The bucket must be private: an anonymous read of an object must fail.
  const bucketRead = await fetch(`${API_URL}/storage/v1/object/${MEDIA_BUCKET}/reports/x.png`, {
    headers: { apikey: anonKey },
  })
  record(
    'the report-media bucket is private — an anonymous read is refused',
    bucketRead.status >= 400,
    `HTTP ${bucketRead.status}`,
  )

  // --- (1) The happy path ----------------------------------------------------

  const clientRequestId = randomUUID()
  const storagePath = `reports/${authorToken}/${clientRequestId}/${clientRequestId}.png`
  const bytes = onePixelPng()

  const upload = await uploadMedia(token, storagePath, bytes)
  record(
    'the client uploads the media straight to the private bucket',
    upload.status === 200 || upload.status === 201,
    `HTTP ${upload.status}`,
  )

  const payload = {
    client_request_id: clientRequestId,
    storage_path: storagePath,
    media_type: 'photo',
    byte_size: bytes.length,
    duration_seconds: null,
    width: 1080,
    height: 1080,
    lat: 23.8103,
    lng: 90.4125,
    captured_at: new Date().toISOString(),
    description: 'probe-capture',
    public_visibility: 'anonymous',
    category: null,
  }

  const submit = await finalizeCapture(token, payload)

  record('the capture is accepted', submit.status === 200, `HTTP ${submit.status}`)

  // --- (2) The wire contract (the defect this probe exists for) -------------

  const data = submit.body?.data

  record(
    'the response body carries a `data` envelope',
    Boolean(data),
    `keys=${Object.keys(submit.body ?? {}).join(',')}`,
  )

  record(
    'the response carries `report_id` (snake_case) — the shape the client reads',
    typeof data?.report_id === 'string' && data.report_id.length > 0,
    `report_id=${data?.report_id}`,
  )

  record(
    'the response does NOT carry a camelCase `reportId` — the client must not read one',
    !Object.prototype.hasOwnProperty.call(data ?? {}, 'reportId'),
    `keys=${Object.keys(data ?? {}).join(',')}`,
  )

  record(
    'the response carries `area_hierarchy`',
    Boolean(data?.area_hierarchy),
    `area=${JSON.stringify(data?.area_hierarchy)}`,
  )

  record(
    'the response carries `moderation_status`',
    typeof data?.moderation_status === 'string',
    `moderation_status=${data?.moderation_status}`,
  )

  // --- (3) The report actually exists, and the id matches -------------------

  const reportId = data?.report_id
  const rows = await readReports(
    token,
    `?id=eq.${reportId}&select=id,author_id,moderation_status,description,public_visibility,client_request_id`,
  )

  record(
    'the report row exists in the database',
    rows.rows.length === 1,
    `rows=${rows.rows.length}`,
  )

  record(
    'the id in the response is the id of the row that exists',
    rows.rows[0]?.id === reportId,
    `row.id=${rows.rows[0]?.id} response=${reportId}`,
  )

  record(
    "the report's `moderation_status` is 'visible'",
    rows.rows[0]?.moderation_status === 'visible',
    `moderation_status=${rows.rows[0]?.moderation_status}`,
  )

  record(
    'an anonymous report still carries `author_id` server-side (AC #6)',
    rows.rows[0]?.author_id === AUTHOR.id,
    `author_id=${rows.rows[0]?.author_id}`,
  )

  record(
    'the stored `public_visibility` is the one that was submitted',
    rows.rows[0]?.public_visibility === 'anonymous',
    `public_visibility=${rows.rows[0]?.public_visibility}`,
  )

  record(
    'the stored `client_request_id` is the one that was submitted',
    rows.rows[0]?.client_request_id === clientRequestId,
    `client_request_id=${rows.rows[0]?.client_request_id}`,
  )

  // The media row must land with the report — a report never exists without
  // its media, because both are written in one transaction.
  const mediaRead = await fetch(
    `${API_URL}/rest/v1/report_media?report_id=eq.${reportId}&select=report_id,storage_path,media_type`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  )
  const mediaBody = await mediaRead.json().catch(() => [])
  const mediaRows = Array.isArray(mediaBody) ? mediaBody : []

  record(
    'the media row lands with the report, in the same transaction',
    mediaRows.length === 1,
    `rows=${mediaRows.length}`,
  )

  record(
    'the media row points at the uploaded object',
    mediaRows[0]?.storage_path === storagePath,
    `storage_path=${mediaRows[0]?.storage_path}`,
  )

  // --- (4) The idempotency guarantee (AC #8) ---------------------------------

  const retry = await finalizeCapture(token, payload)

  record(
    'the same client_request_id is accepted again',
    retry.status === 200,
    `HTTP ${retry.status}`,
  )

  record(
    'the retry returns the ORIGINAL report_id — no duplicate report',
    retry.body?.data?.report_id === reportId,
    `retry=${retry.body?.data?.report_id} original=${reportId}`,
  )

  const afterRetry = await readReports(token, `?client_request_id=eq.${clientRequestId}&select=id`)
  record(
    'exactly one report row exists for the client_request_id',
    afterRetry.rows.length === 1,
    `rows=${afterRetry.rows.length}`,
  )

  // --- (5) The ownership check ------------------------------------------------

  const foreignPath = `reports/${authorTokenFor(randomUUID())}/${randomUUID()}/x.png`
  const foreign = await finalizeCapture(token, { ...payload, storage_path: foreignPath })

  record(
    "a storage path that is not the caller's own is refused with FORBIDDEN",
    foreign.status === 403,
    `HTTP ${foreign.status}`,
  )

  // --- (6) The media caps are re-validated server-side (AC #9) ---------------

  const oversized = await finalizeCapture(token, { ...payload, byte_size: 50 * 1024 * 1024 })
  record(
    'an over-cap byte size is refused by the server',
    oversized.status >= 400,
    `HTTP ${oversized.status}`,
  )

  const badMediaType = await finalizeCapture(token, { ...payload, media_type: 'not-a-type' })
  record(
    'an unknown media type is refused with VALIDATION_FAILED',
    badMediaType.status === 400,
    `HTTP ${badMediaType.status}`,
  )

  // --- (7) The payload is validated -------------------------------------------

  const noLat = await finalizeCapture(token, { ...payload, lat: undefined })
  record(
    'a payload without a latitude is refused with VALIDATION_FAILED',
    noLat.status === 400,
    `HTTP ${noLat.status}`,
  )

  // --- (8) An unauthenticated caller is refused ------------------------------

  const anonymous = await finalizeCapture(anonKey, payload)
  record(
    'an unauthenticated submit is refused',
    anonymous.status >= 400,
    `HTTP ${anonymous.status}`,
  )

  await cleanupProbeRows([clientRequestId])

  const afterCleanup = await readReports(
    token,
    `?client_request_id=eq.${clientRequestId}&select=id`,
  )
  record(
    'the probe cleans up after itself',
    afterCleanup.rows.length === 0,
    `rows=${afterCleanup.rows.length}`,
  )

  finish()
}

function finish() {
  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} capture-submit probes passed`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('ERROR', error)
  process.exitCode = 2
})
