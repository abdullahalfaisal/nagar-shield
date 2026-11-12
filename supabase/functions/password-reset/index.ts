/**
 * The password-reset flow.
 *
 * `POST /functions/v1/password-reset` — two modes, distinguished by the body.
 *
 *   * `{ "identifier": "…" }` — **request**. Generates a 6-digit code,
 *     records the challenge, and mails the code.
 *   * `{ "identifier": "…", "code": "123456", "new_password": "…" }` —
 *     **verify**. Checks the code, sets the new password, and signs the user
 *     in.
 *
 * Who owns what
 * -------------
 *   * **The database owns the code.** `password_reset_challenges` holds its
 *     bcrypt hash, compares the submitted code against it, keeps the attempt
 *     counter, and refuses an expired one. The comparison is server-side and
 *     a modified client cannot bypass it.
 *
 *   * **GoTrue owns the session.** Once the code is proven correct, the
 *     GoTrue recovery token is redeemed and GoTrue issues the session. The
 *     new password is then applied to *that* session, so GoTrue's own
 *     bookkeeping is never bypassed and nothing is forged.
 *
 * The client is never the authority on either.
 *
 * Why the database owns the code, and not GoTrue
 * ------------------------------------------------
 * The first version of this function handed GoTrue's `email_otp` straight back
 * to GoTrue's `verify` endpoint, believing GoTrue would compare them. **It
 * does not.** Proved live against the local stack:
 *
 *   POST /auth/v1/verify {"type":"recovery","token_hash":"41206be8…","code":"000000"}
 *   → 200 {"access_token":"eyJ…","refresh_token":"…"}
 *
 * A deliberately wrong code returned a **full session**. GoTrue's `verify`
 * accepts a `token_hash` and a `type` and nothing else — with a `token_hash`
 * present, the code is never compared — and it rejects any other shape with
 * "Only the token_hash and type should be provided". There is no way to make
 * GoTrue check a 6-digit code against a recovery token.
 *
 * So the code is generated here, hashed here, and compared here. The GoTrue
 * token is redeemed **only after** the comparison succeeds — which means a
 * wrong code never burns the recovery token, and the token cannot be redeemed
 * without the code.
 *
 * The mail
 * --------
 * The code is delivered by the app's own mail transport (`_shared/mailer.ts`),
 * not by GoTrue. GoTrue's recovery template renders a **link**, not a bare
 * code — the code appears nowhere in the message GoTrue sends — so a GoTrue
 * mail could not carry the code the app asks the user to type.
 *
 * The no-oracle rule
 * ------------------
 * An unknown identifier gets exactly the same answer as a known one:
 * `{ "data": { "sent": true } }`. The question of whether an account exists
 * is asked inside the database, and the answer the user can observe does not
 * vary. The same is true of a mail-transport failure: the shape of the
 * response must not depend on whether the mail service is up, or the response
 * becomes a probe for both the account list and the mail service.
 */

import {
  passwordResetRequestBodySchema,
  passwordResetVerifyBodySchema,
} from '../_shared/contracts.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { logEvent } from '../_shared/logger.ts';
import { buildResetEmailBody, sendMail } from '../_shared/mailer.ts';
import { newRequestId } from '../_shared/job-runner.ts';
import { createServiceClient, projectUrl, requireEnv } from '../_shared/supabase.ts';

/** The GoTrue admin API — the service-role key is what authorises it. */
function adminUrl(path: string): string {
  return `${projectUrl()}/auth/v1${path}`;
}

function adminHeaders(): Record<string, string> {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

interface GenerateLinkResponse {
  hashed_token?: string;
}

interface VerifyResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
}

/**
 * The six-digit code.
 *
 * A **string**, not a number, and always six characters wide — `000123` is a
 * valid code, and `parseInt` would turn it into `123`, a different code.
 *
 * The digits come from `crypto.getRandomValues`, not `Math.random`. The
 * generator is not a cryptographic one, and the code is a credential.
 */
function generateCode(): string {
  const digits = new Uint8Array(6);
  crypto.getRandomValues(digits);

  let code = '';
  for (const digit of digits) {
    // 10 % 10 is the identity; the modulo bias for 256 % 10 is negligible
    // for a one-time code, and rejecting the top of the range would make
    // the loop non-terminating in the worst case.
    code += String(digit % 10);
  }
  return code;
}

