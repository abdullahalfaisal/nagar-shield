/**
 * The sign-up wizard's hand-off between its first three screens.
 *
 * The phone, email and **password** used to travel as route params. Params end
 * up in navigation state, deep-link URLs and logs, and the password-reset flow
 * already refuses to do that (`stagePasswordReset`). This is the same answer:
 * hold the values in memory, read them on the next screen, and clear them once
 * the account exists.
 *
 * Memory only — an app reload mid-wizard loses the draft, and the screens fall
 * back to empty fields rather than failing.
 */
export interface SignupDraft {
  phone: string
  email: string
  password: string
  alternatePhone: string
}

const EMPTY: SignupDraft = { phone: '', email: '', password: '', alternatePhone: '' }

let draft: SignupDraft = { ...EMPTY }

export function stageSignupDraft(patch: Partial<SignupDraft>): void {
  draft = { ...draft, ...patch }
}

export function readSignupDraft(): SignupDraft {
  return draft
}

export function clearSignupDraft(): void {
  draft = { ...EMPTY }
}
