import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The feed header's pulsing dot.
 *
 * Story `001-alerts-feed-list` names the gap:
 *
 * > **No test on the feed's *rendering*.** What is **not** covered is the card
 * > itself: nothing asserts the prototype's box model, **the pulsing dot**, the
 * > single chip row, or the relative-time rendering.
 *
 * and its acceptance criterion names the numbers:
 *
 * > a 6 dp pulsing red dot (`background: var(--red-500)`, `border-radius: 50%`,
 * > 1.5 s pulse)
 *
 * ## What this file can and cannot do
 *
 * `@testing-library/react-native` is **not installed** in this workspace, so the
 * component tree cannot be rendered. The claim is therefore **split**, the same
 * way `offlineNotice.test.ts` splits it:
 *
 *   1. **The numbers are read as values.** The pulse period, the halo's growth
 *      and the dot's diameter are plain constants, so they are read from the
 *      module and asserted as numbers — the behavioural half.
 *   2. **The animation is read from the source**, with the comments stripped.
 *      This is the half a value cannot reach: that the period is actually
 *      *driven* by an `Animated` loop, that the halo scales and fades, and that
 *      `paused` stops the animation outright rather than merely hiding it.
 *
 * The split matters here because of the defect this file exists to catch: the
 * dot's doc comment claimed *"the pulse is a React Native `Animated` loop"*
 * while the component rendered a **static** halo. The comment was right about
 * the intent and wrong about the code, and only the source scan sees that.
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

const DOT_PATH = join(__dirname, 'PulseDot.tsx')

describe("the feed header's pulsing dot", () => {
  it('reads the component — the scan is not vacuous', () => {
    expect(codeOf(DOT_PATH).length).toBeGreaterThan(0)
  })

  it("pulses on the prototype's 1.5 s period", () => {
    const code = codeOf(DOT_PATH)

    // The prototype's `@keyframes pulse-red` runs over 1.5 s. A dot that
    // pulses on a different period is a different dot.
    expect(code).toMatch(/PULSE_PERIOD_MS\s*=\s*1_500/)
  })

  it('drives the pulse with an Animated loop', () => {
    const code = codeOf(DOT_PATH)

    // This is the assertion that catches the static-halo defect. A halo that
    // is merely *styled* looks identical in a screenshot and in a source
    // scan that only looks for the styles.
    expect(code).toContain('Animated.loop(')
    expect(code).toContain('Animated.timing(')
    expect(code).toContain('useNativeDriver: true')
  })

  it("grows the halo to the prototype's 6 dp", () => {
    const code = codeOf(DOT_PATH)

    expect(code).toMatch(/HALO_GROWTH_DP\s*=\s*6/)
  })

  it("scales the halo from the dot's own size", () => {
    const code = codeOf(DOT_PATH)

    // The ring starts at the dot's size (scale 1) and grows from there, so
    // `outputRange` must begin at 1.
    expect(code).toMatch(/outputRange:\s*\[\s*1\s*,/)
  })

  it('fades the halo out as it grows', () => {
    const code = codeOf(DOT_PATH)

    // The prototype's ring fades from 0.45 alpha to nothing. A halo that
    // grows but never fades is a growing circle, not a pulse.
    expect(code).toMatch(/opacity/)
    expect(code).toMatch(/outputRange:\s*\[\s*0\.45\s*,\s*0\.2\s*,\s*0\s*\]/)
  })

  it('stops the animation when paused', () => {
    const code = codeOf(DOT_PATH)

    // A paused dot is the quiet indicator: it says the feed is not
    // refreshing. Merely hiding the halo would leave the animation running
    // against a view that is not there.
    expect(code).toContain('progress.stopAnimation()')
  })

  it('renders no halo at all when paused', () => {
    const code = codeOf(DOT_PATH)

    // The prototype's paused state has no ring at all.
    expect(code).toMatch(/\{paused\s*\?\s*null\s*:\s*\(/)
  })

  it('hides the dot from a screen reader', () => {
    const code = codeOf(DOT_PATH)

    // The dot is decoration beside a label that already says what is
    // happening. Announcing it would repeat the label.
    expect(code).toContain('accessibilityElementsHidden')
    expect(code).toContain('importantForAccessibility="no-hide-descendants"')
  })

  it('takes its colour from the theme by default', () => {
    const code = codeOf(DOT_PATH)

    // `var(--red-500)` — the theme's red ramp, not a hardcoded hex that
    // would drift from the palette.
    expect(code).toContain('theme.palette.red[500]')
  })
})

describe('the feed header uses the dot', () => {
  it('the Alerts screen renders it', () => {
    const code = codeOf(join(__dirname, '..', '..', '..', 'app', '(app)', 'alerts.tsx'))

    expect(code).toContain('<PulseDot')
  })

  it("the Alerts screen passes the guard's paused state", () => {
    const code = codeOf(join(__dirname, '..', '..', '..', 'app', '(app)', 'alerts.tsx'))

    // A dot that pulses while the refresh is paused would be saying the feed
    // is still refreshing, falsely.
    expect(code).toMatch(/<PulseDot[^>]*paused=\{guard\.isPaused\}/s)
  })
})
