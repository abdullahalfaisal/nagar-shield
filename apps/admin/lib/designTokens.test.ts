import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The console uses the design tokens, and nothing else.
 *
 * Story `001-moderator-login-and-queue` requires the console to be built
 * from the **web-safe CSS custom-property subset** of
 * `docs/design/design-tokens.md` — "no phone frame, no new hex value, and no
 * third-party UI kit".
 *
 * Why a scan
 * ----------
 * A hex literal in the console is a **design decision made outside the
 * design system**. It survives every review that is not looking for it, and
 * it is invisible in the diff: `color: '#7b1fa2'` looks exactly like
 * `color: 'var(--violet-600)'` until you know to look. A scan makes it a
 * build failure instead.
 *
 * The rule
 * --------
 *   * `globals.css` may declare hex values — it is the token file, and the
 *     declarations there are the tokens themselves.
 *   * **No other file** in the console may contain a hex colour.
 *   * Every colour a component uses must be a `var(--token)` reference.
 *
 * The token set is read from `globals.css` itself rather than from the
 * design doc, so the two cannot drift: a token added to the CSS is
 * immediately usable, and a token removed from the CSS immediately stops
 * being usable.
 */

const ADMIN_ROOT = join(__dirname, '..')

/** The directories the scan reads. */
const SCAN_ROOTS = ['app', 'lib']

/** The source extensions the scan reads. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css']

/** The directories the scan never descends into. */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage'])

/** The one file allowed to declare hex values: the token file itself. */
const TOKEN_FILE = 'app/globals.css'

/** The six-digit hex colour. The three-digit shorthand is not used here. */
const HEX_COLOUR = /#[0-9a-f]{6}\b/gi

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

/** The custom properties the token file declares. */
function declaredTokens(): Set<string> {
  const css = readFileSync(join(ADMIN_ROOT, TOKEN_FILE), 'utf8')
  const names = new Set<string>()

  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)) {
    names.add(match[1] as string)
  }

  return names
}

const tokens = declaredTokens()

/**
 * The token file's **rules**, with the token blocks removed.
 *
 * `globals.css` is the one file allowed to declare hex values — it is the
 * token file, and the declarations there *are* the tokens. But a hex inside
 * a **rule** is something else: it is a value used without naming it, and
 * it is invisible in review because `color: #ffffff` sits right next to
 * `color: var(--static-white)` in the diff.
 *
 * The exemption was therefore blanket where it should have been narrow, and
 * a hex could hide in the token file's rules with nothing watching it. This
 * returns the file's rules with the two token blocks cut out, so the hex
 * scan can be applied to them.
 */
function rulesOutsideTokenBlocks(css: string): string {
  /** The spans of `:root { … }` and `:root[data-theme='dark'] { … }`. */
  const tokenSpans: { start: number; end: number }[] = []

  const openBlock = (pattern: RegExp): void => {
    const match = pattern.exec(css)
    if (!match) return

    let depth = 0
    for (let index = css.indexOf('{', match.index); index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      else if (css[index] === '}') {
        depth -= 1
        if (depth === 0) {
          tokenSpans.push({ start: match.index, end: index })
          return
        }
      }
    }
  }

  openBlock(/:root\s*\{/)
  openBlock(/:root\[data-theme=['"]dark['"]\]\s*\{/)

  // The blocks are cut out from the back, so the earlier offsets stay valid.
  let result = css
  for (const span of [...tokenSpans].reverse()) {
    result = result.slice(0, span.start) + result.slice(span.end + 1)
  }

  return result
}

describe('the console uses the design tokens', () => {
  it('reads a non-trivial number of source files — the scan is not vacuous', () => {
    expect(sourceFiles.length).toBeGreaterThan(3)
  })

  it('declares a real token set', () => {
    // The scan is only meaningful if the token file actually has tokens.
    expect(tokens.size).toBeGreaterThan(10)
    expect(tokens.has('--violet-600')).toBe(true)
  })

  it('contains no hex colour outside the token file', () => {
    const offenders: string[] = []

    for (const path of sourceFiles) {
      if (path === TOKEN_FILE) continue

      const code = readFileSync(join(ADMIN_ROOT, path), 'utf8')
      const matches = code.match(HEX_COLOUR)

      if (!matches) continue
      offenders.push(`${path} — ${[...new Set(matches)].join(', ')}`)
    }

    expect(offenders).toEqual([])
  })

  it('contains no hex colour in the token file’s rules', () => {
    // The token file may **declare** hex values — that is what a token is.
    // It may not **use** one: a hex in a rule is a value that was chosen
    // outside the token contract, and it is the one place a raw value could
    // hide, because the token file was exempt from the scan above.
    //
    // Two such values existed — `color: #ffffff` on the primary and danger
    // buttons. The second is the one that mattered: `--surface-white` is
    // `#11112b` in the dark theme, so using it for on-brand text would put
    // near-black text on a violet button. The on-brand colour is now
    // `--static-white`, a static value in both themes, exactly as the mobile
    // theme's `staticColors.white` is.
    const css = readFileSync(join(ADMIN_ROOT, TOKEN_FILE), 'utf8')
    const matches = rulesOutsideTokenBlocks(css).match(HEX_COLOUR)

    expect(matches).toBeNull()
  })

  it('uses only declared tokens', () => {
    // A `var(--token)` that the token file does not declare resolves to
    // nothing, and the element renders with no colour at all — invisible in
    // the diff and invisible on the screen.
    const offenders: string[] = []

    for (const path of sourceFiles) {
      const code = readFileSync(join(ADMIN_ROOT, path), 'utf8')

      for (const match of code.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const name = match[1] as string

        // A token with a fallback is fine: the fallback covers the case
        // where the token is not declared.
        const hasFallback = code.slice(match.index ?? 0, (match.index ?? 0) + 120).includes(',')
        if (hasFallback) continue

        if (!tokens.has(name)) {
          offenders.push(`${path} — ${name}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
