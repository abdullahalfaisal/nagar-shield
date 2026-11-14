import { ACCOUNT_RECOVERY_WINDOW_DAYS, AppError, recoveryDeadline } from '@nagar-shield/shared'

/**
 * The recovery window, as the **app** sees it.
 *
 * The database is the authority: migration 035 makes `restore_account` a
 * conditional update bounded by `recoverable_until`, so a restore after the
 * window has closed is refused by Postgres with `VALIDATION_FAILED`. This
 * module exists so the app can do two things the database cannot:
 *
 *   1. **Tell the user when the window ends.** The 30-day promise is only
 *      useful if the citizen knows the date. The fact is in the response and
 *      was simply never shown.
 *   2. **Not offer a button that will fail.** A disabled Restore button with
 *      the reason beside it is better than a live button that errors.
 *
 * ## The boundary
 *
 * The window is **exclusive**: at exactly `deleted_at + 30 days` it has
 * closed. The database's predicate is `now() >= deleted_at + interval '30
 * days'`, so a client that used `<=` would offer a restore the server
 * refuses. The story's edge-case table says the boundary is treated as
 * expired, and the two must agree.
 *
 * ## The clock
 *
 * The device's clock is **not** the authority, and this module does not
 * pretend it is. A device with a wrong date can lose a restore it still had
 * — and the server would have said yes. That is the safe direction to be
 * wrong in: the server still honours the restore, so the app is merely
 * cautious, never wrong. The reverse — a device *ahead* of the server
 * offering a restore that is refused — is why the screen still handles the
 * server's refusal as the real answer.
 */

/** How many whole days remain, floored at zero. */
export function daysRemaining(recoverableUntil: string, now: Date = new Date()): number {
  const deadline = new Date(recoverableUntil).getTime()
  if (Number.isNaN(deadline)) return 0

  const remaining = deadline - now.getTime()
  if (remaining <= 0) return 0

  return Math.floor(remaining / (24 * 60 * 60 * 1000))
}

/**
 * True when the recovery window is still open.
 *
 * A `null` deadline means the app does not know when the window ends. The
 * honest answer in that case is **"assume it is open"**: the server decides,
 * and a screen that disabled the button on missing information would take
 * away a restore the user was entitled to.
 */
export function isWindowOpen(recoverableUntil: string | null, now: Date = new Date()): boolean {
  if (!recoverableUntil) return true

  const deadline = new Date(recoverableUntil).getTime()
  if (Number.isNaN(deadline)) return true

  return now.getTime() < deadline
}

/**
 * The full recovery deadline for a deletion, as a date.
 *
 * The same 30 days the purge leg waits out — the two sides of the promise
 * have to agree, or the account becomes purge-eligible while it is still
 * recoverable.
 */
export function deadlineFor(deletedAt: string): Date {
  return recoveryDeadline(new Date(deletedAt))
}

/**
 * The outcome of a restore attempt, as the screen must report it.
 *
 * Three outcomes, and the difference between them is the whole point of this
 * module:
 *
 *   * `restored` — the account came back.
 *   * `windowClosed` — the 30 days are up. This is **not** an app failure.
 *     The citizen is told the truth: their account is permanently gone. The
 *     story's criterion names `VALIDATION_FAILED` for exactly this case.
 *   * `nothingToRestore` — the account was not deleted. The user landed on
 *     the screen by mistake. The RPC answers `CONFLICT`.
 *   * `failed` — anything else. An unknown failure is reported as an
 *     internal error, which is the honest thing to say about a failure we
 *     do not understand.
 */
export type RestoreOutcome = 'restored' | 'windowClosed' | 'nothingToRestore' | 'failed'

/**
 * Classifies a restore failure.
 *
 * The codes are read off the `AppError`, never guessed from a message: the
 * RPC's `errcode` is the fact, and the message is prose that could change.
 */
export function classifyRestoreFailure(error: unknown): RestoreOutcome {
  if (!(error instanceof AppError)) return 'failed'

  if (error.code === 'VALIDATION_FAILED') return 'windowClosed'
  if (error.code === 'CONFLICT') return 'nothingToRestore'
  return 'failed'
}

/**
 * The days a user has left, and the window length — the two numbers the
 * recovery screen states.
 *
 * Exported together so the screen cannot use one without the other: a
 * deadline with no length is not a promise the user can act on.
 */
export function recoveryWindowSummary(
  recoverableUntil: string | null,
  now: Date = new Date(),
): { daysLeft: number; windowDays: number; open: boolean } {
  return {
    daysLeft: recoverableUntil
      ? daysRemaining(recoverableUntil, now)
      : ACCOUNT_RECOVERY_WINDOW_DAYS,
    windowDays: ACCOUNT_RECOVERY_WINDOW_DAYS,
    open: isWindowOpen(recoverableUntil, now),
  }
}

/**
 * The message for a failed restore.
 *
 * The four outcomes are four different facts, and three of them are **not**
 * "the app broke". Reporting them all as `errors.internal` — which is what
 * the recovery screen used to do — tells a citizen whose 30 days have run
 * out that they should try again, when trying again will never work.
 *
 * The function takes a `t` rather than reaching for i18next, so it is a pure
 * function of (failure, window state) and can be tested against the real
 * bundles without a React tree.
 */
export function restoreErrorCopy(
  caught: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
  windowOpen: boolean,
): string {
  const outcome = classifyRestoreFailure(caught)

  if (outcome === 'windowClosed') {
    return t('disabled.recoveryWindowClosed')
  }

  if (outcome === 'nothingToRestore') {
    // The account was not deleted — the user landed here by mistake. The
    // generic conflict copy says what happened without blaming the app.
    return t('errors.conflict')
  }

  // The window was open on screen but the server says it has closed: the
  // device's clock was ahead of the server's. The server is the authority,
  // so the screen believes it.
  if (outcome === 'failed' && !windowOpen) {
    return t('disabled.recoveryWindowClosed')
  }

  return t('errors.internal')
}
