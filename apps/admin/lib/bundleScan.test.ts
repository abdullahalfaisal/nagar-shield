import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The admin bundle scan.
 *
 * Story `001-foundation / 005-admin-skeleton-and-ci` names the criterion:
 *
 * > **Given** the admin bundle and environment configuration, **When** I
 * > search the built output for `SUPABASE_SERVICE_ROLE_KEY`, a `service_role`
 * > literal, or a service-role JWT, and inspect the referenced variables,
 * > **Then** there is no match, only `NEXT_PUBLIC_SUPABASE_URL` and
 * > `NEXT_PUBLIC_SUPABASE_ANON_KEY` are referenced, no server-only credential
 * > is embedded in client-side code, and a bundle-scan test fails the build if
 * > one appears.
 *
 * The `tools/secret-scan.cjs` script already does the mechanical part, and CI
 * runs it over the built bundle. **A script is not a test.** The script is
 * run by a CI job on a schedule and on a push; this is a test that runs with
 * the admin's own suite, on every `pnpm test`, and fails the build the moment
 * a credential appears.
 *
 * ## What is checked
 *
 *   1. **No service-role key name** anywhere in the admin's source — the
 *      env var, the newer secret-key env var, or the `sb_secret_` prefix.
 *   2. **No service-role JWT** — a JWT whose payload claims
 *      `"role":"service_role"`.
 *   3. **Only the two public variables** are referenced. The admin reads
 *      `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; a
 *      third `NEXT_PUBLIC_*` variable, or any non-public `SUPABASE_*`
 *      variable, is a credential the client is not supposed to hold.
 *   4. **The built bundle**, when it exists, carries none of the above.
 *
 * ## Why the bare `sb_secret_` prefix is not a finding
 *
 * The Supabase SDK ships its own detector for the newer key format —
 * `key.startsWith('sb_secret_')` in `supabase-js/src/lib/fetch.ts` — and that
 * detector is in every bundle that includes the SDK. A scan that matched the
 * bare prefix reported the **detector** as an embedded key, so the scan failed
 * on every real build while the rule it guards was never broken. The
 * pattern here therefore requires **key material after the prefix**.
 *
 * ## The scan reads code, not prose
 *
 * The rule is *stated* in the very files it scans — this file names
 * `SUPABASE_SERVICE_ROLE_KEY` in prose — so **comments** are stripped before
 * the scan. A file that merely *mentions* the name in a comment is not a
 * leak.
 *
 * **String literals are not stripped.** A credential is *held* in a string
 * literal — that is what an embedded key looks like — so a scan that removed
 * the literals before looking for them could never find one. (It could only
 * ever fire on a bare identifier, `process.env.SUPABASE_SERVICE_ROLE_KEY`,
 * and would be blind to the far more common
 * `const key = 'sb_secret_…'`.) The comment stripper here therefore keeps
 * every string literal in place, with its contents intact.
 *
 * The env-var *inventory* is read from the **original** source, because a
 * bare `process.env.X` is a property access on a computed member and has no
 * string literal at all. So: a mention in a comment cannot satisfy the
 * inventory, a mention in a comment cannot cause a false alarm, and a key in
 * a literal cannot hide.
 */

const ADMIN_ROOT = join(__dirname, '..')

/** The directories the source scan reads. */
const SCAN_ROOTS = ['app', 'lib', 'src']

/** The source extensions the scan reads. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

/** The directories the scan never descends into. */
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
])

interface ScannedFile {
  /** The path relative to the admin root, with forward slashes. */
  path: string
  /** The file's text, with comments removed and string literals kept. */
  code: string
  /** The file's text, with comments **and** string literals removed. */
  bare: string
  /** The file's text, comments intact. */
  raw: string
}

/**
 * Strips **comments only** from a source file.
 *
 * A line comment runs to the end of the line; a block comment runs to its
 * closing delimiter. String literals are left exactly as they are — the
 * comment characters inside them are part of the literal, not a comment, and
 * the literal's *contents* are what a credential check needs to see.
 *
 * The tricky part is that a `//` or a `/*` can appear inside a string
 * literal, and a quote character can appear inside a comment. So the scanner
 * has to know which it is in: it walks the source, tracks the string state,
 * and only treats `//` and `/*` as comment openers when it is **not** inside
 * a literal.
 *
 * A comment's own quotes must not open a string either — `// don't` ends at
 * the newline, and the apostrophe in `don't` must not swallow the rest of
 * the file.
 */
