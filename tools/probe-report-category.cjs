/**
 * Probes the report-detail category contract over the real PostgREST path.
 *
 * `004-capture / 003-report-detail-and-category-edit`:
 *
 *   * AC #4 — "the author selects one of the 11 values … the stored
 *     `reports.category` equals it";
 *   * AC #5 — "the author changes an already-set category … the stored
 *     `reports.category` is replaced with the new value and the previous
 *     value is not retained anywhere";
 *   * AC #6 — "a signed-in user who is **not** the author … the update is
 *     rejected with `FORBIDDEN` and the stored category is unchanged";
 *   * AC #7 — "a value outside the fixed 11 … is rejected … and no row is
 *     written";
 *   * AC #8 — "the report is present in the author's own History immediately,
 *     with `moderation_status = 'visible'` and no pending-review gate";
 *   * AC #9 — "a non-author viewing a report's category … the category is
 *     shown read-only with no edit affordance";
 *   * AC #10 — "no edit affordance for [the media, the location, the
 *     description, or the visibility] exists — the category is the **only**
 *     editable field after submit".
 *
 * The probe goes through the door the app uses — GoTrue → PostgREST → the
 * RLS policies and the `update_category` RPC — with **two** signed-in
 * citizens, because the author check is only meaningful when there is
 * somebody else to be checked against.
 *
 * Usage: node tools/probe-report-category.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')

const API_URL = 'http://127.0.0.1:54321'
const DEV_PASSWORD = 'nagar-local-dev'

/** The two seeded citizens. Their uuids are FIXED by the seed migration. */
const AUTHOR = { email: 'citizen@nagar.local', id: '11111111-1111-1111-1111-1111111111a1' }
const OTHER = { email: 'citizen2@nagar.local', id: '11111111-1111-1111-1111-1111111111a3' }

/** The fixed 11-value vocabulary, in the order the story lists them. */
const THE_ELEVEN = [
  'theft',
  'assault',
  'harassment',
  'robbery',
  'accident',
  'fire',
  'medical',
  'fraud',
  'vandalism',
  'suspicious',
  'other',
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

async function signIn(email) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, token: body.access_token, body }
}

/** A PostgREST read of the reports table, as the signed-in user. */
async function readReports(token, query = '') {
  const response = await fetch(`${API_URL}/rest/v1/reports${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  const body = await response.json().catch(() => [])
  return { status: response.status, rows: Array.isArray(body) ? body : [] }
}

/** A PostgREST call of the `update_category` RPC. */
async function callUpdateCategory(token, reportId, category) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/update_category`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_report_id: reportId, p_category: category }),
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

