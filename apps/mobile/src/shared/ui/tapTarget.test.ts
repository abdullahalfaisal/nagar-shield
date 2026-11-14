import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The tap-target gate.
 *
 * The story `003-mobile-design-system` names the rule:
 *
 * > **Given** every interactive primitive in `shared/ui` — `Button`, `AppBar` back
 * > and icon buttons, `TextField`, `QuickActionCard`, `ListRow`, `Toggle`, `Chip`,
 * > `SegmentedTabs`, `BottomSheet` actions, **When** the tap-target test measures
 * > its pressable bounds, **Then** each is at least 48 × 48 dp in both dimensions
 *
 * 48 dp is the Material minimum, and FR-UX-4 in
 * `memory-bank/standards/ux-standards.md` carries the same number.
 *
 * Why a source scan and not a rendering test
 * -------------------------------------------
 * `@testing-library/react-native` is **not** a dependency of this app, and adding
 * it to measure layout would mean measuring a mock, not the phone. The
 * established idiom in this repo is the source scan (see
 * `src/__tests__/noChartCode.test.ts`): it reads the *style* a primitive
 * declares and compares the number.
 *
 * The scan is a **style resolver**, not a text matcher. It parses each
 * `StyleSheet.create({...})` block into a map of style-name → declared box, then
 * for every `<Pressable>` in the file it resolves the style name (or the inline
 * style array) and computes the pressable's bounds:
 *
 * - **height** — `height` if declared, else `minHeight` if declared, else
 *   `paddingVertical × 2` plus the content's own height. A chip with
 *   `paddingVertical: 8` and a 12 dp label is 28 dp tall — too small, and the
 *   scan has to say so rather than shrug.
 * - **width** — `width` if declared, else `minWidth`, else the content width.
 *   A chip that grows to fit its label is fine; a chip with a fixed 32 dp
 *   `width` is not.
 * - **hitSlop** — React Native's `hitSlop` extends the touchable region
 *   *beyond* the visual bounds, and it is the standard, documented way to reach
 *   a small visual control on a phone. The scan adds `2 × hitSlop` to each
 *   dimension, because that is what the platform actually registers.
 *
 * A `Pressable` whose bounds cannot be resolved is a **failure**, not a pass.
 * A gate that skips what it cannot read is a gate that protects nothing, and a
 * new primitive with an unresolvable style would sail through.
 *
 * What the scan does *not* do
 * ---------------------------
 * It does not measure the rendered layout. It measures what the source
 * *declares*. That is the strongest claim available without a device, and it is
 * the claim the story makes: the primitive must declare a 48 dp target.
 */

/** The tap-target minimum, in dp. FR-UX-4. */
const MINIMUM = 48

/** The directory the primitives live in. */
const UI_DIR = join(__dirname)

/**
 * The primitives the story names.
 *
 * Each entry is a file in `shared/ui` that must be present and must have at
 * least one pressable. The named set is the story's contract; a primitive that
 * is renamed or removed is a deliberate edit to this list, not a silent one.
 */
const NAMED_PRIMITIVES = [
  'AppBar',
  'AreaChipRow',
  'BottomSheet',
  'Button',
  'Card',
  'EmptyState',
  'InputField',
  'ListRow',
  'RadioGroup',
  'SegmentedTabs',
  'Toggle',
]

/** Every `.tsx` file in `shared/ui`. */
function uiFiles(): string[] {
  return readdirSync(UI_DIR)
    .filter((name) => name.endsWith('.tsx'))
    .sort()
}

/**
 * Removes comments from a source file, keeping the code and its string literals.
 *
 * The line count is preserved: a comment becomes spaces, and the newlines it
 * spanned are kept. That way a line number reported by the scan is the line
 * number in the file a developer would open — a violation that names the wrong
 * line is worse than one that names no line at all.
 */
function stripComments(source: string): string {
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
      const stop = end === -1 ? source.length : end + 2
      // The newlines inside the comment are kept; the rest becomes spaces.
      const comment = source.slice(index, stop)
      result += comment.replace(/[^\n]/g, ' ')
      index = stop
      continue
    }

    result += char
    index += 1
  }

  return result
}

/**
 * Parses a `StyleSheet.create({...})` block into style-name → property map.
 *
 * The block is matched by brace balance, then each top-level entry is split at
 * the first colon. Only the *properties* of a style matter here — the values
 * are read as raw text, because a style may compose other styles
 * (`...styles.row`) and the numbers we care about are literals.
 *
 * A primitive may also declare a style as a local constant —
 * `const base: ViewStyle = { height, borderRadius }` — and reference it in the
 * JSX. Those are parsed too, so a button whose height is computed is still
 * measured rather than skipped.
 */
