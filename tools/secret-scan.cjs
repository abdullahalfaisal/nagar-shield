/**
 * The artifact secret scan.
 *
 * The service-role key is a **server-side** secret: it lives in the Edge
 * Functions and in CI, and it must never reach a phone, a browser bundle, or
 * a build artifact. This script is the **mechanical proof** of that rule.
 *
 * It is a CI gate (`pnpm secret:scan`), not a manual step. A finding is a
 * release blocker, not a note.
 *
 * Usage:
 *   node tools/secret-scan.cjs                                  # scan the defaults
 *   node tools/secret-scan.cjs path/to/app-release.apk           # scan an artifact
 *   node tools/secret-scan.cjs apps/mobile apps/admin/eas.json
 *
 * What it fails on:
 *   * the literal `SUPABASE_SERVICE_ROLE_KEY`
 *   * a service-role JWT role claim (`"role":"service_role"`)
 *   * a base64 JWT that decodes to a service-role payload
 *   * the literal `sb_secret_` and `SUPABASE_SECRET_KEY` (the newer Supabase
 *     secret-key formats)
 *   * a third-party analytics or ad SDK in a dependency manifest (FR-DATA-5)
 *   * `EXPO_PUBLIC_SMS_OTP_ENABLED` set to `true` anywhere
 *
 * What it deliberately does NOT flag: `SUPABASE_ANON_KEY`,
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The
 * anon key is public by design and is protected by Row Level Security.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const ROOT = path.resolve(__dirname, '..')

/** The paths scanned when none are given on the command line. */
const DEFAULT_TARGETS = [
  'apps/mobile',
  'apps/admin',
  'packages/shared',
  'eas.json',
  'apps/mobile/app.config.ts',
]

/** Directories that never carry shippable client code. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.expo',
  'dist',
  'build',
  'coverage',
  '.git',
  '.turbo',
  'vendor',
])

/** Files that legitimately hold the service key for a local function serve. */
const IGNORED_FILES = new Set([path.join('supabase', 'functions', '.env.local')])

/** Text file extensions worth scanning. Binary files are handled separately. */
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.yml',
  '.yaml',
  '.html',
  '.css',
  '.md',
  '.txt',
  '.xml',
  '.gradle',
  '.properties',
  '.env',
  '.plist',
  '.pbxproj',
])

/** Extensions that are never scanned as text. */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.zip',
  '.apk',
  '.aab',
  '.keystore',
  '.jks',
  '.pdf',
])

/**
 * The forbidden literals.
 *
 * Every one of these is a **server** credential or a server-only role. The
 * anon key is deliberately absent — it is public by design.
 */
const FORBIDDEN_LITERALS = [
  { label: 'service-role key env name', pattern: 'SUPABASE_SERVICE_ROLE_KEY' },
  { label: 'service-role key env name', pattern: 'SUPABASE_SECRET_KEY' },
  { label: 'Supabase secret-key prefix', pattern: 'sb_secret_' },
]

/** The service-role JWT role claim, with optional whitespace. */
const SERVICE_ROLE_CLAIM = /["']role["']\s*:\s*["']service_role["']/

/** A JWT — three base64url segments. */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g

/**
 * The banned third-party SDKs.
 *
 * FR-DATA-5: no analytics, no ad SDK, no crash-reporting vendor anywhere in
 * the pipeline. `expo-local-authentication` is NOT on this list — the
 * biometric gate is a required product surface, not an analytics SDK.
 */
const BANNED_SDKS = [
  '@react-native-firebase/analytics',
  'amplitude',
  'amplitude-js',
  'facebook-react-native-sdk',
  'react-native-facebook-sdk',
  '@segment/analytics-react-native',
  'react-native-fbsdk',
  'sentry-expo',
  '@sentry/react-native',
  'expo-facebook',
  'react-native-admob',
  'google-mobile-ads',
  'expo-ads-admob',
]

/** Manifests whose dependency blocks are scanned for banned SDKs. */
const MANIFEST_NAMES = new Set(['package.json'])

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

function isIgnoredFile(file) {
  const rel = path.relative(ROOT, file)
  return IGNORED_FILES.has(rel)
}

/**
 * Collects the scannable files under a path.
 *
 * A file path is taken as-is; a directory is walked. The walk skips the
 * ignored directories so `node_modules` never dominates the scan.
 */
function collectFiles(target) {
  const absolute = path.resolve(ROOT, target)

  if (!fs.existsSync(absolute)) return { files: [], missing: absolute }

  if (fs.statSync(absolute).isFile()) {
    if (isIgnoredFile(absolute)) return { files: [], missing: null }
    return { files: [absolute], missing: null }
  }

  const files = []

  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        walk(full)
        continue
      }

      if (!entry.isFile()) continue
      if (isIgnoredFile(full)) continue

      const ext = path.extname(entry.name).toLowerCase()
      if (BINARY_EXTENSIONS.has(ext)) continue
      if (!TEXT_EXTENSIONS.has(ext) && !MANIFEST_NAMES.has(entry.name)) continue

      files.push(full)
    }
  }

  walk(absolute)

  return { files, missing: null }
}

/**
 * Reads the entries out of a ZIP archive.
 *
 * An APK is a ZIP. Node has no built-in ZIP reader, so this walks the central
 * directory and inflates each entry with `zlib.inflateRawSync` — no
 * dependency, and it works on Windows.
 */
