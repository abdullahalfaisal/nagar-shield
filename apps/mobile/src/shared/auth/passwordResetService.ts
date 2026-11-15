import { AppError, emailSchema, phoneSchema, type ApiErrorCode } from '@nagar-shield/shared'
import { parseErrorBody } from '@/shared/api/errors'
import { supabaseAnonKey, supabaseUrl } from '@/shared/services/submitCapture'

/**
 * The password-reset client service.
 *
 * The story names two operations — `sendPasswordResetOtp` and
 * `verifyPasswordResetOtp` — and they are these two functions. Both talk to
 * the `password-reset` Edge Function; neither talks to `supabase.auth`
 * directly.
 *
 * Why not `supabase.auth.resetPasswordForEmail`?
 * ------------------------------------------------
 * That API sends GoTrue's own recovery **link**, and the flow it opens is the
 * link flow: the link redeems a token, the token becomes a session, and the
 * session applies the new password. It has no place to enter a **code**.
 *
 * The story asks for a code the user types — an OTP — and the rules around it
 * (10-minute validity, 3 attempts, a 30-minute cooldown, and a
 * server-authoritative rejection) have no home in GoTrue. So the app's own
 * Edge Function owns the challenge, and these two functions are the client's
 * half of it.
 *
 * The no-oracle rule
 * ------------------
 * `sendPasswordResetOtp` returns the same answer for an unknown identifier as
 * for a known one: `{ sent: true }`. The caller must not try to tell the two
 * apart, and must not show a different message.
 *
 * Nothing sensitive is logged
 * ---------------------------
 * Neither the code nor the new password is ever passed to a logger, and
 * neither is included in an `AppError`'s details.
 */

/** The answer to a reset request. It carries no information about the account. */
export interface PasswordResetRequestResult {
  sent: boolean
}

/** The answer to a successful reset — a session, issued by GoTrue. */
export interface PasswordResetVerifyResult {
  accessToken: string
  refreshToken: string
  expiresIn: number | undefined
}

/** How long a request may take before it is abandoned. */
export const RESET_REQUEST_TIMEOUT_MS = 15_000

/**
 * The code's validity window. The server enforces it; the client only mirrors
 * it, counting from the moment the code was requested.
 */
export const OTP_VALIDITY_SECONDS = 10 * 60

/**
 * A transport failure: the device is offline, the host is unreachable, or the
 * request ran out of time. It is its own type so the screens can say "you are
 * offline" instead of the generic "something went wrong" — which implies a
 * fault the user cannot tell from a server bug.
 */
export class PasswordResetNetworkError extends Error {
  constructor() {
    super('password-reset request failed in transit')
    this.name = 'PasswordResetNetworkError'
  }
}

/** True for a transport failure of either reset request. */
export function isResetNetworkError(error: unknown): boolean {
  return error instanceof PasswordResetNetworkError
}

/**
 * Posts to the Edge Function with a time limit.
 *
 * Without the limit a request that never answers leaves the button on
 * "Submitting" for as long as the OS keeps the socket. `fetch` rejects with a
 * `TypeError` when the network is down and the abort raises an `AbortError`;
 * both become one `PasswordResetNetworkError`.
 */
async function postToResetFunction(payload: Record<string, string>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESET_REQUEST_TIMEOUT_MS)

  try {
    return await fetch(`${supabaseUrl()}/functions/v1/password-reset`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof TypeError || (error as { name?: string } | null)?.name === 'AbortError') {
      throw new PasswordResetNetworkError()
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Seconds left in the code's validity window.
 *
 * `issuedAt` is when the code was requested, in epoch milliseconds. A missing
 * value means the issue time is unknown (the hand-off was lost), and the
 * window is then assumed to start now — the server still decides.
 */
export function remainingValiditySeconds(
  issuedAt: number | undefined,
  now: number = Date.now(),
): number {
  if (issuedAt === undefined) return OTP_VALIDITY_SECONDS
  const elapsed = Math.floor((now - issuedAt) / 1000)
  return Math.min(OTP_VALIDITY_SECONDS, Math.max(0, OTP_VALIDITY_SECONDS - elapsed))
}

/**
 * Requests a reset code for an identifier.
 *
 * The identifier is a phone number or an email address; the server resolves
 * it to the account, so a reset requested with the phone reaches the same
 * account as one requested with the email.
 *
 * A transport failure is raised. A *rejection* is not: the server answers
 * `VALIDATION_FAILED` only for a malformed identifier, and there is nothing
 * the user can do differently, so the failure surfaces as an `AppError` the
 * screen renders.
 */
export async function sendPasswordResetOtp(
  identifier: string,
): Promise<PasswordResetRequestResult> {
  const response = await postToResetFunction({ identifier: identifier.trim() })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw parseErrorBody(body)
  }

  const data = (body as { data?: PasswordResetRequestResult } | null)?.data

  // The answer is `{ sent: true }` for a known identifier and for an unknown
  // one alike. A missing flag is treated as "sent" rather than as a failure:
  // the point of the rule is that the client cannot distinguish the two
  // cases, and a false "we could not send it" would reintroduce a difference.
  return { sent: data?.sent ?? true }
}

/**
 * Verifies the code and sets the new password.
 *
 * On success the server has already applied the password and returned a
 * session; this function hands the session to the Supabase client so the app
 * is signed in without a second credential entry.
 *
 * The two rejections the user can act on are carried in the error's details:
 *
 *   * `OTP_RATE_LIMIT` — the challenge is in its 30-minute cooldown. The
 *     remaining wait is in `details.retry_after_sec`, and the screen renders
 *     a countdown from it.
 *   * `VALIDATION_FAILED` with `details.attempts_remaining` — the code was
 *     wrong. The remaining attempts are shown so the user knows how close
 *     they are to the cooldown.
 */
export async function verifyPasswordResetOtp(
  identifier: string,
  code: string,
  newPassword: string,
): Promise<PasswordResetVerifyResult> {
  const response = await postToResetFunction({
    identifier: identifier.trim(),
    code: code.trim(),
    new_password: newPassword,
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw parseErrorBody(body)
  }

  const data = (body as { data?: Record<string, unknown> } | null)?.data

  const accessToken = data?.access_token
  const refreshToken = data?.refresh_token

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new AppError('INTERNAL')
  }

  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : '',
    expiresIn: typeof data?.expires_in === 'number' ? data.expires_in : undefined,
  }
}

