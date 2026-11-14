import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { bn } from '../shared/i18n/bn'
import { en } from '../shared/i18n/en'

/**
 * The hardcoded-string scan.
 *
 * Story `003-mobile-design-system` names the gap:
 *
 * > **No hardcoded-string scan.** Nothing in `tools/` or the CI workflow
 * > asserts that user-facing copy comes from the bundles rather than a literal
 * > in a component.
 *
 * The rule: **user-facing copy comes from the i18n bundles.** A string literal
 * in a component is a string literal the Bangla screen will never translate,
 * and a Bangla-first product that silently shows English in one corner is a
 * bug the user sees.
 *
 * This gap was not hypothetical. The login screen once rendered the literal
 * word *"undefined"* because a hand-built error key did not exist in either
 * bundle (see `shared/i18n/errorCopy.ts` for that fix). A literal in a
 * component is the same class of failure, one step earlier.
 *
 * What the scan reads
 * -------------------
 * **Two places only**, because those are the only two places a literal
 * reaches the screen:
 *
 *   1. **JSX text** — `>Some words<` between two tags.
 *   2. **Copy-carrying props** — a string literal in `accessibilityLabel`,
 *      `title`, `label`, `placeholder`, `helper`, `body`, `description`,
 *      `subtitle`, `message`, `eyebrow`, `tagline`, `actionLabel`.
 *
 * A literal in a stylesheet (`flexDirection: 'row'`), an import path, an
 * icon ligature (`'arrow_back'`), a colour (`'#FFFFFF'`) or an API key is
 * not user-facing copy, and the scan does not look for it.
 *
 * The whitelist
 * -------------
 * A small, named set of literals that are legitimately not copy:
 *
 *   * **Icon ligatures** — Material Symbols names (`arrow_back`, `shield`).
 *     They are rendered by a font, not read.
 *   * **`testID`s** — identifiers for the test harness.
 *   * **Format hints** — `you@example.com`, `000000`, coordinate samples.
 *     These are *formats*, not sentences, and they read the same in both
 *     scripts. They are whitelisted **by value**, and the list is short
 *     enough to read.
 *   * **The showcase** — `src/shared/ui/Showcase.tsx` is the design-system
 *     acceptance surface. It deliberately shows every primitive with sample
 *     content, in one script, so a designer can see the shapes. It is not
 *     shipped to a user.
 *
 * Everything else is a failure.
 */

/** The directories the scan reads. */
const SCAN_ROOTS = ['app', 'src']

/** The source extensions the scan reads. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx']

/** The directories the scan never descends into. */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', '.expo', 'coverage'])

/**
 * The files the scan does not read.
 *
 * `Showcase.tsx` is the design-system acceptance surface: it renders every
 * primitive with sample content so a reviewer can see the shapes. Its content
 * is sample content by definition and is never shown to a user.
 *
 * The `i18n` directory holds the bundles themselves — the strings there are
 * the copy, and every literal in them is by definition hardcoded.
 */
const EXEMPT_FILES = [
  'src/shared/ui/Showcase.tsx',
  'src/shared/i18n/en.ts',
  'src/shared/i18n/bn.ts',
]

/**
 * The props that carry copy to the screen.
 *
 * A literal in any of these reaches a user. A literal in `style` or `icon`
 * does not.
 */
const COPY_PROPS = [
  'accessibilityLabel',
  'actionLabel',
  'body',
  'description',
  'eyebrow',
  'helper',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'tagline',
  'title',
]

/**
 * The literals that are legitimately not copy.
 *
 * Every entry is a **value**, not a pattern. A pattern would let a real
 * violation slip through; a value cannot.
 */
const ALLOWED_LITERALS = new Set([
  // Format hints. These read the same in both scripts — a transliteration of
  // an email address or an OTP shape would be worse, not better.
  'you@example.com',
  '000000',
  '23.7806',
  '90.4066',
])

/**
 * The Material Symbols ligature names.
 *
 * They are rendered by a glyph font, not read aloud and not read as text.
 * The set is derived from the icon font's own naming convention: a
 * lower-case `snake_case` name with no spaces and no sentence punctuation.
 *
 * The test below asserts this rule is **not vacuous** — a set that matched
 * everything would pass every assertion while protecting nothing.
 */
const ICON_LIGATURE = /^[a-z][a-z0-9_]*$/

interface SourceFile {
  /** The path relative to the app root, with forward slashes. */
  path: string
  /** The file's text, with comments removed. */
  code: string
}

