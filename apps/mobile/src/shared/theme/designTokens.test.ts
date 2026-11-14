import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { darkColors, lightColors, palette } from './tokens'

/**
 * The design-token parity gate.
 *
 * The story `003-mobile-design-system` says: *"The token values are
 * cross-checked by the same kind of test used on the mobile side: a test
 * parses `docs/design/design-tokens.md` and asserts the admin CSS custom
 * properties match. The document is the contract for both surfaces."*
 *
 * So the **document** is the authority, and both implementations are
 * checked against it. Not the other way round: the existing
 * `apps/admin/lib/designTokens.test.ts` reads the token set from
 * `globals.css` itself, which means the CSS and the CSS can never
 * disagree — but the document can, silently, and then the "port contract"
 * is a fiction.
 *
 * **The parsing problem.** The document is not one table. It has:
 *
 *   * §1.1 — a two-column `| Token | Value |` table, where some values are
 *     `var(--other-token)` aliases rather than literal colours.
 *   * §1.2 — a three-column `| Token | Dark value | Light value |` table,
 *     where the light column is sometimes the literal string
 *     `(not defined in :root)`.
 *   * §1.3 — a four-column alias-resolution table.
 *   * §2 — five more two-column tables, some of which **repeat** a §1.1
 *     row verbatim (`--shadow-sm`, `--dur-fast`, …).
 *   * §3 and §4 — fenced CSS blocks, which contain a *second* copy of the
 *     dark-theme tokens in a completely different format.
 *
 * So the parser has to be selective: it reads the **token tables** and
 * ignores everything else. A naive scan of the whole document would pick
 * up the CSS fences, where the same token appears with a semicolon
 * instead of a table row, and the shadow/easing/duration rows would each
 * be counted twice.
 *
 * **What each surface is allowed to differ by.** The two implementations
 * are not required to be identical to the document — they are required to
 * be *faithful* to it:
 *
 *   * The **admin CSS** is the web-safe *subset*: it omits the legacy
 *     `--blue-*` / `--purple-*` aliases, the emergency shadow and
 *     gradient, the spring easing and the slow duration, and it adds
 *     three layout constants of its own (`--tap-target`, `--rail-width`,
 *     `--page-max`) that are **not** design tokens at all.
 *   * The **mobile theme** is the React Native port: it has no CSS
 *     custom properties, so the tokens live in a nested object. It
 *     legitimately adds `radius.xs`, three violet steps that exist in the
 *     document only as alias *targets* (`--violet-500`, `--violet-400`,
 *     `--violet-950`), a `red.700` shade, and a whole `spacing` scale that
 *     the document does not define.
 *
 * The rule this test enforces is therefore **one-directional**: every
 * colour the document defines must appear in each implementation with the
 * same value. The implementations may carry *more*; they may not carry a
 * *different* value.
 */

/**
 * The document. The path is relative to the repository root, which is
 * five levels up from `apps/mobile/src/shared/theme`.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const TOKEN_DOC = join(REPO_ROOT, 'docs', 'design', 'design-tokens.md')
const ADMIN_CSS = join(REPO_ROOT, 'apps', 'admin', 'app', 'globals.css')

/**
 * Strips the backticks the document wraps its table cells in.
 *
 * A cell that is not backtick-wrapped comes back unchanged — which is how
 * the header row and the separator row are rejected.
 */
function unwrap(cell: string): string {
  return cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1) : cell
}

