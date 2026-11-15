import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The offline indication.
 *
 * The story's promise:
 *
 * > **The offline behaviour is a cached page, not an empty screen.** When the
 * > network is down the feed renders the last cached page with an offline
 * > indication; it never blanks the list.
 *
 * and the gap it names:
 *
 * > **The offline behaviour is not implemented.** … there is **no offline
 * > indication** on the feed, and a cold start with no network renders an
 * > empty feed rather than a cached one.
 *
 * ## What this file can and cannot do
 *
 * `@testing-library/react-native` is **not installed** in this workspace, so a
 * React Native component tree cannot be rendered here. The claim is therefore
 * **split**, the same way `src/__tests__/boot.dom.test.tsx` splits it:
 *
 *   1. **The rule is behavioural.** `alertsShowingCachedPage` is a pure
 *      function and is exercised as one — in `alerts.dom.test.ts`, where the
 *      real hook drives it.
 *   2. **The wiring is structural.** The two feed screens must render the
 *      notice, and they must render it **off the rule** rather than off
 *      their own copy of it. The screens' sources are read with the comments
 *      stripped, so a comment that *mentions* the rule cannot satisfy an
 *      assertion that the rule is *used*.
 *
 * The structural half is not a formality. A rule that nothing calls is a rule
 * that protects nothing, and the offline case is exactly the moment the user
 * is least able to tell that something went wrong.
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

/** The two screens that render the feed. */
const APP_DIR = join(__dirname, '..', '..', '..', 'app')

const FEED_SCREENS = [
  { name: 'the Alerts screen', path: join(APP_DIR, '(app)', 'alerts.tsx') },
  { name: "the Home screen's feed block", path: join(APP_DIR, '(app)', 'home.tsx') },
]

/** The notice component. */
const NOTICE_PATH = join(__dirname, 'OfflineNotice.tsx')

describe('the offline notice exists and says something useful', () => {
  it('reads the notice component', () => {
    expect(codeOf(NOTICE_PATH).length).toBeGreaterThan(0)
  })

  it('renders the localized copy from the bundle', () => {
    const code = codeOf(NOTICE_PATH)

    // The copy comes from the bundle — a literal would be an English string
    // on a Bangla screen.
    expect(code).toContain("t('alerts.offline')")
  })

  it('is announced to a screen reader', () => {
    // The notice is the only thing telling the user that what they are
    // reading may be stale, so it must reach a screen reader too.
    const code = codeOf(NOTICE_PATH)

    expect(code).toContain('accessibilityRole="alert"')
  })

  it('does not claim the data is current', () => {
    // The copy says "showing the last results" — not "updated" and not
    // "live". An offline feed says what it has, not what it knows.
    const code = codeOf(NOTICE_PATH)

    expect(code).not.toMatch(/alerts\.live|alerts\.updated|alerts\.current/i)
  })
})

describe('both feed screens render the offline notice', () => {
  it('reads both screens — the scan is not vacuous', () => {
    for (const screen of FEED_SCREENS) {
      expect(codeOf(screen.path).length).toBeGreaterThan(0)
    }
  })

  it.each(FEED_SCREENS)('$name renders the notice', ({ path }) => {
    const code = codeOf(path)

    expect(code).toContain('<OfflineNotice />')
  })

  it.each(FEED_SCREENS)('$name renders it off the shared rule', ({ path }) => {
    const code = codeOf(path)

    // The rule lives in one place. A screen that re-implemented the
    // condition would drift from it.
    expect(code).toContain('alertsShowingCachedPage(')
  })

  it.each(FEED_SCREENS)('$name does not re-implement the condition', ({ path }) => {
    const code = codeOf(path)

    // No screen may decide the offline case on its own — no `isError &&`
    // beside the feed, no `guard.isOffline` shortcut.
    expect(code).not.toMatch(/isError\s*&&/)
  })
})

describe('the offline case never blanks the feed', () => {
  it.each(FEED_SCREENS)('$name renders the cards from the cached items', ({ path }) => {
    const code = codeOf(path)

    // The rows come from `alertsItems(data)` — the accumulated pages — so a
    // failed refetch leaves them in place. The empty state is rendered only
    // when there are **no** rows, not when the request failed.
    expect(code).toContain('alertsItems(data)')
    // Home shows the newest few and has no "load more" footer to guard.
    expect(code).toContain('data={items}')
  })

  it.each(FEED_SCREENS)('$name keeps the rows when the query errors', ({ path }) => {
    const code = codeOf(path)

    // The empty state is guarded by the row count alone. A screen that
    // rendered the empty state on `isError` would blank the feed exactly
    // when the user is offline.
    expect(code).not.toMatch(/isError\s*\?/)
    expect(code).not.toMatch(/isError\s*&&/)
  })
})
