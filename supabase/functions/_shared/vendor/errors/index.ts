/**
 * GENERATED FILE — do not edit.
 *
 * Mirrored from `packages/shared/src/errors/index.ts`.
 * Run `node tools/mirror-shared-to-functions.cjs` to regenerate, and
 * `node tools/mirror-shared-to-functions.cjs --check` to verify.
 */
/**
 * Stable API error codes.
 * Source: `memory-bank/standards/api-conventions.md` § Error Response Format.
 *
 * Clients switch on `code`, never on `message`. The message is a
 * developer-facing English summary; the UI resolves a localized string from
 * the code.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'AUTH_REQUIRED',
  'AUTH_DISABLED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'FLAG_RATE_LIMIT',
  'CAPTURE_RATE_LIMIT',
  'OTP_RATE_LIMIT',
  'MEDIA_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'GEOCODE_UNAVAILABLE',
  'OFFLINE_QUEUED',
  'INTERNAL',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export const API_ERROR_CODE_SET: ReadonlySet<string> = new Set(API_ERROR_CODES)

/** HTTP status for each error code. */
export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  AUTH_DISABLED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FLAG_RATE_LIMIT: 429,
  CAPTURE_RATE_LIMIT: 429,
  OTP_RATE_LIMIT: 429,
  MEDIA_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  GEOCODE_UNAVAILABLE: 200,
  OFFLINE_QUEUED: 202,
  INTERNAL: 500,
}

/** Default developer-facing message per code. Never shown raw to a user. */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'The request failed validation.',
  AUTH_REQUIRED: 'A valid session is required.',
  AUTH_DISABLED: 'This account has been disabled.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The action conflicts with the current state.',
  FLAG_RATE_LIMIT: 'Too many flags. Try again later.',
  CAPTURE_RATE_LIMIT: 'Too many reports submitted today. Try again tomorrow.',
  OTP_RATE_LIMIT: 'Too many code attempts. Try again later.',
  MEDIA_TOO_LARGE: 'The file exceeds the allowed size or duration.',
  UNSUPPORTED_MEDIA: 'That file type is not supported.',
  GEOCODE_UNAVAILABLE: 'The area could not be resolved; the report was saved anyway.',
  OFFLINE_QUEUED: 'The report was queued and will be sent when the network returns.',
  INTERNAL: 'Something went wrong.',
}

/** i18n key for each error code — the client resolves this to a BN/EN string. */
export const API_ERROR_I18N_KEYS: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'errors.validationFailed',
  AUTH_REQUIRED: 'errors.authRequired',
  AUTH_DISABLED: 'errors.authDisabled',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.notFound',
  CONFLICT: 'errors.conflict',
  FLAG_RATE_LIMIT: 'errors.flagRateLimit',
  CAPTURE_RATE_LIMIT: 'errors.captureRateLimit',
  OTP_RATE_LIMIT: 'errors.otpRateLimit',
  MEDIA_TOO_LARGE: 'errors.mediaTooLarge',
  UNSUPPORTED_MEDIA: 'errors.unsupportedMedia',
  GEOCODE_UNAVAILABLE: 'errors.geocodeUnavailable',
  OFFLINE_QUEUED: 'errors.offlineQueued',
  INTERNAL: 'errors.internal',
}

export interface ApiErrorBody {
  code: ApiErrorCode
  message: string
  details?: Record<string, unknown>
}

/**
 * The i18n key for an error code — the exported resolver story
 * `002-shared-contracts` names in its Technical Notes.
 *
 * It is a thin alias for `API_ERROR_I18N_KEYS[code]`, and it is what the
 * mobile app's `errorCopy()` calls: the story says the mapping lives in the
 * shared package so the client and the server agree, and a **resolver** is
 * easier to call correctly than a map lookup — a caller that reaches for
 * the map directly has to remember to handle a code it does not know.
 *
 * The Technical Notes say the key is in the `errors.<CODE>` namespace; the
 * shipped keys are **camelCase** (`errors.authRequired`), because that is
 * what the i18n bundles actually carry. The bundle is the contract — a
 * key that does not exist renders as the key itself, which is how a user
 * ended up seeing the literal word "undefined".
 */
export function resolveErrorMessage(code: ApiErrorCode): string {
  return API_ERROR_I18N_KEYS[code] ?? 'errors.internal'
}

export interface ApiErrorResponse {
  error: ApiErrorBody
}

export interface ApiSuccessResponse<T> {
  data: T
}

/** A typed error carrying a stable code across the API boundary. */
export class AppError extends Error {
  readonly code: ApiErrorCode
  readonly details?: Record<string, unknown>
  readonly httpStatus: number

  constructor(code: ApiErrorCode, details?: Record<string, unknown>, message?: string) {
    super(message ?? API_ERROR_MESSAGES[code])
    this.name = 'AppError'
    this.code = code
    this.details = details
    this.httpStatus = API_ERROR_HTTP_STATUS[code]
  }

  toBody(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    }
  }
}

/** Narrow an unknown thrown value to an AppError. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/**
 * Normalise any thrown value into an AppError. Raw Postgres / network errors
 * are never surfaced to a user — they collapse to a stable code.
 */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value
  return new AppError('INTERNAL')
}