/**
 * Asks GoTrue for a recovery token.
 *
 * The Admin API returns the token in the same response as the `email_otp`.
 * Only the token is kept: the code is ours, and GoTrue's `email_otp` is
 * neither delivered in its mail nor redeemable through `verify`.
 */
async function generateRecoveryToken(email: string): Promise<string | null> {
  const response = await fetch(adminUrl('/admin/generate_link'), {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      type: 'recovery',
      email,
      options: { redirect_to: 'nagarshield://auth/reset' },
    }),
  });

  if (!response.ok) {
    logEvent('warn', { requestId: 'generate_link', action: 'password_reset_generate_link' });
    return null;
  }

  const body = (await response.json().catch(() => ({}))) as GenerateLinkResponse;
  return body.hashed_token ?? null;
}

/**
 * Redeems the GoTrue recovery token and returns the session.
 *
 * Called **only after** the code has been proven correct. GoTrue's `verify`
 * accepts `{type, token_hash}` and nothing else — sending a `code` beside it
 * is refused with "Only the token_hash and type should be provided", which is
 * also the reason the code cannot be checked here.
 */
async function redeemTokenWithGoTrue(tokenHash: string): Promise<VerifyResponse | null> {
  const response = await fetch(adminUrl('/verify'), {
    method: 'POST',
    headers: {
      apikey: requireEnv('SUPABASE_ANON_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'recovery',
      token_hash: tokenHash,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as VerifyResponse;
  return response.ok ? body : null;
}

/**
 * Applies the new password to the session GoTrue just issued.
 *
 * The session proves the code was correct, so the password can be changed
 * against it without a second credential entry.
 */
async function applyNewPassword(
  accessToken: string,
  newPassword: string,
): Promise<boolean> {
  const response = await fetch(adminUrl('/user'), {
    method: 'PUT',
    headers: {
      apikey: requireEnv('SUPABASE_ANON_KEY'),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });

  return response.ok;
}

Deno.serve(async (request) => {
  const requestId = newRequestId();

  if (request.method !== 'POST') {
    return errorResponse('VALIDATION_FAILED', 'Only POST is accepted.');
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return errorResponse('VALIDATION_FAILED', 'A JSON body is required.');
  }

  const service = createServiceClient();

  // ---------------------------------------------------------------------------
  // Mode 1 — request a code
  // ---------------------------------------------------------------------------

  if (!('code' in body)) {
    const parsed = passwordResetRequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_FAILED', 'An identifier is required.');
    }

    const identifier = parsed.data.identifier;

    // The identifier is resolved to the account's email. The resolution
    // happens in the database, where it can see every profile — an
    // anonymous client cannot, because `profiles` is RLS-scoped to the
    // owner.
    const { data: resolved, error: resolveError } = await service.rpc(
      'resolve_login_identifier',
      { p_identifier: identifier },
    );

    if (resolveError || !resolved?.email) {
      // No account. The answer is deliberately identical to the one a
      // registered address gets — no existence signal.
      logEvent('info', { requestId, action: 'password_reset_request', itemsProcessed: 0 });
      return successResponse({ sent: true });
    }

    const accountEmail = resolved.email as string;

    // The code is ours: generated here, hashed by the database, delivered by
    // the mail transport. It exists in plaintext only in this function's
    // memory, and only until the mail is sent.
    const code = generateCode();

    // GoTrue issues the recovery token. The token alone cannot reset the
    // password — it is redeemed only after the code is proven correct.
    const tokenHash = await generateRecoveryToken(accountEmail);
    if (!tokenHash) {
      // The token could not be issued. The user gets the same generic
      // answer — an account-existence signal must not depend on the
      // downstream services working.
      logEvent('warn', { requestId, action: 'password_reset_generate_link_failed' });
      return successResponse({ sent: true });
    }

    // The challenge is recorded: the code's hash, the GoTrue token, the
    // attempt counter, the 10-minute window and the cooldown all live here.
    //
    // The hash is computed by the database itself, so the two can never
    // disagree about the salt or the cost factor. If the hashing fails, the
    // request fails **open-looking** to the same generic answer — the user
    // gets no code, and no signal about whether the account exists.
    let codeHash: string;
    try {
      codeHash = await hashCode(code);
    } catch {
      logEvent('error', { requestId, action: 'password_reset_hash_failed' });
      return successResponse({ sent: true });
    }

    const { error: startError } = await service.rpc('start_password_reset_otp', {
      p_identifier: identifier,
      p_account_email: accountEmail,
      p_code_hash: codeHash,
      p_token_hash: tokenHash,
    });

    if (startError) {
      logEvent('error', { requestId, action: 'password_reset_start_failed' });
      return successResponse({ sent: true });
    }

    // The mail. A delivery failure does not change the response's shape —
    // see the note at the top of this file.
    const mail = buildResetEmailBody(code);
    await sendMail({
      to: accountEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    logEvent('info', { requestId, action: 'password_reset_request', itemsProcessed: 1 });
    return successResponse({ sent: true });
  }

  // ---------------------------------------------------------------------------
  // Mode 2 — verify the code and set the new password
  // ---------------------------------------------------------------------------

  const parsed = passwordResetVerifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', 'The code or the password is not valid.');
  }

  const { identifier, code, new_password: newPassword } = parsed.data;

  // (1) May this attempt proceed, and is the code correct?
  //
  //     The RPC checks the cooldown, the validity window, and compares the
  //     submitted code against the challenge's bcrypt hash. It returns the
  //     GoTrue token **only** on a correct code.
  const { data: state, error: stateError } = await service.rpc(
    'check_password_reset_otp_state',
    { p_identifier: identifier, p_code: code, p_attempt_ok: true },
  );

  if (stateError || !state) {
    return errorResponse('VALIDATION_FAILED', 'The code is not valid.');
  }

  if (state.ok === false) {
    if (state.code === 'OTP_RATE_LIMIT') {
      return errorResponse('OTP_RATE_LIMIT', 'Too many attempts.', {
        retry_after_sec: state.retry_after_sec ?? 0,
      });
    }

    // (2) The code was wrong. The attempt is accounted for, and the cooldown
    //     is opened if this was the third failure.
    const { data: after } = await service.rpc('check_password_reset_otp_state', {
      p_identifier: identifier,
      p_code: code,
      p_attempt_ok: false,
    });

    if (after?.code === 'OTP_RATE_LIMIT') {
      return errorResponse('OTP_RATE_LIMIT', 'Too many attempts.', {
        retry_after_sec: after.retry_after_sec ?? 0,
      });
    }

    logEvent('info', { requestId, action: 'password_reset_wrong_code' });
    return errorResponse('VALIDATION_FAILED', 'The code is not valid.', {
      attempts_remaining: after?.attempts_remaining ?? 0,
    });
  }

  // (3) The code was right. The GoTrue token is redeemed now — and only now.
  const verified = await redeemTokenWithGoTrue(state.token_hash as string);

  if (!verified?.access_token) {
    // The token could not be redeemed. The code was correct, but the
    // recovery token had already been spent — a stale challenge. It is
    // accounted for like a wrong code.
    await service.rpc('check_password_reset_otp_state', {
      p_identifier: identifier,
      p_code: code,
      p_attempt_ok: false,
    });

    logEvent('warn', { requestId, action: 'password_reset_redeem_failed' });
    return errorResponse('VALIDATION_FAILED', 'The code is not valid.');
  }

  // (4) The new password is applied to the session GoTrue issued.
  const applied = await applyNewPassword(verified.access_token, newPassword);
  if (!applied) {
    logEvent('error', { requestId, action: 'password_reset_apply_failed' });
    return errorResponse('INTERNAL', 'The password could not be set.');
  }

  // (5) The challenge is consumed, so the code cannot be used twice.
  await service.rpc('consume_password_reset_otp', { p_identifier: identifier });

  logEvent('info', { requestId, action: 'password_reset_verified', itemsProcessed: 1 });

  return successResponse({
    ok: true,
    access_token: verified.access_token,
    refresh_token: verified.refresh_token,
    expires_in: verified.expires_in,
  });
});

/**
 * Hashes the code with the database's bcrypt helper.
 *
 * The hash is computed by the same database that will compare it, so the two
 * can never disagree about the salt or the cost factor. The plaintext code
 * goes to the database and comes straight back as a hash — it is never
 * stored.
 */
async function hashCode(code: string): Promise<string> {
  const service = createServiceClient();
  const { data, error } = await service.rpc('password_reset_code_hash', {
    p_code: code,
  });

  if (error || typeof data !== 'string' || data === '') {
    throw new Error('The code could not be hashed.');
  }

  return data;
}
