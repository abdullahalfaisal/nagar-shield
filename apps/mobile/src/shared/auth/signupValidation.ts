import { emailSchema, passwordSchema, phoneSchema } from '@nagar-shield/shared'

/** The i18n key of the message to show under a field that failed, per field. */
export type SignupFieldErrors = Partial<Record<'phone' | 'email' | 'password', string>>

/**
 * Checks the sign-up fields when the user presses the button.
 *
 * The button stays enabled and the check runs on press, so a person who taps
 * it always learns *which* field is wrong — a greyed-out button says nothing.
 * The shared schemas are the same ones the server-side contract uses, so the
 * screen cannot accept what the sign-up call would reject (a bare `@` used to
 * pass the old `includes('@')` test).
 */
export function validateSignupFields(fields: {
  phone?: string
  email?: string
  password?: string
}): SignupFieldErrors {
  const errors: SignupFieldErrors = {}
  if (fields.phone !== undefined && !phoneSchema.safeParse(fields.phone).success) {
    errors.phone = 'errors.phoneInvalid'
  }
  if (fields.email !== undefined && !emailSchema.safeParse(fields.email).success) {
    errors.email = 'errors.emailInvalid'
  }
  if (fields.password !== undefined && !passwordSchema.safeParse(fields.password).success) {
    errors.password = 'auth.passwordTooShort'
  }
  return errors
}
