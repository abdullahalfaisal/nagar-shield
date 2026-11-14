/**
 * GENERATED FILE — do not edit.
 *
 * Mirrored from `packages/shared/src/enums/moderation.ts`.
 * Run `node tools/mirror-shared-to-functions.cjs` to regenerate, and
 * `node tools/mirror-shared-to-functions.cjs --check` to verify.
 */
/**
 * Report moderation state machine.
 * Source: PRD FR-ALERTS-7..9 + ARCHITECTURE §G "Moderation status".
 *
 *   visible → hidden_pending_review → restored (visible) | removed
 *
 * `restored` is a distinct persisted state from `visible` so the audit trail
 * keeps the fact that a report was reviewed and returned.
 */
export const MODERATION_STATUSES = [
  'visible',
  'hidden_pending_review',
  'restored',
  'removed',
] as const

export type ModerationStatus = (typeof MODERATION_STATUSES)[number]

export const MODERATION_STATUS_SET: ReadonlySet<string> = new Set(MODERATION_STATUSES)

/** Statuses that appear in a public feed read model. */
export const PUBLICLY_VISIBLE_STATUSES: readonly ModerationStatus[] = ['visible', 'restored']

export function isPubliclyVisible(status: ModerationStatus): boolean {
  return PUBLICLY_VISIBLE_STATUSES.includes(status)
}

/**
 * Moderator decisions.
 * `restore` and `remove` act on a report; `disable_user` acts on an account.
 */
export const MODERATION_DECISIONS = ['restore', 'remove', 'disable_user'] as const

export type ModerationDecision = (typeof MODERATION_DECISIONS)[number]

export const MODERATION_DECISION_SET: ReadonlySet<string> = new Set(MODERATION_DECISIONS)

/**
 * Why a report was hidden. Distinguishes the per-report 3-flag threshold
 * (FR-ALERTS-7) from the author-level 5-flag auto-hide (FR-ALERTS-11).
 */
export const HIDE_REASONS = ['flag_threshold', 'author_auto_hide', 'both', 'manual'] as const

export type HideReason = (typeof HIDE_REASONS)[number]

export const HIDE_REASON_SET: ReadonlySet<string> = new Set(HIDE_REASONS)