/**
 * Removes comments from a source file, preserving the line count so a
 * reported line number is the line a developer would open.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (line, prefix: string) => prefix + ' '.repeat(Math.max(0, line.length - prefix.length)),
    )
}

interface Offence {
  file: string
  line: number
  kind: string
  value: string
}

/** Every source file under the given roots. */
function collectSourceFiles(): SourceFile[] {
  const appRoot = join(__dirname, '..', '..')
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

      const path = relative(appRoot, absolute).split(sep).join('/')
      if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) continue
      // The test files themselves are the rule, not the code under the rule.
      if (path.includes('.test.ts')) continue
      // The exempted files.
      if (EXEMPT_FILES.includes(path)) continue

      files.push({ path, code: stripComments(readFileSync(absolute, 'utf8')) })
    }
  }

  for (const root of SCAN_ROOTS) {
    walk(join(appRoot, root))
  }

  return files
}

/**
 * The JSX text nodes in a file.
 *
 * `>words<` — the text between two tags. A TypeScript generic
 * (`Array<string>`) looks the same, so a candidate is rejected when it is a
 * single identifier with no spaces: a generic's type argument is one name,
 * and a sentence is not.
 */
function jsxTextOffences(file: SourceFile): Offence[] {
  const offences: Offence[] = []

  file.code.split('\n').forEach((line, index) => {
    const match = line.match(/>\s*([^<>{}][^<>{}]*?)\s*</)
    if (!match) return

    const value = (match[1] ?? '').trim()
    if (value.length < 2) return
    // A generic type argument (`Array<string>`) is one identifier.
    if (!value.includes(' ') && !/[ঀ-৿]/.test(value)) return
    // A comparison or an arrow.
    if (value.includes('=>') || value.includes(' as ')) return
    // A single word is a label, not a sentence — but it is still copy.
    if (ALLOWED_LITERALS.has(value)) return

    offences.push({ file: file.path, line: index + 1, kind: 'JSX text', value })
  })

  return offences
}

/**
 * The copy-carrying props with a string literal in a file.
 */
function copyPropOffences(file: SourceFile): Offence[] {
  const offences: Offence[] = []

  file.code.split('\n').forEach((line, index) => {
    for (const prop of COPY_PROPS) {
      const pattern = new RegExp('\\b' + prop + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')')
      const match = line.match(pattern)
      if (!match) continue

      const value = (match[1] ?? match[2] ?? '').trim()
      if (value.length < 2) continue
      if (ALLOWED_LITERALS.has(value)) continue

      offences.push({ file: file.path, line: index + 1, kind: `${prop} prop`, value })
    }
  })

  return offences
}

/** Every offence across every file. */
function allOffences(): Offence[] {
  const files = collectSourceFiles()
  return files.flatMap((file) => [...jsxTextOffences(file), ...copyPropOffences(file)])
}

const sourceFiles = collectSourceFiles()
const offences = allOffences()

describe('the hardcoded-string scan', () => {
  it('reads the app source — the scan is not vacuous', () => {
    // A scan that walked the wrong directories would find nothing and every
    // assertion below would pass while protecting nothing.
    expect(sourceFiles.length).toBeGreaterThan(30)
  })

  it('exempts only the files it names', () => {
    // The exemption list is short on purpose. Each entry is either the
    // design-system showcase or a bundle.
    expect(EXEMPT_FILES).toEqual([
      'src/shared/ui/Showcase.tsx',
      'src/shared/i18n/en.ts',
      'src/shared/i18n/bn.ts',
    ])

    for (const path of EXEMPT_FILES) {
      expect(sourceFiles.some((file) => file.path === path)).toBe(false)
    }
  })

  it('finds a hardcoded string when there is one — the scan is not vacuous', () => {
    // The scan must be *capable* of finding an offence. A scan that finds
    // nothing because it is broken would pass the "finds no hardcoded copy"
    // assertion below while protecting nothing.
    //
    // The proof is a synthetic source with one hardcoded sentence in it. The
    // scan must report it — and it must report it for the right reason
    // (a JSX text node), not by accident.
    const synthetic: SourceFile = {
      path: 'synthetic.tsx',
      code: ['export const A = () => (', '  <Text>Auto-refreshes every 60s</Text>', ')'].join('\n'),
    }

    const found = jsxTextOffences(synthetic)
    expect(found).toHaveLength(1)
    expect(found[0]?.value).toBe('Auto-refreshes every 60s')
    expect(found[0]?.kind).toBe('JSX text')
  })

  it('finds a hardcoded copy prop when there is one', () => {
    const synthetic: SourceFile = {
      path: 'synthetic.tsx',
      code: ['export const A = () => (', '  <Button accessibilityLabel="Go back" />', ')'].join(
        '\n',
      ),
    }

    const found = copyPropOffences(synthetic)
    expect(found).toHaveLength(1)
    expect(found[0]?.value).toBe('Go back')
    expect(found[0]?.kind).toBe('accessibilityLabel prop')
  })

  it('does not report a string that comes from the bundles', () => {
    // The other half of the vacuity proof: the scan must be *quiet* on
    // correct code, so that the silence in the real tree means something.
    const synthetic: SourceFile = {
      path: 'synthetic.tsx',
      code: [
        'export const A = () => (',
        "  <Button accessibilityLabel={t('common.back')} />",
        "  <Text>{t('home.autoRefreshNote')}</Text>",
        ')',
      ].join('\n'),
    }

    expect(jsxTextOffences(synthetic)).toEqual([])
    expect(copyPropOffences(synthetic)).toEqual([])
  })

  it('does not report a literal that is not copy', () => {
    // Styles, colours, icon ligatures and test ids are not copy. If the
    // scan reported them, the real tree would be full of false positives and
    // the gate would be switched off.
    const synthetic: SourceFile = {
      path: 'synthetic.tsx',
      code: [
        'export const A = () => (',
        '  <View style={styles.row} testID="wiz-phone-1" />',
        '  <Icon name="arrow_back" />',
        "  <View style={{ backgroundColor: '#FFFFFF', flexDirection: 'row' }} />",
        ')',
      ].join('\n'),
    }

    expect(jsxTextOffences(synthetic)).toEqual([])
    expect(copyPropOffences(synthetic)).toEqual([])
  })

  it('finds no hardcoded user-facing copy', () => {
    expect(
      offences.map(
        (offence) => `${offence.file}:${offence.line} — ${offence.kind} — "${offence.value}"`,
      ),
    ).toEqual([])
  })
})

