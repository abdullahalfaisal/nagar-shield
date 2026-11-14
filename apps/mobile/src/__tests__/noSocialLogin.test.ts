import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * FR-AUTH-6 — no social login, guarded.
 *
 * Story `002-dual-identifier-login` names the criterion:
 *
 * > **Given** any auth screen, **When** it renders, **Then** no Google,
 * > Facebook, or Apple sign-in control is present (FR-AUTH-6)
 *
 * and the Technical Notes say:
 *
 * > **No social login.** No Google / Facebook / Apple provider is wired in
 * > Auth and no such control appears on any auth screen.
 *
 * Nothing guarded it. A `Button` labelled *"Continue with Google"* would
 * have shipped unnoticed — and it would have been worse than a cosmetic
 * defect: a social provider is a **second credential system** with its own
 * account rows, which would break the "one person, one `auth.users` row"
 * invariant that the whole identity model rests on (W-1).
 *
 * ## The shape of the guard
 *
 * Three places a social control could appear:
 *
 *   1. **A rendered control** — a button, a label, an icon.
 *   2. **A string** — the copy for such a control, in the i18n bundles.
 *   3. **A provider** — a provider wired into the Supabase Auth client.
 *
 * All three are scanned. The scan reads the **code** (comments and string
 * literals stripped) for the first and third, and the **literals** for the
 * second — because the copy for a social button would live in the bundle,
 * not in the component.
 *
 * ## The scan is not vacuous
 *
 * A negative claim cannot distinguish "clean" from "blind". So the file
 * carries a **positive control**: a synthetic source that *does* contain a
 * social control, run through the same matcher, which must be flagged. If
 * the matcher stops matching, the positive control fails and the whole file
 * says so.
 */

/** The auth screens — the screens a signed-out user can reach. */
const AUTH_SCREENS = [
  'welcome.tsx',
  'login.tsx',
  'register.tsx',
  'forgot-password.tsx',
  'verify-otp.tsx',
  'reset-password.tsx',
  'phone.tsx',
  'alternate-phone.tsx',
  'biometric-gate.tsx',
  'account-deleted.tsx',
  'account-disabled.tsx',
]

/**
 * The providers FR-AUTH-6 names, and the spellings each one arrives in.
 *
 * The spellings are what a control would actually be written as — a
 * `Button` label, an icon name, a `provider` option, a copy string. They
 * are matched case-insensitively, and the "sign in with" / "continue with"
 * prefixes are matched separately because a control's **label** is the
 * giveaway, and its label need not name the provider at all ("Continue" is
 * a legal button label for a social button).
 */
const PROVIDER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['google', /\bgoogle\b/i],
  ['facebook', /\bfacebook\b/i],
  ['apple', /\bapple\b/i],
  ['social', /\bsocial\b/i],
  ['oauth', /\boauth\b/i],
  ['openid', /\bopenid\b/i],
]

/**
 * The button-label prefixes that mark a social control.
 *
 * A social button says *"Continue with…"* or *"Sign in with…"*. A password
 * button says *"Sign in"*. The prefix alone, without a provider name, is
 * enough to warrant a look — and the scan reports it, so a reviewer reads
 * it rather than being surprised by it.
 */
const SOCIAL_LABEL_PATTERN = /\b(continue|sign\s*in|log\s*in|register)\s+with\b/i

/**
 * The source with its comments and string literals stripped.
 *
 * The **code** view is what a rendered control is made of. A comment that
 * mentions Google must not satisfy an assertion that a Google control is
 * *present* — and a string literal must not either, because the literal
 * that says *"Continue with Google"* is the copy, which is scanned
 * separately, against the bundles.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
}

/** The string literals in a source. */
function literalsOf(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const literals: string[] = []
  const pattern = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(withoutComments)) !== null) {
    literals.push(match[2] ?? '')
  }

  return literals
}

function readAuthScreen(name: string): string {
  return readFileSync(join(__dirname, '..', '..', 'app', '(auth)', name), 'utf8')
}

/** Every file under `directory`, recursively. */
function filesUnder(directory: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) {
      found.push(...filesUnder(full))
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      found.push(full)
    }
  }

  return found
}

describe('the scan is not vacuous', () => {
  it('flags a synthetic control that names a provider', () => {
    // The positive control. If the matcher stopped matching, this would
    // pass silently and every negative assertion below would be worthless.
    const synthetic = `
      export function Login() {
        return <Button label="Continue with Google" onPress={signIn} />
      }
    `

    const literals = literalsOf(synthetic)

    const named = PROVIDER_PATTERNS.filter(([, pattern]) =>
      literals.some((literal) => pattern.test(literal)),
    ).map(([name]) => name)
    const labelled = literals.filter((literal) => SOCIAL_LABEL_PATTERN.test(literal))

    expect(named).toContain('google')
    expect(labelled).toHaveLength(1)
  })

  it('flags a synthetic control whose provider is wired, not named in the label', () => {
    const synthetic = `
      const provider = { provider: 'facebook' }
      export function Login() { return <Button label="Continue" /> }
    `

    const literals = literalsOf(synthetic)
    const named = PROVIDER_PATTERNS.filter(([, pattern]) =>
      literals.some((literal) => pattern.test(literal)),
    ).map(([name]) => name)

    expect(named).toContain('facebook')
  })

  it('does not flag a plain password sign-in', () => {
    const synthetic = `
      export function Login() {
        return <Button label="Sign in" onPress={signIn} />
      }
    `

    const literals = literalsOf(synthetic)

    const named = PROVIDER_PATTERNS.filter(([, pattern]) =>
      literals.some((literal) => pattern.test(literal)),
    ).map(([name]) => name)
    const labelled = literals.filter((literal) => SOCIAL_LABEL_PATTERN.test(literal))

    expect(named).toEqual([])
    expect(labelled).toEqual([])
  })
})