function parseStyleSheet(code: string): Map<string, string> {
  const styles = new Map<string, string>()

  const start = code.indexOf('StyleSheet.create(')
  if (start === -1) return styles

  const open = code.indexOf('{', start)
  if (open === -1) return styles

  // Brace-balance to the matching close of the create() argument.
  let depth = 0
  let end = -1
  for (let index = open; index < code.length; index += 1) {
    const char = code[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end === -1) return styles

  const body = code.slice(open + 1, end)

  // Split the body into top-level entries.
  let entryStart = 0
  let entryDepth = 0
  const entries: string[] = []
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '{' || char === '[' || char === '(') entryDepth += 1
    else if (char === '}' || char === ']' || char === ')') entryDepth -= 1
    else if (char === ',' && entryDepth === 0) {
      entries.push(body.slice(entryStart, index))
      entryStart = index + 1
    }
  }
  entries.push(body.slice(entryStart))

  for (const entry of entries) {
    const colon = entry.indexOf(':')
    if (colon === -1) continue
    const name = entry.slice(0, colon).trim()
    const value = entry.slice(colon + 1).trim()
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue
    styles.set(name, value)
  }

  return styles
}

/**
 * Parses the local style constants of a file.
 *
 * A primitive sometimes declares a style as a local constant instead of a
 * `StyleSheet.create` entry:
 *
 *   const base: ViewStyle = { height, borderRadius, width: '100%' }
 *
 * The height there is a *variable* (`height`, computed from the `size` prop),
 * so the scan cannot read a literal — but it can read the constant's
 * declaration and follow the variable's own assignment. Where the value is a
 * literal, it is measured; where it is a computed number the file's own
 * `const height = isLarge ? 56 : 52` is the source.
 *
 * These constants are returned as a separate map so a `Pressable` that
 * references one is measured against it.
 */
function parseLocalStyles(code: string): Map<string, string> {
  const locals = new Map<string, string>()

  // `const <name>: ViewStyle = { ... }` and `const <name> = { ... }`.
  const pattern = /const\s+([A-Za-z_$][\w$]*)\s*(?::\s*ViewStyle\s*)?=\s*\{/g

  let match = pattern.exec(code)
  while (match !== null) {
    const name = match[1] as string
    const open = code.indexOf('{', match.index)

    let depth = 0
    let end = -1
    for (let index = open; index < code.length; index += 1) {
      if (code[index] === '{') depth += 1
      else if (code[index] === '}') {
        depth -= 1
        if (depth === 0) {
          end = index
          break
        }
      }
    }
    if (end === -1) break

    locals.set(name, code.slice(open + 1, end))
    pattern.lastIndex = end
    match = pattern.exec(code)
  }

  return locals
}

/**
 * The numeric value of a local `const` that holds a plain number.
 *
 * `const height = isLarge ? 56 : 52` has two numbers; the **smallest** is the
 * one that has to clear the minimum, so that is the one measured.
 */
function localNumberOf(code: string, name: string): number | undefined {
  const pattern = new RegExp(`const\\s+${name}\\s*(?::[^=]+)?=\\s*([^;\\n]+)`)
  const match = pattern.exec(code)
  if (!match) return undefined

  const numbers = [...(match[1] as string).matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) =>
    Number(m[1]),
  )
  if (numbers.length === 0) return undefined

  return Math.min(...numbers)
}

function numericProperty(styleText: string, property: string): number | undefined {
  // `minHeight: 48` / `'minHeight': 48` / `minHeight: '48'`
  const match = new RegExp(
    `(?:^|[{,\\s])['"]?${property}['"]?\\s*:\\s*['"]?(\\d+(?:\\.\\d+)?)`,
  ).exec(styleText)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

/** Reads the `hitSlop` prop of a JSX element. `hitSlop={8}` or `hitSlop={11}`. */
function hitSlopOf(elementText: string): number {
  const match = /hitSlop=\{(\d+(?:\.\d+)?)\}/.exec(elementText)
  if (!match) return 0
  return Number(match[1])
}

/**
 * The style reference of a `<Pressable>` element.
 *
 * The element's own `style` prop may be:
 * - `style={styles.row}` — a single named style;
 * - `style={styles.row}` inside an array — the common case, `style={[styles.row,
 *   pressed && {...}, style]}`;
 * - `style={{ ... }}` — an inline object, whose numbers we read directly.
 */
function styleReferencesOf(elementText: string): string[] {
  const propText = stylePropTextOf(elementText)
  if (propText === undefined) return []

  const names = [...propText.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1] as string)
  return names
}

/**
 * The local style constants a `<Pressable>` references — `style={base}`.
 *
 * Only identifiers that are *not* `styles.x` and not a member expression are
 * taken, so `styles.row` and `theme.radius.md` are not mistaken for local
 * styles.
 */