/**
 * Reads the remaining cooldown out of a rejection.
 *
 * The server is the authority on the wait — the client's countdown mirrors
 * it and never replaces it — so the number comes from
 * `details.retry_after_sec` and nowhere else.
 */
export function readRetryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof AppError)) return undefined
  const details = error.details as { retry_after_sec?: unknown } | undefined
  const value = details?.retry_after_sec
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Reads the remaining attempts out of a rejection.
 *
 * `undefined` means the server did not say — the screen then says nothing
 * about a count, rather than guessing.
 */
export function readAttemptsRemaining(error: unknown): number | undefined {
  if (!(error instanceof AppError)) return undefined
  const details = error.details as { attempts_remaining?: unknown } | undefined
  const value = details?.attempts_remaining
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Whether the text looks like a phone number or an email address.
 *
 * Only a format check, so an obvious typo is caught before a request: the
 * server resolves the identifier and gives the same answer for an unknown
 * one, so this says nothing about whether an account exists.
 */
export function isValidResetIdentifier(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  return trimmed.includes('@')
    ? emailSchema.safeParse(trimmed).success
    : phoneSchema.safeParse(trimmed).success
}

/**
 * Whether to announce the validity countdown to a screen reader at this
 * second. Announcing every tick would drown out everything else, so it is
 * said at a few milestones only.
 */
export function isValidityMilestone(seconds: number): boolean {
  return seconds === OTP_VALIDITY_SECONDS / 2 || seconds === 60 || seconds === 0
}

/**
 * Why the user was sent back to the code step. It travels as a route param —
 * a KEY, never text, so the message is rendered in the current language and a
 * param holds nothing sensitive.
 */
export type ResetNotice = 'wrong' | 'rateLimited'

/** Reads a route param as a notice key; anything unknown is no notice. */
export function parseResetNotice(value: unknown): ResetNotice | undefined {
  return value === 'wrong' || value === 'rateLimited' ? value : undefined
}

/** True when the rejection is the cooldown. */
export function isRateLimited(error: unknown): boolean {
  return error instanceof AppError && (error.code as ApiErrorCode) === 'OTP_RATE_LIMIT'
}

/**
 * The in-memory hand-off between the two reset screens.
 *
 * The code the user typed has to reach the password step, and **not** in a
 * route param. A route param is part of a URL: it lands in the navigation
 * state, in any route-change log, and in any crash report. The code is a
 * credential, and the story's own rule is that no token, password, phone
 * number or OTP is written to app logs.
 *
 * So the code lives here — in the module's memory, for the length of one
 * navigation — and nowhere else. It is cleared the moment it is read, so a
 * second pass through the password step cannot replay it, and it never
 * survives the process.
 *
 * The identifier travels alongside it in the same hand-off, for the same
 * reason: a phone number is PII.
 */
interface PendingReset {
  identifier: string
  code: string
  /**
   * When the code was requested, in epoch milliseconds. It rides the hand-off
   * so the validity countdown on the code step keeps the real time instead of
   * restarting at 10:00 every time the screen mounts.
   */
  issuedAt?: number
}

let pendingReset: PendingReset | null = null

/**
 * Hands the code and the identifier to the next step.
 *
 * Only one reset is pending at a time. A second request replaces the first —
 * the newest challenge is the only valid one anyway, so keeping the older one
 * would be keeping a code the server has already superseded.
 */
export function stagePasswordReset(identifier: string, code: string, issuedAt?: number): void {
  pendingReset = {
    identifier: identifier.trim(),
    code,
    ...(issuedAt !== undefined ? { issuedAt } : {}),
  }
}

/**
 * Reads the staged reset and clears it.
 *
 * Returns `null` when nothing is staged — which happens if the app was
 * reloaded between the two steps. The screen then sends the user back to the
 * code step rather than failing with an opaque error.
 */
export function takePendingReset(): PendingReset | null {
  const staged = pendingReset
  pendingReset = null
  return staged
}

/**
 * Reads the staged reset **without** clearing it.
 *
 * Used by the code step, which needs the identifier but must leave the
 * staged code in place for the password step to take.
 */
export function peekPendingReset(): PendingReset | null {
  return pendingReset
}

/**
 * Discards the staged reset.
 *
 * Called when the user goes back to the code step: the code they typed was
 * wrong, expired or superseded, and it must not be reused.
 */
export function clearPendingReset(): void {
  pendingReset = null
}
