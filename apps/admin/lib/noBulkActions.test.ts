import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The no-bulk-action rule.
 *
 * `007-moderation / 005-author-auto-hide-queue` (FR-MOD-3).
 *
 * The rule this file protects: **there is no bulk action at MVP.** No "restore
 * all", no "remove all", no multi-select, no shared note, and no group-wide
 * action.
 *
 * Why a source scan
 * -----------------
 * Two reasons, and the second is the important one.
 *
 * First, a bulk action is not a small thing to add — it needs a control, a
 * selection model, a confirmation, and a write path. A unit test on a
 * component would assert that the button is *absent*, which is easy to satisfy
 * by not writing the component and easy to break by adding a prop.
 *
 * Second, and more to the point: a bulk action is a **semantic** violation, not
 * a visual one. The story gives two reasons, and the scan asserts both.
 *
 *   * A shared note across N reports makes the required note meaningless. FR-MOD-3
 *     requires a note on every decision; a note written once for a hundred
 *     reports is not a note.
 *   * One click writing N audit rows is exactly the shape the append-only
 *     trail cannot describe. The audit log's value is that it says what was
 *     decided, about which report, and why — per row.
 *
 * A convention is a note in a document. A source scan is a build failure.
 * This is the same discipline as the mobile app's no-chart scan.
 */

/** The directories the scan reads. */
const SCAN_ROOTS = ['app', 'lib']

/** The source extensions the scan reads. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx']

/** The directories the scan never descends into. */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage'])

/**
 * The banned identifiers.
 *
 * `restore` and `remove` alone are **not** banned — a single report's decision
 * is exactly those words. What is banned is the *bulk* shape: a verb with
 * `all`, `selected`, `bulk`, or `many` attached to it.
 */
const BANNED_IDENTIFIERS: Array<{ pattern: RegExp; rule: string }> = [
  {
    pattern: /\b(restore|remove|hide|delete)\s*(all|selected|bulk|many|every|each)\b/i,
    rule: 'a bulk action',
  },
  { pattern: /\bbulk\w*/i, rule: 'a bulk action' },
  {
    pattern: /\b(restoreAll|removeAll|bulkRestore|bulkRemove|selectAll|toggleAll)\b/,
    rule: 'a bulk action',
  },
  { pattern: /\bmultiSelect\b/, rule: 'a multi-select' },
  // A checkbox in a moderation list is the selection affordance of a bulk
  // action. The console has no other use for one.
  { pattern: /type\s*=\s*['"]checkbox['"]/, rule: 'a selection affordance' },
  // A shared note across reports.
  { pattern: /\bsharedNote\b/, rule: 'a shared note across reports' },
]

/**
 * Removes comments and string literals from a source file.
 *
 * The rule is *stated* in prose in several places — the queue page's own doc
 * comment names every one of the banned shapes — and a scan that matched those
 * would fail on the rule itself.
 */
function stripProse(source: string): string {
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

interface SourceFile {
  path: string
  code: string
}

function collectSourceFiles(): SourceFile[] {
  const adminRoot = join(__dirname, '..')
  const files: SourceFile[] = []

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

      const path = relative(adminRoot, absolute).split(sep).join('/')
      if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) continue
      if (path.includes('.test.ts')) continue

      files.push({ path, code: stripProse(readFileSync(absolute, 'utf8')) })
    }
  }

  for (const root of SCAN_ROOTS) {
    walk(join(adminRoot, root))
  }

  return files
}

const sourceFiles = collectSourceFiles()

describe('the console has no bulk action', () => {
  it('reads a non-trivial number of source files — the scan is not vacuous', () => {
    expect(sourceFiles.length).toBeGreaterThan(3)
  })

  it('names no bulk action, in any file', () => {
    const offenders: string[] = []

    for (const file of sourceFiles) {
      for (const { pattern, rule } of BANNED_IDENTIFIERS) {
        const match = file.code.match(pattern)
        if (!match) continue
        offenders.push(`${file.path} — ${rule}: "${match[0]}"`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('offers no multi-select affordance in the queue', () => {
    const queue = readFileSync(join(__dirname, '..', 'app', 'queue', 'queue-client.tsx'), 'utf8')

    expect(stripProse(queue)).not.toMatch(/type\s*=\s*['"]checkbox['"]/)
    expect(stripProse(queue)).not.toMatch(/\bselectedIds\b/)
    expect(stripProse(queue)).not.toMatch(/\btoggleSelect\b/)
  })

  it('decides one report at a time, through the per-report decision', () => {
    const decision = readFileSync(join(__dirname, '..', 'app', 'decision-buttons.tsx'), 'utf8')
    const code = stripProse(decision)

    // The per-report decision is the only decision path. It writes one row.
    //
    // The write itself lives in the query layer (`lib/queries.ts`) since the
    // refactor onto TanStack Query, so the page's own contribution is that it
    // calls the **single-report** mutation. The shape of that mutation's
    // variables is what carries the "one row" guarantee — there is no
    // `reportIds` and no `ids`.
    expect(code).toContain('useSubmitDecision')
    expect(code).not.toMatch(/\b(reportIds|ids)\s*:/)
  })

  it('offers no bulk-shaped write anywhere in the query layer', () => {
    // The same guarantee, checked where the write actually happens now.
    const queries = readFileSync(join(__dirname, '..', 'lib', 'queries.ts'), 'utf8')
    const code = stripProse(queries)

    expect(code).toContain('submitDecision')
    expect(code).not.toMatch(/\b(reportIds|ids)\s*:/)
    // One decision, one report id. The mutation's variables are the
    // single-report shape.
    expect(code).toMatch(/reportId\s*:/)
  })
})

describe('the author-auto-hide group is a slice, not a second queue', () => {
  it('filters the rows already on screen, and issues no second request', () => {
    const queue = readFileSync(join(__dirname, '..', 'app', 'queue', 'queue-client.tsx'), 'utf8')
    const code = stripProse(queue)

    // The queue page issues **no** fetch of its own. The read lives in the
    // query hook (`useModerationQueue`), and the page narrows the rows it
    // already has. A call site here would be a second read.
    expect(code).not.toContain('fetchModerationQueue')
    // The page reads through the hook, and slices the accumulated pages.
    expect(code).toContain('useModerationQueue')
    expect(code).toContain('flatMap')
    // The group never reaches the server as a parameter.
    expect(code).not.toMatch(/group\s*:/)
  })

  it('keeps the group out of the query key, so the server is never asked to filter by it', () => {
    // The invariant the old call-site count was a proxy for. It now lives in
    // the query layer, and it is checked there — where a change would
    // actually be made.
    //
    // If the group entered the key, the server would be asked to filter by
    // it, the console would issue a second read for the same data, and the
    // group would become a server-side concept it is not.
    const queries = readFileSync(join(__dirname, '..', 'lib', 'queries.ts'), 'utf8')
    const code = stripProse(queries)

    expect(code).toContain('fetchModerationQueue')
    expect(code).not.toMatch(/group\s*:/)
    expect(code).not.toContain('author_auto_hide')
  })

  it('writes nothing on a read — no decision call sits in the queue list', () => {
    const queue = readFileSync(join(__dirname, '..', 'app', 'queue', 'queue-client.tsx'), 'utf8')

    // The decision lives on the per-report detail route. The list is a read.
    expect(stripProse(queue)).not.toContain('moderation_decide')
  })
})
