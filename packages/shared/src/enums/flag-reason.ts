/**
 * Fixed 5-value flag reason.
 * Source: PRD FR-ALERTS-6 + ARCHITECTURE §G "Flag reason enum".
 */
export const FLAG_REASONS = [
  'misinformation',
  'harassment',
  'duplicate',
  'off_topic',
  'other',
] as const

export type FlagReason = (typeof FLAG_REASONS)[number]

export const FLAG_REASON_SET: ReadonlySet<string> = new Set(FLAG_REASONS)

export const FLAG_REASON_LABELS: Record<FlagReason, { en: string; bn: string }> = {
  misinformation: { en: 'Misinformation', bn: 'ভুল তথ্য' },
  harassment: { en: 'Harassment', bn: 'উত্যন্তকরণ' },
  duplicate: { en: 'Duplicate', bn: 'ডুপ্লিকেট' },
  off_topic: { en: 'Off topic', bn: 'অপ্রাসঙ্গিক' },
  other: { en: 'Other', bn: 'অন্যান্য' },
}
