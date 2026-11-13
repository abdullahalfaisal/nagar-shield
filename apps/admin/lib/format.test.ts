import {
  authorAutoHideBadge,
  formatAreaLine,
  formatCategoryLabel,
  formatDecisionLabel,
  formatFlagReason,
  formatHideReason,
  formatRelativeTime,
  formatTimestamp,
  formatTimestampShort,
  isAuthorAutoHide,
  isInAuthorAutoHideGroup,
  maskPhone,
  maskUploaderIdentity,
} from '@/lib/format';

/**
 * The console's display rules.
 *
 * These helpers are pure — no browser, no Supabase project — so they carry
 * the rules that the moderation screens depend on: the masking of an uploader's
 * phone, the hide-reason vocabulary, and the timestamp formats.
 */

/** The mask glyph, written as a code point so the expectation cannot drift. */
const BULLET = String.fromCharCode(0x2022);
const MASKED_TAIL = `${BULLET}${BULLET}${BULLET}5678`;

describe('maskPhone', () => {
  it('keeps only the last four digits', () => {
    expect(maskPhone('+8801712345678')).toBe(`+${MASKED_TAIL}`);
  });

  it('keeps the leading plus', () => {
    expect(maskPhone('+8801712345678').startsWith('+')).toBe(true);
  });

  it('renders an em dash for a missing phone', () => {
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone(undefined)).toBe('—');
    expect(maskPhone('   ')).toBe('—');
  });

  it('does not mask a purged-account placeholder', () => {
    expect(maskPhone('purged-abc123')).toBe('purged-abc123');
  });

  it('never reveals more than four digits', () => {
    const masked = maskPhone('+8801712345678');
    const digits = masked.replace(/\D/g, '');
    expect(digits).toBe('5678');
  });
});

describe('maskUploaderIdentity', () => {
  it('prefers the chosen display name', () => {
    expect(maskUploaderIdentity({ fullName: '  রহিম  ', phone: '+8801712345678' })).toBe('রহিম');
  });

  it('falls back to the masked phone when no name was chosen', () => {
    expect(maskUploaderIdentity({ fullName: null, phone: '+8801712345678' })).toBe(
      `+${MASKED_TAIL}`,
    );
  });

  it('falls back to the masked phone when the name is blank', () => {
    expect(maskUploaderIdentity({ fullName: '   ', phone: '+8801712345678' })).toBe(
      `+${MASKED_TAIL}`,
    );
  });
});

describe('formatHideReason', () => {
  it('labels every hide reason', () => {
    expect(formatHideReason('flag_threshold')).toContain('3-flag');
    expect(formatHideReason('author_auto_hide')).toContain('Author auto-hide');
    expect(formatHideReason('both')).toContain('Both rules');
    expect(formatHideReason('manual')).toContain('moderator');
  });
});

describe('isAuthorAutoHide', () => {
  it('is true for the author rule and for both rules', () => {
    expect(isAuthorAutoHide('author_auto_hide')).toBe(true);
    expect(isAuthorAutoHide('both')).toBe(true);
  });

  it('is false for the per-report threshold and for a manual hide', () => {
    expect(isAuthorAutoHide('flag_threshold')).toBe(false);
    expect(isAuthorAutoHide('manual')).toBe(false);
  });
});

describe('the author-auto-hide group', () => {
  it('holds the reports hidden by the author rule', () => {
    expect(isInAuthorAutoHideGroup('author_auto_hide')).toBe(true);
    expect(isInAuthorAutoHideGroup('both')).toBe(true);
  });

  it('excludes the reports hidden by their own flag count', () => {
    expect(isInAuthorAutoHideGroup('flag_threshold')).toBe(false);
    expect(isInAuthorAutoHideGroup('manual')).toBe(false);
  });
});

describe('the author-auto-hide badge', () => {
  it('names the author rule on its own', () => {
    expect(authorAutoHideBadge('author_auto_hide')).toBe('author');
  });

  it('names both causes when both rules applied', () => {
    // A report that reached its own 3 flags AND was swept in by the author
    // rule carries the 'both' badge — naming only one cause would misinform
    // the moderator about why it is in the queue.
    expect(authorAutoHideBadge('both')).toBe('both');
  });

  it('carries no badge for a report hidden by its own threshold', () => {
    expect(authorAutoHideBadge('flag_threshold')).toBeNull();
    expect(authorAutoHideBadge('manual')).toBeNull();
  });

  it('is distinct from the plain hide reason, so the two are separable at a glance', () => {
    expect(authorAutoHideBadge('author_auto_hide')).not.toBe(authorAutoHideBadge('flag_threshold'));
    expect(authorAutoHideBadge('both')).not.toBe(authorAutoHideBadge('author_auto_hide'));
  });
});

describe('formatCategoryLabel', () => {
  it('returns null for an uncategorised report', () => {
    expect(formatCategoryLabel(null)).toBeNull();
  });

  it('returns the bilingual label for a category', () => {
    const label = formatCategoryLabel('theft');
    expect(label).toBeTruthy();
    expect(label).toContain('—');
  });
});

describe('formatDecisionLabel', () => {
  it('labels the three decisions', () => {
    expect(formatDecisionLabel('restore')).toContain('Restored');
    expect(formatDecisionLabel('remove')).toContain('Removed');
    expect(formatDecisionLabel('disable_user')).toContain('User disabled');
  });

  it('never crashes on an unknown decision', () => {
    expect(formatDecisionLabel('nonsense')).toContain('Unknown');
  });
});

describe('formatFlagReason', () => {
  it('labels every flag reason', () => {
    expect(formatFlagReason('misinformation')).toContain('Misinformation');
    expect(formatFlagReason('harassment')).toContain('Harassment');
    expect(formatFlagReason('duplicate')).toContain('Duplicate');
    expect(formatFlagReason('off_topic')).toContain('Off topic');
    expect(formatFlagReason('other')).toContain('Other');
  });
});

describe('formatAreaLine', () => {
  it('prefers the most specific area', () => {
    expect(
      formatAreaLine({
        division: 'Dhaka',
        city: 'Dhaka',
        thana: 'Mirpur',
        neighborhood: 'Kallyanagar',
      }),
    ).toBe('Kallyanagar');
  });

  it('falls back through the hierarchy', () => {
    expect(formatAreaLine({ division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' })).toBe('Mirpur');
  });

  it('renders an em dash for a missing area', () => {
    expect(formatAreaLine(null)).toBe('—');
    expect(formatAreaLine({})).toBe('—');
  });
});

describe('timestamp formatting', () => {
  const iso = '2026-11-05T09:07:03.000Z';

  it('formats the full UTC timestamp', () => {
    expect(formatTimestamp(iso)).toBe('2026-11-05 09:07:03 UTC');
  });

  it('formats the compact table cell', () => {
    expect(formatTimestampShort(iso)).toBe('11/05 09:07');
  });

  it('returns the raw value for an unparseable timestamp', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
    expect(formatTimestampShort('not-a-date')).toBe('not-a-date');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-11-05T12:00:00.000Z');

  it('describes a just-now timestamp', () => {
    expect(formatRelativeTime('2026-11-05T11:59:55.000Z', now)).toContain('just now');
  });

  it('describes minutes, hours and days', () => {
    expect(formatRelativeTime('2026-11-05T11:30:00.000Z', now)).toContain('30');
    expect(formatRelativeTime('2026-11-05T09:00:00.000Z', now)).toContain('3 h');
    expect(formatRelativeTime('2026-11-02T12:00:00.000Z', now)).toContain('3 d');
  });

  it('renders an em dash for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('—');
  });
});
