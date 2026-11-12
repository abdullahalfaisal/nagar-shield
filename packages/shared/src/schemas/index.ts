import { z } from 'zod';
import { REPORT_CATEGORIES, FLAG_REASONS } from '../enums';

/**
 * Bangladesh phone numbers in E.164 form: `+880` followed by a 10-digit
 * national number (8XXXXXXXXX). Spaces, dashes and a leading `0` are stripped
 * before validation.
 */
export const E164_PHONE_REGEX = /^\+880\d{10}$/;

export function normalisePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+880')) return `+880${digits.slice(4)}`;
  if (digits.startsWith('880') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+880${digits.slice(1)}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export const phoneSchema = z
  .string()
  .transform(normalisePhone)
  .refine((value) => E164_PHONE_REGEX.test(value), {
    message: 'Phone must be a valid Bangladesh number in E.164 format (+880XXXXXXXXX)',
  });

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

/**
 * The alternate phone — a second way to reach the user.
 *
 * The same E.164 rule as the primary phone, and the same normaliser, so the
 * two are always comparable. That comparability is the point: the wizard
 * must be able to answer "is this the same number as the primary one?",
 * and it can only answer that if both are in one canonical form. A raw
 * string comparison would let `01711-111111` and `+8801711111111` — the same
 * number, written two ways — pass as different.
 *
 * Unlike the primary phone it is **not unique**: two accounts may store the
 * same alternate number. A shared family number is a legitimate thing for
 * two people to list.
 */
export const alternatePhoneSchema = phoneSchema;

/**
 * Password policy. Deliberately length-first — NIST SP 800-63B guidance
 * rather than composition rules the user will fight.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

/** FR-CAPTURE-6 — the description cap. */
export const CAPTURE_DESCRIPTION_MAX_LENGTH = 140;

export const captureDescriptionSchema = z
  .string()
  .max(CAPTURE_DESCRIPTION_MAX_LENGTH, `Description must be ${CAPTURE_DESCRIPTION_MAX_LENGTH} characters or fewer`)
  .transform((value) => value.trim());

export const reportCategorySchema = z.enum(REPORT_CATEGORIES);
export const flagReasonSchema = z.enum(FLAG_REASONS);

/** FR-AUTH-1 — signup collects email + password + phone. */
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema,
  fullName: z.string().trim().min(1).max(120).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * FR-AUTH-1 — login accepts phone OR email + password. The identifier is
 * resolved to the email-primary Auth user before the password is checked.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your phone number or email'),
  password: z.string().min(1, 'Enter your password'),
  rememberMe: z.boolean().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** FR-AUTH-3 — password reset requests an OTP for a known identifier. */
export const passwordResetRequestSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your phone number or email'),
});

export const passwordResetVerifySchema = z.object({
  token: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: passwordSchema,
});

/** FR-AUTH-3 — 10-minute OTP validity, 3 attempts, then a 30-minute cooldown. */
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_COOLDOWN_MINUTES = 30;

/** Biometric failure rules — FR-AUTH-5. */
export const BIOMETRIC_FAILS_TO_PASSWORD = 3;
export const BIOMETRIC_FAILS_TO_DISABLE = 5;
export const BIOMETRIC_FAIL_WINDOW_HOURS = 24;

/** FR-AUTH-2 — Remember me persists the session for 30 days. */
export const REMEMBER_ME_DAYS = 30;

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  phone: phoneSchema,
  isPrimary: z.boolean().default(false),
  groupName: z.enum(['family', 'friend', 'colleague', 'other']).default('other'),
  sortOrder: z.number().int().min(0).default(0),
});

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

/** FR-CAPTURE-1..5 — the Capture submission payload. */
export const captureSubmissionSchema = z.object({
  clientRequestId: z.string().uuid(),
  storagePath: z.string().min(1),
  mediaType: z.enum(['photo', 'video', 'file']),
  byteSize: z.number().int().min(0),
  durationSeconds: z.number().min(0).nullable().default(null),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  capturedAt: z.string().datetime(),
  description: captureDescriptionSchema.nullable().default(null),
  publicVisibility: z.enum(['anonymous', 'identified']).default('anonymous'),
  category: reportCategorySchema.nullable().default(null),
});

