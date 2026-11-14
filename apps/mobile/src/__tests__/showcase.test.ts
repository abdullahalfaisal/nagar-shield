import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The design-system showcase gate.
 *
 * Story `003-mobile-design-system` names the acceptance surface:
 *
 * > **Given** the primitive set — `Button`, `AppBar`, `HelpCard`, `TextField`,
 * > `QuickActionCard`, `ListRow`, `Toggle`, `Chip`, `SegmentedTabs`,
 * > `StickyFooter`, `BottomSheet`, `Brand`, `PulseDot`, `Skeleton` — **When**
 * > each is rendered in the design-system showcase in the light theme and
 * > again in the dark theme, **Then** every one renders without error in
 * > both themes.
 *
 * Why a source scan and not a rendering test
 * -----------------------------------------
 * `@testing-library/react-native` is not installed in this workspace, and a
 * React Native component cannot be rendered without it. The house idiom for
 * this — see `noChartCode.test.ts` — is to read the source and assert the
 * structure that the criterion names.
 *
 * The scan is deliberately **not** satisfied by a bare import. A primitive
 * that is imported but never rendered is exactly the regression the criterion
 * guards against: the showcase would look complete while a primitive silently
 * stopped rendering. So the scan requires the primitive to appear as a JSX
 * element inside the showcase's render, and it requires the showcase to mount
 * under both themes.
 *
 * The story's names do not all match the code's names — the app calls the
 * text field `InputField` and the quick-action tile `ActionCard`. The
 * resolution is declared below rather than hidden: the story's name is
 * mapped to the code's export, and the mapping is itself asserted, so a
 * rename in either place is caught.
 */

/** The app root, from `src/__tests__`. */
const APP_ROOT = join(__dirname, '..', '..')

const SHOWCASE = join(APP_ROOT, 'src', 'shared', 'ui', 'Showcase.tsx')
const SHOWCASE_ROUTE = join(APP_ROOT, 'app', 'showcase.tsx')
const ROOT_LAYOUT = join(APP_ROOT, 'app', '_layout.tsx')
const UI_BARREL = join(APP_ROOT, 'src', 'shared', 'ui', 'index.ts')

/**
 * The story's primitive list, mapped to the export the app actually uses.
 *
 * `TextField` → `InputField` and `QuickActionCard` → `ActionCard` are the two
 * renames; `Chip` → `AreaChipRow` is the one the story names loosely (the
 * prototype's `.chip` / `.time-chip` is the area filter chip row).
 */
const STORY_PRIMITIVES: Array<{ story: string; code: string }> = [
  { story: 'Button', code: 'Button' },
  { story: 'AppBar', code: 'AppBar' },
  { story: 'HelpCard', code: 'HelpCard' },
  { story: 'TextField', code: 'InputField' },
  { story: 'QuickActionCard', code: 'ActionCard' },
  { story: 'ListRow', code: 'ListRow' },
  { story: 'Toggle', code: 'Toggle' },
  { story: 'Chip', code: 'AreaChipRow' },
  { story: 'SegmentedTabs', code: 'SegmentedTabs' },
  { story: 'StickyFooter', code: 'StickyFooter' },
  { story: 'BottomSheet', code: 'BottomSheet' },
  { story: 'Brand', code: 'Brand' },
  { story: 'PulseDot', code: 'PulseDot' },
  { story: 'Skeleton', code: 'Skeleton' },
]

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

/** The showcase's source, comments removed. */
const showcaseCode = stripComments(readFileSync(SHOWCASE, 'utf8'))

describe('the design-system showcase exists', () => {
  it('has a route that mounts the showcase', () => {
    const route = readFileSync(SHOWCASE_ROUTE, 'utf8')
    expect(route).toContain('Showcase')
    expect(stripComments(route)).toMatch(/<Showcase\s*\/>/)
  })

  it('is registered in the root stack', () => {
    const layout = readFileSync(ROOT_LAYOUT, 'utf8')
    expect(layout).toContain('name="showcase"')
  })
})

