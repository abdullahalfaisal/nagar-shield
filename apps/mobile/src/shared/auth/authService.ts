import { AppError, signupSchema } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'
import {
  clearSessionPersistencePolicy,
  setSessionPersistencePolicy,
  windowForRememberMe,
} from '@/shared/api/session-storage'
import { clearQueue, ownQueueCount } from '@/shared/services/uploadQueue'

/**
 * Authentication operations.
 *
 * Waiver W-1: **email-primary** Supabase Auth. The phone number is a required
 * unique attribute on `profiles`, not an Auth identity. Signup creates the
 * Auth user with the email + password and writes the phone into `profiles`.
 *
 * Waiver W-2: SMS OTP is **feature-flagged off**. `sendPhoneOtp` is never
 * called from the UI while the flag is off; the code is retained so the flag
 * can be turned on without a refactor.
 */

/**
 * The detail that marks an `AUTH_REQUIRED` as "the credentials were wrong"
 * rather than "the session ended". The code stays `AUTH_REQUIRED` because the
 * upload-queue drain treats that code as retryable; only the login screen
 * reads the detail, to say the credentials are wrong instead of "Please sign
 * in again", which tells someone who just typed a password nothing useful.
 */
export const INVALID_CREDENTIALS = { reason: 'invalid_credentials' } as const

export function isInvalidCredentials(error: AppError): boolean {
  return error.code === 'AUTH_REQUIRED' && error.details?.reason === INVALID_CREDENTIALS.reason
}

export interface SignupParams {
  email: string
  password: string
  phone: string
  fullName?: string
}

export interface LoginParams {
  identifier: string
  password: string
  rememberMe: boolean
}

/**
 * Resolves a phone-or-email identifier to the email that Auth knows about.
 *
 * The phone path calls the `resolve_login_identifier` RPC rather than
 * selecting from `profiles` directly. The direct select cannot work: at
 * sign-in the caller has no session yet, so the request carries the **anon**
 * key, and `profiles` is RLS-scoped to the owner (`id = auth.uid()`). An
 * anonymous caller sees zero rows, so a phone sign-in would always fail with
 * "account not found".
 *
 * The RPC exists for exactly this case. It is `SECURITY DEFINER`, granted to
 * `anon`, and it returns the email for an exact match or raises
 * `AUTH_REQUIRED` — the same message a wrong password produces, so the
 * endpoint cannot be used to enumerate registered phone numbers.
 *
 * The email path is resolved locally: it needs no lookup, and an email is
 * not a secret.
 */
async function resolveEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim()

  if (trimmed.includes('@')) {
    return trimmed.toLowerCase()
  }

  const { data, error } = await supabase.rpc('resolve_login_identifier', {
    p_identifier: trimmed,
  })

  if (error) {
    // The RPC raises `AUTH_REQUIRED` for an unknown identifier. Surface it as
    // the same generic failure a wrong password produces.
    if (error.code === '42501' || error.code === 'P0002') {
      throw new AppError('AUTH_REQUIRED', INVALID_CREDENTIALS)
    }
    throw fromSupabaseError(error)
  }

  const email = (data as { email?: string } | null)?.email
  if (!email) {
    throw new AppError('AUTH_REQUIRED', INVALID_CREDENTIALS)
  }

  return email
}

export async function signUp({ email, password, phone, fullName }: SignupParams): Promise<string> {
  // The shared schema is the single definition of the signup contract, and it
  // **normalises** the phone to E.164 on the way through. The server stores
  // the E.164 form and the login resolver compares against it, so sending the
  // raw input would leave the two sides disagreeing about the same number.
  const parsed = signupSchema.safeParse({
    email,
    password,
    phone,
    fullName: fullName ?? undefined,
  })

  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED')
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { phone: parsed.data.phone, full_name: parsed.data.fullName ?? null },
      emailRedirectTo: 'nagarshield://auth/callback',
    },
  })

  if (error) {
    // A **duplicate phone** is a field validation failure, not a state
    // conflict, and the story says so: "the request fails with the error code
    // `VALIDATION_FAILED`".
    //
    // The server signals it as a `23505` unique violation on
    // `profiles_phone_key` — the `UNIQUE` constraint inside the signup
    // trigger's transaction. The generic mapping would turn that into
    // `CONFLICT`, which tells the user nothing about which field is wrong.
    //
    // The constraint name is the signal, so the mapping is precise rather
    // than a guess on the message text.
    //
    // Postgres puts the constraint name in the **message**
    // (`duplicate key value violates unique constraint
    // "profiles_phone_key"`), not in `detail` — `detail` carries the values.
    // The Supabase client surfaces both, so the message is checked first and
    // the detail second.
    const message = error.message ?? ''
    const details = (error as { details?: string }).details ?? ''

    if (/profiles_phone_key/i.test(message) || /profiles_phone_key/i.test(details)) {
      throw new AppError('VALIDATION_FAILED', { field: 'phone' })
    }

    if (/already registered|already exists/i.test(error.message)) {
      // The field lets the register screen say "this email is already
      // registered" instead of the generic conflict text.
      throw new AppError('CONFLICT', { field: 'email' })
    }
    throw fromSupabaseError(error)
  }

  // The profile row is created by a trigger on `auth.users`; nothing to do
  // client-side here.
  //
  // The new user's id is returned so the caller can write the columns the
  // trigger does not carry — the alternate phone, above all. The trigger
  // writes `id, email, phone, full_name` and nothing else, so there is no
  // other way to set `alternate_phone` at signup time.
  //
  // With email confirmation ON the user must verify before a session exists,
  // and this id is the only handle on the new account until they do. It is
  // still the right id to return: the account exists either way.
  if (!data.user) {
    throw new AppError('INTERNAL')
  }

  return data.user.id
}

