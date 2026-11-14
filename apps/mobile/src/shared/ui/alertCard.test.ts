import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_ICONS,
  REPORT_CATEGORY_LABELS,
  REPORT_CATEGORIES,
  type PublicReport,
} from '@nagar-shield/shared'

/**
 * AsyncStorage's native module does not exist under Jest.
 *
 * The card imports the theme, and the theme provider reads the persisted
 * theme on mount, so the import chain reaches the native module. The mock is
 * the same one `src/__tests__/boot.dom.test.tsx` uses — the storage is not
 * what this file is about, and the card's own values do not depend on it.
 *
 * The variable name starts with `mock` because Jest's module factory may not
 * close over anything else.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}))

import { alertAccent, alertCategoryLabel, formatArea, styles, withAlpha } from './AlertCard'
import { en } from '@/shared/i18n/en'
import { bn } from '@/shared/i18n/bn'

/**
 * The Alerts feed card's rendering.
 *
 * Story `001-alerts-feed-list` names the gap:
 *
 * > **No test on the feed's *rendering*.** What is **not** covered is the card
 * > itself: nothing asserts the prototype's box model, the pulsing dot, the
 * > single chip row, or the relative-time rendering.
 *
 * and asks for:
 *
 * > A test on the card's rendering — the box model, the accent map's single
 * > source, the uncategorized placeholder, the empty-description gap, and the
 * > Bangla / English pair.
 *
 * ## What this file can and cannot do
 *
 * `@testing-library/react-native` is **not installed** in this workspace, so a
 * React Native component tree cannot be rendered here. That is the same
 * constraint story `003-mobile-design-system` worked under, and it leads to the
 * same answer: **split the claim**.
 *
 *   1. **The card's logic and its box model are read directly.** The accent
 *      lookup, the category label, the area line, the hex→rgba conversion and
 *      the `StyleSheet` entries are all plain values, so they are asserted as
 *      values — the behavioural half.
 *   2. **The card's conditional structure is read from the source**, with the
 *      comments stripped, so a comment that *mentions* the rule cannot satisfy
 *      an assertion that the rule is *implemented*. This covers what a render
 *      would have covered and what a value cannot: the description block's
 *      conditional render, and the fact that the accent reaches the border, the
 *      tint and the glyph.
 *
 * Neither half alone would be enough. A render proves the tree but not the
 * numbers; a source scan proves the structure but says nothing about whether
 * the values are right.
 */

/**
 * The card's source, with its comments removed.
 *
 * The card's doc comment names the prototype's box model in prose, and the
 * comments above the accent and the label name the rules they implement. A
 * scan that counted those words would pass while the code did the opposite, so
 * the comments are removed before the source is read.
 *
 * The line count is preserved, so a reported line number is the line number in
 * the file a developer would open.
 */
const CARD_PATH = join(__dirname, 'AlertCard.tsx')

function cardCode(): string {
  return readFileSync(CARD_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (line, prefix: string) => prefix + ' '.repeat(Math.max(0, line.length - prefix.length)),
    )
}

/** The neutral ramp the uncategorized state wears — `--ink-300`. */
const NEUTRAL = '#B8B8CC'

/** The uncategorized placeholder, as the bundles spell it. */
const UNCATEGORIZED = 'অকার্যনির্দিষ্ট — Uncategorized'

