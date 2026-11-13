/**
 * Display helpers for the moderator console.
 *
 * Every function here is **pure** and takes its input explicitly — no module
 * state, no I/O. That is what makes them unit-testable without a browser and
 * without a Supabase project, and it keeps the presentation rules in one place
 * instead of spread across the routes.
 */

import type { FlagReason, HideReason, ModerationDecision, ReportCategory } from '@nagar-shield/shared';
import { REPORT_CATEGORY_LABELS } from '@nagar-shield/shared';

/**
 * Masks an uploader's phone number for the queue list.
 *
 * The unmasked identity is server-side only (FR-MOD-2). The list shows a
 * masked handle so a shoulder-surfer cannot read a phone number off the
 * screen; the **full** identity is only rendered on the review detail, which
 * is opened deliberately.
 *
 * The masked value never reaches a URL, a query key, or a log line.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';

  const trimmed = phone.trim();
  if (trimmed.length === 0) return '—';

  // A tombstoned account's placeholder is not a phone number; show it as-is.
  if (trimmed.startsWith('purged-')) return trimmed;

  const visibleTail = trimmed.slice(-4);
  const prefix = trimmed.startsWith('+') ? '+' : '';

  if (trimmed.length <= visibleTail.length + 2) {
    return `${prefix}${'•'.repeat(Math.max(trimmed.length - visibleTail.length, 1))}${visibleTail}`;
  }

  return `${prefix}${'•'.repeat(3)}${visibleTail}`;
}

/**
 * The masked uploader handle for the queue list.
 *
 * The name (when the author chose `identified`) is shown; otherwise the
 * masked phone is the handle.
 */
export function maskUploaderIdentity(uploader: {
  fullName: string | null;
  phone: string | null;
}): string {
  if (uploader.fullName && uploader.fullName.trim().length > 0) {
    return uploader.fullName.trim();
  }
  return maskPhone(uploader.phone);
}

/** The area line: `English · বাংলা`, matching the mobile alert card. */
export function formatAreaLine(area: {
  neighborhood?: string | null;
  thana?: string | null;
  city?: string | null;
  division?: string | null;
} | null): string {
  if (!area) return '—';

  const english = area.neighborhood ?? area.thana ?? area.city ?? area.division ?? null;
  if (!english) return '—';

  // The curated dataset is Bangla-first; the mobile card shows one line.
  return english;
}

/** The category label, or the neutral placeholder when it is null. */
export function formatCategoryLabel(category: ReportCategory | null): string | null {
  if (!category) return null;
  const label = REPORT_CATEGORY_LABELS[category];
  return `${label.bn} — ${label.en}`;
}

/** The flag-reason label pair, matching the shared enum vocabulary. */
export function formatFlagReason(reason: FlagReason): string {
  const labels: Record<FlagReason, string> = {
    misinformation: 'ভুল তথ্য — Misinformation',
    harassment: 'উত্যন্তকরণ — Harassment',
    duplicate: 'ডুপ্লিকেট — Duplicate',
    off_topic: 'অপ্রাসঙ্গিক — Off topic',
    other: 'অন্যান্য — Other',
  };
  return labels[reason];
}

/** The decision label for the audit trail. Unknown values never crash. */
export function formatDecisionLabel(decision: string): string {
  const labels: Record<ModerationDecision, string> = {
    restore: 'ফিরিয়ে আনা — Restored',
    remove: 'সরানো — Removed',
    disable_user: 'ব্যবহারকারী নিষ্ক্রিয় — User disabled',
  };
  return labels[decision as ModerationDecision] ?? 'অজানা — Unknown';
}

/** The hide-reason badge text. `manual` is a moderator's earlier decision. */
export function formatHideReason(reason: HideReason): string {
  const labels: Record<HideReason, string> = {
    flag_threshold: '৩টি ফ্ল্যাগের সীমায় লুকানো — 3-flag threshold',
    author_auto_hide: 'লেখকের নিয়মে লুকানো — Author auto-hide',
    both: 'ফ্ল্যাগ ও লেখকের নিয়মে লুকানো — Both rules',
    manual: 'মডারেটরের আগে লুকানো — Hidden by a moderator',
  };
  return labels[reason];
}

/**
 * True when the report was hidden by the **author** rule (5 flagged reports
 * from one author in 24 hours) rather than by the report's own 3-flag
 * threshold. The banner that explains this is what makes FR-ALERTS-11 legible.
 */
export function isAuthorAutoHide(reason: HideReason): boolean {
  return reason === 'author_auto_hide' || reason === 'both';
}

/**
 * The queue's group filter.
 *
 * `all` is every pending report — the queue as it was before this group
 * existed. `author_auto_hide` is the **slice** of that queue where the
 * report's author was auto-hidden: `hide_reason ∈ { 'author_auto_hide', 'both' }`.
 *
 * The group is a **client-side slice over a `SELECT`-only read model**. It
 * adds no rows to the schema, it invents no second cursor, and it can only
 * **narrow** what `moderation_queue` returned — it never widens it. A
 * non-moderator is refused by the RPC before any of this runs.
 */
export type QueueGroup = 'all' | 'author_auto_hide';

/**
 * Whether a queue row belongs to the author-auto-hide group.
 *
 * The server's `hide_reason` is authoritative. The client does not recompute
 * the rule from the row's flag counts — it renders the reason the server sent.
 * The `author_flags_24h` count is shown **alongside** the badge as context,
 * never as the thing that decides membership: a report's flags age out of the
 * 24 h window, and when they do the badge stops claiming the author rule even
 * though the report is still `hidden_pending_review`.
 */
export function isInAuthorAutoHideGroup(hideReason: HideReason): boolean {
  return isAuthorAutoHide(hideReason);
}

/**
 * The badge's variant.
 *
 * `author` — the report's author was auto-hidden. `both` — the report reached
 * its own 3 flags **and** the author's rule applied. The two are rendered
 * distinctly so a moderator can tell a report that reached the 3-flag
 * threshold apart from one that was swept up by the author's flag history.
 * `null` means the report carries no author-rule badge at all.
 */
export type AuthorAutoHideBadge = 'author' | 'both' | null;

export function authorAutoHideBadge(hideReason: HideReason): AuthorAutoHideBadge {
  if (hideReason === 'both') return 'both';
  if (hideReason === 'author_auto_hide') return 'author';
  return null;
}

/** Formats an ISO timestamp for the audit trail and the detail view. */
export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;

  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())} ` +
    `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}:${pad(parsed.getUTCSeconds())} UTC`
  );
}

/** The compact form of a timestamp for a dense table cell. */
export function formatTimestampShort(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(parsed.getUTCMonth() + 1)}/${pad(parsed.getUTCDate())} ${pad(parsed.getUTCHours())}:${pad(
    parsed.getUTCMinutes(),
  )}`;
}

/**
 * The relative time for the queue row. It falls back to an em dash when the
 * timestamp is unparseable rather than rendering "Invalid Date".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';

  const deltaMs = now.getTime() - parsed.getTime();
  const minutes = Math.round(deltaMs / 60_000);

  if (minutes < 1) return 'এইমাত্র · just now';
  if (minutes < 60) return `${minutes} মিনিট আগে · ${minutes} min ago`;
  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ঘণ্টা আগে · ${hours} h ago`;
  }
  const days = Math.floor(minutes / (60 * 24));
  return `${days} দিন আগে · ${days} d ago`;
}