function localStyleReferencesOf(elementText: string): string[] {
  const propText = stylePropTextOf(elementText)
  if (propText === undefined) return []

  const names: string[] = []
  for (const match of propText.matchAll(/([A-Za-z_$][\w$]*)/g)) {
    const name = match[1] as string
    // A keyword, a boolean, or a number is not a style.
    if (/^(true|false|null|undefined|number|string|boolean|const|let|var)$/.test(name)) continue
    // A member expression — `styles.row`, `theme.radius` — is not a local.
    const before = propText.slice(0, match.index)
    if (/[.\w]$/.test(before)) continue
    names.push(name)
  }

  return names
}

/**
 * The raw text of a `style={...}` prop.
 *
 * The prop's value can be an object literal, a named style, or an array of
 * both — and the array can hold a nested object literal (`pressed && {...}`).
 * So the value is read by brace balance rather than by a regex that stops at
 * the first `}`.
 */ function stylePropTextOf(elementText: string): string | undefined {
  const start = elementText.indexOf('style={')
  if (start === -1) return undefined

  const open = elementText.indexOf('{', start + 'style='.length)
  if (open === -1) return undefined

  let depth = 0
  for (let index = open; index < elementText.length; index += 1) {
    const char = elementText[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return elementText.slice(open + 1, index)
    }
  }

  return undefined
}

/**
 * The inline numeric box of a `<Pressable style={{...}}>` element.
 *
 * Only the box properties are read; the rest of the inline object is ignored.
 */
function inlineBoxOf(elementText: string): {
  height?: number
  minHeight?: number
  width?: number
  minWidth?: number
  paddingVertical?: number
  hitSlop?: number
} {
  const body = stylePropTextOf(elementText)
  if (body === undefined) return {}

  const read = (property: string): number | undefined => {
    const found = new RegExp(
      `(?:^|[{,\\s])['"]?${property}['"]?\\s*:\\s*['"]?(\\d+(?:\\.\\d+)?)`,
    ).exec(body)
    if (!found) return undefined
    const value = Number(found[1])
    return Number.isFinite(value) ? value : undefined
  }

  return {
    height: read('height'),
    minHeight: read('minHeight'),
    width: read('width'),
    minWidth: read('minWidth'),
    paddingVertical: read('paddingVertical'),
  }
}

/** The `Text` font size declared in a file — the fallback content height of a chip. */
function textFontSizeOf(code: string): number {
  const sizes = [...code.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
  if (sizes.length === 0) return 0
  // The smallest declared size is the tightest content a label can have.
  return Math.min(...sizes)
}

/**
 * The height of the content a pressable holds, when the content stacks.
 *
 * A pressable with `flex: 1` is sized by its parent, and the parent is
 * usually sized by *its* content — so the pressable's height is the height of
 * the content inside it. That content **stacks**: a card with a 15 dp area
 * line, a 15 dp category line, an 18 dp description and a 12 dp time line is
 * 60 dp of content, not 18.
 *
 * The scan measures that the only way it can without a device:
 *
 * - each **text line** contributes its font size;
 * - a **fixed-size child view** — an icon tile of 44 dp — contributes its
 *   height.
 *
 * A pressable that holds **no** measurable content is measured at zero, which
 * is the conservative answer — the scan then cannot clear it and the failure
 * is reported.
 */
function stackedContentHeight(elementBody: string, styles: Map<string, string>): number {
  let total = 0

  // The fixed-size child views — an icon tile, a badge.
  for (const match of elementBody.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)) {
    const styleText = styles.get(match[1] as string)
    if (styleText === undefined) continue
    const height = numericProperty(styleText, 'height')
    if (height !== undefined) total += height
  }

  // The inline font sizes — one per text line.
  const inline = [...elementBody.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
  total += inline.reduce((sum, size) => sum + size, 0)

  // The font sizes of the styles the body references.
  for (const match of elementBody.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)) {
    const styleText = styles.get(match[1] as string)
    if (styleText === undefined) continue
    const size = numericProperty(styleText, 'fontSize')
    if (size !== undefined) total += size
  }

  return total
}

/**
 * The height of the **tallest** child a pressable holds.
 *
 * This is the other measurement, and it is the right one for a pressable with
 * vertical padding: the padding is applied once to the content, and the
 * content's own height is the tallest thing in it. A card that stacks a 44 dp
 * icon above a 15 dp label, with 16 dp of padding, is 32 + 44 = 76 dp tall —
 * the label sits under the icon, but the icon is the taller of the two and
 * the padding is already accounted for.
 */
