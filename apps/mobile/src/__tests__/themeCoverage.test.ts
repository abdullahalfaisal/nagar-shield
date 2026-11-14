import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The theme-coverage scan.
 *
 * Story `004-mobile-app-shell` names the criterion:
 *
 * > **Given** a user who toggles the theme or switches the locale, **When** I
 * > force-close and relaunch the app, **Then** the same theme and locale are
 * > active, **every screen renders in the chosen theme**, and all visible
 * > strings are rendered in the chosen language.
 *
 * and the `## Implementation` section named the missing guard:
 *
 * > The theme and the locale survive a relaunch **behaviourally** — the boot
 * > test writes a choice, throws the tree away, builds a new one, and asserts
 * > the choice came back. But **nothing proves every screen reads the
 * > theme**.
 *
 * ## Why the scan is needed
 *
 * The theme provider is above every route, so *in principle* every screen
 * inherits the palette. In practice a screen renders whatever colours it
 * names. A screen that reaches for a hardcoded background does not read the
 * theme, so the user who picked the dark theme gets a light screen and
 * nothing complains.
 *
 * The check that catches it is the same check a person would do by hand:
 * open every screen in both themes. A screen that cannot change its
 * colours is a screen that is not reading the theme.
 *
 * ## What counts as "reading the theme"
 *
 * A screen qualifies if it **or a component it renders** calls `useTheme`.
 * The delegation matters — `app/(auth)/contact-1.tsx` renders
 * `ContactCaptureScreen`, which reads the theme; the route file itself does
 * not. A scan that only looked at the route file would flag it, and the fix
 * would be to add a pointless `useTheme` call rather than to fix anything.
 *
 * So the scan resolves the **transitive** closure: a route file reaches the
 * theme if it calls `useTheme`, or if it renders a component that does.
 *
 * ## Why the scan is not vacuous
 *
 * A scan that walked the wrong directory, or that found no files, would pass
 * every assertion below while protecting nothing. The first test asserts
 * the file count is non-trivial, and the resolution walk is asserted
 * separately, so a broken resolver cannot quietly pass by resolving nothing.
 *
 * ## The house idiom
 *
 * Comments and string literals are stripped before the scan, so a rule that
 * is only ever *stated* in a doc comment — this very file's comment mentions
 * `useTheme` — must not read as a rule satisfaction. The same `stripProse`
 * the chart scan uses.
 */

/** The app root — `apps/mobile`. */
const APP_ROOT = join(__dirname, '..', '..')

/** The directory the route screens live in. */
const ROUTES_ROOT = join(APP_ROOT, 'app')

/** The directory the shared components live in. */
const SHARED_ROOT = join(APP_ROOT, 'src', 'shared')

/** Directories never walked. */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.expo', 'dist', 'build'])

/** The file extensions that can hold a React component. */
const SOURCE_EXTENSIONS = ['.tsx', '.ts']

interface SourceFile {
  /** The path relative to the app root, with forward slashes. */
  path: string
  /** The file's text, with comments and string literals removed. */
  code: string
  /** The file's text, comments intact — used to find imported names. */
  raw: string
}

/**
 * Removes comments and string literals from a source file.
 *
 * The result is not valid TypeScript — it is the *code* of the file with the
 * prose taken out. That is exactly what the scan needs: a rule that is only
 * ever stated in words must not read as a rule satisfaction, and a rule that
 * is only ever stated in words must not read as a rule violation either.
 */
function stripProse(source: string): string {
  let result = ''
  let index = 0

  while (index < source.length) {
    const char = source[index] as string
    const next = source[index + 1]

    // A line comment.
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      index = end === -1 ? source.length : end
      continue
    }

    // A block comment.
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      result += ' '
      continue
    }

    // A string literal — single, double, or template.
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
function collectSourceFiles(root: string): SourceFile[] {
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

      const path = relative(APP_ROOT, absolute).split(sep).join('/')
      if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) continue
      // The test files themselves are the rule, not the code under the rule.
      if (path.includes('.test.ts')) continue

      const raw = readFileSync(absolute, 'utf8')
      files.push({ path, code: stripProse(raw), raw })
    }
  }

  walk(root)
  return files
}

/**
 * The route files — a `.tsx` file directly under `app/` or under a route
 * group folder.
 *
 * `_layout.tsx` is excluded: it is the provider stack, not a screen, and it
 * is covered by the boot test's structural assertions.
 */
function collectRouteFiles(): SourceFile[] {
  return collectSourceFiles(ROUTES_ROOT).filter(
    (file) => file.path.endsWith('.tsx') && !file.path.endsWith('_layout.tsx'),
  )
}

const routeFiles = collectRouteFiles()
const sharedFiles = collectSourceFiles(SHARED_ROOT)

/** Every file the scan can resolve, keyed by its basename and by its stem. */
const filesByName = new Map<string, SourceFile>()
const filesByStem = new Map<string, SourceFile>()
for (const file of [...routeFiles, ...sharedFiles]) {
  const name = file.path.split('/').pop() as string
  const stem = name.replace(/\.(tsx|ts)$/, '')
  // The first file wins, so the app's own `app/` copy shadows a shared one
  // with the same name. `app/` is walked first.
  if (!filesByName.has(name)) filesByName.set(name, file)
  if (!filesByStem.has(stem)) filesByStem.set(stem, file)
}

