/**
 * Fixed 11-value incident category.
 * Source: PRD FR-CAPTURE-5 + ARCHITECTURE §G "Category enum (fixed 11 values)".
 *
 * `category` is NULLABLE on a report — it may be set later by the author.
 */
export const REPORT_CATEGORIES = [
  'theft',
  'assault',
  'harassment',
  'robbery',
  'accident',
  'fire',
  'medical',
  'fraud',
  'vandalism',
  'suspicious',
  'other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_SET: ReadonlySet<string> = new Set(REPORT_CATEGORIES);

/**
 * The exported parser for `ReportCategory`.
 *
 * The story says the enum is modelled as an `as const` array **plus** a
 * runtime parser, so the two can never diverge. The parser lives here, next
 * to the array, so the two are edited together.
 *
 * A value outside the eleven **fails** — there is no fallback and no
 * coercion, because a silently substituted category would put a report in
 * the wrong bucket with no trace.
 */
export function parseReportCategory(value: unknown): ReportCategory {
  if (typeof value !== 'string' || !REPORT_CATEGORY_SET.has(value)) {
    throw new Error(`Not a report category: ${String(value)}`);
  }
  return value as ReportCategory;
}

/**
 * Bangla / English display pairs, matching the prototype's alert card format
 * (e.g. "চুরি — Theft"). English is the canonical key; Bangla is the primary
 * locale (C-8 — Bangla + English only).
 */
export const REPORT_CATEGORY_LABELS: Record<ReportCategory, { en: string; bn: string }> = {
  theft: { en: 'Theft', bn: 'চুরি' },
  assault: { en: 'Assault', bn: 'আক্রমণ' },
  harassment: { en: 'Harassment', bn: 'উত্যন্ত' },
  robbery: { en: 'Robbery', bn: 'ডাকাতি' },
  accident: { en: 'Accident', bn: 'দুর্ঘটনা' },
  fire: { en: 'Fire', bn: 'আগুন' },
  medical: { en: 'Medical', bn: 'চিকিৎসা' },
  fraud: { en: 'Fraud', bn: 'প্রতারণা' },
  vandalism: { en: 'Vandalism', bn: 'ভাঙচোরা' },
  suspicious: { en: 'Suspicious', bn: 'সন্দেহজনক' },
  other: { en: 'Other', bn: 'অন্যান্য' },
};

/** Material Symbols icon used for each category in the Alerts feed. */
export const REPORT_CATEGORY_ICONS: Record<ReportCategory, string> = {
  theft: 'backpack',
  assault: 'warning',
  harassment: 'gavel',
  robbery: 'money',
  accident: 'diamond',
  fire: 'local_fire_department',
  medical: 'medical_services',
  fraud: 'credit_card',
  vandalism: 'hammer',
  suspicious: 'visibility',
  other: 'help',
};

/**
 * Left-border accent colour per category on the Alerts feed card.
 * Source: `prototype ui.html` — the alert card inline `border-left` values.
 */
export const REPORT_CATEGORY_ACCENTS: Record<ReportCategory, string> = {
  theft: '#7B1FA2',
  assault: '#DC2626',
  harassment: '#9C27B0',
  robbery: '#B71C1C',
  accident: '#5D4037',
  fire: '#D97706',
  medical: '#C2185B',
  fraud: '#00838F',
  vandalism: '#4E342E',
  suspicious: '#546E7A',
  other: '#6B6B85',
};