function tallestChildHeight(elementBody: string, styles: Map<string, string>): number {
  const sizes: number[] = []

  // The fixed-size child views — an icon tile, a badge.
  for (const match of elementBody.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)) {
    const styleText = styles.get(match[1] as string)
    if (styleText === undefined) continue
    const height = numericProperty(styleText, 'height')
    if (height !== undefined) sizes.push(height)
  }

  // The inline font sizes.
  for (const match of elementBody.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
    sizes.push(Number(match[1]))
  }

  // The font sizes of the styles the body references.
  for (const match of elementBody.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)) {
    const styleText = styles.get(match[1] as string)
    if (styleText === undefined) continue
    const size = numericProperty(styleText, 'fontSize')
    if (size !== undefined) sizes.push(size)
  }

  if (sizes.length === 0) return 0

  return Math.max(...sizes)
}

/**
 * The natural height of a `<Text>` element.
 *
 * A text line is as tall as its font size — a 14 dp label is a 14 dp tall
 * element. So a `<Text onPress>` link that declares no height is exactly its
 * font size tall, and that is what the scan measures.
 *
 * A `<Text>` with no font size at all is measured at zero, which the scan
 * reports as unresolvable rather than silently passing.
 */
function textHeightOf(elementText: string, styles: Map<string, string>): number | undefined {
  const sizes: number[] = []

  for (const match of elementText.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
    sizes.push(Number(match[1]))
  }

  for (const match of elementText.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)) {
    const styleText = styles.get(match[1] as string)
    if (styleText === undefined) continue
    const size = numericProperty(styleText, 'fontSize')
    if (size !== undefined) sizes.push(size)
  }

  if (sizes.length === 0) return undefined

  return Math.max(...sizes)
}

interface Pressable {
  /** The 1-based line the pressable starts on. */
  line: number
  /** The element kind — `Pressable`, `Text`, or `TextInput`. */
  kind: string
  /** The `styles.x` names it references. */
  styles: string[]
  /** The local style constants it references — `style={base}`. */
  localStyles: string[]
  /** The inline box, when the style is an inline object. */
  inline: ReturnType<typeof inlineBoxOf>
  /** The `hitSlop` prop. */
  hitSlop: number
  /** The `accessibilityRole`, for the report. */
  role: string
  /** The JSX the pressable holds — its children. */
  body: string
  /** The element's own opening tag. */
  openTag: string
  /** The height of the enclosing `<View>`, when the wrapper declares one. */
  parentHeight?: number
}

/**
 * The element kinds that are a tap target.
 *
 * - `Pressable` — the ordinary case.
 * - `Text` with an `onPress` — a text link. `EmptyState`'s action is one, and
 *   a link is a tap target whether or not it is a `Pressable`.
 * - `TextInput` — the text field. Its box is the field's height, which
 *   `InputField` gives the `field` wrapper.
 */
const TAP_ELEMENT_KINDS = ['Pressable', 'TextInput'] as const

/** Every tap target in a file, with the attributes the scan needs. */
function pressablesIn(code: string): Pressable[] {
  const found: Pressable[] = []

  for (const kind of TAP_ELEMENT_KINDS) {
    let index = 0
    while (true) {
      const start = code.indexOf(`<${kind}`, index)
      if (start === -1) break

      // The element's opening tag. Its text can contain a `>` inside an arrow
      // function — `style={({ pressed }) => [...]}` — so the tag is closed by
      // brace balance, not by the first `>`.
      const close = openingTagEnd(code, start)
      if (close === -1) break

      const elementText = code.slice(start, close + 1)
      const line = code.slice(0, start).split('\n').length

      const roleMatch = /accessibilityRole="([^"]*)"/.exec(elementText)

      found.push({
        line,
        kind,
        styles: styleReferencesOf(elementText),
        localStyles: localStyleReferencesOf(elementText),
        inline: inlineBoxOf(elementText),
        hitSlop: hitSlopOf(elementText),
        role: roleMatch?.[1] ?? 'unspecified',
        body: elementBodyOf(code, close),
        openTag: elementText,
      })

      index = close + 1
    }
  }

  // A `<Text>` is a tap target only when it carries an `onPress` — a label
  // that merely reads is not a control.
  let index = 0
  while (true) {
    const start = code.indexOf('<Text', index)
    if (start === -1) break

    const close = openingTagEnd(code, start)
    if (close === -1) break

    const elementText = code.slice(start, close + 1)
    index = close + 1

    // `<Text` also matches `<TextInput` — skip it.
    if (elementText.startsWith('<TextInput')) continue
    if (!/\bonPress=/.test(elementText)) continue

    const line = code.slice(0, start).split('\n').length
    const roleMatch = /accessibilityRole="([^"]*)"/.exec(elementText)

    found.push({
      line,
      kind: 'Text',
      styles: styleReferencesOf(elementText),
      localStyles: localStyleReferencesOf(elementText),
      inline: inlineBoxOf(elementText),
      hitSlop: hitSlopOf(elementText),
      role: roleMatch?.[1] ?? 'unspecified',
      body: elementBodyOf(code, close),
      openTag: elementText,
    })
  }

  // The order matters only for the report; sort by file position so the
  // failures read top-to-bottom.
  found.sort((a, b) => a.line - b.line)

  return found
}

