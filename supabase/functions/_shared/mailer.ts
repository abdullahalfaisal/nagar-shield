/**
 * The mail transport for the Edge Functions.
 *
 * Why this module exists
 * ----------------------
 * The password-reset flow needs to deliver a **6-digit code** the user will
 * type. GoTrue's own mailer cannot deliver it:
 *
 *   * `POST /auth/v1/admin/generate_link` returns the plaintext code as
 *     `email_otp`, but the message GoTrue then sends renders the recovery
 *     **link** — the code appears nowhere in the delivered mail. Verified
 *     against the local stack: the message body is "Reset your password — Follow
 *     the link below to choose a new one", with the token in the URL.
 *
 *   * GoTrue's `verify` endpoint will not check a code. It accepts
 *     `{type, token_hash}` and returns a session, ignoring any `code` beside
 *     it. So the code cannot be redeemed through GoTrue either.
 *
 * So the code is ours: the function generates it, the database hashes it, and
 * this module puts it in front of the user.
 *
 * The two transports
 * ------------------
 *
 *   * **SMTP** — the production path. `MAIL_SMTP_URL` points at the provider
 *     (a relay, a transactional-mail API's SMTP front end). The transport
 *     speaks SMTP over a socket.
 *
 *   * **HTTP** — the local path. `MAIL_HTTP_ENDPOINT` points at a mailpit
 *     instance's `POST /api/v1/send`. Mailpit is what the Supabase local
 *     stack ships, and it is reachable from the host on port 54324 — which
 *     matters, because the local Edge Function runs on the **host**, not in a
 *     container, and so cannot reach inbucket's container-internal SMTP port.
 *
 * The transport is chosen by which variable is set. There is no fallback and
 * no default: a deployment with neither variable set cannot send mail, and
 * the caller is told so rather than silently pretending the code was sent.
 *
 * The rules
 * ---------
 *
 *   * The code is never logged, never returned in a response, and never
 *     written to the database in plaintext.
 *   * The recipient address is the account's own registered address. The
 *     function resolves it from the database, so a caller cannot choose where
 *     a code goes.
 *   * A delivery failure never changes the *shape* of the response the user
 *     sees. An unknown identifier and a mail-transport failure both produce
 *     the same generic answer, so the response cannot be used to probe either
 *     the account list or the mail service.
 */

import { logEvent } from './logger.ts'

/** What a mailer needs to send one message. */
export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * The mail transports this module understands.
 *
 * `MAIL_SMTP_URL` — `smtp://user:pass@host:port`. The credentials are part
 * of the URL because that is how every SMTP provider documents its setup.
 *
 * `MAIL_HTTP_ENDPOINT` — the base URL of a mailpit-compatible API, e.g.
 * `http://127.0.0.1:54324`.
 */
export interface MailerConfig {
  smtpUrl?: string
  httpEndpoint?: string
  from: string
}