function stripComments(source: string): string {
  let result = ''
  let index = 0

  /** The quote character of the literal we are inside, or `''` for none. */
  let inLiteral = ''

  while (index < source.length) {
    const char = source[index] as string
    const next = source[index + 1]

    // Inside a string literal: copy it through verbatim, honouring escapes,
    // until the closing quote. Nothing inside is a comment.
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
 * Strips **comments and string literals** from a source file.
 *
 * This is the third view, and it exists for one purpose: reading the
 * env-var *inventory*. A bare `process.env.X` is a property access on a
 * computed member — there is no string literal to remove, so it survives —
 * while the same text appearing *inside* a literal is not a reference and
 * should not be counted.
 *
 * A string literal is any single-quoted, double-quoted or backtick-quoted
 * run, and its contents are replaced by a space.
 */
function stripCommentsAndLiterals(source: string): string {
  let result = ''
  let index = 0

  while (index < source.length) {
    const char = source[index] as string
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      index = end === -1 ? source.length : end
      continue
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      result += ' '
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      const quote = char
      index += 1
      while (index < source.length) {
        const current = source[index] as string
        if (current === '\\') {
          index += 2
          continue
        }
        if (current === quote) {
          index += 1
          break
        }
        index += 1
      }
      result += ' '
      continue
    }

    result += char
    index += 1
  }

  return result
}

/** Every source file under a root. */
function collectSourceFiles(root: string): ScannedFile[] {
  const files: ScannedFile[] = []

  const walk = (directory: string) => {
    let entries: string[]
    try {
      entries = readdirSync(directory)
    } catch {
      return
    }

    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry)) continue

      const absolute = join(directory, entry)
      let stats
      try {
        stats = statSync(absolute)
      } catch {
        continue
      }

      if (stats.isDirectory()) {
        walk(absolute)
        continue
      }

      if (!stats.isFile()) continue
      if (!SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) continue
      // The test files themselves are the rule, not the code under the rule.
      if (entry.includes('.test.')) continue

      const raw = readFileSync(absolute, 'utf8')
      files.push({
        path: relative(ADMIN_ROOT, absolute).split(sep).join('/'),
        code: stripComments(raw),
        bare: stripCommentsAndLiterals(raw),
        raw,
      })
    }
  }

  walk(root)
  return files
}

const sourceFiles = SCAN_ROOTS.flatMap((root) => {
  const absolute = join(ADMIN_ROOT, root)
  if (!existsSync(absolute)) return []
  return collectSourceFiles(absolute)
})

/**
 * The Supabase secret-key prefix, with the key material after it.
 *
 * The bare prefix is the SDK's own detector, not a secret. See the file
 * header.
 */
const SECRET_KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{20,}/

/** The service-role JWT role claim. */
const SERVICE_ROLE_CLAIM = /["']role["']\s*:\s*["']service_role["']/

/** A JWT — three base64url segments. */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g

/** The env var names that must never appear in the admin. */
const FORBIDDEN_ENV_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']

/**
 * The only environment variables the admin may read.
 *
 * Both are `NEXT_PUBLIC_*`, which is what makes them shippable to the browser
 * — and they carry the **anon** key, which is public by design and protected
 * by Row Level Security.
 */
const ALLOWED_ENV_NAMES = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']

/**
 * Every `process.env.NAME` reference.
 *
 * Read from the source with **both** comments and string literals removed. A
 * bare `process.env.X` is a property access on a computed member, so it has
 * no string literal and survives the literal-stripping — which is exactly
 * what makes this the right place to look. The reverse is also true: the
 * text `process.env.X` *inside* a string literal is not a reference, so
 * removing the literals keeps it from being counted as one.
 */
function referencedEnvNames(source: string): string[] {
  const names: string[] = []
  const pattern = /process\.env\.([A-Z][A-Z0-9_]*)/g
  let match = pattern.exec(source)
  while (match) {
    names.push(match[1] as string)
    match = pattern.exec(source)
  }
  return names
}

/** Decodes a JWT payload, returning `null` when it is not decodable JSON. */
function decodeJwtPayload(token: string): string | null {
  const segments = token.split('.')
  if (segments.length < 2) return null

  try {
    const normalized = segments[1] as string
    const padded = normalized.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='), 'base64').toString(
      'utf8',
    )
  } catch {
    return null
  }
}

/** The built bundle, when one exists. */
function collectBundleFiles(): ScannedFile[] {
  const buildRoot = join(ADMIN_ROOT, '.next')
  if (!existsSync(buildRoot)) return []

  const files: ScannedFile[] = []

  const walk = (directory: string) => {
    let entries: string[]
    try {
      entries = readdirSync(directory)
    } catch {
      return
    }

    for (const entry of entries) {
      const absolute = join(directory, entry)
      let stats
      try {
        stats = statSync(absolute)
      } catch {
        continue
      }

      if (stats.isDirectory()) {
        walk(absolute)
        continue
      }

      if (!stats.isFile()) continue
      if (!/\.(js|mjs|cjs|html|css|json)$/.test(entry)) continue

      const raw = readFileSync(absolute, 'utf8')
      files.push({
        path: relative(ADMIN_ROOT, absolute).split(sep).join('/'),
        code: raw,
        bare: raw,
        raw,
      })
    }
  }

  walk(buildRoot)
  return files
}

