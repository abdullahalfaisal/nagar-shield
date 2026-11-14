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
 *   * a Supabase secret key — the `sb_secret_` prefix **followed by key
 *     material**, not the bare prefix (see `SECRET_KEY_PREFIX_PATTERN`)
 *   * the literal `SUPABASE_SECRET_KEY`
 *   * a third-party analytics or ad SDK in a dependency manifest (FR-DATA-5)
 *   * `EXPO_PUBLIC_SMS_OTP_ENABLED` set to `true` anywhere
 *
 * What it deliberately does NOT flag: `SUPABASE_ANON_KEY`,
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The
 * anon key is public by design and is protected by Row Level Security.
 *
 * It also does not flag the **bare** `sb_secret_` prefix. The Supabase SDK
 * ships its own detector for the newer key format, and that detector is in
 * every bundle that includes the SDK. Matching the bare prefix reported the
 * detector as an embedded key, so the CI job failed on every real build
 * while the rule it guards was never broken.
 *
 * Two more things it does not flag, and why:
 *
 *   * **A credential named in a comment.** The rule this scan enforces is
 *     stated in the very files it scans — the docs, the code and the tests
 *     all name `SUPABASE_SERVICE_ROLE_KEY` — so a comment that mentions the
 *     name is prose, not a leak. For source files the comments are stripped
 *     before the scan; string literals are **kept**, because that is where a
 *     credential is held.
 *   * **A credential in a test file.** A test legitimately holds the very
 *     patterns this scan looks for, because the rule is written down as a
 *     fixture — `apps/admin/lib/bundleScan.test.ts` asserts on the
 *     service-role key name and carries a fake secret key. A test file is
 *     never bundled and never shipped, so it cannot leak. The banned-SDK
 *     manifest check still runs over a test tree's `package.json`.
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
 * The extensions whose comments can be stripped.
 *
 * Only source files have comments. A `.md` file is prose throughout, a
 * `.json` file has no comments at all, and a `.yml` file uses `#` — so for
 * those the raw text is the right thing to scan.
 */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/**
 * The forbidden literals.
 *
 * Every one of these is a **server** credential or a server-only role. The
 * anon key is deliberately absent — it is public by design.
 *
 * `sb_secret_` is the one **prefix** rather than a whole literal, because
 * the newer Supabase secret keys are a prefix followed by random material.
 * It therefore needs the special handling in `scanText` below — see
 * `SECRET_KEY_PREFIX_PATTERN`.
 */
const FORBIDDEN_LITERALS = [
  { label: 'service-role key env name', pattern: 'SUPABASE_SERVICE_ROLE_KEY' },
  { label: 'service-role key env name', pattern: 'SUPABASE_SECRET_KEY' },
]

/**
 * The Supabase secret-key prefix, followed by the **key material**.
 *
 * The bare prefix is not a secret. The Supabase SDK ships its own detector
 * — `key.startsWith('sb_secret_')` in `supabase-js/src/lib/fetch.ts` — and
 * that detector ends up in every bundle that includes the SDK. A scan that
 * matched the bare prefix flagged the *detector* and reported it as an
 * embedded key, so the CI `secret-scan` job failed on every real build while
 * the actual rule it guards was never broken.
 *
 * So the pattern requires **key material after the prefix**: a run of
 * base64url/base62 characters. A detector literal is the prefix followed by
 * a quote, a parenthesis or nothing — none of which the pattern accepts.
 *
 * The material must be at least `SECRET_KEY_MIN_MATERIAL` characters, so a
 * truncated prefix in a bundle is not mistaken for a key either.
 */
const SECRET_KEY_MIN_MATERIAL = 20

const SECRET_KEY_PREFIX_PATTERN = new RegExp(
  `sb_secret_[A-Za-z0-9_-]{${SECRET_KEY_MIN_MATERIAL},}`,
  'g',
)

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
 * Strips **comments only** from a source file.
 *
 * The rule this scan enforces is *stated* in the very files it scans — the
 * docs, the code and the tests all name `SUPABASE_SERVICE_ROLE_KEY` — so a
 * comment that mentions the name is prose, not a leak.
 *
 * String literals are left exactly as they are, because a credential is
 * *held* in a string literal. A scan that removed the literals before
 * looking for them could never find one.
 *
 * The scanner has to track whether it is inside a literal or inside a
 * comment, because the two share characters: a URL has `//` in it, a glob
 * has `/*` in it, and a sentence in a comment has an apostrophe in it.
 */
