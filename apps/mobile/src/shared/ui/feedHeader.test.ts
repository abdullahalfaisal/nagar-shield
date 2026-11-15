import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The feed header, on both surfaces.
 *
 * Story `002-auto-refresh-and-pull-to-refresh` has two acceptance criteria
 * that are about the **screen**, not about the query:
 *
 *   * AC #3 — a paused refresh replaces the pulsing dot and the
 *     **"Auto-refreshes every 60s"** label with a **quiet indicator**;
 *   * AC #10 — under reduced motion the dot is static, while the label and the
 *     `11 px / var(--ink-500) / weight 600` styling **remain unchanged**.
 *
 * Neither can be observed by counting requests. The behaviour lives in the
 * screen's wiring, so it is asserted against the **source** — the same split
 * `pulseDot.test.ts` uses, and for the same reason:
 * `@testing-library/react-native` is not installed in this workspace, so the
 * component tree cannot be rendered.
 *
 * ## Why the source scan is not a proxy for the behaviour
 *
 * A scan of a screen file looks like a weak substitute for a render. It is
 * not, here, because the claims being made are **structural**: the Home
 * screen renders a `PulseDot` at all, the screen passes the guard's paused
 * state into it, the screen does not call `useRefreshGuard` itself, the label
 * is driven by the paused reason and by nothing else. Those are statements
 * about the wiring, and the wiring is what the source *is*.
 *
 * The scans are paired with a **positive control** — a deliberately wrong
 * string that must not match — so a scan that silently stopped matching
 * anything cannot pass.
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

/**
 * A source file with its comments **kept**.
 *
 * Some claims are about the *explanation* rather than the code, and an
 * explanation belongs in a comment. This story asks for the reason the
 * background poll stops to be **recorded** — so the scan for it has to read
 * the comment.
 */
function rawOf(path: string): string {
  return readFileSync(path, 'utf8')
}

const ALERTS_SCREEN = join(__dirname, '..', '..', '..', 'app', '(app)', 'alerts.tsx')
const HOME_SCREEN = join(__dirname, '..', '..', '..', 'app', '(app)', 'home.tsx')
const FEED_HOOK = join(__dirname, '..', 'api', 'alerts.ts')

describe('the feed header on the Alerts screen', () => {
  it('reads the screen — the scan is not vacuous', () => {
    expect(codeOf(ALERTS_SCREEN).length).toBeGreaterThan(0)
    expect(codeOf(HOME_SCREEN).length).toBeGreaterThan(0)
  })

  it('renders the pulsing dot and passes the guard’s paused state', () => {
    const code = codeOf(ALERTS_SCREEN)

    expect(code).toContain('<PulseDot')
    expect(code).toMatch(/<PulseDot[^>]*paused=\{guard\.isPaused\}/s)
  })

  it('passes the reduced-motion setting to the dot', () => {
    const code = codeOf(ALERTS_SCREEN)

    expect(code).toMatch(/<PulseDot[^>]*reduceMotion=\{reduceMotion\}/s)
  })

  it('wires the pull-to-refresh to the hook’s refetch', () => {
    const code = codeOf(ALERTS_SCREEN)

    expect(code).toContain('refreshControl={')
    // The spinner is for a pull the user made, so it is local state around
    // `refetch()` — `isRefetching` is also true for the 60 s poll.
    expect(code).toMatch(/refreshing=\{refreshing\}/)
    expect(code).not.toMatch(/refreshing=\{isRefetching\}/)
    expect(code).toMatch(/onRefresh=\{\(\)\s*=>\s*void\s+onRefresh\(\)\}/)
    expect(code).toMatch(/await\s+refetch\(\)/)
  })

  it('does not pull the next page when the user pulls down', () => {
    const code = codeOf(ALERTS_SCREEN)

    // The pull and the pagination are different actions. A pull that
    // advanced the cursor would skip the page the user was reading.
    expect(code).not.toMatch(/onRefresh=\{\(\)\s*=>\s*void\s+fetchNextPage\(\)\}/)
  })

  it('maps every paused reason to its own label', () => {
    const code = codeOf(ALERTS_SCREEN)

    expect(code).toContain("case 'battery'")
    expect(code).toContain("case 'offline'")
    expect(code).toContain("case 'background'")
    expect(code).toContain("t('alerts.pausedBattery')")
    expect(code).toContain("t('alerts.pausedOffline')")
    expect(code).toContain("t('alerts.pausedBackground')")
  })

  it('keeps the header’s styling exactly as the story names it', () => {
    const code = codeOf(ALERTS_SCREEN)

    // 11 px, `var(--ink-500)`, weight 600. The story says the *label text*
    // changes under a pause; the *box* does not.
    expect(code).toMatch(/refreshText:\s*\{[^}]*fontSize:\s*11/s)
    expect(code).toMatch(/refreshText:\s*\{[^}]*fontWeight:\s*'600'/s)
    expect(code).toContain('theme.colors.ink[500]')
  })

  it('never lets the reduced-motion setting reach the label', () => {
    const code = codeOf(ALERTS_SCREEN)

    // AC #10: the label is **unchanged** under reduced motion. The setting
    // asks for less movement, not for less information — so the label must
    // never mention it.
    const label = code.slice(code.indexOf('function pausedLabel'))

    expect(label).not.toContain('reduceMotion')
  })
})