/** The token tables, and only the token tables. */
function parseTokenDoc(text: string): {
  root: Map<string, string>
  dark: Map<string, string>
  light: Map<string, string>
} {
  const root = new Map<string, string>()
  const dark = new Map<string, string>()
  const light = new Map<string, string>()

  // The section boundaries. §1.1 is the `:root` table, §1.2 the dark
  // overrides, §1.3 the alias table, §2 the radius/shadow/motion tables.
  const rootStart = text.indexOf('### 1.1 Light theme')
  const darkStart = text.indexOf('### 1.2 Dark theme overrides')
  const aliasStart = text.indexOf('### 1.3 Legacy alias resolution')
  const radiusStart = text.indexOf('## 2. Radius, shadow, motion')
  const inventoryStart = text.indexOf('## 3. Component inventory')

  if (rootStart === -1 || darkStart === -1 || radiusStart === -1 || inventoryStart === -1) {
    throw new Error(
      `The token document's structure changed — expected the "1.1 Light theme", ` +
        `"1.2 Dark theme overrides", "2. Radius, shadow, motion", and ` +
        `"3. Component inventory" headings in ${TOKEN_DOC}`,
    )
  }

  /**
   * The rows of a two-column `| Token | Value |` table in a slice.
   *
   * Both cells are backtick-wrapped in the document, so both are unwrapped
   * here. The header row (`| Token | Value |`) and the separator row
   * (`|---|---|`) are rejected because neither cell is backtick-wrapped.
   */
  const twoColumnRows = (slice: string): Array<[string, string]> => {
    const rows: Array<[string, string]> = []

    for (const line of slice.split('\n')) {
      const cells = line.split('|').map((cell) => cell.trim())

      // `| --token | `value` |` → cells = ['', '`--token`', '`value`', '']
      if (cells.length !== 4) continue

      const name = unwrap(cells[1] ?? '')
      const value = unwrap(cells[2] ?? '')

      if (!name.startsWith('--')) continue
      if (value === '') continue
      // The separator row is `|---|---|`; its cells unwrap to `---`.
      if (name === '---') continue

      rows.push([name, value])
    }

    return rows
  }

  // §1.1 — the `:root` table. The tokens here are the **light** values.
  for (const [name, value] of twoColumnRows(text.slice(rootStart, darkStart))) {
    root.set(name, value)
  }

  // §2 — radius, shadow, easing, duration, gradient. These repeat some of
  // §1.1's rows verbatim; writing them again is harmless because the
  // values are identical, and it means a token defined *only* in §2 (the
  // radius tokens, for instance) is still found.
  for (const [name, value] of twoColumnRows(text.slice(radiusStart, inventoryStart))) {
    if (!root.has(name)) root.set(name, value)
  }

  // §1.2 — the dark-theme overrides. Three columns: token, dark value,
  // light value. The light column is `(not defined in :root)` when the
  // token exists only in the dark theme.
  for (const line of text.slice(darkStart, aliasStart).split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())

    // `| --ink-950 | `dark` | `light` |` → cells = ['', token, dark, light, '']
    if (cells.length !== 5) continue

    const name = unwrap(cells[1] ?? '')
    const darkValue = unwrap(cells[2] ?? '')
    const lightValue = unwrap(cells[3] ?? '')

    if (!name.startsWith('--')) continue
    if (darkValue === '') continue
    // The separator row is `|---|---|---|`; its cells unwrap to `---`.
    if (name === '---') continue

    dark.set(name, darkValue)

    // `(not defined in :root)` is not backtick-wrapped, so `unwrap` leaves
    // it alone — and it is not a light value, so it is not recorded.
    if (lightValue !== '' && !lightValue.startsWith('(not defined')) {
      light.set(name, lightValue)
    }
  }

  return { root, dark, light }
}

/**
 * The literal colour of a token, resolving a `var(--other)` alias.
 *
 * An alias is resolved against the `:root` table. The document's own alias
 * table (§1.3) shows what happens when the *target* has no row of its
 * own: `--blue-600` resolves to `--violet-500`, which resolves to
 * `--violet-500` — the alias's target **is** the effective value, because
 * the target is an alias-target step with no literal value in the
 * document.
 *
 * A token whose value cannot be resolved to a literal is therefore
 * **skipped** by the parity check rather than treated as a mismatch: the
 * document does not state a colour for it, so there is nothing to compare.
 */
function literalColour(
  tokens: { root: Map<string, string> },
  name: string,
  seen: Set<string> = new Set(),
): string | undefined {
  if (seen.has(name)) return undefined
  seen.add(name)

  const value = tokens.root.get(name)
  if (value === undefined) return undefined

  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value)
  if (!alias) return value

  return literalColour(tokens, alias[1] as string, seen)
}

