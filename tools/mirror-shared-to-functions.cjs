/**
 * Mirrors the shared package's server-side modules into the Edge Functions
 * tree.
 *
 * **Why a mirror.** The Edge Runtime container mounts **only** the
 * `supabase/` directory — the workspace's `packages/shared/` is not visible
 * from inside it, so a function cannot import `@nagar-shield/shared` by path.
 * The deploy bundler has the same constraint.
 *
 * **Why this is not drift.** The mirror is a GENERATED artefact, exactly like
 * `supabase/seed.sql` is a generated mirror of the curated reference data. The
 * `--check` mode compares the vendored copy against the source and fails the
 * build on any difference, so a shared change that is not re-mirrored can
 * never reach production with a stale contract.
 *
 * Only the modules the functions actually consume are mirrored:
 *
 *   * `errors/`  — the stable error-code table and the envelope helpers
 *   * `enums/`   — the fixed vocabularies the schemas depend on
 *   * `schemas/` — the Zod contracts, shared with the mobile client
 *   * `jobs/`    — the retention rules and the tombstone builder
 *   * `storage/` — the author token, which the capture write path computes
 *
 * Usage:
 *   node tools/mirror-shared-to-functions.cjs            # write the mirror
 *   node tools/mirror-shared-to-functions.cjs --check    # verify only
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_ROOT = path.join(ROOT, 'packages', 'shared', 'src')
const TARGET_ROOT = path.join(ROOT, 'supabase', 'functions', '_shared', 'vendor')

/** The modules the Edge Functions consume. */
const MODULES = ['errors', 'enums', 'schemas', 'jobs', 'storage']

const CHECK_ONLY = process.argv.includes('--check')

/** Every file under a module directory, relative to the module root. */
function collectFiles(directory, base = directory) {
  const files = []

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectFiles(full, base))
      continue
    }

    if (!entry.name.endsWith('.ts')) continue
    // The test files are not part of the server contract.
    if (entry.name.endsWith('.test.ts')) continue

    files.push(path.relative(base, full))
  }

  return files
}

/** The banner every mirrored file carries. */
function banner(sourcePath) {
  const relative = path.relative(ROOT, sourcePath).split(path.sep).join('/')
  return [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ` * Mirrored from \`${relative}\`.`,
    ' * Run `node tools/mirror-shared-to-functions.cjs` to regenerate, and',
    ' * `node tools/mirror-shared-to-functions.cjs --check` to verify.',
    ' */',
    '',
  ].join('\n')
}

/**
 * Rewrites a relative import to a path Deno's resolver accepts.
 *
 * The shared package is written for a bundler-style resolver, so it says
 * `from '../enums'` and `from './common'`. Deno needs the explicit file: a
 * directory becomes `../enums/index.ts` and a module becomes `./common.ts`.
 * The Edge Runtime's compiler does not enable the sloppy-imports fallback.
 *
 * Only a relative path that actually resolves is rewritten — a bare specifier
 * such as `'zod'` is left exactly as it is.
 */
function rewriteDirectoryImports(contents, sourcePath) {
  return contents.replace(/(from\s+['"])(\.[^'"]*)(['"])/g, (match, prefix, specifier, suffix) => {
    if (specifier.endsWith('.ts') || specifier.endsWith('.js')) return match

    const candidate = path.resolve(path.dirname(sourcePath), specifier)

    // A directory → its index file.
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return `${prefix}${specifier}/index.ts${suffix}`
    }

    // A module without an extension → the source file directly.
    if (fs.existsSync(`${candidate}.ts`)) {
      return `${prefix}${specifier}.ts${suffix}`
    }

    return match
  })
}

