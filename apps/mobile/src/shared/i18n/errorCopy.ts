import type { TFunction } from 'i18next'
import { resolveErrorMessage, type ApiErrorCode } from '@nagar-shield/shared'

/**
 * The localized message for an API error code.
 *
 * The screens used to build the i18n key by hand:
 *
 * ```ts
 * t(`errors.${appError.code.toLowerCase()}`)
 * ```
 *
 * which produced `errors.authrequired` — while the bundle's key is
 * `errors.authRequired`. The key did not exist, so i18next rendered the
 * **key itself**, and the user saw the literal word *"undefined"* where the
 * error message should have been.
 *
 * The mapping already existed and was already correct:
 * `API_ERROR_I18N_KEYS` in `@nagar-shield/shared` maps every code to its
 * bundle key. This function is the one place that consults it, so the ten
 * call sites cannot each re-derive it wrongly.
 *
 * The **fallback matters**. A code the shared package does not know — a
 * server that grew a new one before the app shipped it — must still produce a
 * readable message rather than a raw key. The generic `errors.internal` is the
 * fallback, and the developer-facing message from `AppError` is never shown.
 */
export function errorCopy(t: TFunction, code: ApiErrorCode): string {
  return t(resolveErrorMessage(code))
}

/**
 * The same message, for a code that may not be one the shared package knows.
 *
 * The screens hold an `AppError` whose `code` is typed as `ApiErrorCode`, so
 * they use `errorCopy`. This variant is for a code that arrived as a plain
 * string — a response body from an Edge Function, or a server that is ahead
 * of the app.
 */
export function errorCopyForCode(t: TFunction, code: string): string {
  const known = resolveErrorMessage(code as ApiErrorCode)
  return t(known ?? 'errors.internal')
}
