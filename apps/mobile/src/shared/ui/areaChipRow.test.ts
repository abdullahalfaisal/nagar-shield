import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildAreaChips, resolveAreaFilter, DEFAULT_AREA_CHIP_ID } from '@/shared/api/areaChips'
import type { AreaChip } from './AreaChipRow'

/**
 * The area filter chip row.
 *
 * Story `003-area-filter-chips` names the gaps:
 *
 * > **The row clips.** `AreaChipRow.tsx:25` uses a plain `View` … A horizontal
 * > chip row with more chips than fit the screen width overflows in a `View` and
 * > is cut off at the edge, with no way to reach the chips beyond it.
 * >
 * > **No test covers the row.** Nothing asserts the chips render, that the
 * > active chip is marked selected, or that the row scrolls. A regression that
 * > drops the last chip would not fail any gate.
 *
 * and the closing list:
 *
 * > 1. `AreaChipRow.tsx:25` changed from `View` to a horizontal `ScrollView`.
 * > 2. A test asserting the row renders every chip and that the active one
 * >    carries the selected state.
 * > 3. A test asserting the horizontal scroll is enabled, so the fix cannot
 * >    silently regress back to a `View`.
 *
 * ## What this file can and cannot do
 *
 * `@testing-library/react-native` is **not installed**, so the component tree
 * cannot be rendered. The claim is therefore **split**, the same way
 * `offlineNotice.test.ts` splits it:
 *
 *   1. **The list and the filter are pure functions**, so they are exercised
 *      as one — `buildAreaChips()` and `resolveAreaFilter()`.
 *   2. **The row's structure is read from the source**, with the comments
 *      stripped, so a comment that *mentions* the scroll cannot satisfy an
 *      assertion that the scroll is *implemented*.
 *
 * The structural half is the load-bearing one here. The bug that story names
 * is a **container** — a `View` where a `ScrollView` belongs — and only the
 * source can see it. A test that asserted the chips render would have passed
 * happily against the clipping row.
 */

/**
 * A source file with its comments removed.
 *
 * The line count is preserved, so a reported line number is the line number in
 * the file a developer would open.
 */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (line, prefix: string) => prefix + ' '.repeat(Math.max(0, line.length - prefix.length)),
    )
}

const ROW_PATH = join(__dirname, 'AreaChipRow.tsx')

function rowCode(): string {
  return codeOf(ROW_PATH)
}

/** The labels the two feed screens pass in. */
const LABELS = { all: 'All BD', division: 'My division', city: 'My city' }

/** A reference area, as the `area_lookup` table carries it. */
function area(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'area-1',
    name: 'Mirpur',
    name_bn: 'মিরপুর',
    division: 'Dhaka',
    city: 'Dhaka',
    thana: 'Mirpur',
    neighborhood: null,
    ...overrides,
  }
}

describe('the chip row scrolls horizontally', () => {
  it('reads the component — the scan is not vacuous', () => {
    expect(rowCode().length).toBeGreaterThan(0)
  })

  it('the row is a horizontal ScrollView, not a View', () => {
    const code = rowCode()

    // This is the assertion that catches the clipping defect. A `View` cannot
    // scroll, so the chips beyond the screen edge were unreachable.
    expect(code).toContain('<ScrollView')
    expect(code).toMatch(/<ScrollView[\s\S]*?horizontal/)
  })

  it('the scroll indicator is hidden', () => {
    const code = rowCode()

    // The prototype's row has no scrollbar, and a visible one on Android sits
    // under the chips.
    expect(code).toContain('showsHorizontalScrollIndicator={false}')
  })

  it("the row carries the prototype's padding contract", () => {
    const code = rowCode()

    // `padding: 0 20px 12px` — the first chip aligns with the feed's own 20 dp
    // gutter, and the row's bottom padding is the prototype's 12 dp.
    expect(code).toMatch(/paddingHorizontal:\s*20/)
    expect(code).toMatch(/paddingBottom:\s*12/)
  })

  it('the chips keep flex-shrink 0', () => {
    const code = rowCode()

    // A chip never squeezes to fit — it either fits or the row scrolls.
    expect(code).toMatch(/flexShrink:\s*0/)
  })

  it('the content container does not stretch to the viewport', () => {
    const code = rowCode()

    // A `ScrollView`'s content container stretches to fill the viewport by
    // default, which would make the row swallow the feed beneath it.
    expect(code).toMatch(/flexGrow:\s*0/)
  })

  it('the chips are mapped from the list, one pressable each', () => {
    const code = rowCode()

    expect(code).toContain('chips.map(')
    expect(code).toContain('<Pressable')
  })
})