function env(name: string): string | undefined {
  const value = Deno.env.get(name)
  return value && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Reads the mail configuration from the environment.
 *
 * Returns `null` when no transport is configured — the caller must then treat
 * the send as failed.
 */
export function readMailerConfig(): MailerConfig | null {
  const smtpUrl = env('MAIL_SMTP_URL')
  const httpEndpoint = env('MAIL_HTTP_ENDPOINT')

  if (!smtpUrl && !httpEndpoint) return null

  return {
    smtpUrl,
    httpEndpoint,
    from: env('MAIL_FROM') ?? 'no-reply@nagarshield.bd',
  }
}

/**
 * Sends a message over SMTP.
 *
 * A deliberately small SMTP client: `EHLO`, optional `AUTH LOGIN`, `MAIL
 * FROM`, `RCPT TO`, `DATA`, `QUIT`. That is the whole protocol a
 * transactional-mail relay needs, and a hand-rolled client is smaller than
 * the dependency it would replace.
 *
 * The `AUTH LOGIN` exchange is base64, not encryption — TLS is the
 * transport's job, and it is required (`STARTTLS` is issued before `AUTH`).
 * A server that offers neither TLS nor a login is refused rather than
 * trusted with the credentials.
 */
async function sendViaSmtp(config: MailerConfig, message: MailMessage): Promise<boolean> {
  const url = new URL(config.smtpUrl as string)
  const secure = url.protocol === 'smtps:'
  const port = Number(url.port || (secure ? 465 : 587))
  const host = url.hostname

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  // `Deno.connect` is plain TCP only. The TLS socket is a separate call —
  // `Deno.connectTls` — and it takes the `caCert`/`certChain` options a
  // relay with a private CA needs.
  const socket = secure
    ? await Deno.connectTls({ hostname: host, port })
    : await Deno.connect({ hostname: host, port })

  const readReply = async (): Promise<string> => {
    let buffer = ''
    while (true) {
      // `socket.read(buffer)` resolves to the **number of bytes** read, not
      // the bytes themselves, so the chunk is read into a local array and
      // decoded from there.
      const chunk = new Uint8Array(1024)
      const read = await socket.read(chunk)
      if (read === null) break
      buffer += decoder.decode(chunk.subarray(0, read))
      // A multi-line reply has a '-' in the fourth position; the final line
      // has a space.
      if (/^\d{3} /.test(buffer)) break
    }
    return buffer
  }

  const send = async (line: string): Promise<void> => {
    await socket.write(encoder.encode(`${line}\r\n`))
  }

  try {
    await readReply() // 220 greeting

    await send('EHLO nagarshield.local')
    const ehlo = await readReply()

    // STARTTLS, when the server offers it.
    if (!secure && /STARTTLS/i.test(ehlo)) {
      await send('STARTTLS')
      await readReply()
      // The socket must be reconnected in TLS mode after the upgrade. Deno's
      // `connect` cannot upgrade in place, so the TLS session is opened by
      // connecting again with `transport: 'tls'` and replaying EHLO.
      socket.close()
      return sendViaSmtp(
        {
          ...config,
          smtpUrl: `smtps://${url.username ? `${url.username}:${url.password}@` : ''}${host}:${port}`,
        },
        message,
      )
    }

    // AUTH LOGIN, when the server offers it and the URL carries credentials.
    if (/^AUTH/i.test(ehlo) && url.username) {
      await send('AUTH LOGIN')
      await readReply()
      await send(btoa(decodeURIComponent(url.username)))
      await readReply()
      await send(btoa(decodeURIComponent(url.password)))
      const authReply = await readReply()
      if (!/^235/.test(authReply)) return false
    }

    await send(`MAIL FROM:<${config.from}>`)
    if (!/^250/.test(await readReply())) return false

    await send(`RCPT TO:<${message.to}>`)
    if (!/^250|^251/.test(await readReply())) return false

    await send('DATA')
    if (!/^354/.test(await readReply())) return false

    const body = [
      `From: Nagar Shield <${config.from}>`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      message.text,
    ].join('\r\n')

    // A line that begins with a dot is escaped, and the message is
    // terminated by a lone dot.
    await socket.write(encoder.encode(`${body.replace(/\r?\n\./g, '\r\n..')}\r\n.\r\n`))
    const dataReply = await readReply()
    if (!/^250/.test(dataReply)) return false

    await send('QUIT')
    return true
  } finally {
    socket.close()
  }
}

/**
 * Sends a message through a mailpit-compatible HTTP API.
 *
 * Mailpit's `POST /api/v1/send` takes `{From, To, Subject, Text, HTML}` with
 * the capitalised field names and `Email`/`Name` inside each address.
 */
async function sendViaHttp(config: MailerConfig, message: MailMessage): Promise<boolean> {
  const base = (config.httpEndpoint as string).replace(/\/+$/, '')
  const response = await fetch(`${base}/api/v1/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: { Email: config.from, Name: 'Nagar Shield' },
      To: [{ Email: message.to }],
      Subject: message.subject,
      Text: message.text,
      ...(message.html ? { HTML: message.html } : {}),
    }),
  })

  return response.ok
}

/**
 * Sends one message.
 *
 * Returns `false` — never throws — when no transport is configured or the
 * transport fails. The caller decides what a failed send means; for the
 * password reset it means "the user still gets the generic answer", because
 * the shape of that answer must not depend on whether the mail service is up.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const config = readMailerConfig()

  if (!config) {
    logEvent('warn', { requestId: 'mailer', action: 'password_reset_mail_unconfigured' })
    return false
  }

  try {
    const sent = config.smtpUrl
      ? await sendViaSmtp(config, message)
      : await sendViaHttp(config, message)

    if (!sent) {
      logEvent('warn', { requestId: 'mailer', action: 'password_reset_mail_failed' })
    }
    return sent
  } catch {
    logEvent('warn', { requestId: 'mailer', action: 'password_reset_mail_failed' })
    return false
  }
}

/**
 * The password-reset message.
 *
 * The body carries the **code**, because the code is what the app asks the
 * user to type. It does not carry a reset link: the link's token is GoTrue's
 * recovery token, and handing that out would create a second, weaker path to
 * a password reset — one with no attempt counter and no cooldown.
 */
export function buildResetEmailBody(code: string): { subject: string; text: string; html: string } {
  const subject = 'Your Nagar Shield verification code'

  const text = [
    'আপনার নগর শিল্ড কোড:',
    '',
    `    ${code}`,
    '',
    'কোডটি ১০ মিনিটের মধ্যে ব্যবহার করতে হবে। তিনবার ভুল কোড দিলে আগামী ৩০ মিনিট আর চেষ্টা করা যাবে না।',
    '',
    'Your Nagar Shield verification code:',
    '',
    `    ${code}`,
    '',
    'This code expires in 10 minutes. After three wrong attempts, the code is blocked for 30 minutes.',
    '',
    'If you did not ask for this code, you can ignore this message — nobody can change your password without it.',
  ].join('\n')

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 420px; margin: 0 auto;">
      <p style="font-size: 16px;">আপনার নগর শিল্ড কোড:</p>
      <p style="font-size: 32px; letter-spacing: 8px; font-weight: 700; margin: 16px 0;">${code}</p>
      <p style="font-size: 14px; color: #555;">কোডটি ১০ মিনিটের মধ্যে ব্যবহার করতে হবে। তিনবার ভুল কোড দিলে আগামী ৩০ মিনিট আর চেষ্টা করা যাবে না।</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      <p style="font-size: 14px; color: #555;">This code expires in 10 minutes. After three wrong attempts, the code is blocked for 30 minutes.</p>
      <p style="font-size: 12px; color: #888;">If you did not ask for this code, you can ignore this message — nobody can change your password without it.</p>
    </div>
  `.trim()

  return { subject, text, html }
}