export async function logIn({ identifier, password, rememberMe }: LoginParams): Promise<void> {
  const email = await resolveEmail(identifier)

  // FR-AUTH-2 — the "Remember me" choice is recorded **before** the sign-in.
  //
  // `supabase-js` writes the session to the store as part of
  // `signInWithPassword` (`_saveSession`), so a policy set afterwards would
  // be too late for the first write — and the first write is the one that
  // decides the session's window. Setting it here means the very first
  // `_saveSession` already honours the user's choice.
  setSessionPersistencePolicy({
    remembered: rememberMe,
    windowMs: windowForRememberMe(rememberMe),
    persistedAt: Date.now(),
  })

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // The sign-in failed, so there is no session to govern. Leaving a policy
    // behind would expire the *next* session against a window nobody chose.
    clearSessionPersistencePolicy()
    if (/invalid login credentials/i.test(error.message)) {
      throw new AppError('AUTH_REQUIRED', INVALID_CREDENTIALS)
    }
    throw fromSupabaseError(error)
  }

  if (rememberMe) {
    // FR-AUTH-2 — extend the session window to 30 days.
    // Supabase rotates the refresh token on demand; `refreshSession` with the
    // stored refresh token keeps the session alive for the full window.
    //
    // **The failure here must not cost the user their sign-in.**
    //
    // `supabase-js`'s `refreshSession` reads the session from **storage**,
    // and a session it cannot find is treated as invalid: `auth-js` calls
    // `_removeSession()`, which emits `SIGNED_OUT` and clears the session the
    // sign-in had just created. The user is bounced straight back to the
    // welcome screen after a *successful* sign-in, with no error shown.
    //
    // So the session is checked **before** the refresh, and the refresh is
    // only attempted when there is one to refresh. A device whose store
    // could not hold the session keeps the session it has — in memory, for
    // this launch — which is the story's own edge case:
    //
    // > | SecureStore is unavailable on the device | Session persistence
    // > degrades to memory-only, the app still runs for the current session
    //
    // The 30-day window cannot be honoured without a stored refresh token,
    // so the session simply uses its default lifetime instead. That is the
    // correct outcome: the alternative is signing the user out.
    const { data: sessionData } = await supabase.auth.getSession()

    if (sessionData.session) {
      const { error: extendError } = await supabase.auth.refreshSession()
      if (extendError) {
        // Not fatal — the user is signed in; the session simply uses the
        // default lifetime.
      }
    }
  }
}

/**
 * Signs the user out.
 *
 * The user's unsent reports are **kept**. A queued report records who made it
 * and only that user's session sends it (see `uploadQueue.ts`), so another
 * account that signs in on this phone cannot send it or see it, and it is still
 * waiting when its author signs in again. Discarding it here used to lose
 * evidence that had never been sent, on one tap, with the warning shown after
 * the loss. `keptUploads` is returned so the caller can tell the user where
 * their reports are.
 *
 * `discardUploads` is for deleting the account: there is no one left to send
 * them for, and their files should not stay on the phone.
 *
 * A sign-out that fails because the phone is offline is still a sign-out. The
 * session is removed from the phone before the server is asked to revoke it,
 * and the revoke is what fails; reporting that as an error left the user on
 * the signed-in screens with no session behind them.
 */
export async function logOut(
  options: { discardUploads?: boolean } = {},
): Promise<{ keptUploads: number; discardedUploads: number }> {
  const { data: before } = await supabase.auth.getSession()
  const userId = before.session?.user.id ?? null

  const { error } = await supabase.auth.signOut()
  if (error) {
    const { data: after } = await supabase.auth.getSession()
    if (after.session) throw fromSupabaseError(error)
  }

  // The next session must not inherit this one's window.
  clearSessionPersistencePolicy()

  if (!userId) return { keptUploads: 0, discardedUploads: 0 }

  if (options.discardUploads) {
    return { keptUploads: 0, discardedUploads: await clearQueue(userId) }
  }

  return { keptUploads: await ownQueueCount(userId), discardedUploads: 0 }
}

/**
 * The password reset lives in `passwordResetService.ts`, not here.
 *
 * `supabase.auth.resetPasswordForEmail` sends GoTrue's recovery **link**, and
 * the flow it opens redeems a token rather than checking a code — there is
 * nowhere in it to enter an OTP, and nowhere for the 10-minute validity, the
 * three-attempt limit or the 30-minute cooldown to live. The app's own
 * `password-reset` Edge Function owns the challenge instead, and
 * `sendPasswordResetOtp` / `verifyPasswordResetOtp` are its client half.
 */

/**
 * Loads the profile row for the signed-in user.
 * A missing profile means the signup trigger did not run — treated as a
 * validation failure rather than an internal error so the user can retry.
 */
export async function loadProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (error) throw fromSupabaseError(error)
  if (!data) throw new AppError('NOT_FOUND')
  return data
}

/**
 * FR-AUTH-2 — the biometric gate. This resolves the stored session without a
 * password prompt. The actual fingerprint check is done by
 * `expo-local-authentication` in the UI layer before this is called.
 */
export async function refreshSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession()
  if (error) throw fromSupabaseError(error)
}

/**
 * W-2 — SMS OTP. **Feature-flagged off for MVP Phase 1.**
 * Kept wired so the flag can be enabled without touching the identity model.
 */
export const SMS_OTP_ENABLED = false

export async function sendPhoneOtp(phone: string): Promise<void> {
  if (!SMS_OTP_ENABLED) {
    throw new AppError('FORBIDDEN', { feature: 'sms_otp', flag: 'SMS_OTP_ENABLED' })
  }
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) throw fromSupabaseError(error)
}