/** A hex colour, normalised to upper case so the two surfaces can compare. */
function normaliseHex(value: string): string | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!hex) return undefined
  return hex[0].toUpperCase()
}

/**
 * Whether a token is a **colour**.
 *
 * The document declares more than colours: radii, shadows, easing curves,
 * durations and gradients. Those have no one-to-one counterpart in a
 * React Native theme — a CSS `box-shadow` string becomes four separate
 * numeric properties, and a `linear-gradient` becomes a list of stops — so
 * comparing them as strings would compare two different *representations*
 * of the same decision, and report a difference where there is none.
 *
 * The parity check is therefore about the thing that genuinely must not
 * drift: the **colour values**. A radius that rounds, or a shadow that
 * changes its blur, is a design change — but it is a change made in the
 * theme and the CSS together, not two surfaces silently disagreeing
 * about what `#6D28D9` looks like.
 */
function isColourToken(value: string): boolean {
  return normaliseHex(value) !== undefined
}

/**
 * Compares a documented value with a declared one.
 *
 * A hex colour is compared case-insensitively — the admin's CSS writes
 * `#3b1e91` where the document writes `#3B1E91`, and that is a difference
 * in case, not in colour. Everything else (a gradient, a shadow, an
 * easing curve, a duration) is compared as a string, after normalising
 * the whitespace the CSS may have introduced and lower-casing the hex
 * stops inside it.
 */
function mismatch(name: string, documented: string, declared: string): string | undefined {
  const expected = normaliseHex(documented)
  const actual = normaliseHex(declared)

  if (expected && actual) {
    return expected === actual
      ? undefined
      : `${name}: document ${expected}, implementation ${actual}`
  }

  // A non-colour value: normalise the whitespace and the case of every
  // hex stop inside it, so `rgba(15, 23, 42, 0.04)` and `rgba(15,23,42,0.04)`
  // are the same value written two ways.
  const normalised = (text: string) =>
    text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/#[0-9a-f]{3,6}/gi, (hex) => hex.toUpperCase())

  if (normalised(documented) === normalised(declared)) return undefined

  return `${name}: document "${documented}", implementation "${declared}"`
}

/**
 * The tokens the admin console adds that are **not** design tokens.
 *
 * They are the console's own layout constants. The console's CSS says so
 * itself, and they are not in the document, so the parity check must not
 * require them to be there.
 */
const ADMIN_LAYOUT_CONSTANTS = new Set(['--tap-target', '--rail-width', '--page-max'])

/**
 * The document's colours the admin console deliberately does **not**
 * carry.
 *
 * The console's CSS calls itself "the web-safe subset of the same token
 * set the mobile app consumes", and it is: the emergency gradient and
 * shadow are not used by the console, the spring easing and the slow
 * duration are not used by it either, and the two violet steps that exist
 * in the document only as alias *targets* have no row of their own to
 * copy.
 *
 * The list is named rather than computed so that **adding** a token to
 * the console and **removing** it from this list are both deliberate
 * edits. A computed rule would silently accept whatever the CSS happened
 * to omit.
 */
const ADMIN_SUBSET = new Set([
  '--violet-500',
  '--violet-400',
  '--grad-emergency',
  '--shadow-emergency',
  '--ease-spring',
  '--dur-slow',
])

/**
 * The custom properties the admin CSS declares, parsed from the file.
 *
 * Only the `:root` block and the `:root[data-theme='dark']` block are
 * read. A naive scan of the whole file would pick up the block that
 * follows, which re-declares the dark tokens.
 */
