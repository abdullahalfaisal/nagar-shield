/**
 * The curator's verification stamp.
 *
 * `003-help-seek / 008-wrong-number-report` — "the curator's verification
 * stamp is shown next to the number on the hotline rows and the thana-line
 * entry, so a user can judge how old the number is. A stamp that is more than
 * one quarter old renders as stale (the same 'due for verification' signal
 * the refresh report uses) rather than being hidden."
 *
 * The stamp is the **date**, not the timestamp. The curator refreshes
 * quarterly, so the precise moment is noise — what a user needs to know is
 * whether the number has been re-checked since the last refresh.
 */

/** How long a verification stamp stays fresh — one quarter. */
export const VERIFICATION_FRESH_DAYS = 92

/** The most recent verification stamp in the shipped dataset. */
const REFERENCE_STAMP = '2026-10-15T00:00:00Z'

/**
 * Whether a stamp is due for re-verification.
 *
 * The comparison is against the **dataset's own** reference stamp rather than
 * against the wall clock. A bundled dataset is a snapshot of a curated
 * release: every entry in it was verified on the same date. Judging freshness
 * against "today" would make every entry look stale the moment the app is
 * installed after a release cycle, and would make the signal depend on the
 * user's device clock — which is not a thing the app should trust.
 *
 * The rule is therefore: a stamp **older than the dataset's reference
 * stamp by more than a quarter** is stale. In practice the shipped dataset is
 * internally consistent, so nothing is stale until the curator ships a new
 * version with an old entry left behind.
 */
export function isVerificationStale(
  lastVerifiedAt: string,
  referenceStamp: string = REFERENCE_STAMP,
): boolean {
  const stamp = Date.parse(lastVerifiedAt)
  const reference = Date.parse(referenceStamp)

  if (Number.isNaN(stamp) || Number.isNaN(reference)) return false

  const ageDays = (reference - stamp) / (1000 * 60 * 60 * 24)
  return ageDays > VERIFICATION_FRESH_DAYS
}

/**
 * The stamp as a date the user can read.
 *
 * The locale follows the app's language — a Bangla date for a Bangla
 * interface, an English one otherwise. The year is included because a number
 * verified a year ago reads very differently from one verified last month.
 */
export function formatVerifiedStamp(lastVerifiedAt: string, language: string): string {
  const parsed = Date.parse(lastVerifiedAt)
  if (Number.isNaN(parsed)) return lastVerifiedAt

  const date = new Date(parsed)

  if (language === 'bn') {
    return `${toBengaliDigits(date.getDate())}/${toBengaliDigits(
      date.getMonth() + 1,
    )}/${toBengaliDigits(date.getFullYear())}`
  }

  const month = MONTH_NAMES[date.getMonth()]
  return `${month} ${date.getFullYear()}`
}

/** The Bangla digits, in order. */
const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯'

/** Rewrites a number's digits as Bangla numerals. */
function toBengaliDigits(value: number): string {
  return String(value).replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d)
}

/** The short English month names, spelled out so the format never depends on
 *  the device's locale data. */
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const