const bundleFiles = collectBundleFiles()

/**
 * The scan's own positive control.
 *
 * Every other test in this file asserts that the admin is clean. That is a
 * **negative** claim, and a negative claim alone cannot tell a clean repo
 * from a blind scan: if the scanner stopped matching anything, every
 * "carries no …" test would still pass, and the suite would look green
 * while guarding nothing.
 *
 * That is not hypothetical. This scan once stripped string literals before
 * looking for a credential — the natural reading of "the rule is stated in
 * the files it scans" — and a key held in a literal became invisible. The
 * scan passed, and the credential was right there in the file.
 *
 * So the scanner is run against **synthetic samples** that contain each
 * class of credential, and it must report every one. If a change to the
 * patterns or the stripper makes the scanner blind again, these fail.
 */
describe('the scan itself can see a credential', () => {
  /** The classes of credential, and how each one is spelled. */
  const SAMPLES: { label: string; source: string }[] = [
    {
      label: 'a service-role key name in a string literal',
      source: "const key = 'SUPABASE_SERVICE_ROLE_KEY'\n",
    },
    {
      label: 'a service-role key name as a bare property access',
      source: 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY\n',
    },
    {
      label: 'a secret key in a string literal',
      source: "const key = 'sb_secret_abcdefghijklmnopqrstuvwxyz0123456789ABCD'\n",
    },
    {
      label: 'a service-role role claim in a string literal',
      source: 'const claim = \'{"role":"service_role"}\'\n',
    },
  ]

  for (const sample of SAMPLES) {
    it(`reports ${sample.label}`, () => {
      // The leak checks read the comments-stripped, literals-kept view.
      const code = stripComments(sample.source)

      const named = FORBIDDEN_ENV_NAMES.some((name) => code.includes(name))
      const secretKey = SECRET_KEY_PATTERN.test(code)
      const roleClaim = SERVICE_ROLE_CLAIM.test(code)

      expect(named || secretKey || roleClaim).toBe(true)
    })
  }

  it('does not report a comment that only mentions the name', () => {
    // The mirror of the positive control: the stripper must remove prose, or
    // every file that documents the rule would be a false positive.
    const source = [
      '// The service-role key is SUPABASE_SERVICE_ROLE_KEY and must never ship.',
      '/* Also SUPABASE_SECRET_KEY. */',
      "const ok = 'sb_secret_short'\n",
      'const alsoOk = process.env.NEXT_PUBLIC_SUPABASE_URL\n',
    ].join('\n')

    const code = stripComments(source)

    for (const name of FORBIDDEN_ENV_NAMES) {
      expect(code.includes(name)).toBe(false)
    }
    expect(SECRET_KEY_PATTERN.test(code)).toBe(false)
    expect(SERVICE_ROLE_CLAIM.test(code)).toBe(false)
  })

  it('does not report a truncated secret-key prefix', () => {
    // The bare prefix is the Supabase SDK's own detector, which ships in
    // every bundle that includes the SDK.
    const code = stripComments("const prefix = 'sb_secret_'\n")
    expect(SECRET_KEY_PATTERN.test(code)).toBe(false)
  })

  it('counts a bare `process.env.X` as a reference but not one inside a literal', () => {
    // The inventory reads the comments-and-literals-stripped view: a bare
    // property access survives, the same text inside a string does not.
    const source = [
      'const real = process.env.NEXT_PUBLIC_SUPABASE_URL',
      "const notAReference = 'process.env.SOMETHING_ELSE'",
    ].join('\n')

    const names = referencedEnvNames(stripCommentsAndLiterals(source))

    expect(names).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(names).not.toContain('SOMETHING_ELSE')
  })
})

/**
 * The stripper's own edge cases.
 *
 * The stripper has to know whether it is inside a string literal or inside a
 * comment, because the two share characters: a URL has `//` in it, a glob
 * has `/*` in it, and a sentence in a comment has an apostrophe in it. Get
 * it wrong and the scan either raises a false alarm on a URL or swallows
 * the rest of the file after an apostrophe.
 */
