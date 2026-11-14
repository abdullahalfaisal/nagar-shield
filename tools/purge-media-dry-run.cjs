/**
 * The media-purge dry run.
 *
 * Calls the `purge-media` Edge Function in **dry-run mode** against a
 * configured project and reports the worklist it *would* process: how many
 * media objects are past the 90-day window, and how many bytes they would
 * reclaim.
 *
 * The dry run is a first-class mode of the function, not a flag day. It
 * performs **no** Storage delete and writes **no** `purged_at`, so it is
 * safe to run against production at any time.
 *
 * Usage:
 *   node tools/purge-media-dry-run.cjs
 *   node tools/purge-media-dry-run.cjs --url https://<ref>.supabase.co --key <service-role-key>
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/purge-media-dry-run.cjs
 *
 * The service-role key is read from the environment or from the command line
 * and is **never** echoed: the report prints the worklist, never the
 * credential.
 */

'use strict'

const { execFileSync } = require('node:child_process')

const DEFAULT_URL = 'http://127.0.0.1:54321'

function readFlag(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

/** Reads the local Supabase keys when no explicit target was given. */
function localEnv() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  })
  const read = (key) => {
    const match = output.match(new RegExp(`${key}="([^"]+)"`))
    return match ? match[1] : ''
  }
  return { url: read('API_URL'), key: read('SERVICE_ROLE_KEY') }
}

/** Formats a byte count for a human-readable report. */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

async function main() {
  const flagUrl = readFlag('--url')
  const flagKey = readFlag('--key')

  let targetUrl = flagUrl ?? process.env.SUPABASE_URL ?? ''
  let serviceRoleKey = flagKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!targetUrl || !serviceRoleKey) {
    const local = localEnv()
    targetUrl = targetUrl || local.url
    serviceRoleKey = serviceRoleKey || local.key
  }

  if (!targetUrl || !serviceRoleKey) {
    console.error(
      'No target. Pass --url and --key, or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
    process.exit(1)
  }

  const response = await fetch(`${targetUrl.replace(/\/$/, '')}/functions/v1/purge-media`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dry_run: true }),
  })

  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    console.error(`The function answered with a non-JSON body (HTTP ${response.status}).`)
    process.exit(1)
  }

  if (!response.ok || body.error) {
    console.error(`The dry run failed (HTTP ${response.status}).`)
    console.error(`  code: ${body.error?.code ?? 'UNKNOWN'}`)
    console.error(`  message: ${body.error?.message ?? 'No message'}`)
    process.exit(1)
  }

  const data = body.data ?? {}

  console.log('Media purge — dry run')
  console.log(`  target:            ${targetUrl}`)
  console.log(`  dry_run:           ${data.dry_run}`)
  console.log(`  retention window:  ${data.retention_days} days`)
  console.log(`  items to process:  ${data.items_processed}`)
  console.log(`  items to fail:     ${data.items_failed}`)
  console.log(`  bytes reclaimable: ${formatBytes(data.bytes_reclaimed)}`)
  console.log('')
  console.log('Nothing was deleted and no `purged_at` was written.')

  // A non-zero failure count means the worklist itself had a problem — the
  // operator should know before the real run, not after it.
  if (Number(data.items_failed) > 0) {
    console.error(`\n⚠ ${data.items_failed} item(s) failed during the dry run.`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