/** Builds the mirror in memory and compares it with what is on disk. */
function buildMirror() {
  const files = new Map()

  for (const moduleName of MODULES) {
    const moduleRoot = path.join(SOURCE_ROOT, moduleName)
    if (!fs.existsSync(moduleRoot)) {
      throw new Error(`Missing shared module: ${moduleRoot}`)
    }

    for (const relative of collectFiles(moduleRoot)) {
      const sourcePath = path.join(moduleRoot, relative)
      const targetPath = path.join(TARGET_ROOT, moduleName, relative)

      const source = fs.readFileSync(sourcePath, 'utf8')
      const contents = `${banner(sourcePath)}${rewriteDirectoryImports(source, sourcePath)}`
      files.set(targetPath, contents)
    }
  }

  assertNoUnmirroredImports(files)

  return files
}

/**
 * Fails when a mirrored module imports a shared module that is **not**
 * mirrored.
 *
 * The Edge Runtime mounts only the `supabase/` directory, so the vendored
 * copy of `schemas/` cannot import a vendored copy of `types/` — `types/`
 * is not mirrored at all. The import resolves in the workspace and fails
 * only inside the container, which is exactly the kind of failure that
 * reaches production.
 *
 * This check runs in **both** modes, so the mistake is caught when the
 * mirror is written rather than when the container refuses to boot.
 */
function assertNoUnmirroredImports(files) {
  const mirrored = new Set(
    [...files.keys()].map((targetPath) => path.basename(path.dirname(targetPath))),
  )

  const problems = []

  for (const [targetPath, contents] of files) {
    // The relative specifier, before it was rewritten.
    const relative = path
      .relative(
        SOURCE_ROOT,
        path.join(SOURCE_ROOT, path.dirname(path.relative(TARGET_ROOT, targetPath))),
      )
      .split(path.sep)
      .join('/')

    const source = fs.readFileSync(
      path.join(SOURCE_ROOT, relative, path.basename(targetPath)),
      'utf8',
    )

    for (const match of source.matchAll(/from\s+['"](\.[^'"]*)['"]/g)) {
      const specifier = match[1]
      const resolved = path.resolve(
        path.dirname(path.join(SOURCE_ROOT, relative, path.basename(targetPath))),
        specifier,
      )
      const owner = path.relative(SOURCE_ROOT, resolved).split(path.sep)[0]

      if (owner && !mirrored.has(owner) && owner !== relative) {
        problems.push(
          `${path.relative(ROOT, targetPath)} imports \`${specifier}\` — ` +
            `\`${owner}/\` is not mirrored into the Edge Functions tree`,
        )
      }
    }
  }

  if (problems.length > 0) {
    console.error('A mirrored module imports a module that is not mirrored:')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error(
      'The Edge Runtime mounts only `supabase/`, so a mirrored module cannot\n' +
        'import one that was not mirrored. Either mirror the module too, or\n' +
        'remove the dependency.',
    )
    process.exit(1)
  }
}

/** Removes a mirrored file that no longer has a source. */
function findStaleFiles(mirror) {
  if (!fs.existsSync(TARGET_ROOT)) return []

  const stale = []

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!mirror.has(full)) stale.push(full)
    }
  }

  walk(TARGET_ROOT)
  return stale
}

function main() {
  const mirror = buildMirror()
  const stale = findStaleFiles(mirror)

  if (CHECK_ONLY) {
    const problems = []

    for (const [targetPath, expected] of mirror) {
      const actual = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null
      if (actual !== expected) {
        problems.push(path.relative(ROOT, targetPath))
      }
    }

    for (const stalePath of stale) {
      problems.push(`${path.relative(ROOT, stalePath)} (no source)`)
    }

    if (problems.length > 0) {
      console.error('The Edge Functions mirror has drifted from packages/shared:')
      for (const problem of problems) console.error(`  - ${problem}`)
      console.error('Re-run: node tools/mirror-shared-to-functions.cjs')
      process.exit(1)
    }

    console.log(`✓ The Edge Functions mirror matches packages/shared (${mirror.size} files)`)
    return
  }

  for (const [targetPath, contents] of mirror) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, contents, 'utf8')
  }

  for (const stalePath of stale) {
    fs.rmSync(stalePath, { force: true })
  }

  console.log(`✓ Mirrored ${mirror.size} shared modules into supabase/functions/_shared/vendor`)
}

main()