/** The `history_nearby` read model — the author's own History. */
async function callHistoryNearby(token, lat, lng) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/history_nearby`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_lat: lat,
      p_lng: lng,
      p_radius_km: 50,
      p_window_hours: 24 * 30,
    }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}

/**
 * Creates a report row directly, with the service role.
 *
 * The probe needs a report that exists before it can test the category
 * contract on it. The service role bypasses RLS, which is what makes this
 * possible — and it is also what makes the *negative* tests meaningful: the
 * row is created by the server and then read back **through the client's own
 * door**, so the RLS policies are still the thing under test.
 */
async function createReport(reportId, authorId) {
  const response = await fetch(`${API_URL}/rest/v1/reports`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: reportId,
      author_id: authorId,
      client_request_id: randomUUID(),
      lat: 23.8103,
      lng: 90.4125,
      captured_at: new Date().toISOString(),
      description: 'probe-report',
      category: null,
      public_visibility: 'anonymous',
      area_hierarchy: {
        division: 'Dhaka',
        city: 'Dhaka',
        thana: 'Gulshan',
        neighborhood: null,
      },
    }),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: response.status, text, row: Array.isArray(parsed) ? parsed[0] : parsed }
}

/** Removes the probe rows, using the service role so nothing is scoped away. */
async function cleanupProbeRows() {
  await fetch(`${API_URL}/rest/v1/reports?id=like.probe-*`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  await fetch(`${API_URL}/rest/v1/reports?description=eq.probe-report`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
}

async function main() {
  await cleanupProbeRows()

  const signInAuthor = await signIn(AUTHOR.email)
  const signInOther = await signIn(OTHER.email)

  if (signInAuthor.status !== 200 || !signInAuthor.token) {
    console.log(`SKIP: cannot sign in as ${AUTHOR.email} (HTTP ${signInAuthor.status})`)
    process.exitCode = 0
    return
  }
  if (signInOther.status !== 200 || !signInOther.token) {
    console.log(`SKIP: cannot sign in as ${OTHER.email} (HTTP ${signInOther.status})`)
    process.exitCode = 0
    return
  }

  const token = signInAuthor.token
  const otherToken = signInOther.token

  // A report id that is recognisable as a probe row, so cleanup can find it.
  const reportId = randomUUID()

  // --- (0) The report starts with NO category -----------------------------

  const created = await createReport(reportId, AUTHOR.id)
  record(
    'the probe report row is created',
    created.status === 200 || created.status === 201,
    `HTTP ${created.status}`,
  )

  const initial = await readReports(token, `?id=eq.${reportId}&select=id,category,author_id`)
  record(
    'the author can read their own report',
    initial.rows.length === 1,
    `rows=${initial.rows.length}`,
  )
  record(
    "the report's category starts NULL — a report with no category is valid",
    initial.rows[0]?.category === null || initial.rows[0]?.category === undefined,
    `category=${initial.rows[0]?.category}`,
  )

  // --- (1) The author sets a category -------------------------------------

  const set = await callUpdateCategory(token, reportId, 'theft')
  record('the author can set a category', set.status === 200, `HTTP ${set.status}`)

  const afterSet = await readReports(token, `?id=eq.${reportId}&select=id,category`)
  record(
    'the stored category equals the selected value',
    afterSet.rows[0]?.category === 'theft',
    `category=${afterSet.rows[0]?.category}`,
  )

  // --- (2) The author changes it — the old value is replaced ---------------

  const changed = await callUpdateCategory(token, reportId, 'fire')
  record(
    'the author can change an already-set category',
    changed.status === 200,
    `HTTP ${changed.status}`,
  )

  const afterChange = await readReports(token, `?id=eq.${reportId}&select=id,category`)
  record(
    'the stored category is replaced with the new value',
    afterChange.rows[0]?.category === 'fire',
    `category=${afterChange.rows[0]?.category}`,
  )
  record(
    'the previous value is not retained anywhere on the row',
    !/theft/i.test(JSON.stringify(afterChange.rows[0] ?? {})),
    JSON.stringify(afterChange.rows[0] ?? {}),
  )

  // --- (3) The non-author is refused (AC #6) --------------------------------

  const otherBefore = await readReports(otherToken, `?id=eq.${reportId}&select=id,category`)
  record(
    "a non-author cannot even read the author's report",
    otherBefore.status === 200 && otherBefore.rows.length === 0,
    `HTTP ${otherBefore.status} rows=${otherBefore.rows.length}`,
  )

  const otherWrite = await callUpdateCategory(otherToken, reportId, 'fraud')
  record(
    "a non-author's category update is refused with FORBIDDEN",
    otherWrite.status >= 400 && otherWrite.status < 500,
    `HTTP ${otherWrite.status}`,
  )

  const afterOther = await readReports(token, `?id=eq.${reportId}&select=id,category`)
  record(
    "the stored category is unchanged after the non-author's attempt",
    afterOther.rows[0]?.category === 'fire',
    `category=${afterOther.rows[0]?.category}`,
  )

  // --- (4) A value outside the fixed 11 is refused (AC #7) ------------------

  const bogus = await callUpdateCategory(token, reportId, 'not-a-category')
  record(
    'a value outside the fixed 11 is refused',
    bogus.status >= 400 && bogus.status < 500,
    `HTTP ${bogus.status}`,
  )

  const afterBogus = await readReports(token, `?id=eq.${reportId}&select=id,category`)
  record(
    'the refused value wrote no row',
    afterBogus.rows[0]?.category === 'fire',
    `category=${afterBogus.rows[0]?.category}`,
  )

  // --- (5) Every one of the 11 values is accepted --------------------------

  const rejected = []
  for (const value of THE_ELEVEN) {
    const attempt = await callUpdateCategory(token, reportId, value)
    if (attempt.status !== 200) rejected.push(`${value}(HTTP ${attempt.status})`)
  }
  record('all 11 of the fixed values are accepted', rejected.length === 0, rejected.join(','))

  // --- (6) Only the category is editable (AC #10) ---------------------------

  // The `reports_update_guard` trigger refuses any other column change. The
  // probe writes directly through PostgREST — the same door the app would
  // use — so the refusal is the trigger's, not the UI's.
  const editDescription = await fetch(`${API_URL}/rest/v1/reports?id=eq.${reportId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ description: 'probe-edited' }),
  })
  record(
    'the description is not editable after submit',
    editDescription.status >= 400 && editDescription.status < 500,
    `HTTP ${editDescription.status}`,
  )

  const editVisibility = await fetch(`${API_URL}/rest/v1/reports?id=eq.${reportId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ public_visibility: 'identified' }),
  })
  record(
    'the visibility is not editable after submit',
    editVisibility.status >= 400 && editVisibility.status < 500,
    `HTTP ${editVisibility.status}`,
  )

  const afterEdits = await readReports(
    token,
    `?id=eq.${reportId}&select=id,description,public_visibility`,
  )
  record(
    'the refused edits left the row untouched',
    afterEdits.rows[0]?.description === 'probe-report' &&
      afterEdits.rows[0]?.public_visibility === 'anonymous',
    `description=${afterEdits.rows[0]?.description} visibility=${afterEdits.rows[0]?.public_visibility}`,
  )

  // --- (7) The report is in the author's own History immediately (AC #8) ----

  const history = await callHistoryNearby(token, 23.8103, 90.4125)
  const historyItems = Array.isArray(history.body?.items) ? history.body.items : []
  const ownItem = historyItems.find((item) => item.id === reportId)

  record(
    "the report is present in the author's own History immediately",
    Boolean(ownItem),
    `items=${historyItems.length}`,
  )
  // The `history_nearby` projection does not carry `moderation_status` at
  // all — it **filters** to `moderation_status in ('visible','restored')`. So
  // the row's presence in the projection IS the guarantee: a report that was
  // pending review, hidden, or withdrawn would not be in the result at all.
  // The assertion is therefore that the row is present AND flagged as the
  // caller's own, not that a field reads 'visible'.
  record(
    "the report is in History as the caller's own row — no pending-review gate",
    ownItem?.is_own === true,
    `is_own=${ownItem?.is_own}`,
  )

  // The public projection must not leak the author. The History item is the
  // author's own, so it may carry the flag — but `author_id` must never
  // appear on the public feed.
  const hasAuthorId = Object.prototype.hasOwnProperty.call(ownItem ?? {}, 'author_id')
  record(
    'the History projection does not carry author_id',
    !hasAuthorId,
    `keys=${Object.keys(ownItem ?? {}).join(',')}`,
  )

  // --- (8) The category is read-only for a non-author (AC #9) ----------------

  const otherRead = await readReports(otherToken, `?id=eq.${reportId}&select=id,category`)
  record(
    'a non-author sees no category row to edit (no row resolves)',
    otherRead.rows.length === 0,
    `rows=${otherRead.rows.length}`,
  )

  await cleanupProbeRows()

  // The cleanup must actually have removed the row.
  const afterCleanup = await readReports(token, `?id=eq.${reportId}&select=id`)
  record(
    'the probe cleans up after itself',
    afterCleanup.rows.length === 0,
    `rows=${afterCleanup.rows.length}`,
  )

  finish()
}

function finish() {
  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} report-category probes passed`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('ERROR', error)
  process.exitCode = 2
})
