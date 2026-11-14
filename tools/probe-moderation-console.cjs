/**
 * Probes the moderator console's **read models** over the real PostgREST path.
 *
 * `007-moderation / 001-moderator-login-and-queue`, `002-report-review-detail`,
 * `004-disable-a-user`, `006-moderator-action-audit-log`:
 *
 *   * `001` AC #3 — "a non-moderator calling the queue read model is refused
 *     with `FORBIDDEN`";
 *   * `002` AC #5/#6/#7 — the uploader's identity is in the **server payload**
 *     of the detail, with the account state, and it is masked on the client;
 *   * `004` AC #1/#2 — "the matching account rows are listed with their
 *     account state and a per-user report count", and the empty state
 *     returns **no rows**;
 *   * `006` AC #3 — the audit payload carries **exactly** the specified keys
 *     and no report contents.
 *
 * **What this probe adds.** `tools/smoke-functions.cjs` proves the Edge
 * Functions — `moderation-decide`, `disable-user`. It does **not** touch the
 * four console read models (`moderation_queue`, `moderation_report_detail`,
 * `moderator_search_users`, `moderation_audit_feed`), because those are
 * called by the **browser**, over PostgREST, with the moderator's own
 * session — a different door, a different credential, and a different
 * authorisation path from the service-role functions. `read_models.sql`
 * asserts them from SQL, which cannot see the JSON shape the browser
 * actually receives.
 *
 * So this probe closes the one gap the console had: the **shape and the
 * authorisation** of the four payloads, as the browser receives them.
 *
 * **The fixture is built, not borrowed.** The queue only holds
 * `hidden_pending_review` reports, and the audit trail only has rows once
 * something has been decided — so a probe that read whatever happened to be
 * in the database would pass on a dirty instance and fail on a clean one.
 * This probe creates its own report through the real `finalize-capture`
 * function, flags it three times as three distinct citizens so the
 * **product's own** threshold moves it into the queue, and then decides it
 * so the trail has a row. The fixture is scoped to this run by a unique
 * client request id and a unique note, so the probe is re-runnable and its
 * assertions cannot be satisfied by another run's leftovers.
 *
 * Usage: node tools/probe-moderation-console.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')
const { createHash, randomUUID } = require('node:crypto')

const API_URL = 'http://127.0.0.1:54321'
const DEV_PASSWORD = 'nagar-local-dev'
const CONTAINER = 'supabase_db_nagar-shield'

/** The seeded accounts. Their uuids are FIXED by the seed migration. */
const MODERATOR = { email: 'mod@nagar.local', id: '11111111-1111-1111-1111-1111111111a2' }
const CITIZEN = { email: 'citizen@nagar.local', id: '11111111-1111-1111-1111-1111111111a1' }
const CITIZEN2 = { email: 'citizen2@nagar.local', id: '11111111-1111-1111-1111-1111111111a3' }

/** The seeded phone numbers, exactly as the seed migration writes them. */
const CITIZEN_PHONE = '+8801911000001'

/**
 * The author token — the hex SHA-256 of the author's user id.
 *
 * This mirrors `authorToken()` in `packages/shared/src/storage/index.ts`. The
 * media path must carry the token rather than the raw uuid so that a media
 * path never leaks the author's uuid (FR-DATA-3).
 */
function authorToken(userId) {
  return createHash('sha256').update(userId, 'utf8').digest('hex')
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
 * A PostgREST call of a console read model, as the signed-in user.
 *
 * The console calls these through `supabase-js`, which uses PostgREST's
 * `/rest/v1/rpc/<fn>` path with the arguments as a JSON body — exactly what
 * this does.
 */
async function callRpc(token, fn, args = {}) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  return { status: response.status, text, body }
}