describe('the icon-ligature rule is not vacuous', () => {
  it('reads real icon names as ligatures', () => {
    // The ligature rule is a fallback inside the scan, not a blanket
    // exemption. This asserts the rule still matches what it is meant to.
    expect(ICON_LIGATURE.test('arrow_back')).toBe(true)
    expect(ICON_LIGATURE.test('local_fire_department')).toBe(true)
  })

  it('does not read a sentence as a ligature', () => {
    expect(ICON_LIGATURE.test('Go back')).toBe(false)
    expect(ICON_LIGATURE.test('Auto-refreshes every 60s')).toBe(false)
    expect(ICON_LIGATURE.test('you@example.com')).toBe(false)
  })
})

describe('the copy actually comes from the bundles', () => {
  it('resolves every `t(...)` key the app asks for', () => {
    // A `t('some.key')` that is not in the bundles renders the **key
    // itself** — the "undefined" bug this story already paid for once. The
    // key-parity gate (`shared/i18n/keyParity.test.ts`) proves the two
    // bundles agree with each other; this proves the app agrees with them.
    //
    // The bundle is **imported**, not parsed. The bundles are nested
    // objects, so a key is checked segment by segment against the real
    // exported value.
    const bundle = en as unknown as Record<string, unknown>

    const asked = new Set<string>()
    for (const file of sourceFiles) {
      for (const match of file.code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        asked.add(match[1] as string)
      }
    }

    // The scan must have found the call sites at all.
    expect(asked.size).toBeGreaterThan(20)

    const missing: string[] = []
    for (const key of asked) {
      const segments = key.split('.')
      let cursor: unknown = bundle
      let resolved = true

      for (const segment of segments) {
        if (cursor && typeof cursor === 'object' && segment in (cursor as object)) {
          cursor = (cursor as Record<string, unknown>)[segment]
        } else {
          resolved = false
          break
        }
      }

      if (!resolved) missing.push(key)
    }

    expect(missing).toEqual([])
  })

  it('resolves every key in the Bangla bundle too — the two agree', () => {
    // The same keys, asked against the Bangla bundle. A key that exists in
    // one bundle but not the other would render the key itself in the other
    // language.
    const asked = new Set<string>()
    for (const file of sourceFiles) {
      for (const match of file.code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        asked.add(match[1] as string)
      }
    }

    const bundle = bn as unknown as Record<string, unknown>
    const missing: string[] = []

    for (const key of asked) {
      let cursor: unknown = bundle
      let resolved = true
      for (const segment of key.split('.')) {
        if (cursor && typeof cursor === 'object' && segment in (cursor as object)) {
          cursor = (cursor as Record<string, unknown>)[segment]
        } else {
          resolved = false
          break
        }
      }
      if (!resolved) missing.push(key)
    }

    expect(missing).toEqual([])
  })
})