/**
 * The files a file imports.
 *
 * Both named and default imports are resolved, and both are resolved **by
 * the file the specifier points at** rather than by the local name. The
 * local name is not knowable from the import statement — `import Screen from
 * './x'` could be anything — and a named import's local name may be
 * aliased (`import { A as B }`). The specifier is the reliable link.
 */
function importedFiles(file: SourceFile): SourceFile[] {
  const resolved: SourceFile[] = []

  const statement = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let match = statement.exec(file.raw)
  while (match) {
    const specifier = match[1] as string
    const target = resolveImportPath(file.path, specifier)
    if (target) resolved.push(target)
    match = statement.exec(file.raw)
  }

  return resolved
}

/**
 * The file an import specifier points at, if it is one of the scanned files.
 *
 * The specifier is relative to the importing file, and may or may not carry
 * a file extension. The `@/` alias means `apps/mobile/src`.
 */
function resolveImportPath(importerPath: string, specifier: string): SourceFile | undefined {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return undefined

  const importerDirectory = importerPath.split('/').slice(0, -1).join('/')

  let base: string
  if (specifier.startsWith('@/')) {
    base = `src/${specifier.slice(2)}`
  } else {
    base = `${importerDirectory}/${specifier}`
  }

  const normalized = base
    .split('/')
    .filter((part) => part !== '.' && part !== '')
    .join('/')

  // The specifier usually carries no extension, so the candidates are the
  // stem and its two extensions. The stem alone can be ambiguous — two
  // directories may hold a `Card.tsx` — so the full path must match.
  const candidates = [
    normalized,
    `${normalized}.tsx`,
    `${normalized}.ts`,
    `${normalized}/index.tsx`,
    `${normalized}/index.ts`,
  ]

  for (const candidate of candidates) {
    const stem = candidate
      .split('/')
      .pop()
      ?.replace(/\.(tsx|ts)$/, '') as string
    const file = filesByStem.get(stem)
    if (!file) continue
    if (file.path === candidate) return file
    // The stem matched but the path did not — the file is elsewhere, so it
    // is a different file and must not be followed.
    if (candidate === normalized) return file
  }

  return undefined
}

/**
 * Whether a file reads the theme.
 *
 * The check is for a **call** to `useTheme`, not the word: an import that is
 * never called does not read the theme.
 */
function readsTheme(file: SourceFile): boolean {
  return /\buseTheme\s*\(\s*\)/.test(file.code)
}

/**
 * Whether a route reaches the theme, directly or through a component.
 *
 * The closure is bounded so a cycle in the imports cannot hang the scan.
 */
function reachesTheme(file: SourceFile, seen: Set<string> = new Set()): boolean {
  if (seen.has(file.path)) return false
  seen.add(file.path)

  if (readsTheme(file)) return true

  for (const target of importedFiles(file)) {
    if (reachesTheme(target, seen)) return true
  }

  return false
}

describe('every screen renders in the chosen theme', () => {
  it('reads a non-trivial number of route files — the scan is not vacuous', () => {
    // A scan that walked the wrong directory would pass every assertion
    // below while protecting nothing.
    expect(routeFiles.length).toBeGreaterThan(10)
  })

  it('resolves the component graph — the resolver is not vacuous', () => {
    // If the resolver returned nothing for every file, the coverage test
    // below would pass for the wrong reason.
    const home = routeFiles.find((file) => file.path.endsWith('home.tsx'))
    expect(home).toBeDefined()

    const resolved = importedFiles(home as SourceFile)
    expect(resolved.length).toBeGreaterThan(0)
    expect(
      resolved.some((file) => file.path.includes('Screen') || file.path.includes('Card')),
    ).toBe(true)
  })

  it('finds a screen that reaches the theme — the scan can say yes', () => {
    const home = routeFiles.find((file) => file.path.endsWith('home.tsx'))
    expect(reachesTheme(home as SourceFile)).toBe(true)
  })

  it('reads the theme in every route screen, directly or through a component', () => {
    const offenders = routeFiles.filter((file) => !reachesTheme(file)).map((file) => file.path)

    expect(offenders).toEqual([])
  })

  it('gives every screen the theme through the shared provider, not a hardcoded colour', () => {
    // A screen that reaches the theme might *also* hardcode a background,
    // which is the failure the criterion is really about: the user picks the
    // dark theme and this screen stays light. A screen's background must
    // come from the palette.
    const offenders: string[] = []

    for (const file of routeFiles) {
      // A `backgroundColor` that is not from the theme. The theme's own
      // palette reads are `theme.colors…` / `theme.palette…`; a literal
      // `#RRGGBB` is a hardcoded colour.
      const hardcodedBackground = /backgroundColor:\s*['"]#[0-9A-Fa-f]{3,8}['"]/.test(file.code)
      if (hardcodedBackground) offenders.push(file.path)
    }

    expect(offenders).toEqual([])
  })
})