function parseAdminCss(text: string): {
  root: Map<string, string>
  dark: Map<string, string>
} {
  const root = new Map<string, string>()
  const dark = new Map<string, string>()

  const declaration = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g

  // The `:root { … }` block.
  const rootBlock = /:root\s*\{([^}]*)\}/.exec(text)
  if (!rootBlock) throw new Error(`Could not find the :root block in ${ADMIN_CSS}`)

  for (const match of (rootBlock[1] ?? '').matchAll(declaration)) {
    root.set(match[1] as string, (match[2] ?? '').trim())
  }

  // The `:root[data-theme='dark'] { … }` block. The attribute selector may
  // be spelled with either quote character.
  const darkBlock = /:root\[data-theme=['"]dark['"]\]\s*\{([^}]*)\}/.exec(text)
  if (!darkBlock) throw new Error(`Could not find the dark-theme block in ${ADMIN_CSS}`)

  for (const match of (darkBlock[1] ?? '').matchAll(declaration)) {
    dark.set(match[1] as string, (match[2] ?? '').trim())
  }

  return { root, dark }
}

/** The mobile theme's colours, flattened into the document's vocabulary. */
function mobileTokens(): Map<string, string> {
  const tokens = new Map<string, string>()

  for (const [family, steps] of Object.entries(palette)) {
    for (const [step, value] of Object.entries(steps)) {
      tokens.set(`--${family}-${step}`, value)
    }
  }

  for (const [ramp, steps] of Object.entries(lightColors.ink)) {
    tokens.set(`--ink-${ramp}`, steps)
  }
  for (const [ramp, steps] of Object.entries(lightColors.surface)) {
    tokens.set(`--surface-${ramp}`, steps)
  }
  for (const [ramp, steps] of Object.entries(darkColors.ink)) {
    tokens.set(`--ink-${ramp}@dark`, steps)
  }
  for (const [ramp, steps] of Object.entries(darkColors.surface)) {
    tokens.set(`--surface-${ramp}@dark`, steps)
  }

  return tokens
}

describe('the design-token document', () => {
  const doc = parseTokenDoc(readFileSync(TOKEN_DOC, 'utf8'))

  it('declares the colours it claims to', () => {
    // The scan is not vacuous: a parser that silently matched nothing
    // would make every parity check below pass for the wrong reason.
    expect(doc.root.size).toBeGreaterThan(50)
    expect(doc.dark.size).toBeGreaterThan(10)
  })

  it('declares the violet ramp the prototype uses', () => {
    expect(doc.root.get('--violet-900')).toBe('#3B1E91')
    expect(doc.root.get('--violet-600')).toBe('#7C3AED')
  })

  it('declares the dark-theme overrides for the ink and surface ramps', () => {
    expect(doc.dark.get('--ink-950')).toBe('#F5F5FA')
    expect(doc.dark.get('--surface-white')).toBe('#11112B')
  })

  it('resolves the legacy aliases onto the violet ramp', () => {
    // `--blue-900` is `var(--violet-700)`, so its literal colour is the
    // violet ramp's value. This is the case the document's own §1.3 table
    // exists for.
    const alias = /^var\((--[a-z0-9-]+)\)$/.exec(doc.root.get('--blue-900') ?? '')

    expect(alias?.[1]).toBe('--violet-700')
    expect(literalColour(doc, '--blue-900')).toBe('#6D28D9')
  })

  it('leaves an alias whose target has no row unresolved', () => {
    // `--violet-500` is an alias target with no row of its own, so the
    // document states no colour for it. The parity check has to skip it
    // rather than treat it as a mismatch.
    expect(doc.root.get('--violet-500')).toBeUndefined()
    expect(literalColour(doc, '--violet-500')).toBeUndefined()
  })
})

describe('the admin console CSS', () => {
  const doc = parseTokenDoc(readFileSync(TOKEN_DOC, 'utf8'))
  const css = parseAdminCss(readFileSync(ADMIN_CSS, 'utf8'))

  it('declares a token set', () => {
    expect(css.root.size).toBeGreaterThan(30)
    expect(css.dark.size).toBeGreaterThan(10)
  })

  it("carries every colour the document declares, at the document's value", () => {
    const mismatched: string[] = []

    for (const [name, value] of doc.root) {
      const colour = literalColour(doc, name)
      if (!colour) continue
      // Only the colours are compared — see `isColourToken`.
      if (!isColourToken(colour)) continue

      const declared = css.root.get(name)
      if (declared === undefined) {
        // The console's CSS is the web-safe **subset** — the legacy
        // aliases and the React-Native-only tokens are not in it. A
        // missing token is only a failure if the document says the token
        // is a plain colour (not an alias), because an alias has no
        // independent value to carry.
        if (!value.startsWith('var(') && !ADMIN_SUBSET.has(name)) {
          mismatched.push(`${name} is missing`)
        }
        continue
      }

      const difference = mismatch(name, colour, declared)
      if (difference) mismatched.push(difference)
    }

    expect(mismatched).toEqual([])
  })

  it("carries the dark-theme overrides at the document's value", () => {
    const mismatched: string[] = []

    for (const [name, value] of doc.dark) {
      const declared = css.dark.get(name)

      if (declared === undefined) {
        mismatched.push(`${name} is missing from the dark block`)
        continue
      }

      const difference = mismatch(name, value, declared)
      if (difference) mismatched.push(difference)
    }

    expect(mismatched).toEqual([])
  })

  it("declares the console's own layout constants", () => {
    // These are the console's, not the design system's. They are the
    // *only* properties the CSS may carry that the document does not.
    //
    // The two violet steps are an exception with a stated reason: the
    // document names `--violet-500` and `--violet-400` only as the
    // *targets* of the legacy aliases, with no row of their own, so there
    // is no documented value for them to carry.
    const extras: string[] = []

    for (const name of css.root.keys()) {
      if (doc.root.has(name)) continue
      if (ADMIN_LAYOUT_CONSTANTS.has(name)) continue
      if (name === '--violet-500' || name === '--violet-400') continue
      extras.push(name)
    }

    expect(extras).toEqual([])
  })

  it("keeps the console's tap target at the mobile minimum", () => {
    // `--tap-target: 48px` was described as "an invented value" in the
    // story's gaps. It is not invented: it is the same 48 dp the mobile
    // theme declares as `MIN_TAP_TARGET`. The point of asserting it here
    // is that the two surfaces cannot drift apart on the one number that
    // is a usability requirement rather than a style choice.
    expect(css.root.get('--tap-target')).toBe('48px')
  })
})

describe('the mobile theme', () => {
  const doc = parseTokenDoc(readFileSync(TOKEN_DOC, 'utf8'))
  const theme = mobileTokens()

  it('declares a token set', () => {
    expect(theme.size).toBeGreaterThan(40)
  })

  it("carries every colour the document declares, at the document's value", () => {
    const mismatched: string[] = []

    for (const [name, value] of doc.root) {
      const colour = literalColour(doc, name)
      if (!colour) continue
      // Only the colours are compared — see `isColourToken`.
      if (!isColourToken(colour)) continue

      const declared = theme.get(name)
      if (declared === undefined) {
        // The React Native port does not carry the legacy `--blue-*` /
        // `--purple-*` aliases — the components reference the violet ramp
        // directly, which the theme file says in its own header. A plain
        // colour, however, must be there.
        if (!value.startsWith('var(')) mismatched.push(`${name} is missing`)
        continue
      }

      const difference = mismatch(name, colour, declared)
      if (difference) mismatched.push(difference)
    }

    expect(mismatched).toEqual([])
  })

  it("carries the dark-theme overrides at the document's value", () => {
    const mismatched: string[] = []

    for (const [name, value] of doc.dark) {
      const declared = theme.get(`${name}@dark`)

      if (declared === undefined) {
        mismatched.push(`${name} is missing from the dark theme`)
        continue
      }

      const difference = mismatch(name, value, declared)
      if (difference) mismatched.push(difference)
    }

    expect(mismatched).toEqual([])
  })

  it('does not carry a colour the document says is different', () => {
    // The one-directional check above would pass if the theme dropped a
    // token *and* the token was an alias. This is the other direction: a
    // theme colour that the document states as a different colour is a
    // drift, whether or not the document's token is present.
    const mismatched: string[] = []

    for (const [key, declared] of theme) {
      if (key.endsWith('@dark')) continue

      const colour = literalColour(doc, key)
      if (!colour) continue

      const difference = mismatch(key, colour, declared)
      if (difference) mismatched.push(difference)
    }

    expect(mismatched).toEqual([])
  })
})
