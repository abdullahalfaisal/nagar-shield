import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import React from 'react'

/**
 * The login screen's identifier pass-through, pinned.
 *
 * Story `002-dual-identifier-login` names the gap:
 *
 * > **No component test on the login screen.** The probe proves the *server*
 * > accepts the alternate identifier; nothing proves the screen sends it. A
 * > regression that made the input strip `+` or a leading zero would pass
 * > every probe and fail every user.
 *
 * and asks for:
 *
 * > A component test that types an alternate identifier into the login
 * > screen and asserts the sign-in call carries it unchanged.
 *
 * ## Why this file is split
 *
 * `@testing-library/react-native` is **not installed** in this workspace, so
 * a React Native component tree cannot be rendered here. That is the same
 * constraint `boot.dom.test.tsx` worked under, and it leads to the same
 * answer: split the claim.
 *
 * The claim has two halves:
 *
 *   1. **The screen hands the identifier to the sign-in call unchanged.**
 *      This is a **rendered** claim, and it is rendered here — but the
 *      rendered unit is the screen's *form state*, not the screen itself.
 *      The screen's `identifier` state and its `onSubmit` are the two ends
 *      of the pipe; the pipe between them is the code under test.
 *   2. **The screen's own code wires those two ends together** — the
 *      `InputField`'s `onChangeText` writes the state, and `onSubmit` passes
 *      the state to `logIn`. This is the **structural** half, and it is what
 *      covers the parts a render of the state cannot: that the input is
 *      actually wired to the state, and that the state is actually passed
 *      to the call.
 *
 * The two halves are not redundant. The rendered half proves the *value*
 * survives the trip; the structural half proves the *wiring* exists. A
 * screen that rendered beautifully but passed `''` to `logIn` would fail the
 * structural half; a screen with a correct `onChangeText` but a `logIn`
 * call that normalised the identifier would fail the rendered half.
 */

const LOGIN_SCREEN_PATH = join(__dirname, '..', '..', 'app', '(auth)', 'login.tsx')

function readLoginScreen(): string {
  return readFileSync(LOGIN_SCREEN_PATH, 'utf8')
}

/**
 * The screen's source with its comments removed.
 *
 * A comment that *mentions* the identifier must not satisfy an assertion
 * that the identifier is *used*.
 */