/** A call of one of the Edge Functions, as the signed-in user. */
async function callFunction(name, body, bearer) {
  const response = await fetch(`${API_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${bearer}`,
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

/** Reads a scalar out of the local database as the table owner. */
function psqlScalar(sql) {
  const output = execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  )
  return output.trim()
}

/**
 * Builds the fixture: a report in the moderator's queue.
 *
 * The report is created through the real `finalize-capture` function, and it
 * enters the queue through the **product's own** rule — three distinct
 * citizens flag it — rather than a hand-written UPDATE that would bypass the
 * threshold the probe is beside. The flag's identity comes from the JWT, so
 * the three flags must be three real sessions.
 */
async function buildQueuedFixture(citizenToken) {
  const clientRequestId = randomUUID()
  const note = `console probe ${clientRequestId}`

  const created = await callFunction(
    'finalize-capture',
    {
      client_request_id: clientRequestId,
      storage_path: `reports/${authorToken(CITIZEN.id)}/${clientRequestId}.jpg`,
      media_type: 'photo',
      byte_size: 2048,
      duration_seconds: null,
      width: 800,
      height: 600,
      lat: 23.7461,
      lng: 90.3774,
      captured_at: new Date().toISOString(),
      description: 'moderator console probe',
      public_visibility: 'anonymous',
      category: 'theft',
    },
    citizenToken,
  )

  if (created.status !== 200 || !created.body?.data?.report_id) {
    return { ok: false, reason: `finalize-capture HTTP ${created.status}` }
  }

  const reportId = created.body.data.report_id

  // Three distinct flaggers — and **none of them the author**. `flag_report`
  // refuses an own-report flag ("A user cannot flag their own report"), so
  // the author would silently contribute nothing and the report would never
  // reach the queue. The two remaining seeded citizens plus a throwaway
  // created for this run give three real sessions, because the flag's
  // identity comes from the JWT and the flags table has a unique constraint
  // on `(report_id, flagger_id)`.
  const thirdEmail = `console-probe-flagger-${randomUUID()}@test.local`
  await createThrowawayCitizen(thirdEmail)

  const flaggers = [CITIZEN2.email, MODERATOR.email, thirdEmail]
  let flagged = 0
  for (const email of flaggers) {
    const session = await signIn(email)
    if (!session.token) continue
    const flag = await callRpc(session.token, 'flag_report', {
      p_report_id: reportId,
      p_reason: 'other',
    })
    if (flag.status === 200) flagged += 1
  }

  const status = psqlScalar(
    `select moderation_status from public.reports where id = '${reportId}';`,
  )

  return { ok: status === 'hidden_pending_review', reportId, note, flagged, status }
}

/**
 * Creates a throwaway citizen with a known password.
 *
 * The admin endpoint needs the **service-role** key — the anon key is
 * refused. The `phone` is in the metadata because the profile's phone is
 * what the trigger copies over, and the profiles table requires one.
 */
async function createThrowawayCitizen(email) {
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
  return body.id ?? null
}

async function main() {
  console.log('probing the moderator console read models\n')

  const moderator = await signIn(MODERATOR.email)
  record('the moderator can sign in', Boolean(moderator.token), `HTTP ${moderator.status}`)

  const citizen = await signIn(CITIZEN.email)
  record('the citizen can sign in', Boolean(citizen.token), `HTTP ${citizen.status}`)

  if (!moderator.token || !citizen.token) {
    finish()
    return
  }

  const moderatorToken = moderator.token
  const citizenToken = citizen.token

  // ---------------------------------------------------------------------
  // 0. The fixture — a report in the moderator's queue.
  // ---------------------------------------------------------------------

  const fixture = await buildQueuedFixture(citizenToken)
  record(
    'the fixture report is in the moderator queue',
    fixture.ok,
    fixture.ok
      ? fixture.reportId
      : `${fixture.reason} status=${fixture.status} flagged=${fixture.flagged}`,
  )

  if (!fixture.ok) {
    finish()
    return
  }

  // ---------------------------------------------------------------------
  // 1. The queue is moderator-only, and it answers the browser's shape.
  // ---------------------------------------------------------------------

  const citizenQueue = await callRpc(citizenToken, 'moderation_queue', {
    p_cursor: null,
    p_limit: 20,
  })
  record(
    'a citizen is refused the moderation queue',
    citizenQueue.status === 403,
    `HTTP ${citizenQueue.status}`,
  )

  const queue = await callRpc(moderatorToken, 'moderation_queue', {
    p_cursor: null,
    p_limit: 20,
  })
  record('a moderator gets the moderation queue', queue.status === 200, `HTTP ${queue.status}`)

  const queueEnvelope = queue.body ?? {}
  const queueItems = Array.isArray(queueEnvelope.items) ? queueEnvelope.items : []
  record(
    'the queue envelope carries an items array and a next_cursor key',
    Array.isArray(queueEnvelope.items) && 'next_cursor' in queueEnvelope,
    `items=${queueItems.length} next_cursor=${String(queueEnvelope.next_cursor)}`,
  )

  // The console's own types assert this — `toQueueItem` reads exactly these
  // keys — so a payload that dropped one would render an empty row rather
  // than fail loudly. The probe asserts the shape the browser receives.
  const QUEUE_KEYS = [
    'id',
    'category',
    'description',
    'area_hierarchy',
    'captured_at',
    'flag_count',
    'flags',
    'media',
    'hide_reason',
    'author_flags_24h',
  ]
  const queueItem = queueItems.find((item) => item.id === fixture.reportId) ?? queueItems[0]
  const queueKeys = queueItem ? Object.keys(queueItem).sort() : []
  const missingQueueKeys = QUEUE_KEYS.filter((key) => !queueKeys.includes(key))
  record(
    'the queue row carries the keys the console renders',
    missingQueueKeys.length === 0,
    missingQueueKeys.length === 0 ? queueKeys.join(',') : `missing ${missingQueueKeys.join(',')}`,
  )

  // The queue must never carry the raw author uuid: the console masks the
  // identity on the client, and a raw uuid in the payload would be one
  // unmasking mistake away from a leak.
  const queueCarriesAuthor = queueItem ? 'author_id' in queueItem : false
  record(
    'the queue row does not carry the raw author id',
    !queueCarriesAuthor,
    `keys=${queueKeys.join(',')}`,
  )

  // The fixture's flags must be visible on the row — the moderator judges
  // the report on the flag reasons, not on a count alone.
  const queueFlags = Array.isArray(queueItem?.flags) ? queueItem.flags : []
  record(
    'the queue row carries the flag reasons',
    queueFlags.length === 3,
    `flags=${queueFlags.length}`,
  )

  // ---------------------------------------------------------------------
  // 2. The detail carries the uploader's identity — server-side only.
  // ---------------------------------------------------------------------

  const citizenDetail = await callRpc(citizenToken, 'moderation_report_detail', {
    p_report_id: fixture.reportId,
  })
  record(
    'a citizen is refused the report detail',
    citizenDetail.status === 403,
    `HTTP ${citizenDetail.status}`,
  )

  const detail = await callRpc(moderatorToken, 'moderation_report_detail', {
    p_report_id: fixture.reportId,
  })
  record('a moderator gets the report detail', detail.status === 200, `HTTP ${detail.status}`)

  const detailBody = detail.body ?? {}
  const uploader = detailBody.uploader ?? {}

  record(
    'the detail carries the uploader identity block',
    typeof uploader === 'object' && Object.keys(uploader).length > 0,
    `keys=${Object.keys(uploader).join(',')}`,
  )

  // Story 002 AC #6 — "the profile id, registered phone, and email are
  // present and the account state is shown". The account state is the
  // `disabled_at` / `deleted_at` pair.
  record(
    'the uploader identity carries the account state',
    'disabled_at' in uploader && 'deleted_at' in uploader,
    `keys=${Object.keys(uploader).join(',')}`,
  )

  // Story 002 AC #7 — the identity must not appear in the URL, the query
  // keys, or the logs. The payload is the one place it MAY appear, so the
  // probe asserts it is in the payload — the browser then masks it.
  record(
    "the uploader's phone is in the server payload",
    typeof uploader.phone === 'string' && uploader.phone.length > 0,
    `phone=${String(uploader.phone)}`,
  )

  // The detail's `prior_actions` is the same append-only trail the audit
  // view reads — story 002's decision-history strip.
  record(
    'the detail carries the prior-actions strip',
    Array.isArray(detailBody.prior_actions),
    `prior_actions=${Array.isArray(detailBody.prior_actions) ? detailBody.prior_actions.length : 'absent'}`,
  )

  // ---------------------------------------------------------------------
  // 3. The account search is an exact match — never a directory.
  // ---------------------------------------------------------------------

  const citizenSearch = await callRpc(citizenToken, 'moderator_search_users', {
    p_query: CITIZEN.id,
  })
  record(
    'a citizen is refused the account search',
    citizenSearch.status === 403,
    `HTTP ${citizenSearch.status}`,
  )

  // An empty query must match **nothing** — it is not a "list everything"
  // request. This is the boundary that keeps the console a targeted tool
  // rather than a user-database browser.
  const emptySearch = await callRpc(moderatorToken, 'moderator_search_users', { p_query: '' })
  const emptyItems = Array.isArray(emptySearch.body?.items) ? emptySearch.body.items : []
  record(
    'an empty query returns no accounts — it is not a directory listing',
    emptySearch.status === 200 && emptyItems.length === 0,
    `items=${emptyItems.length}`,
  )

  const noMatch = await callRpc(moderatorToken, 'moderator_search_users', {
    p_query: 'no-such-account-9d2f1c',
  })
  const noMatchItems = Array.isArray(noMatch.body?.items) ? noMatch.body.items : []
  record(
    'an unmatched query returns no accounts',
    noMatch.status === 200 && noMatchItems.length === 0,
    `items=${noMatchItems.length}`,
  )

  // A **partial** phone prefix must match nothing: the lookup is exact.
  const partial = await callRpc(moderatorToken, 'moderator_search_users', {
    p_query: CITIZEN_PHONE.slice(0, 12),
  })
  const partialItems = Array.isArray(partial.body?.items) ? partial.body.items : []
  record(
    'a partial phone prefix matches nothing — the lookup is exact',
    partial.status === 200 && partialItems.length === 0,
    `items=${partialItems.length}`,
  )

  const byPhone = await callRpc(moderatorToken, 'moderator_search_users', {
    p_query: CITIZEN_PHONE,
  })
  const byPhoneItems = Array.isArray(byPhone.body?.items) ? byPhone.body.items : []
  record(
    'the account is found by phone',
    byPhone.status === 200 && byPhoneItems.length === 1,
    `items=${byPhoneItems.length} query=${CITIZEN_PHONE}`,
  )

  const byEmail = await callRpc(moderatorToken, 'moderator_search_users', {
    p_query: 'CITIZEN@NAGAR.LOCAL',
  })
  const byEmailItems = Array.isArray(byEmail.body?.items) ? byEmail.body.items : []
  record(
    'the account is found by email, case-insensitively',
    byEmail.status === 200 && byEmailItems.length === 1,
    `items=${byEmailItems.length}`,
  )

  const byId = await callRpc(moderatorToken, 'moderator_search_users', {
    p_query: CITIZEN.id,
  })
  const byIdItems = Array.isArray(byId.body?.items) ? byId.body.items : []
  record(
    'the account is found by profile id',
    byId.status === 200 && byIdItems.length === 1,
    `items=${byIdItems.length}`,
  )

  // Story 004 AC #1 — "the matching account rows are listed with their
  // account state and a per-user report count".
  const account = byIdItems[0] ?? {}
  record(
    'the account row carries its account state',
    'disabled_at' in account && 'deleted_at' in account,
    `keys=${Object.keys(account).join(',')}`,
  )
  record(
    'the account row carries a per-user report count',
    typeof account.report_count === 'number',
    `report_count=${String(account.report_count)}`,
  )

  // The per-user count is moderation context about ONE account — it is not
  // an aggregate over the corpus (FR-NG-3).
  const expectedCount = psqlScalar(
    `select count(*)::text from public.reports where author_id = '${CITIZEN.id}';`,
  )
  record(
    'the per-user report count matches the database',
    String(account.report_count) === expectedCount,
    `payload=${String(account.report_count)} db=${expectedCount}`,
  )

  // A moderator row is found too — and the console renders a **refusal** in
  // place of the disable control for it, so the row must still be returned.
  const moderatorRow = await callRpc(moderatorToken, 'moderator_search_users', {
    p_query: MODERATOR.id,
  })
  const moderatorItems = Array.isArray(moderatorRow.body?.items) ? moderatorRow.body.items : []
  record(
    "a moderator's own row is findable, so the console can refuse to disable it",
    moderatorRow.status === 200 &&
      moderatorItems.length === 1 &&
      moderatorItems[0]?.role === 'moderator',
    `role=${String(moderatorItems[0]?.role)}`,
  )

  // ---------------------------------------------------------------------
  // 4. The audit trail — newest first, exactly the specified keys.
  // ---------------------------------------------------------------------

  // The trail only has a row once something has been decided, so the probe
  // decides the fixture through the real Edge Function — the same door the
  // console's decision panel uses.
  const decide = await callFunction(
    'moderation-decide',
    { report_id: fixture.reportId, decision: 'restore', note: fixture.note },
    moderatorToken,
  )
  record('the fixture decision is accepted', decide.status === 200, `HTTP ${decide.status}`)

  const citizenAudit = await callRpc(citizenToken, 'moderation_audit_feed', {
    p_cursor: null,
    p_limit: 20,
    p_decision: null,
  })
  record(
    'a citizen is refused the audit trail',
    citizenAudit.status === 403,
    `HTTP ${citizenAudit.status}`,
  )

  const audit = await callRpc(moderatorToken, 'moderation_audit_feed', {
    p_cursor: null,
    p_limit: 20,
    p_decision: null,
  })
  record('a moderator gets the audit trail', audit.status === 200, `HTTP ${audit.status}`)

  const auditEnvelope = audit.body ?? {}
  const auditItems = Array.isArray(auditEnvelope.items) ? auditEnvelope.items : []
  record(
    'the audit envelope carries an items array and a next_cursor key',
    Array.isArray(auditEnvelope.items) && 'next_cursor' in auditEnvelope,
    `items=${auditItems.length} next_cursor=${String(auditEnvelope.next_cursor)}`,
  )

  const auditRow = auditItems.find((item) => item.id && item.note === fixture.note)
  record(
    'the trail carries the decision the probe just made',
    Boolean(auditRow),
    `items=${auditItems.length}`,
  )

  if (auditRow) {
    const AUDIT_KEYS = [
      'created_at',
      'decision',
      'id',
      'moderator_display_name',
      'moderator_id',
      'note',
      'report_id',
      'target_user_id',
    ]
    const auditKeys = Object.keys(auditRow).sort()
    const missingAuditKeys = AUDIT_KEYS.filter((key) => !auditKeys.includes(key))
    const extraAuditKeys = auditKeys.filter((key) => !AUDIT_KEYS.includes(key))
    record(
      'the audit row carries exactly the specified keys',
      missingAuditKeys.length === 0 && extraAuditKeys.length === 0,
      missingAuditKeys.length || extraAuditKeys.length
        ? `missing ${missingAuditKeys.join(',')} extra ${extraAuditKeys.join(',')}`
        : auditKeys.join(','),
    )

    // Story 006 — the trail points at a report, it never duplicates the
    // report's contents.
    const LEAK_KEYS = [
      'area_hierarchy',
      'description',
      'lat',
      'latitude',
      'lng',
      'longitude',
      'media',
      'public_visibility',
      'storage_path',
    ]
    const leaked = auditKeys.filter((key) => LEAK_KEYS.includes(key))
    record(
      'the audit row carries no report contents',
      leaked.length === 0,
      leaked.length === 0 ? 'none' : leaked.join(','),
    )

    // The moderator's identity comes from the JWT, so the trail is always
    // attributable and cannot be forged by the client.
    record(
      'the audit row attributes the decision to the moderator',
      auditRow.moderator_id === MODERATOR.id,
      `moderator_id=${String(auditRow.moderator_id)}`,
    )
    record(
      'the audit row carries the reason as written',
      auditRow.note === fixture.note,
      `note=${String(auditRow.note)}`,
    )

    // Newest first — the console renders the trail in the order it arrives.
    const times = auditItems.map((item) => String(item.created_at ?? ''))
    const sorted = [...times].sort().reverse()
    record(
      'the trail is newest first',
      JSON.stringify(times) === JSON.stringify(sorted),
      times[0] ?? '',
    )
  }

  // The decision filter is a **server** parameter, so it belongs in the
  // query key (story 006's filter). A filter that is ignored server-side
  // would make the console's filter a lie.
  const filtered = await callRpc(moderatorToken, 'moderation_audit_feed', {
    p_cursor: null,
    p_limit: 20,
    p_decision: 'restore',
  })
  const filteredItems = Array.isArray(filtered.body?.items) ? filtered.body.items : []
  const allRestore = filteredItems.every((item) => item.decision === 'restore')
  record(
    "the trail's decision filter is applied server-side",
    filtered.status === 200 && allRestore,
    `items=${filteredItems.length}`,
  )

  finish()
}

function finish() {
  const failed = results.filter((r) => !r.passed)
  console.log(
    `\n${results.length - failed.length}/${results.length} moderator-console probes passed`,
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('ERROR', error)
  process.exitCode = 2
})
