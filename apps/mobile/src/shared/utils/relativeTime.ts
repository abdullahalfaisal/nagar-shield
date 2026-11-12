/**
 * Relative-time formatting for the Alerts feed and History list.
 * Matches the prototype's "5 min ago" / "22 min ago" / "1 hr ago" / "3 hr ago".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffMs = now.getTime() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;

  return `${Math.floor(days / 365)} yr ago`;
}

/**
 * The Bengali relative-time format used in the Bangla locale.
 * `৫ মিনিট আগে`, `২ ঘণ্টা আগে`.
 */
const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit);
}

export function formatRelativeTimeBn(iso: string, now: Date = new Date()): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffMs = now.getTime() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'এইমাত্র';
  if (minutes < 60) return `${toBengaliDigits(String(minutes))} মিনিট আগে`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toBengaliDigits(String(hours))} ঘণ্টা আগে`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${toBengaliDigits(String(days))} দিন আগে`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${toBengaliDigits(String(weeks))} সপ্তাহ আগে`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${toBengaliDigits(String(months))} মাস আগে`;

  return `${toBengaliDigits(String(Math.floor(days / 365)))} বছর আগে`;
}

/** Picks the right formatter for the active locale. */
export function formatRelativeTimeForLocale(
  iso: string,
  locale: string,
  now: Date = new Date(),
): string {
  return locale === 'bn' ? formatRelativeTimeBn(iso, now) : formatRelativeTime(iso, now);
}
