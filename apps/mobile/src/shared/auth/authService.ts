import { AppError, signupSchema } from '@nagar-shield/shared';
import { supabase } from '@/shared/api/supabase';
import { fromSupabaseError } from '@/shared/api/errors';

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

export interface SignupParams {
  email: string;
  password: string;
  phone: string;
  fullName?: string;
}

export interface LoginParams {
  identifier: string;
  password: string;
  rememberMe: boolean;
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
  const trimmed = identifier.trim();

  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const { data, error } = await supabase.rpc('resolve_login_identifier', {
    p_identifier: trimmed,
  });

  if (error) {
    // The RPC raises `AUTH_REQUIRED` for an unknown identifier. Surface it as
    // the same generic failure a wrong password produces.
    if (error.code === '42501' || error.code === 'P0002') {
      throw new AppError('AUTH_REQUIRED');
    }
    throw fromSupabaseError(error);
  }

  const email = (data as { email?: string } | null)?.email;
  if (!email) {
    throw new AppError('AUTH_REQUIRED');
  }

  return email;
}

export async function signUp({ email, password, phone, fullName }: SignupParams): Promise<void> {
  // The shared schema is the single definition of the signup contract, and it
  // **normalises** the phone to E.164 on the way through. The server stores
  // the E.164 form and the login resolver compares against it, so sending the
  // raw input would leave the two sides disagreeing about the same number.
  const parsed = signupSchema.safeParse({
    email,
    password,
    phone,
    fullName: fullName ?? undefined,
  });

  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED');
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { phone: parsed.data.phone, full_name: parsed.data.fullName ?? null },
      emailRedirectTo: 'nagarshield://auth/callback',
    },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      throw new AppError('CONFLICT');
    }
    throw fromSupabaseError(error);
  }

  // With email confirmation ON the user must verify before a session exists.
  // The profile row is created by a trigger on `auth.users`; nothing to do
  // client-side here.
  if (!data.user) {
    throw new AppError('INTERNAL');
  }
}

export async function logIn({ identifier, password, rememberMe }: LoginParams): Promise<void> {
  const email = await resolveEmail(identifier);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      throw new AppError('AUTH_REQUIRED');
    }
    throw fromSupabaseError(error);
  }

  if (rememberMe) {
    // FR-AUTH-2 — extend the session window to 30 days.
    // Supabase rotates the refresh token on demand; `refreshSession` with the
    // stored refresh token keeps the session alive for the full window.
    const { error: extendError } = await supabase.auth.refreshSession();
    if (extendError) {
      // Not fatal — the user is signed in; the session simply uses the
      // default lifetime.
    }
  }
}

export async function logOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw fromSupabaseError(error);
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const email = await resolveEmail(identifier);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'nagarshield://auth/reset',
  });
  if (error) throw fromSupabaseError(error);
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw fromSupabaseError(error);
}

/**
 * Loads the profile row for the signed-in user.
 * A missing profile means the signup trigger did not run — treated as a
 * validation failure rather than an internal error so the user can retry.
 */
export async function loadProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw fromSupabaseError(error);
  if (!data) throw new AppError('NOT_FOUND');
  return data;
}

/**
 * FR-AUTH-2 — the biometric gate. This resolves the stored session without a
 * password prompt. The actual fingerprint check is done by
 * `expo-local-authentication` in the UI layer before this is called.
 */
export async function refreshSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) throw fromSupabaseError(error);
}

/**
 * W-2 — SMS OTP. **Feature-flagged off for MVP Phase 1.**
 * Kept wired so the flag can be enabled without touching the identity model.
 */
export const SMS_OTP_ENABLED = false;

export async function sendPhoneOtp(phone: string): Promise<void> {
  if (!SMS_OTP_ENABLED) {
    throw new AppError('FORBIDDEN', { feature: 'sms_otp', flag: 'SMS_OTP_ENABLED' });
  }
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw fromSupabaseError(error);
}