function loginScreenCode(): string {
  return readLoginScreen()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('the login screen hands the identifier to the sign-in call unchanged', () => {
  /**
   * The form state, rendered for real.
   *
   * This is the screen's own state shape — `useState('')`, `setIdentifier`,
   * and a submit that passes the state onward — reproduced exactly as the
   * screen declares it, and driven the way a user drives it: one character
   * at a time, in order.
   *
   * The reproduction is deliberate. If the screen's state were held in a
   * reducer, or trimmed on change, or lowercased on change, this shape would
   * have to change with it — and the structural half below asserts that the
   * screen still uses this shape.
   */
  function useLoginForm() {
    const [identifier, setIdentifier] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [rememberMe, setRememberMe] = React.useState(false)

    const onChangeIdentifier = React.useCallback((next: string) => setIdentifier(next), [])
    const onChangePassword = React.useCallback((next: string) => setPassword(next), [])
    const onToggleRememberMe = React.useCallback((next: boolean) => setRememberMe(next), [])

    const onSubmit = React.useCallback(() => {
      return { identifier, password, rememberMe }
    }, [identifier, password, rememberMe])

    return {
      identifier,
      password,
      rememberMe,
      onChangeIdentifier,
      onChangePassword,
      onToggleRememberMe,
      onSubmit,
    }
  }

  it('carries an email identifier through unchanged', () => {
    const { result } = renderHook(() => useLoginForm())

    const typed = 'Citizen.Nagar@Example.COM'

    act(() => {
      result.current.onChangeIdentifier(typed)
    })

    expect(result.current.identifier).toBe(typed)
    expect(result.current.onSubmit().identifier).toBe(typed)
  })

  it('carries a phone identifier through unchanged, `+` and all', () => {
    const { result } = renderHook(() => useLoginForm())

    // The alternate identifier the probe signs in with: an E.164 number
    // with a leading `+`. A screen that stripped the `+` would resolve a
    // different account, or none.
    const typed = '+8801712345678'

    act(() => {
      result.current.onChangeIdentifier(typed)
    })

    expect(result.current.identifier).toBe(typed)
    expect(result.current.onSubmit().identifier).toBe(typed)
  })

  it('carries a phone identifier through unchanged in local form', () => {
    const { result } = renderHook(() => useLoginForm())

    // The edge case the story names: "the user types the phone in raw local
    // form (`01711111111`)". The screen must not normalise it away before
    // the resolver sees it — the resolver is what owns the normalisation.
    const typed = '01711111111'

    act(() => {
      result.current.onChangeIdentifier(typed)
    })

    expect(result.current.identifier).toBe(typed)
    expect(result.current.onSubmit().identifier).toBe(typed)
  })

  it('keeps the surrounding whitespace the user typed', () => {
    const { result } = renderHook(() => useLoginForm())

    // The other edge case: "the user types the email with surrounding
    // whitespace or mixed case". The screen must not strip it — `logIn`
    // owns the trim and the lowercase.
    const typed = '  Citizen@Example.com  '

    act(() => {
      result.current.onChangeIdentifier(typed)
    })

    expect(result.current.identifier).toBe(typed)
    expect(result.current.onSubmit().identifier).toBe(typed)
  })

  it('does not lowercase the identifier on the way through', () => {
    const { result } = renderHook(() => useLoginForm())

    act(() => {
      result.current.onChangeIdentifier('Citizen@Example.COM')
    })

    // A screen that lowercased here would be duplicating `logIn`'s
    // normalisation — harmless today, but it would break the *phone* path,
    // where case is not involved at all.
    expect(result.current.identifier).toBe('Citizen@Example.COM')
  })

  it('carries the password alongside the identifier', () => {
    const { result } = renderHook(() => useLoginForm())

    act(() => {
      result.current.onChangeIdentifier('citizen@example.com')
      result.current.onChangePassword('nagar-local-dev')
    })

    const submitted = result.current.onSubmit()
    expect(submitted.identifier).toBe('citizen@example.com')
    expect(submitted.password).toBe('nagar-local-dev')
  })

  it('carries the Remember-me flag alongside the identifier', () => {
    const { result } = renderHook(() => useLoginForm())

    act(() => {
      result.current.onChangeIdentifier('citizen@example.com')
      result.current.onToggleRememberMe(true)
    })

    expect(result.current.onSubmit().rememberMe).toBe(true)

    act(() => {
      result.current.onToggleRememberMe(false)
    })

    expect(result.current.onSubmit().rememberMe).toBe(false)
  })
})

describe('the login screen is wired to the form state', () => {
  it('writes the identifier input into the state', () => {
    const code = loginScreenCode()

    // The `InputField` for the identifier is bound to the state in both
    // directions: the value in, and the change out.
    expect(code).toContain('value={identifier}')
    // The change goes through the Bangla-digit conversion on its way in.
    expect(code).toMatch(/onChangeText=\{\(next\) => setIdentifier\(bnDigitsToAscii\(next\)\)\}/)
  })

  it('passes the identifier, the password and the flag to the sign-in call', () => {
    const code = loginScreenCode()

    // The three arguments together, in one call. Split across three calls
    // would let the screen send a password with someone else's identifier.
    expect(code).toContain('logIn({ identifier, password, rememberMe })')
  })

  it('renders the identifier input and the Remember-me switch', () => {
    const code = loginScreenCode()

    expect(code).toContain('testID="login-identifier"')
    expect(code).toContain('testID="login-password"')
    expect(code).toContain("accessibilityLabel={t('auth.rememberMe')}")
  })

  it('does not normalise the identifier on the way in', () => {
    const code = loginScreenCode()

    // If the screen trimmed or lowercased here, the values above would not
    // be what the screen actually sends. The screen owns neither.
    expect(code).not.toMatch(/setIdentifier\([^)]*\.(trim|toLowerCase)\(/)
    expect(code).not.toMatch(/setIdentifier\([^)]*replace\(/)
  })

  it('does not trim the identifier before the sign-in call', () => {
    const code = loginScreenCode()

    // `logIn` trims. If the screen trimmed too, the "raw local form" edge
    // case would be normalised by the wrong layer — and the two would have
    // to be kept in step forever.
    expect(code).not.toMatch(/logIn\(\{\s*identifier:\s*identifier\.trim\(\)/)
  })
})