function readZipEntries(buffer) {
  const entries = []
  const EOCD_SIGNATURE = 0x06054b50
  const CENTRAL_SIGNATURE = 0x02014b50

  // The end-of-central-directory record is at the tail.
  let eocd = -1
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIGNATURE) {
      eocd = index
      break
    }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)')

  const entryCount = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break

    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    // The local header repeats the name and extra lengths.
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(dataStart, dataStart + compressedSize)

    if (method === 0) {
      entries.push({ name, data })
    } else if (method === 8) {
      try {
        entries.push({ name, data: zlib.inflateRawSync(data) })
      } catch {
        // A corrupt or unsupported entry is skipped, not fatal — the scan
        // reports what it could read.
      }
    }

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** True when the buffer looks like a ZIP/APK. */
function looksLikeZip(buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
}

/**
 * Scans one blob of text for the forbidden material.
 *
 * `source` is a human-readable label used in the report.
 */
function scanText(source, text, findings) {
  for (const { label, pattern } of FORBIDDEN_LITERALS) {
    if (text.includes(pattern)) {
      findings.push({ source, kind: label, match: pattern, snippet: redact(pattern) })
    }
  }

  if (SERVICE_ROLE_CLAIM.test(text)) {
    findings.push({
      source,
      kind: 'service-role JWT role claim',
      match: '"role":"service_role"',
      snippet: redact('"role":"service_role"'),
    })
  }

  for (const match of text.matchAll(JWT_PATTERN)) {
    const token = match[0]
    const payload = decodeJwtPayload(token)
    if (payload && /"role"\s*:\s*"service_role"/.test(payload)) {
      findings.push({
        source,
        kind: 'service-role JWT',
        match: token,
        snippet: redact(token),
      })
    }
  }

  if (/EXPO_PUBLIC_SMS_OTP_ENABLED["'\s:=]*true/i.test(text)) {
    findings.push({
      source,
      kind: 'SMS OTP feature flag enabled',
      match: 'EXPO_PUBLIC_SMS_OTP_ENABLED=true',
      snippet: 'EXPO_PUBLIC_SMS_OTP_ENABLED=true',
    })
  }
}

/** Decodes a JWT payload, returning `null` when it is not decodable JSON. */
function decodeJwtPayload(token) {
  const segments = token.split('.')
  if (segments.length < 2) return null

  try {
    const normalized = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return null
  }
}

/** Redacts a match so a report never repeats a live credential. */
function redact(value) {
  if (value.length <= 12) return `${value.slice(0, 4)}…`
  return `${value.slice(0, 8)}…`
}

/** Scans a dependency manifest for the banned SDKs. */
function scanManifest(file, text, findings) {
  let manifest
  try {
    manifest = JSON.parse(text)
  } catch {
    return
  }

  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

  for (const section of sections) {
    const deps = manifest[section]
    if (!deps || typeof deps !== 'object') continue

    for (const name of Object.keys(deps)) {
      if (BANNED_SDKS.includes(name)) {
        findings.push({
          source: relative(file),
          kind: 'third-party analytics / ad SDK (FR-DATA-5)',
          match: name,
          snippet: name,
        })
      }
    }
  }
}

function main() {
  const targets = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  const scanTargets = targets.length > 0 ? targets : DEFAULT_TARGETS

  const findings = []
  const scannedFiles = []
  const missingTargets = []

  for (const target of scanTargets) {
    const { files, missing } = collectFiles(target)

    if (missing) {
      missingTargets.push(target)
      continue
    }

    for (const file of files) {
      const stat = fs.statSync(file)

      // An APK (or any zip) is scanned through its entries.
      if (stat.isFile() && looksLikeZip(fs.readFileSync(file).subarray(0, 4))) {
        const buffer = fs.readFileSync(file)
        let entries = []
        try {
          entries = readZipEntries(buffer)
        } catch (error) {
          findings.push({
            source: relative(file),
            kind: 'unreadable archive',
            match: '—',
            snippet: error instanceof Error ? error.message : String(error),
          })
          continue
        }

        for (const entry of entries) {
          if (entry.name.endsWith('/')) continue
          const ext = path.extname(entry.name).toLowerCase()
          if (!TEXT_EXTENSIONS.has(ext)) continue

          const text = entry.data.toString('utf8')
          scanText(`${relative(file)}!/${entry.name}`, text, findings)
          scannedFiles.push(`${relative(file)}!/${entry.name}`)
        }
        continue
      }

      let text
      try {
        text = fs.readFileSync(file, 'utf8')
      } catch {
        continue
      }

      scannedFiles.push(relative(file))

      if (MANIFEST_NAMES.has(path.basename(file))) {
        scanManifest(file, text, findings)
      }

      scanText(relative(file), text, findings)
    }
  }

  console.log(`Secret scan — ${scannedFiles.length} file(s) across ${scanTargets.length} target(s)`)

  for (const target of missingTargets) {
    console.log(`  · skipped (not found): ${target}`)
  }

  if (findings.length === 0) {
    console.log('✓ no service-role material found')
    console.log('✓ no third-party analytics or ad SDK found')
    console.log('✓ SMS OTP remains feature-flagged off')
    process.exit(0)
  }

  console.error(`\n✗ ${findings.length} finding(s):`)
  for (const finding of findings) {
    console.error(`   [${finding.kind}] ${finding.source}`)
    console.error(`      ${finding.snippet}`)
  }
  console.error('\nA service-role key in a client bundle is a release blocker.')
  process.exit(1)
}

main()