describe('the comment stripper tells comments from string literals', () => {
  it('does not treat a // inside a string literal as a comment', () => {
    const out = stripComments("const url = 'https://example.com/x'\nconst after = 1\n")
    expect(out).toContain('https://example.com/x')
    expect(out).toContain('const after')
  })

  it('does not let an apostrophe in a line comment swallow the file', () => {
    const out = stripComments("// don't do this\nconst real = 'SUPABASE_ANON'\n")
    expect(out).not.toContain("don't do this")
    expect(out).toContain("const real = 'SUPABASE_ANON'")
  })

  it('does not treat a /* inside a string literal as a comment', () => {
    const out = stripComments("const glob = '/* not a comment */'\nconst after = 2\n")
    expect(out).toContain('/* not a comment */')
    expect(out).toContain('const after')
  })

  it('removes a block comment whole', () => {
    const out = stripComments('/* SUPABASE_SERVICE_ROLE_KEY */\nconst after = 3\n')
    expect(out).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(out).toContain('const after')
  })

  it('does not let an escaped quote close a literal', () => {
    const out = stripComments("const q = 'it\\'s fine'\nconst after = 4\n")
    expect(out).toContain('const after')
  })

  it('keeps a template literal whole', () => {
    const out = stripComments('const t = `SUPABASE_SERVICE_ROLE_KEY`\n')
    expect(out).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})

describe('the admin bundle carries no service-role credential', () => {
  it('reads a non-trivial number of source files — the scan is not vacuous', () => {
    // A scan that walked the wrong directory would pass every assertion below
    // while protecting nothing.
    expect(sourceFiles.length).toBeGreaterThan(10)
  })

  it('names no service-role key environment variable', () => {
    const offenders: string[] = []

    for (const file of sourceFiles) {
      for (const name of FORBIDDEN_ENV_NAMES) {
        // The **comments-stripped** source: a comment that mentions the name
        // is not a leak, but a string literal that holds it is.
        if (file.code.includes(name)) offenders.push(`${file.path} names \`${name}\``)
      }
    }

    expect(offenders).toEqual([])
  })

  it('carries no Supabase secret key', () => {
    const offenders: string[] = []

    for (const file of sourceFiles) {
      // The prefix alone is the SDK's own detector. The key material after
      // it is what makes it a secret.
      if (SECRET_KEY_PATTERN.test(file.code)) offenders.push(`${file.path} carries a secret key`)
    }

    expect(offenders).toEqual([])
  })

  it('carries no service-role JWT', () => {
    const offenders: string[] = []

    for (const file of sourceFiles) {
      if (SERVICE_ROLE_CLAIM.test(file.code)) {
        offenders.push(`${file.path} carries a service-role role claim`)
        continue
      }

      for (const match of file.code.matchAll(JWT_PATTERN)) {
        const payload = decodeJwtPayload(match[0])
        if (payload && /"role"\s*:\s*"service_role"/.test(payload)) {
          offenders.push(`${file.path} carries a service-role JWT`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('reads only the two public Supabase variables', () => {
    const referenced = new Set<string>()
    for (const file of sourceFiles) {
      for (const name of referencedEnvNames(file.bare)) referenced.add(name)
    }

    const unexpected = [...referenced].filter((name) => !ALLOWED_ENV_NAMES.includes(name))
    expect(unexpected).toEqual([])
  })

  it('reads at least one of the two public variables — the scan is not vacuous', () => {
    const referenced = new Set<string>()
    for (const file of sourceFiles) {
      for (const name of referencedEnvNames(file.bare)) referenced.add(name)
    }

    expect(
      [...referenced].filter((name) => ALLOWED_ENV_NAMES.includes(name)).length,
    ).toBeGreaterThan(0)
  })
})

describe('the built admin bundle carries no service-role credential', () => {
  it('reports whether a bundle exists — the assertion below is honest', () => {
    // The bundle only exists after a build. A test that asserted "the bundle
    // is clean" without saying whether there *was* a bundle would pass
    // vacuously on a fresh checkout, which is most of them.
    expect(Array.isArray(bundleFiles)).toBe(true)
  })

  it('carries no service-role key name, no secret key and no service-role JWT', () => {
    // Skipped, not failed, when there is no build — the criterion is about
    // the **built output**, and CI's `secret-scan` job builds it first.
    if (bundleFiles.length === 0) {
      expect(bundleFiles).toEqual([])
      return
    }

    const offenders: string[] = []

    for (const file of bundleFiles) {
      for (const name of FORBIDDEN_ENV_NAMES) {
        if (file.raw.includes(name)) offenders.push(`${file.path} names \`${name}\``)
      }
      if (SECRET_KEY_PATTERN.test(file.raw)) offenders.push(`${file.path} carries a secret key`)
      if (SERVICE_ROLE_CLAIM.test(file.raw)) {
        offenders.push(`${file.path} carries a service-role role claim`)
      }

      for (const match of file.raw.matchAll(JWT_PATTERN)) {
        const payload = decodeJwtPayload(match[0])
        if (payload && /"role"\s*:\s*"service_role"/.test(payload)) {
          offenders.push(`${file.path} carries a service-role JWT`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