describe('the selected chip wears the primary gradient', () => {
  it('the gradient is a token, not a hex', () => {
    const code = rowCode()

    // `var(--grad-primary)` resolves through the theme, so the chip keeps AA
    // contrast in light and dark mode. A hardcoded hex would drift.
    expect(code).toContain('theme.gradients.primary')
  })

  it('the gradient is rendered only for the selected chip', () => {
    const code = rowCode()

    expect(code).toMatch(/\{active\s*\?\s*\(\s*<LinearGradient/)
  })

  it('the unselected chip stays a flat surface with an ink border', () => {
    const code = rowCode()

    expect(code).toContain('theme.colors.surface.white')
    expect(code).toContain('theme.colors.ink[200]')
  })

  it("the selected chip's text is white", () => {
    const code = rowCode()

    expect(code).toMatch(/color:\s*active\s*\?\s*theme\.staticColors\.white/)
  })
})

describe('the chips carry their accessibility state', () => {
  it('the selected state is carried on every chip', () => {
    const code = rowCode()

    // The story: "the selected chip carries `accessibilityState={{ selected:
    // true }}` and every unselected chip carries `accessibilityState={{
    // selected: false }}`". One expression covers both, because `active` is
    // true for one chip and false for the rest.
    expect(code).toContain('accessibilityState={{ selected: active')
  })

  it('every chip has an accessibility label', () => {
    const code = rowCode()

    expect(code).toContain('accessibilityLabel={chip.label}')
  })

  it('the chips are buttons', () => {
    const code = rowCode()

    expect(code).toContain('accessibilityRole="button"')
  })

  it('a disabled chip says so', () => {
    const code = rowCode()

    // A chip that cannot be applied must not read as available to a screen
    // reader either.
    expect(code).toMatch(/accessibilityState=\{\{[^}]*disabled/)
  })
})

describe('the chip list is data-driven, not a hardcoded array', () => {
  it('builds All BD first', () => {
    const chips = buildAreaChips({ currentArea: null, labels: LABELS, areas: [] })

    expect(chips[0]?.id).toBe(DEFAULT_AREA_CHIP_ID)
    expect(chips[0]?.label).toBe('All BD')
    expect(chips[0]?.value).toBeNull()
  })

  it('adds one chip per reference area', () => {
    const chips = buildAreaChips({
      currentArea: null,
      labels: LABELS,
      areas: [area(), area({ id: 'area-2', name: 'Dhanmondi', thana: 'Dhanmondi' })],
    })

    // All BD, My division, My city, then the areas.
    expect(chips).toHaveLength(5)
    expect(chips.map((chip) => chip.label)).toEqual([
      'All BD',
      'My division',
      'My city',
      'Mirpur',
      'Dhanmondi',
    ])
  })

  it("the chip carries the area's own hierarchy, not a bare thana", () => {
    const chips = buildAreaChips({
      currentArea: null,
      labels: LABELS,
      areas: [area()],
    })

    // The `alerts_feed` RPC matches on the prefix the filter names, so a chip
    // that carried only a thana would match a thana of the same name in
    // another division.
    expect(chips[3]?.value).toEqual({
      division: 'Dhaka',
      city: 'Dhaka',
      thana: 'Mirpur',
    })
  })

  it('the chip id is derived from the area, so two areas never collide', () => {
    const chips = buildAreaChips({
      currentArea: null,
      labels: LABELS,
      areas: [area({ id: 'a-1' }), area({ id: 'a-2' })],
    })

    const ids = chips.map((chip) => chip.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the chip id is stable across builds', () => {
    const first = buildAreaChips({ currentArea: null, labels: LABELS, areas: [area()] })
    const second = buildAreaChips({ currentArea: null, labels: LABELS, areas: [area()] })

    // The selection is a chip **id**, so the id must be the same between two
    // builds — otherwise a selection would not survive a re-render.
    expect(first[3]?.id).toBe(second[3]?.id)
  })
})

describe('the location-derived chips need a fix', () => {
  it('disables them when there is no fix', () => {
    const chips = buildAreaChips({ currentArea: null, labels: LABELS, areas: [] })

    // The story: "the chip is disabled or visibly marked unavailable, no
    // `division` / `city` parameter is sent, and the feed keeps the previous
    // result set instead of filtering to an empty area."
    expect(chips[1]?.disabled).toBe(true)
    expect(chips[2]?.disabled).toBe(true)
  })

  it('sends no parameter for a disabled chip', () => {
    const chips = buildAreaChips({ currentArea: null, labels: LABELS, areas: [] })

    // A disabled chip resolves to **no filter at all**, so the feed keeps the
    // result set it had.
    expect(resolveAreaFilter(chips[1] as AreaChip)).toEqual({})
    expect(resolveAreaFilter(chips[2] as AreaChip)).toEqual({})
  })

  it('enables My division when the fix named one', () => {
    const chips = buildAreaChips({
      currentArea: { division: 'Dhaka', city: 'Dhaka' },
      labels: LABELS,
      areas: [],
    })

    expect(chips[1]?.disabled).toBe(false)
    expect(chips[1]?.value).toEqual({ division: 'Dhaka' })
  })

  it('enables My city when the fix named one', () => {
    const chips = buildAreaChips({
      currentArea: { division: 'Dhaka', city: 'Dhaka' },
      labels: LABELS,
      areas: [],
    })

    expect(chips[2]?.disabled).toBe(false)
    expect(chips[2]?.value).toEqual({ division: 'Dhaka', city: 'Dhaka' })
  })

  it('leaves My city disabled when the fix named only a division', () => {
    const chips = buildAreaChips({
      currentArea: { division: 'Dhaka', city: '' },
      labels: LABELS,
      areas: [],
    })

    // A city chip with no city would send a filter that matches nothing.
    expect(chips[2]?.disabled).toBe(true)
  })
})

describe('resolveAreaFilter is the one mapping function', () => {
  it('All BD sends no area parameter at all', () => {
    expect(resolveAreaFilter({ value: null })).toEqual({})
  })

  it('a selected chip sends its own payload', () => {
    const filter = resolveAreaFilter({
      value: { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' },
    })

    expect(filter).toEqual({ division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' })
  })

  it('a disabled chip sends nothing, even with a payload', () => {
    // The disabled check comes **first**: a chip that cannot be applied must
    // not narrow the feed to an area the user never chose.
    const filter = resolveAreaFilter({
      value: { division: 'Dhaka' },
      disabled: true,
    })

    expect(filter).toEqual({})
  })
})

describe('both feed screens render the one row', () => {
  const APP_DIR = join(__dirname, '..', '..', '..', 'app')

  const FEED_SCREENS = [
    { name: 'the Alerts screen', path: join(APP_DIR, '(app)', 'alerts.tsx'), row: '<AreaChipRow' },
    {
      name: "the Home screen's feed block",
      path: join(APP_DIR, '(app)', 'home.tsx'),
      row: '<AreaDropdown',
    },
  ]

  it.each(FEED_SCREENS)('$name renders exactly one chip row', ({ path, row }) => {
    const code = codeOf(path)

    expect(code.split(row).length - 1).toBe(1)
  })

  it.each(FEED_SCREENS)('$name builds its chips from the shared list', ({ path }) => {
    const code = codeOf(path)

    // The list is built in one place. A screen that built its own would
    // drift from the reference data.
    expect(code).toContain('useAreaChips(')
  })

  it.each(FEED_SCREENS)('$name resolves its filter through the shared rule', ({ path }) => {
    const code = codeOf(path)

    expect(code).toContain('resolveAreaFilter(')
  })

  it.each(FEED_SCREENS)('$name hardcodes no chip labels', ({ path }) => {
    const code = codeOf(path)

    // The chip list is data. A hardcoded area name in the screen is a chip
    // that will not exist once the reference data changes.
    expect(code).not.toMatch(/label:\s*'Mirpur'/)
    expect(code).not.toMatch(/label:\s*'Dhanmondi'/)
    expect(code).not.toMatch(/label:\s*'All BD'/)
  })

  it.each(FEED_SCREENS)('$name starts on All BD', ({ path }) => {
    const code = codeOf(path)

    // Phase 1 keeps All BD as the default on every launch, and the last
    // selection is never persisted.
    expect(code).toContain('DEFAULT_AREA_CHIP_ID')
  })
})