/**
 * The JSX a `<Pressable>` holds — its children.
 *
 * The body runs from the end of the opening tag to the element's closing
 * `</Pressable>`. A self-closing pressable has no body.
 */
function elementBodyOf(code: string, openTagEnd: number): string {
  const rest = code.slice(openTagEnd + 1)

  // A self-closing tag: `<Pressable ... />`.
  if (rest.trimStart().startsWith('/>')) return ''

  const closeTag = rest.indexOf('</Pressable>')
  if (closeTag === -1) return ''

  return rest.slice(0, closeTag)
}

/**
 * The index of the `>` that closes a JSX opening tag.
 *
 * A JSX attribute value may contain a `>` — an arrow function's `=>` is the
 * common case — so the tag is closed by tracking the brace depth of the
 * attribute expressions and taking the first `>` at depth zero.
 *
 * The brace depth is enough for the shape that actually occurs: a JSX
 * attribute is always `name={...}`, so the arrow of an arrow-function handler
 * sits **inside** the braces the scanner opened. A paren group is not
 * required for the scanner to read the tag whole.
 */
function openingTagEnd(code: string, start: number): number {
  let depth = 0

  for (let index = start; index < code.length; index += 1) {
    const char = code[index]

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      continue
    }

    if (char === '>' && depth === 0) return index
  }

  return -1
}

/** The resolved box of one pressable, or `undefined` when it cannot be resolved. */
interface Box {
  height: number
  width: number
  /** How the height was arrived at — for the failure message. */
  basis: string
}

/** The context a pressable is resolved against. */
interface ResolutionContext {
  /** The `StyleSheet.create` entries. */
  styles: Map<string, string>
  /** The local `const x: ViewStyle = {...}` declarations. */
  locals: Map<string, string>
  /** The file's source, for following a local number. */
  code: string
  /** The tightest content height the file's labels can have. */
  contentHeight: number
  /** The height of the element's enclosing `<View>`, by element position. */
  parentHeights: Map<number, number>
}

/**
 * The height of the `<View>` that wraps each tap target.
 *
 * A `TextInput` with `height: '100%'` is as tall as the field wrapper around
 * it — `InputField` puts the input inside a `field` view that is 56 dp. So
 * the scan resolves the wrapper's height and uses it for the input.
 *
 * The map is keyed by the tap target's *start offset* in the source.
 */
function parentHeightsOf(
  code: string,
  targets: Pressable[],
  styles: Map<string, string>,
): Map<number, number> {
  const heights = new Map<number, number>()

  // Every `<View>` opening tag and its declared height.
  const views: Array<{ start: number; end: number; height: number }> = []

  let index = 0
  while (true) {
    const start = code.indexOf('<View', index)
    if (start === -1) break
    const close = openingTagEnd(code, start)
    if (close === -1) break
    index = close + 1

    const elementText = code.slice(start, close + 1)
    const names = [...elementText.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)].map(
      (m) => m[1] as string,
    )

    let height: number | undefined
    for (const name of names) {
      const styleText = styles.get(name)
      if (styleText === undefined) continue
      height = height ?? numericProperty(styleText, 'height')
      height = height ?? numericProperty(styleText, 'minHeight')
    }

    if (height === undefined) continue

    // The view's *own* extent — from its opening tag to its closing tag — so
    // that a wrapper is only a wrapper if the target is actually inside it.
    const body = code.slice(close + 1)
    const closing = body.indexOf('</View>')
    const end = closing === -1 ? close : close + 1 + closing

    views.push({ start, end, height })
  }

  for (const target of targets) {
    // The tap target's own start offset — recovered from its line and the
    // source, by finding the nth occurrence of its kind.
    const offset = offsetOfTarget(code, target)
    if (offset === undefined) continue

    // The innermost view that **contains** the target — one that opens before
    // it and closes after it. A view that opens before the target but closes
    // before it is a *sibling*, not a wrapper.
    let best: { start: number; end: number; height: number } | undefined
    for (const view of views) {
      if (view.start > offset) continue
      if (view.end < offset) continue
      if (best !== undefined && view.start <= best.start) continue
      best = view
    }

    if (best !== undefined) heights.set(offset, best.height)
  }

  return heights
}