function stripComments(source) {
  let result = ''
  let index = 0
  let inLiteral = ''

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    // Inside a string literal: copy it through verbatim, honouring escapes.
    if (inLiteral) {
      result += char
      if (char === '\\') {
        const escaped = source[index + 1]
        if (escaped !== undefined) {
          result += escaped
          index += 2
          continue
        }
      }
      if (char === inLiteral) inLiteral = ''
      index += 1
      continue
    }

    // A line comment runs to the end of the line.
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      index = end === -1 ? source.length : end
      continue
    }

    // A block comment runs to its closing delimiter.
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      result += ' '
      continue
    }

    // A quote opens a string literal.
    if (char === "'" || char === '"' || char === '`') {
      inLiteral = char
      result += char
      index += 1
      continue
    }

    result += char
    index += 1
  }

  return result
}

/**
 * True when a file is a **test** — and so never ships.
 *
 * A test file legitimately holds the very patterns this scan looks for: the
 * admin's `bundleScan.test.ts` asserts on the service-role key name and
 * carries a fake secret key as a fixture. Those are not leaks; they are the
 * rule, written down. A test file is never bundled, never shipped, and never
 * reaches a phone or a browser.
 *
 * So a test file is skipped for the **credential** checks — the ones that
 * look for the material itself. The **banned-SDK manifest** check still runs
 * over a test file's `package.json`, because a banned SDK in a dependency
 * manifest is a banned SDK whether or not a test mentions it.
 */
function isTestFile(file) {
  const name = path.basename(file)
  return /\.test\.[cm]?[jt]sx?$/.test(name) || /__tests__/.test(file.replace(/\\/g, '/'))
}

/**
 * Scans one blob of text for the forbidden material.
 *
 * `source` is a human-readable label used in the report.
 *
 * `options.skipCredentials` is set for a **test** file: a test legitimately
 * holds the very patterns this scan looks for, because the rule is written
 * down as a fixture. See `isTestFile`.
 */
function scanText(source, text, findings, options = {}) {
  if (options.skipCredentials) {
    // The SMS OTP flag is a *behaviour*, not a credential. A test may assert
    // that the flag is off, or that it reads as on, and either way the
    // assertion is the point. The flag is checked in the app config and the
    // EAS profiles, which are shippable, not in the test tree.
    return
  }

  for (const { label, pattern } of FORBIDDEN_LITERALS) {
    if (text.includes(pattern)) {
      findings.push({ source, kind: label, match: pattern, snippet: redact(pattern) })
    }
  }

  // The secret-key prefix, with the key material after it. A bare prefix —
  // the SDK's own detector — is not a finding; see
  // `SECRET_KEY_PREFIX_PATTERN`.
  for (const match of text.matchAll(SECRET_KEY_PREFIX_PATTERN)) {
    const token = match[0]
    findings.push({
      source,
      kind: 'Supabase secret key',
      match: token,
      snippet: redact(token),
    })
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
}

/**
 * Scans one blob of text for the behaviour flags.
 *
 * The SMS OTP feature flag is a *behaviour* rather than a credential, so it
 * is checked even in a test file: a test that asserted the flag reads as
 * enabled would be asserting the wrong thing.
 */
function scanFlags(source, text, findings) {
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
          const label = `${relative(file)}!/${entry.name}`
          scanText(label, text, findings)
          scanFlags(label, text, findings)
          scannedFiles.push(label)
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

      // The credential checks read the **comments-stripped** text, and only
      // for source files — for a `.md` or a `.json` the whole file is the
      // text that matters. String literals are kept: that is where a
      // credential lives.
      const ext = path.extname(file).toLowerCase()
      const scannable = SOURCE_EXTENSIONS.has(ext) ? stripComments(text) : text

      scanText(relative(file), scannable, findings, { skipCredentials: isTestFile(file) })
      scanFlags(relative(file), scannable, findings)
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