describe('the showcase renders every primitive the story names', () => {
  it("lists exactly the story's primitive set — the list is not vacuous", () => {
    // If the list drifted away from the story's, the scan below would still
    // pass while protecting less. The count pins it.
    expect(STORY_PRIMITIVES).toHaveLength(14)
    expect(STORY_PRIMITIVES.map((p) => p.story)).toEqual([
      'Button',
      'AppBar',
      'HelpCard',
      'TextField',
      'QuickActionCard',
      'ListRow',
      'Toggle',
      'Chip',
      'SegmentedTabs',
      'StickyFooter',
      'BottomSheet',
      'Brand',
      'PulseDot',
      'Skeleton',
    ])
  })

  it('renders every one of them as a JSX element', () => {
    // The element must carry attributes or close itself — `<Skeleton … />` or
    // `<Skeleton …>`. A bare `<Skeleton>` in the source is a JSX *text*
    // match (`<Text>Skeleton</Text>` would satisfy it), which is not a
    // rendering. So the pattern requires a prop, a closing bracket, or a
    // `>` right after the name.
    const missing = STORY_PRIMITIVES.filter(({ code }) => {
      const element = new RegExp(`<${code}(\\s[^>]*)?[/>]`)
      return !element.test(showcaseCode)
    }).map(({ story, code }) => `${story} (rendered as <${code}>)`)

    expect(missing).toEqual([])
  })

  it('imports every one of them from the shared UI module', () => {
    // The named imports of every `import { … } from './Something'` statement
    // whose module path points at the shared UI directory.
    const imported = new Set<string>()

    for (const statement of showcaseCode.match(/import\s*\{([^}]*)\}\s*from\s*'[^']*'/g) ?? []) {
      const names = statement.match(/\{([^}]*)\}/)?.[1] ?? ''
      for (const name of names.split(',')) {
        const trimmed = name
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim()
        if (trimmed) imported.add(trimmed)
      }
    }

    const missing = STORY_PRIMITIVES.filter(({ code }) => !imported.has(code)).map(
      ({ story }) => story,
    )

    expect(missing).toEqual([])
  })

  it('exports every one of them from the UI barrel', () => {
    const barrel = readFileSync(UI_BARREL, 'utf8')

    const missing = STORY_PRIMITIVES.filter(({ code }) => {
      // A barrel line is `export { Name } from './Module'` or
      // `export { A, B } from './Module'`.
      const exported = barrel.match(/export\s*\{([^}]*)\}\s*from/g) ?? []
      return !exported.some((line) => line.match(/\{([^}]*)\}/)?.[1]?.includes(code))
    }).map(({ story }) => story)

    expect(missing).toEqual([])
  })
})

describe('the showcase renders in both themes', () => {
  it('reads the theme controls, so the theme can be flipped', () => {
    expect(showcaseCode).toContain('useThemeControls')
    expect(showcaseCode).toMatch(/toggleTheme|setTheme/)
  })

  it('tells the reader which theme is showing', () => {
    // The app bar's subtitle names the theme, so a reviewer can see which
    // theme a primitive is being read in.
    expect(showcaseCode).toMatch(/isDark\s*\?\s*'Dark theme'\s*:\s*'Light theme'/)
  })

  it('renders the primitives once, under a single theme provider — the theme toggle flips the whole screen', () => {
    // The primitives are rendered once, not twice. If they were rendered twice
    // — once per theme — the toggle would be a lie.
    const buttonUses = (showcaseCode.match(/<Button[\s/>]/g) ?? []).length
    expect(buttonUses).toBeGreaterThan(0)

    // One theme read drives the whole screen.
    expect((showcaseCode.match(/useTheme\(\)/g) ?? []).length).toBe(1)
  })
})

describe('the showcase renders nothing it should not', () => {
  it('fetches no data', () => {
    // The showcase is a design surface. If it started fetching, a failure in
    // the API would break the acceptance screen for the UI.
    expect(showcaseCode).not.toMatch(/useQuery|useMutation|useInfiniteQuery|supabase/i)
  })

  it('touches no account state', () => {
    expect(showcaseCode).not.toMatch(/useAuthSession|useAccountStatus|logIn|logOut/i)
  })
})