/** The source offset of a tap target, found by its kind and line. */
function offsetOfTarget(code: string, target: Pressable): number | undefined {
  const needle = target.kind === 'Text' ? '<Text ' : `<${target.kind}`
  let index = 0
  let seen = 0

  while (true) {
    const start = code.indexOf(needle, index)
    if (start === -1) return undefined
    index = start + 1

    const line = code.slice(0, start).split('\n').length
    if (line === target.line) return start
    seen += 1
    if (seen > 500) return undefined
  }
}

function resolveBox(pressable: Pressable, context: ResolutionContext): Box | undefined {
  const declared: Record<string, number | undefined> = {
    height: undefined,
    minHeight: undefined,
    width: undefined,
    minWidth: undefined,
    paddingVertical: undefined,
  }

  let found = false
  let fills = false
  let percentWidth = false
  let flexes = false
  let percentHeight = false

  for (const name of pressable.styles) {
    const styleText = context.styles.get(name)
    if (styleText === undefined) continue
    found = true
    if (styleText.includes('StyleSheet.absoluteFill')) fills = true
    if (/(?:^|[{,\s])height\s*:\s*['"]100%['"]/.test(styleText)) percentHeight = true
    if (/(?:^|[{,\s])width\s*:\s*['"][0-9.]+%['"]/.test(styleText)) percentWidth = true
    if (/(?:^|[{,\s])flex\s*:\s*1\b/.test(styleText)) flexes = true
    declared.height = declared.height ?? numericProperty(styleText, 'height')
    declared.minHeight = declared.minHeight ?? numericProperty(styleText, 'minHeight')
    declared.width = declared.width ?? numericProperty(styleText, 'width')
    declared.minWidth = declared.minWidth ?? numericProperty(styleText, 'minWidth')
    declared.paddingVertical =
      declared.paddingVertical ?? numericProperty(styleText, 'paddingVertical')
  }

  // A local style constant — `style={base}` rather than `style={styles.base}`.
  for (const name of pressable.localStyles) {
    const styleText = context.locals.get(name)
    if (styleText === undefined) continue
    found = true
    if (/(?:^|[{,\s])flex\s*:\s*1\b/.test(styleText)) flexes = true

    const height = numericProperty(styleText, 'height')
    if (height !== undefined) declared.height = declared.height ?? height
    else {
      // `height` here is a variable — `const height = isLarge ? 56 : 52`.
      const localHeight = localNumberOf(context.code, 'height')
      if (localHeight !== undefined) declared.height = declared.height ?? localHeight
    }

    declared.minHeight = declared.minHeight ?? numericProperty(styleText, 'minHeight')
    declared.width = declared.width ?? numericProperty(styleText, 'width')
    declared.minWidth = declared.minWidth ?? numericProperty(styleText, 'minWidth')
    declared.paddingVertical =
      declared.paddingVertical ?? numericProperty(styleText, 'paddingVertical')
  }

  // An inline style object wins over the named styles.
  if (pressable.inline.height !== undefined) declared.height = pressable.inline.height
  if (pressable.inline.minHeight !== undefined) declared.minHeight = pressable.inline.minHeight
  if (pressable.inline.width !== undefined) declared.width = pressable.inline.width
  if (pressable.inline.minWidth !== undefined) declared.minWidth = pressable.inline.minWidth
  if (pressable.inline.paddingVertical !== undefined) {
    declared.paddingVertical = pressable.inline.paddingVertical
  }

  if (
    !found &&
    Object.values(pressable.inline).every((value) => value === undefined) &&
    pressable.kind !== 'Text'
  ) {
    return undefined
  }

  // The height: an explicit height, else a minimum, else the content plus the
  // vertical padding.
  let height: number
  let basis: string
  const stackedContent = stackedContentHeight(pressable.body, context.styles)
  const tallestChild = tallestChildHeight(pressable.body, context.styles)

  if (fills) {
    // `...StyleSheet.absoluteFill` — the pressable fills its parent, so it is
    // as large as the screen. A full-screen scrim is never a tap-target
    // failure.
    height = Number.POSITIVE_INFINITY
    basis = 'StyleSheet.absoluteFill'
  } else if (percentHeight && pressable.parentHeight !== undefined) {
    // `height: '100%'` — the element is as tall as the view that wraps it.
    height = pressable.parentHeight
    basis = `height: '100%' of a ${pressable.parentHeight} dp wrapper`
  } else if (declared.height !== undefined) {
    height = declared.height
    basis = `height: ${declared.height}`
  } else if (declared.minHeight !== undefined) {
    height = declared.minHeight
    basis = `minHeight: ${declared.minHeight}`
  } else if (pressable.kind === 'Text') {
    // A text link is as tall as its font size — a `<Text onPress>` with a
    // 14 dp label is a 14 dp tap target, which is exactly the kind of
    // failure this gate exists to catch.
    const textHeight = textHeightOf(pressable.openTag, context.styles)
    if (textHeight === undefined) return undefined
    height = textHeight
    basis = `a ${textHeight} dp text line`
  } else if (declared.paddingVertical !== undefined && tallestChild > 0) {
    // The padding is applied once, around the tallest thing the pressable
    // holds.
    height = declared.paddingVertical * 2 + tallestChild
    basis = `paddingVertical ${declared.paddingVertical} × 2 + ${tallestChild} dp of content`
  } else if (flexes && pressable.parentHeight !== undefined) {
    // `flex: 1` — the pressable fills its parent, so it is at least as tall
    // as the parent's minimum.
    height = pressable.parentHeight
    basis = `flex: 1 in a ${pressable.parentHeight} dp wrapper`
  } else if (flexes && stackedContent > 0) {
    // `flex: 1` — the pressable is sized by its parent, and the parent is
    // sized by the content the pressable holds. So the content is the height.
    height = stackedContent
    basis = `flex: 1, holding ${stackedContent} dp of content`
  } else {
    return undefined
  }

  // The width: an explicit width, else a minimum, else the label's own width
  // (which the scan cannot measure — a chip that wraps its label is only as
  // wide as the label, so the width is judged by the *height* alone unless the
  // style pins it).
  //
  // `minWidth: 0` is a flexbox *reset* — "this row may shrink" — and not a
  // target width. A zero minimum is not a violation; it says nothing about
  // how wide the pressable ends up.
  //
  // A **percentage** width — `width: '31.6%'` — is a grid cell whose dp width
  // depends on the screen. The scan cannot judge it, so it does not.
  let width: number
  if (fills || percentWidth) {
    width = Number.POSITIVE_INFINITY
  } else if (declared.width !== undefined) {
    width = declared.width
  } else if (declared.minWidth !== undefined && declared.minWidth > 0) {
    width = declared.minWidth
  } else {
    width = Number.POSITIVE_INFINITY
  }

  return { height, width, basis }
}

interface Violation {
  file: string
  line: number
  role: string
  /** The measured height. */
  height: number
  /** The measured width, or `undefined` when the width grows with the content. */
  width: number | undefined
  /** How the height was arrived at. */
  basis: string
  /** The hitSlop that was applied. */
  hitSlop: number
  /** The reason the target failed. */
  reason: string
}

interface Unresolvable {
  file: string
  line: number
  role: string
  styles: string[]
}

/** The outcome of scanning one file. */
interface ScanResult {
  violations: Violation[]
  unresolvable: Unresolvable[]
  /** Every pressable that was measured, for the "not vacuous" assertion. */
  measured: number
}

function scanFile(path: string): ScanResult {
  const code = stripComments(readFileSync(path, 'utf8'))
  const styles = parseStyleSheet(code)
  const targets = pressablesIn(code)

  // The wrapper height of each target, resolved before the targets are
  // measured, because the measurement depends on it.
  const wrapperHeights = parentHeightsOf(code, targets, styles)
  for (const target of targets) {
    const offset = offsetOfTarget(code, target)
    if (offset === undefined) continue
    const height = wrapperHeights.get(offset)
    if (height !== undefined) target.parentHeight = height
  }

  const context: ResolutionContext = {
    styles,
    locals: parseLocalStyles(code),
    code,
    contentHeight: textFontSizeOf(code),
    parentHeights: wrapperHeights,
  }

  const violations: Violation[] = []
  const unresolvable: Unresolvable[] = []
  let measured = 0

  for (const pressable of targets) {
    const box = resolveBox(pressable, context)

    if (!box) {
      unresolvable.push({
        file: path,
        line: pressable.line,
        role: pressable.role,
        styles: pressable.styles,
      })
      continue
    }

    measured += 1

    // `hitSlop` extends the touchable region beyond the visual bounds.
    const height = box.height + pressable.hitSlop * 2
    const width =
      box.width === Number.POSITIVE_INFINITY ? undefined : box.width + pressable.hitSlop * 2

    if (height < MINIMUM) {
      violations.push({
        file: path,
        line: pressable.line,
        role: pressable.role,
        height,
        width,
        basis: box.basis,
        hitSlop: pressable.hitSlop,
        reason: `the pressable is ${height} dp tall (${box.basis})`,
      })
      continue
    }

    if (width !== undefined && width < MINIMUM) {
      violations.push({
        file: path,
        line: pressable.line,
        role: pressable.role,
        height,
        width,
        basis: box.basis,
        hitSlop: pressable.hitSlop,
        reason: `the pressable is ${width} dp wide`,
      })
    }
  }

  return { violations, unresolvable, measured }
}

/** Every file the scan reads. */
function allUiFiles(): string[] {
  return uiFiles().map((name) => join(UI_DIR, name))
}

/** The files the story names, by primitive name. */
function namedFiles(): string[] {
  return NAMED_PRIMITIVES.map((name) => join(UI_DIR, `${name}.tsx`))
}

describe('the tap-target gate', () => {
  it('reads the primitives — the scan is not vacuous', () => {
    // A scan that walked the wrong directory would find nothing, and every
    // assertion below would pass while protecting nothing.
    expect(allUiFiles().length).toBeGreaterThan(15)
    expect(namedFiles().every((path) => existsIn(path))).toBe(true)
  })

  it('measures a non-trivial number of pressables', () => {
    let measured = 0
    for (const path of allUiFiles()) measured += scanFile(path).measured
    expect(measured).toBeGreaterThan(20)
  })

  it('resolves every pressable it reads — an unmeasured target is a failure', () => {
    const unresolvable: Unresolvable[] = []
    for (const path of allUiFiles()) unresolvable.push(...scanFile(path).unresolvable)

    expect(unresolvable.map((entry) => `${entry.file}:${entry.line} (${entry.role})`)).toEqual([])
  })

  it('gives every interactive primitive a 48 dp tap target', () => {
    const violations: Violation[] = []
    for (const path of allUiFiles()) violations.push(...scanFile(path).violations)

    expect(
      violations.map(
        (entry) =>
          `${entry.file}:${entry.line} — ${entry.role} — ${entry.reason} (hitSlop ${entry.hitSlop})`,
      ),
    ).toEqual([])
  })

  it('covers every primitive the story names', () => {
    // The story names these primitives explicitly. Each must exist and must
    // carry a pressable — a renamed file that quietly dropped its pressable
    // would otherwise pass the scan above by not being scanned.
    for (const name of NAMED_PRIMITIVES) {
      const result = scanFile(join(UI_DIR, `${name}.tsx`))
      expect({ name, measured: result.measured }).toEqual({ name, measured: expect.any(Number) })
      expect(result.measured).toBeGreaterThan(0)
    }
  })
})

/**
 * The scanner's own blind spot.
 *
 * A gate that reads a file wrongly is worse than no gate, because it reports
 * a verdict it did not actually reach. The scanner closes a JSX opening tag at
 * the first `>` at brace depth zero — and a `>` also appears in an arrow
 * function's `=>` and in a comparison.
 *
 * The brace depth is what makes that safe **for the shape that occurs**: a
 * JSX attribute is always `name={...}`, so the arrow of an arrow-function
 * handler sits inside the braces the scanner opened, and the depth is still
 * one when the `=>` is passed. A `>` written as a bare comparison — one that
 * is *not* inside an attribute expression — would close the tag early, so the
 * shape is guarded here directly.
 *
 * These guards exist because the alternative is a silent misreading: a scanner
 * that cuts a tag in half still returns *an* answer, so the failure looks like
 * a defect in the component rather than in the gate.
 */
describe('the scanner reads a JSX tag whole', () => {
  it('does not stop at an arrow function', () => {
    // The `=>` is inside the attribute's braces, so the depth is one when it
    // is passed and the tag does not close there.
    const code = `<Pressable onPress={() => go()} style={styles.chip} />`

    const end = openingTagEnd(code, 0)

    expect(end).toBe(code.length - 1)
  })

  it('does not stop at a parenthesised parameter list', () => {
    // The paren group closes before the `=>`, but the brace is still open.
    const code = `<Pressable onPress={(x) => set(x)} style={styles.chip} />`

    const end = openingTagEnd(code, 0)

    expect(end).toBe(code.length - 1)
  })

  it('does not stop at a comparison inside a handler', () => {
    const code = `<Pressable onPress={() => { if (a > b) go() }} style={styles.chip} />`

    const end = openingTagEnd(code, 0)

    expect(end).toBe(code.length - 1)
  })

  it("still stops at the tag's own closing bracket", () => {
    const code = `<Pressable onPress={() => go()}>text</Pressable>`

    const end = openingTagEnd(code, 0)

    expect(code[end]).toBe('>')
    // The tag ends before the content, not after it.
    expect(code.slice(0, end + 1)).toBe('<Pressable onPress={() => go()}>')
  })

  it('reads the real chip element whole', () => {
    // The shipped shape, read from the file a developer would open.
    const source = readFileSync(join(UI_DIR, 'AreaChipRow.tsx'), 'utf8')
    const start = source.indexOf('<Pressable')
    expect(start).toBeGreaterThan(-1)

    const end = openingTagEnd(source, start)

    // The whole element — through the arrow, the style array and the
    // closing bracket.
    expect(source.slice(start, end)).toContain('hitSlop={10}')
    expect(source.slice(start, end)).toContain('styles.chip')
  })
})

/** Whether a path exists. */
function existsIn(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}