describe('the feed header on the Home screen', () => {
  it('renders the pulsing dot and passes the guard’s paused state', () => {
    const code = codeOf(HOME_SCREEN)

    expect(code).toContain('<PulseDot')
    expect(code).toMatch(/<PulseDot[^>]*paused=\{guard\.isPaused\}/s)
    expect(code).toMatch(/<PulseDot[^>]*reduceMotion=\{reduceMotion\}/s)
  })

  it('uses the guarded feed hook, not the unguarded one', () => {
    const code = codeOf(HOME_SCREEN)

    // Home polls the same feed as the Alerts screen. If it called a hook
    // without the guard, a backgrounded Home would poll forever — which is
    // exactly the defect this story exists to close.
    expect(code).toContain('useAlertsFeed(')
    expect(code).not.toMatch(/\buseAlerts\(/)
  })

  it('does not call the refresh guard itself', () => {
    const code = codeOf(HOME_SCREEN)

    // The guard is **intrinsic** to the hook. A screen that called
    // `useRefreshGuard` as well would hold a *second* guard, and the header
    // could then show a reason the poll did not actually use.
    expect(code).not.toContain('useRefreshGuard')
  })

  it('wires the pull-to-refresh to the hook’s refetch', () => {
    const code = codeOf(HOME_SCREEN)

    expect(code).toContain('refreshControl={')
    // The spinner is for a pull the user made, so it is local state around
    // `refetch()` — `isRefetching` is also true for the 60 s poll.
    expect(code).toMatch(/refreshing=\{refreshing\}/)
    expect(code).not.toMatch(/refreshing=\{isRefetching\}/)
    expect(code).toMatch(/onRefresh=\{\(\)\s*=>\s*void\s+onRefresh\(\)\}/)
    expect(code).toMatch(/await\s+refetch\(\)/)
  })

  it('maps every paused reason to its own label', () => {
    const code = codeOf(HOME_SCREEN)

    expect(code).toContain("case 'battery'")
    expect(code).toContain("case 'offline'")
    expect(code).toContain("case 'background'")
    expect(code).toContain("t('alerts.pausedBattery')")
    expect(code).toContain("t('alerts.pausedOffline')")
    expect(code).toContain("t('alerts.pausedBackground')")
  })

  it('keeps the header’s styling exactly as the story names it', () => {
    const code = codeOf(HOME_SCREEN)

    expect(code).toMatch(/refreshText:\s*\{[^}]*fontSize:\s*11/s)
    // The weight (600) now comes from the face: Inter-SemiBold / Noto Sans Bengali
    // SemiBold. A custom font on Android must not also set `fontWeight`.
    expect(code).toMatch(/styles\.refreshText,[\s\S]{0,120}?appFont\(/)
    expect(code).toContain('theme.colors.ink[500]')
  })

  it('never lets the reduced-motion setting reach the label', () => {
    const code = codeOf(HOME_SCREEN)

    const label = code.slice(code.indexOf('function pausedLabel'))

    expect(label).not.toContain('reduceMotion')
  })
})

describe('the feed hook owns the refresh guard', () => {
  it('the hook builds the guard, once', () => {
    const code = codeOf(FEED_HOOK)

    expect(code).toContain('useRefreshGuard()')
  })

  it('the hook returns the guard with its result', () => {
    const code = codeOf(FEED_HOOK)

    // The screen reads the guard **from the hook**, so the header and the
    // poll cannot disagree about why the refresh is paused.
    expect(code).toMatch(/return\s*\{\s*\.\.\.result,\s*guard\s*\}/)
  })

  it('the interval is a function, so the timer is re-armed on a change', () => {
    const code = codeOf(FEED_HOOK)

    // A **number** would arm the timer once and never re-evaluate it. A
    // **function** is re-evaluated on every render, and TanStack re-arms the
    // timer when the computed value changes — which is what re-arms it at the
    // moment the app returns to the foreground.
    expect(code).toMatch(/refetchInterval:\s*\(\)\s*=>/)
    expect(code).not.toMatch(/refetchInterval:\s*ALERTS_REFRESH_INTERVAL_MS/)
  })

  it('the interval returns false when the refresh is paused', () => {
    const code = codeOf(FEED_HOOK)

    // `false` is what stops the **timer**: `isValidTimeout(false)` is false,
    // so no interval is armed at all.
    expect(code).toMatch(/refetchInterval:\s*\(\)\s*=>\s*\(guard\.isPaused\s*\?\s*false\s*:/)
  })

  it('the query refuses to fetch while the refresh is paused', () => {
    const code = codeOf(FEED_HOOK)

    // The **second** lever: the timer can fire in the window between the
    // native app-state event and React's commit, so the request itself has to
    // be refused.
    expect(code).toContain('RefreshPausedError')
    expect(code).toMatch(/if\s*\(\s*guard\.isBackgroundedNow\(\)\s*\)/)
  })

  it('the record of why the background poll stops is in the code', () => {
    const code = codeOf(FEED_HOOK)
    const raw = rawOf(FEED_HOOK)

    // `refetchIntervalInBackground: false` is a **no-op in React Native** —
    // TanStack's `focusManager.isFocused()` reads
    // `globalThis.document?.visibilityState`, and React Native has no DOM
    // `document`, so it is *always* `true`. The flag is kept because it is
    // the correct thing to write, but it is **not** what stops the poll.
    //
    // The story asks for the reason to be *recorded*, so the code has to say
    // it — otherwise a future change to `true` would look like a harmless
    // edit.
    expect(code).toContain('refetchIntervalInBackground: false')

    // The **explanation** is in a comment, so it is read from the raw source.
    expect(raw).toMatch(/no-op in React Native/i)
    expect(raw).toMatch(/focusManager\.isFocused\(\)/)
    expect(raw).toMatch(/visibilityState/)
  })
})
