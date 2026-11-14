import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The moderator gate is wired into every console route.
 *
 * The defect this file exists to prevent
 * ---------------------------------------
 * `readModeratorRole()` was written and **never called**. Every console page
 * passed a literal `role="moderator"` to `<AdminShell>`, so the shell's own
 * role guard was dead code: a citizen who reached `/queue` saw the server's
 * generic `FORBIDDEN` banner instead of the "moderator access only" state.
 *
 * Nothing failed. The TypeScript was clean, the build was clean, the tests
 * passed, and the server was enforcing the role correctly the whole time.
 * The console was simply never asking.
 *
 * That is the whole shape of the defect, and it is why this is a **scan**
 * rather than a behavioural test: a behavioural test needs a session, and the
 * scan catches the structural mistake — a route that renders the console
 * without passing through the gate — with no session at all.
 */

/** The directories the scan reads. */
const SCAN_ROOTS = ['app']

/** The source extensions the scan reads. */
const SOURCE_EXTENSIONS = ['.tsx']

/** The directories the scan never descends into. */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage'])

/**
 * The routes that render the console.
 *
 * Every one of them must pass through `ModeratorGate`. The list is written
 * out rather than discovered, because a route that is *missing* from the list
 * is exactly the defect: a new console route added without the gate would
 * otherwise sail past a scan that only looked at the routes it knew about.
 */
const CONSOLE_ROUTES = [
  'app/queue/page.tsx',
  'app/queue/[reportId]/page.tsx',
  'app/users/page.tsx',
  'app/audit/page.tsx',
]

const ADMIN_ROOT = join(__dirname, '..')

/**
 * Removes comments and string literals from a source file.
 *
 * The rule is *stated* in prose in several places — this file's own doc
 * comment names `role="moderator"` — and a scan that matched those would
 * fail on the rule itself.
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

/** Every `.tsx` file under `app/`, minus the tests. */
function collectSourceFiles(): string[] {
  const files: string[] = []

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

      const path = relative(ADMIN_ROOT, absolute).split(sep).join('/')
      if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) continue
      if (path.includes('.test.')) continue

      files.push(path)
    }
  }

  for (const root of SCAN_ROOTS) {
    walk(join(ADMIN_ROOT, root))
  }

  return files
}

const sourceFiles = collectSourceFiles()

describe('the moderator gate is wired into every console route', () => {
  it('reads a non-trivial number of source files — the scan is not vacuous', () => {
    expect(sourceFiles.length).toBeGreaterThan(3)
  })

  it('gates each console route', () => {
    // Each console route renders through `ModeratorGate`, so the role is read
    // from the session before the console's client bundle mounts.
    for (const route of CONSOLE_ROUTES) {
      const code = stripProse(readFileSync(join(ADMIN_ROOT, route), 'utf8'))

      expect(code).toContain('ModeratorGate')
      expect(code).toMatch(/<ModeratorGate>/)
    }
  })

  it('hardcodes no role on the shell', () => {
    // The defect. A literal `role="moderator"` on `<AdminShell>` asserts a
    // role the client cannot know — the real one lives in the cookie-backed
    // session, and only the server can read it.
    //
    // The scan is narrow on purpose: `role="alert"` and `role="group"` are
    // ARIA attributes and are legitimate throughout the console. What must
    // not exist is a `role` **prop** on the shell — and the shell no longer
    // takes one at all.
    for (const path of sourceFiles) {
      const code = stripProse(readFileSync(join(ADMIN_ROOT, path), 'utf8'))

      // A `role` prop on `<AdminShell>` — the defect, in any spelling.
      const shellRoleProp = code.match(/<AdminShell[^>]*\brole\s*=/g) ?? []

      // A `role` prop on any component, taken as a JSX **attribute** whose
      // value is the literal "moderator". `role="alert"` is ARIA; this is
      // not.
      const moderatorRoleProp = code.match(/\brole\s*=\s*['"]moderator['"]/g) ?? []

      expect({ path, shellRoleProp, moderatorRoleProp }).toEqual({
        path,
        shellRoleProp: [],
        moderatorRoleProp: [],
      })
    }
  })

  it('gives the shell no role prop to receive', () => {
    // The second half of the same defect: even with the routes fixed, a
    // shell that still accepted a `role` prop could be handed a lie.
    const shell = stripProse(readFileSync(join(ADMIN_ROOT, 'app', 'admin-shell.tsx'), 'utf8'))

    expect(shell).not.toMatch(/role\??:\s*['"]citizen['"]\s*\|\s*['"]moderator['"]/)
    expect(shell).not.toContain('role !==')
  })

  it('reads the role on the server, not in the browser', () => {
    // The gate is a **server** component: only a Server Component can read
    // the cookie-backed session through `@supabase/ssr` before the page
    // renders. A client-side read would happen after the first paint, by
    // which time the console's shell and its queries are already on screen.
    const gate = stripProse(readFileSync(join(ADMIN_ROOT, 'app', 'moderator-gate.tsx'), 'utf8'))

    expect(gate).not.toContain('use client')
    expect(gate).toContain('readModeratorRole')
  })

  it('calls the role reader somewhere', () => {
    // `readModeratorRole()` existed and was never called. The gate calls it;
    // this asserts the call site is still there.
    const gate = stripProse(readFileSync(join(ADMIN_ROOT, 'app', 'moderator-gate.tsx'), 'utf8'))

    expect(gate).toMatch(/await\s+readModeratorRole\(\)/)
  })
})

describe('the access-only state is one component', () => {
  it('renders the same card in the login page, the gate and the shell', () => {
    // Three surfaces, one component. The copy lives in one place, so the
    // three cannot drift.
    const state = stripProse(readFileSync(join(ADMIN_ROOT, 'app', 'access-only-state.tsx'), 'utf8'))

    expect(state).toContain('copy.accessOnlyTitle')
    expect(state).toContain('copy.accessOnlyBody')

    const login = stripProse(readFileSync(join(ADMIN_ROOT, 'app', 'login', 'page.tsx'), 'utf8'))
    const gate = stripProse(readFileSync(join(ADMIN_ROOT, 'app', 'moderator-gate.tsx'), 'utf8'))

    expect(login).toContain('AccessOnlyState')
    expect(gate).toContain('AccessOnlyState')

    // The card is **defined** in exactly one place.
    const defined = sourceFiles.filter((path) =>
      /export function AccessOnlyState/.test(
        stripProse(readFileSync(join(ADMIN_ROOT, path), 'utf8')),
      ),
    )
    expect(defined).toEqual(['app/access-only-state.tsx'])
  })
})
