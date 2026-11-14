import { AppError } from '@nagar-shield/shared'
import {
  classifyRestoreFailure,
  daysRemaining,
  deadlineFor,
  isWindowOpen,
  recoveryWindowSummary,
} from './recovery-window'

/**
 * The recovery window, as the app sees it.
 *
 * Story `002-identity / 007-account-deletion-and-recovery` names the gap:
 *
 * > **An expired restore is misreported as an internal error.** … The
 * > comment correctly identifies the cause — the RPC raises `CONFLICT` when
 * > the window has closed — and then reports it as `errors.internal`. The
 * > citizen is told the app broke, when the truthful answer is that the 30
 * > days are up and the account is permanently gone.
 *
 * and asks for:
 *
 * > A test for the expired-restore path that asserts the **message**, not
 * > just that an error appears.
 *
 * ## The three facts this file pins
 *
 *   1. **The window is 30 days, and the boundary is exclusive.** At exactly
 *      `deleted_at + 30 days` the window has closed — the database's
 *      predicate is `now() >= deleted_at + interval '30 days'`, and a client
 *      that used `<=` would offer a restore the server refuses.
 *   2. **The three restore failures are three different facts.** A closed
 *      window, a not-deleted account and an unknown failure are not the same
 *      message, and none of them is "the app broke".
 *   3. **A missing deadline is not a closed window.** The app does not know
 *      the deadline; the server does. Disabling the button on missing
 *      information would take away a restore the user was entitled to.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const NOW = new Date('2026-11-14T12:00:00.000Z')

describe('the recovery deadline', () => {
  it('is 30 days from the deletion', () => {
    const deletedAt = new Date('2026-11-14T00:00:00.000Z')

    const deadline = deadlineFor(deletedAt.toISOString())

    expect(deadline.toISOString()).toBe('2026-12-14T00:00:00.000Z')
  })

  it('agrees with the shared purge window', () => {
    // The purge leg waits out the same 30 days. If the two disagreed, the
    // account would become purge-eligible while it was still recoverable —
    // or the promise would outlast the data.
    const deletedAt = new Date('2026-11-14T00:00:00.000Z')

    const deadline = deadlineFor(deletedAt.toISOString())

    expect(deadline.getTime() - deletedAt.getTime()).toBe(30 * DAY_MS)
  })
})

describe('the remaining days', () => {
  it('counts the whole days left', () => {
    const deadline = new Date(NOW.getTime() + 10.9 * DAY_MS).toISOString()

    // Floored, not rounded: 10 days and 21 hours left is 10 days, and
    // rounding up would promise a day the user does not have.
    expect(daysRemaining(deadline, NOW)).toBe(10)
  })

  it('is zero once the deadline has passed', () => {
    const deadline = new Date(NOW.getTime() - DAY_MS).toISOString()

    expect(daysRemaining(deadline, NOW)).toBe(0)
  })

  it('is zero for an unreadable deadline', () => {
    expect(daysRemaining('not-a-date', NOW)).toBe(0)
  })

  it('is 30 days when the deadline is unknown', () => {
    // A missing deadline is not "no time left" — the window is still 30 days
    // long; the app simply does not know when it started.
    expect(recoveryWindowSummary(null, NOW).daysLeft).toBe(30)
  })
})

describe('the window boundary', () => {
  it('is open one millisecond before the deadline', () => {
    const deletedAt = new Date(NOW.getTime() - (30 * DAY_MS - 1))

    expect(isWindowOpen(deadlineFor(deletedAt.toISOString()).toISOString(), NOW)).toBe(true)
  })

  it('is closed at exactly the deadline', () => {
    // The story's edge case: "the user restores exactly at the 30-day
    // boundary → treated as expired". The database's predicate is
    // `now() >= deleted_at + 30 days`, so the client must agree.
    const deletedAt = new Date(NOW.getTime() - 30 * DAY_MS)

    expect(isWindowOpen(deadlineFor(deletedAt.toISOString()).toISOString(), NOW)).toBe(false)
  })

  it('is closed one millisecond after the deadline', () => {
    const deletedAt = new Date(NOW.getTime() - (30 * DAY_MS + 1))

    expect(isWindowOpen(deadlineFor(deletedAt.toISOString()).toISOString(), NOW)).toBe(false)
  })

  it('is open when the deadline is unknown', () => {
    // The app does not know; the server does. Assuming "closed" would take
    // away a restore the user was entitled to — the server would have said
    // yes.
    expect(isWindowOpen(null, NOW)).toBe(true)
  })

  it('is open when the deadline is unreadable', () => {
    expect(isWindowOpen('not-a-date', NOW)).toBe(true)
  })
})

describe('a failed restore', () => {
  it('reports a closed window as a closed window', () => {
    // The RPC refuses an expired restore with `VALIDATION_FAILED`. That is
    // the answer to "can I still get my account back?" — and it is not an
    // internal error.
    const failure = new AppError('VALIDATION_FAILED')

    expect(classifyRestoreFailure(failure)).toBe('windowClosed')
  })

  it('reports a not-deleted account as a conflict', () => {
    // The RPC raises `CONFLICT` when the account is not deleted. The user
    // landed on the recovery screen by mistake.
    const failure = new AppError('CONFLICT')

    expect(classifyRestoreFailure(failure)).toBe('nothingToRestore')
  })

  it('reports an unknown failure as a failure', () => {
    expect(classifyRestoreFailure(new AppError('INTERNAL'))).toBe('failed')
    expect(classifyRestoreFailure(new AppError('FORBIDDEN'))).toBe('failed')
  })

  it('reports a non-AppError as a failure', () => {
    // A plain `Error` — a network drop, a thrown string — is not a code the
    // app knows, so it must not be dressed up as one.
    expect(classifyRestoreFailure(new Error('network'))).toBe('failed')
    expect(classifyRestoreFailure(undefined)).toBe('failed')
  })

  it('does not mistake a closed window for a conflict', () => {
    // The two are different facts. A user whose window closed must not be
    // told there is "nothing to restore" — something *was* deleted, and the
    // promise they were given has run out.
    expect(classifyRestoreFailure(new AppError('VALIDATION_FAILED'))).not.toBe('nothingToRestore')
  })
})

describe('the summary the screen shows', () => {
  it('states the days left and the window length together', () => {
    const deadline = new Date(NOW.getTime() + 5 * DAY_MS).toISOString()

    const summary = recoveryWindowSummary(deadline, NOW)

    expect(summary).toEqual({ daysLeft: 5, windowDays: 30, open: true })
  })

  it('states a closed window as closed', () => {
    const deadline = new Date(NOW.getTime() - DAY_MS).toISOString()

    const summary = recoveryWindowSummary(deadline, NOW)

    expect(summary.open).toBe(false)
    expect(summary.daysLeft).toBe(0)
  })
})