describe('no auth screen carries a social sign-in control', () => {
  it('reads every auth screen', () => {
    for (const name of AUTH_SCREENS) {
      expect(readAuthScreen(name).length).toBeGreaterThan(0)
    }
  })

  it('names no provider in any auth screen', () => {
    for (const name of AUTH_SCREENS) {
      const literals = literalsOf(readAuthScreen(name))

      for (const [provider, pattern] of PROVIDER_PATTERNS) {
        const matched = literals.some((literal) => pattern.test(literal))
        expect({ screen: name, provider, matched }).toEqual({
          screen: name,
          provider,
          matched: false,
        })
      }
    }
  })

  it('carries no social button label in any auth screen', () => {
    for (const name of AUTH_SCREENS) {
      const literals = literalsOf(readAuthScreen(name))
      const offenders = literals.filter((literal) => SOCIAL_LABEL_PATTERN.test(literal))

      expect({ screen: name, offenders }).toEqual({ screen: name, offenders: [] })
    }
  })
})

describe('no copy for a social control exists in either bundle', () => {
  it('has no provider name in the English bundle', () => {
    const source = readFileSync(join(__dirname, '..', 'shared', 'i18n', 'en.ts'), 'utf8')
    const literals = literalsOf(source)

    for (const [provider, pattern] of PROVIDER_PATTERNS) {
      const offenders = literals.filter((literal) => pattern.test(literal))
      expect({ provider, offenders }).toEqual({ provider, offenders: [] })
    }
  })

  it('has no provider name in the Bangla bundle', () => {
    const source = readFileSync(join(__dirname, '..', 'shared', 'i18n', 'bn.ts'), 'utf8')
    const literals = literalsOf(source)

    for (const [provider, pattern] of PROVIDER_PATTERNS) {
      const offenders = literals.filter((literal) => pattern.test(literal))
      expect({ provider, offenders }).toEqual({ provider, offenders: [] })
    }
  })
})

describe('no provider is wired into the Supabase client', () => {
  it('the client module names no provider', () => {
    const source = readFileSync(join(__dirname, '..', 'shared', 'api', 'supabase.ts'), 'utf8')
    const literals = literalsOf(source)

    for (const [provider, pattern] of PROVIDER_PATTERNS) {
      const matched = literals.some((literal) => pattern.test(literal))
      expect({ provider, matched }).toEqual({ provider, matched: false })
    }
  })

  it('the auth service names no provider', () => {
    const source = readFileSync(join(__dirname, '..', 'shared', 'auth', 'authService.ts'), 'utf8')
    const literals = literalsOf(source)

    for (const [provider, pattern] of PROVIDER_PATTERNS) {
      const matched = literals.some((literal) => pattern.test(literal))
      expect({ provider, matched }).toEqual({ provider, matched: false })
    }
  })

  it('no auth module signs in through anything but a password', () => {
    // The **code** of every auth module is scanned for a call into the
    // Auth client, and every call must be on the allowlist. A social
    // sign-in would be a call into `signInWithOAuth` — and the waiver W-1
    // is that Auth is email-primary and password-only.
    //
    // The allowlist is **explicit**, not a deny-list: a new Auth call has
    // to be added here on purpose. A deny-list would let a new sign-in
    // method through by default.
    const ALLOWED_AUTH_CALLS = new Set([
      '.auth.signInWithPassword',
      '.auth.signUp',
      '.auth.signOut',
      '.auth.getSession',
      '.auth.refreshSession',
      '.auth.onAuthStateChange',
      '.auth.verifyOtp',
      '.auth.updateUser',
      '.auth.resetPasswordForEmail',
      // W-2 — the SMS OTP path, which is feature-flagged off for MVP
      // Phase 1. It is a phone-code sign-in, not a social provider.
      '.auth.signInWithOtp',
    ])

    const authRoot = join(__dirname, '..', 'shared', 'auth')

    const offenders: string[] = []

    for (const file of filesUnder(authRoot)) {
      const code = codeOf(readFileSync(file, 'utf8'))

      const calls = code.match(/\.auth\.[A-Za-z_]+/g) ?? []
      for (const call of calls) {
        if (!ALLOWED_AUTH_CALLS.has(call)) {
          offenders.push(`${relative(authRoot, file)}: ${call}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