export type CaptureSubmission = z.infer<typeof captureSubmissionSchema>;

/** FR-ALERTS-4 — area filters for the feed. */
export const areaFilterSchema = z.object({
  division: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  thana: z.string().trim().min(1).optional(),
  neighborhood: z.string().trim().min(1).optional(),
});

export type AreaFilter = z.infer<typeof areaFilterSchema>;

/** FR-HIST-1 — History defaults: 1 km radius, 24-hour window. */
export const HISTORY_DEFAULT_RADIUS_KM = 1;
export const HISTORY_DEFAULT_WINDOW_HOURS = 24;
export const HISTORY_MAX_RADIUS_KM = 50;
export const HISTORY_MAX_WINDOW_HOURS = 720;

export const historyQuerySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(HISTORY_MAX_RADIUS_KM).default(HISTORY_DEFAULT_RADIUS_KM),
  windowHours: z
    .number()
    .min(1)
    .max(HISTORY_MAX_WINDOW_HOURS)
    .default(HISTORY_DEFAULT_WINDOW_HOURS),
  category: reportCategorySchema.nullable().default(null),
  cursor: z.string().nullable().default(null),
  limit: z.number().int().min(1).max(100).default(20),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** FR-ALERTS-1..4 — the feed query. */
export const alertsQuerySchema = z.object({
  ...areaFilterSchema.shape,
  cursor: z.string().nullable().default(null),
  limit: z.number().int().min(1).max(100).default(20),
});

export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

/** FR-ALERTS-6 — flagging an alert. */
export const flagReportSchema = z.object({
  reportId: z.string().uuid(),
  reason: flagReasonSchema,
});

/** FR-SEEK-6 — a user reporting a wrong number. */
export const wrongNumberReportSchema = z.object({
  entryType: z.enum(['station', 'hotline']),
  entryId: z.string().uuid(),
  reason: z.string().trim().min(1, 'Tell us what is wrong').max(500),
});

/** FR-LOC-1 — sharing a snapshot with one contact or all primaries. */
export const locationShareSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1, 'Choose at least one contact'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().min(0).nullable().default(null),
  sharedAt: z.string().datetime(),
});

export type LocationShareInput = z.infer<typeof locationShareSchema>;

/** FR-MOD-3 — a decision always carries a note. */
export const moderationDecisionSchema = z.object({
  reportId: z.string().uuid(),
  decision: z.enum(['restore', 'remove']),
  note: z
    .string()
    .trim()
    .min(1, 'A note is required for every decision')
    .max(2000, 'Note must be 2000 characters or fewer'),
});

export type ModerationDecisionInput = z.infer<typeof moderationDecisionSchema>;

export const disableUserSchema = z.object({
  userId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .min(1, 'A note is required')
    .max(2000, 'Note must be 2000 characters or fewer'),
});

/** Business-rule constants shared by the client and the server. */
export const FLAG_HIDE_THRESHOLD = 3;
export const FLAG_RATE_LIMIT_PER_HOUR = 10;
export const AUTHOR_FLAG_AUTO_HIDE_THRESHOLD = 5;
export const AUTHOR_FLAG_AUTO_HIDE_WINDOW_HOURS = 24;
export const SEEK_THANA_FALLBACK_RADIUS_KM = 10;
export const SEEK_THANA_FALLBACK_NUMBER = '999';
export const MEDIA_MAX_VIDEO_SECONDS = 30;
export const MEDIA_MAX_DIMENSION = 1080;
export const MEDIA_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CAPTURE_MAX_PER_DAY = 50;
export const ALERTS_REFRESH_INTERVAL_MS = 60_000;
export const ALERTS_BATTERY_PAUSE_THRESHOLD = 20;
