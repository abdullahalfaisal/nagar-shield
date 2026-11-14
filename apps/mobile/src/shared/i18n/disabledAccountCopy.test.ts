import { bn } from './bn'
import { en } from './en'

/**
 * The disable message audit.
 *
 * FR-AUTH-7 names the string exactly:
 *
 *   > "Remote logout by admin SHALL disable a user immediately; the user
 *   > SHALL see 'Your account has been disabled. Contact support.' on next
 *   > open."
 *
 * Two stories depend on it: `002-identity / 005-remote-account-disable`
 * (whose criterion 1 quotes the same literal) and
 * `007-moderation / 004-disable-a-user` (whose criterion 5 asserts the
 * observable end-to-end effect).
 *
 * The string is **fixed**. It must not embed the moderator's reason, the
 * disabling timestamp, or any internal identifier — a disabled user learns
 * *that* they were disabled and *where* to get help, and nothing else. The
 * reason lives in the moderator console's audit trail.
 *
 * This test walks the **actual bundles** rather than a list of strings typed
 * here, so a rewrite of the message fails the build.
 */

/** The literal FR-AUTH-7 names. */
const PRD_MESSAGE = 'Your account has been disabled. Contact support.'

describe('the disable message', () => {
  it('is the exact string FR-AUTH-7 names', () => {
    expect(en.disabled.message).toBe(PRD_MESSAGE)
  })

  it('is carried in Bangla too', () => {
    // The Bangla bundle is the **primary** one. A missing translation would
    // leave the primary language showing nothing at all.
    expect(bn.disabled.message.length).toBeGreaterThan(0)
    expect(bn.disabled.message).not.toBe('')
  })

  it('is a fixed string — it never embeds the moderator’s reason', () => {
    // The reason is a moderator's private note. Leaking it to the disabled
    // user would expose the internals of the moderation decision.
    expect(en.disabled.message).not.toMatch(/reason/i)
    expect(en.disabled.message).not.toMatch(/note/i)
  })

  it('never claims the account was deleted', () => {
    // A delete and a disable are different states with different recoveries.
    // The delete screen says so explicitly; the disable screen must not.
    expect(en.disabled.message.toLowerCase()).not.toContain('deleted')
    expect(bn.disabled.message).not.toContain('মুছে')
  })

  it('points the user at the support path', () => {
    expect(en.disabled.message.toLowerCase()).toContain('support')
    expect(bn.disabled.message).toContain('সাপোর্ট')
  })

  it('carries no identifier, timestamp, or id', () => {
    // The message is one fixed sentence. Anything that varies per account
    // would be a template, and the story forbids a template.
    expect(en.disabled.message).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(en.disabled.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
    expect(en.disabled.message).not.toMatch(/\d{2}:\d{2}/)
  })
})