/** A report, with the pieces a test cares about overridable. */
function report(overrides: Partial<PublicReport> = {}): PublicReport {
  return {
    id: 'r1',
    category: 'theft',
    description: 'A bag was taken near the market.',
    areaHierarchy: { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur', neighborhood: 'আকাশিয়া' },
    capturedAt: '2026-11-14T09:00:00.000Z',
    moderationStatus: 'visible',
    authorDisplayName: null,
    hasMedia: false,
    mediaCount: 0,
    ...overrides,
  }
}

describe('the card reads its accent from the one shared map', () => {
  it('uses the shared accent for every category', () => {
    // The map is the single source. A card that hardcoded a hex would drift
    // from the map the moment a category's colour changed.
    for (const category of REPORT_CATEGORIES) {
      expect(alertAccent(category, NEUTRAL)).toBe(REPORT_CATEGORY_ACCENTS[category])
    }
  })

  it('uses the prototype’s accents for the five named categories', () => {
    // The story names the five accents and their icons explicitly.
    expect(alertAccent('theft', NEUTRAL)).toBe('#7B1FA2')
    expect(alertAccent('assault', NEUTRAL)).toBe('#DC2626')
    expect(alertAccent('fire', NEUTRAL)).toBe('#D97706')
    expect(alertAccent('medical', NEUTRAL)).toBe('#C2185B')
    expect(alertAccent('accident', NEUTRAL)).toBe('#5D4037')

    expect(REPORT_CATEGORY_ICONS.theft).toBe('backpack')
    expect(REPORT_CATEGORY_ICONS.assault).toBe('warning')
    expect(REPORT_CATEGORY_ICONS.fire).toBe('local_fire_department')
    expect(REPORT_CATEGORY_ICONS.medical).toBe('medical_services')
    expect(REPORT_CATEGORY_ICONS.accident).toBe('diamond')
  })

  it('wears the neutral ramp when there is no category', () => {
    // The accent is the signal that says *what kind of report this is*. An
    // uncategorized report has no such signal, so it wears the neutral grey.
    expect(alertAccent(null, NEUTRAL)).toBe(NEUTRAL)
  })

  it('hardcodes no hex value in the card', () => {
    // The card may not carry a literal colour of its own — every colour is
    // either the shared map or a theme token.
    const code = cardCode()

    const hexes = [...code.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((match) => match[0])

    // The only hex in the file is the shadow colour, which the prototype's
    // `box-shadow` names and which is a shadow, not an accent.
    expect(hexes.filter((hex) => hex !== '#0F172A')).toEqual([])
  })
})

describe('the card renders the uncategorized placeholder', () => {
  it('shows the localized placeholder, never a dash', () => {
    // The card used to render the literal `'—'`. A dash is an empty value;
    // an uncategorized report is a named state the citizen can read.
    expect(alertCategoryLabel(null, UNCATEGORIZED)).toBe(UNCATEGORIZED)
    expect(alertCategoryLabel(null, UNCATEGORIZED)).not.toBe('—')
  })

  it('takes the placeholder from the bundle, in both languages', () => {
    // The copy is localized — the same key in both bundles.
    expect(en.alerts.uncategorized).toBe(UNCATEGORIZED)
    expect(bn.alerts.uncategorized).toBe(UNCATEGORIZED)
  })

  it('never invents a category', () => {
    // A null category is null — the card must not fall back to "other" or to
    // any other category that happens to be in the map.
    expect(alertCategoryLabel(null, UNCATEGORIZED)).not.toContain(REPORT_CATEGORY_LABELS.other.en)
    expect(alertCategoryLabel(null, UNCATEGORIZED)).not.toContain(REPORT_CATEGORY_LABELS.other.bn)
  })
})

describe('the card renders the Bangla / English pair', () => {
  it('pairs the Bangla name with the English one', () => {
    // The copy contract: `চুরি — Theft`.
    expect(alertCategoryLabel('theft', UNCATEGORIZED)).toBe('চুরি — Theft')
  })

  it('pairs every category the map knows', () => {
    for (const category of REPORT_CATEGORIES) {
      const label = REPORT_CATEGORY_LABELS[category]
      expect(alertCategoryLabel(category, UNCATEGORIZED)).toBe(`${label.bn} — ${label.en}`)
    }
  })
})

describe('the card renders the area line', () => {
  it('names the neighbourhood when there is one', () => {
    // The neighbourhood is the most specific level, so it is the one named.
    expect(formatArea(report())).toBe('আকাশিয়া')
  })

  it('falls back to the thana when there is no neighbourhood', () => {
    const line = formatArea(
      report({ areaHierarchy: { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' } }),
    )

    expect(line).toBe('Mirpur')
  })

  it('falls back to the city, then the division, and never renders a dangling separator', () => {
    // The database holds a **null** thana on a degraded capture, so the
    // fallback chain is a real path, not a hypothetical one.
    //
    // The client boundary normalises a null level to the **empty string**
    // (`raw.thana ?? ''`), because the `AreaHierarchy` type requires a string.
    // An empty string is not nullish, so a `??` chain would stop there and
    // render an empty area line. The fallback therefore has to skip the
    // empty levels too.
    const city = formatArea(
      report({ areaHierarchy: { division: 'Dhaka', city: 'Dhaka', thana: '' } }),
    )
    expect(city).toBe('Dhaka')

    const division = formatArea(
      report({ areaHierarchy: { division: 'Dhaka', city: '', thana: '' } }),
    )
    expect(division).toBe('Dhaka')

    for (const line of [city, division]) {
      expect(line).not.toMatch(/^\s*·/)
      expect(line).not.toMatch(/·\s*$/)
      expect(line).not.toContain('·')
      expect(line).not.toBe('')
    }
  })

  it('renders an em dash when there is no area at all', () => {
    expect(formatArea(report({ areaHierarchy: null }))).toBe('—')
  })

  it('renders the area once, never twice', () => {
    // The Bangla half of `Mirpur · মিরপুর` comes from the **server-side**
    // `area_lookup`, and the public projection carries the English names
    // alone. So the client renders the name it has — once — and never
    // repeats it. A line like `Mirpur · Mirpur` would be a visible defect.
    const line = formatArea(
      report({ areaHierarchy: { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' } }),
    )

    expect(line.split('·').length).toBe(1)
  })
})

describe('the card matches the prototype’s box model', () => {
  it('uses the prototype’s margins, padding, radius and gap', () => {
    // `margin: 0 20px 10px; padding: 14px 16px; border-radius: 14px; gap: 12px`
    expect(styles.card.marginHorizontal).toBe(20)
    expect(styles.card.marginBottom).toBe(10)
    expect(styles.card.paddingVertical).toBe(14)
    expect(styles.card.paddingHorizontal).toBe(16)
    expect(styles.card.borderRadius).toBe(14)
    expect(styles.card.borderWidth).toBe(1)
    expect(styles.card.gap).toBe(12)
    expect(styles.card.flexDirection).toBe('row')
  })

  it('uses the prototype’s 40 dp circular icon tile', () => {
    expect(styles.iconTile.width).toBe(40)
    expect(styles.iconTile.height).toBe(40)
    expect(styles.iconTile.borderRadius).toBe(20)
  })

  it('uses the prototype’s 48 dp flag button', () => {
    expect(styles.flagButton.width).toBe(48)
    expect(styles.flagButton.height).toBe(48)
  })

  it('uses the prototype’s type scale', () => {
    // area 11 px / 600 · category 15 px / 700 · description 13 px · time 11 px
    expect(styles.area.fontSize).toBe(11)
    expect(styles.area.fontWeight).toBe('600')
    expect(styles.category.fontSize).toBe(15)
    expect(styles.category.fontWeight).toBe('700')
    expect(styles.description.fontSize).toBe(13)
    expect(styles.description.lineHeight).toBe(18)
    expect(styles.time.fontSize).toBe(11)
  })
})

describe('the card tints the icon tile at 15 %', () => {
  it('converts the accent to an rgba at the prototype’s alpha', () => {
    // `rgba(<accent>, 0.15)` — the prototype's tinted icon tile.
    expect(withAlpha(REPORT_CATEGORY_ACCENTS.theft as string, 0.15)).toBe(
      'rgba(123, 31, 162, 0.15)',
    )
    expect(withAlpha(REPORT_CATEGORY_ACCENTS.assault as string, 0.15)).toBe(
      'rgba(220, 38, 38, 0.15)',
    )
  })

  it('tints the neutral grey the same way when there is no category', () => {
    expect(withAlpha(NEUTRAL, 0.15)).toBe('rgba(184, 184, 204, 0.15)')
  })
})

describe('the card omits the description block when there is no description', () => {
  it('renders no description block and no empty gap', () => {
    // The story: *"a report with no description renders **no** description
    // block and **no** empty gap"*.
    //
    // The block is **conditional** in the source, not rendered empty — so the
    // assertion is on the conditional itself.
    const code = cardCode()

    expect(code).toContain('{report.description ? (')
    expect(code).toContain('{report.description}')
  })

  it('does not render the description unconditionally', () => {
    // The other half of the same claim: there must be **no** second,
    // unconditional description render that would leave an empty block.
    const code = cardCode()
    const occurrences = code.split('report.description').length - 1

    // Two occurrences: the guard and the text. A third would be a second
    // render site.
    expect(occurrences).toBe(2)
  })
})

describe('the card renders the accent, the icon and the label together', () => {
  it('wires the accent to the border, the tint and the glyph', () => {
    const code = cardCode()

    // The left border.
    expect(code).toContain('borderLeftColor: accent')
    // The tinted icon tile.
    expect(code).toContain('withAlpha(accent, 0.15)')
    // The glyph.
    expect(code).toContain('color: accent')
  })

  it('renders the label from the shared lookup, not a literal', () => {
    const code = cardCode()

    expect(code).toContain('alertCategoryLabel(category, t(')
    expect(code).toContain("t('alerts.uncategorized')")
  })

  it('uses the neutral ramp for the uncategorized accent and the category text', () => {
    const code = cardCode()

    // The accent falls back to the neutral ramp, and the category text is
    // neutral too — an uncategorized card must not be the loudest card on
    // the feed.
    expect(code).toContain('alertAccent(category, theme.colors.ink[300])')
    expect(code).toContain('category ? theme.colors.ink[950] : theme.colors.ink[300]')
  })
})
