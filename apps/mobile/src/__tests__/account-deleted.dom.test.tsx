import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@nagar-shield/shared'
import { restoreErrorCopy } from '../shared/api/recovery-window'
import { bn } from '../shared/i18n/bn'
import { en } from '../shared/i18n/en'

/**
 * The recovery screen's message, pinned.
 *
 * Story `002-identity / 007-account-deletion-and-recovery` asks for:
 *
 * > A test for the expired-restore path that asserts the **message**, not
 * > just that an error appears.
 *
 * The screen used to report every restore failure as `errors.internal` — so
 * a citizen whose 30 days had run out was told the app broke, and told to
 * try again, when trying again could never work.
 *
 * ## Why this file is split
 *
 * `@testing-library/react-native` is **not installed** in this workspace, so
 * a React Native component tree cannot be rendered here. The claim has two
 * halves, and the same answer `boot.dom.test.tsx` reached applies:
 *
 *   1. **The message.** `restoreErrorCopy` is a pure function that takes the
 *      failure and the window's state and returns the string the screen
 *      shows. It is **called** here, against the real bundles, with the real
 *      `AppError` codes the RPC raises.
 *   2. **The wiring.** The screen actually calls `restoreErrorCopy`, and
 *      actually renders its result, and actually disables the button when
 *      the window has closed. This is the **structural** half.
 *
 * The halves are not redundant. A screen that called `restoreErrorCopy` and
 * threw the result away would pass the first half and fail the second; a
 * screen that rendered the right string but wired the wrong failure into it
 * would fail the first half.
 */

const SCREEN_PATH = join(__dirname, '..', '..', 'app', '(auth)', 'account-deleted.tsx')

function readScreen(): string {
  return readFileSync(SCREEN_PATH, 'utf8')
}

/**
 * The screen's source with its comments removed.
 *
 * A comment that *mentions* the copy must not satisfy an assertion that the
 * copy is *used*.
 */
function screenCode(): string {
  return readScreen()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('the recovery screen reports the truth about a failed restore', () => {
  /**
   * A `t` that reads the **real** bundles, so the assertion is about the
   * string a citizen actually sees.
   */
  function realTranslator(language: 'en' | 'bn') {
    const bundle = language === 'bn' ? bn : en
    return (key: string, options?: Record<string, unknown>): string => {
      const path = key.split('.')
      let value: unknown = bundle
      for (const segment of path) {
        if (value && typeof value === 'object' && segment in value) {
          value = (value as Record<string, unknown>)[segment]
        } else {
          return key
        }
      }
      if (typeof value !== 'string') return key
      return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        options && name in options ? String(options[name]) : '',
      )
    }
  }

  it('says the recovery period has ended when the window has closed', () => {
    const t = realTranslator('en')

    const message = restoreErrorCopy(new AppError('VALIDATION_FAILED'), t, true)

    // Not `errors.internal`. The citizen is told the truth about their
    // account, not that the app broke.
    expect(message).toBe(
      'The 30-day recovery period has ended, so this account can no longer be restored.',
    )
    expect(message).not.toBe(t('errors.internal'))
  })

  it('says it in Bangla too', () => {
    const t = realTranslator('bn')

    const message = restoreErrorCopy(new AppError('VALIDATION_FAILED'), t, true)

    expect(message).toContain('সুস্থতার সময়সীমা শেষ হয়ে গেছে')
    expect(message).not.toBe(t('errors.internal'))
  })

  it('reports a conflict when the account was not deleted', () => {
    const t = realTranslator('en')

    const message = restoreErrorCopy(new AppError('CONFLICT'), t, true)

    // The user landed on the recovery screen by mistake. That is a different
    // fact from "your window closed", and a different fact from "the app
    // broke".
    expect(message).toBe(t('errors.conflict'))
    expect(message).not.toBe(t('errors.internal'))
  })

  it('reports an unknown failure as an internal error', () => {
    const t = realTranslator('en')

    const message = restoreErrorCopy(new AppError('INTERNAL'), t, true)

    expect(message).toBe(t('errors.internal'))
  })

  it('reports a plain error as an internal error', () => {
    const t = realTranslator('en')

    expect(restoreErrorCopy(new Error('network'), t, true)).toBe(t('errors.internal'))
  })

  it('believes the server when the screen thought the window was open', () => {
    const t = realTranslator('en')

    // The device's clock was ahead of the server's. The server is the
    // authority on when the window closes, so the screen believes it.
    const message = restoreErrorCopy(new AppError('VALIDATION_FAILED'), t, true)

    expect(message).toBe(t('disabled.recoveryWindowClosed'))
  })

  it('never tells a citizen to try again when trying cannot work', () => {
    const t = realTranslator('en')

    const closed = restoreErrorCopy(new AppError('VALIDATION_FAILED'), t, true)

    // The generic internal-error copy asks the user to try again. For a
    // closed window that is a false promise.
    expect(closed).not.toContain('try again')
  })
})

describe('the recovery screen is wired to the window', () => {
  it('reads the deadline from the account status', () => {
    const code = screenCode()

    // The deadline has to come from the account row, not from a local timer.
    expect(code).toContain('useAccountStatus(')
    expect(code).toContain('recoverableUntil')
  })

  it('states the deadline to the user', () => {
    const code = screenCode()

    expect(code).toContain("t('disabled.recoverableUntilDays'")
    expect(code).toContain("t('disabled.recoveryWindowClosed')")
  })

  it('disables the Restore button once the window has closed', () => {
    const code = screenCode()

    // The button is enabled regardless — the citizen pressed it, got an
    // error, and learned the hard way. The screen knows the deadline.
    expect(code).toMatch(/disabled=\{busy \|\| !window\.open\}/)
  })

  it('routes the failure through the copy function', () => {
    const code = screenCode()

    // The bug this story names was `catch { setError(t('errors.internal')) }`
    // — a bare catch that threw away the code. The screen must branch on it.
    expect(code).toContain('restoreErrorCopy(caught, t, window.open)')
  })

  it('does not report a restore failure as an internal error on its own', () => {
    const code = screenCode()

    // The sign-out path may still report an internal error — that is a
    // different operation. But the restore path must not. The slice is
    // bounded to the restore handler, so the sign-out's own catch block
    // cannot satisfy (or fail) this assertion.
    const start = code.indexOf('const onRestore')
    const end = code.indexOf('const onSignOut')
    const restoreHandler = code.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(restoreHandler).not.toContain("setError(t('errors.internal'))")
    expect(restoreHandler).not.toMatch(/catch\s*\{/)
  })
})

describe('the recovery screen states the window in both languages', () => {
  it('resolves the deadline copy in the English bundle', () => {
    expect(en.disabled.recoverableUntilDays).toBeTruthy()
    expect(en.disabled.recoveryWindowClosed).toBeTruthy()
  })

  it('resolves the deadline copy in the Bangla bundle', () => {
    expect(bn.disabled.recoverableUntilDays).toBeTruthy()
    expect(bn.disabled.recoveryWindowClosed).toBeTruthy()
  })

  it('names the 30 days in the closed-window copy, in both languages', () => {
    // The copy names the window's length, so the citizen knows what ran out.
    expect(en.disabled.recoveryWindowClosed).toContain('30')
    expect(bn.disabled.recoveryWindowClosed).toContain('৩০')
  })
})
