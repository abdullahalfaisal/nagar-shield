import { REPORT_CATEGORIES } from '../enums';
import type { PublicReport } from '../types';

/**
 * Deterministic factories for fixtures and tests.
 * Source: `memory-bank/standards/coding-standards.md` § Test data management.
 * Never use production PII in fixtures.
 */

/** A fixed seed keeps generated fixtures stable across runs. */
let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter).padStart(6, '0')}`;
}

export function resetFactoryCounter(): void {
  counter = 0;
}

export const buildAreaHierarchy = (
  overrides: Partial<PublicReport['areaHierarchy']> = {},
): NonNullable<PublicReport['areaHierarchy']> => ({
  division: 'Dhaka',
  city: 'Dhaka',
  thana: 'Mirpur',
  neighborhood: 'Kazipara',
  ...overrides,
});

export const buildPublicReport = (overrides: Partial<PublicReport> = {}): PublicReport => ({
  id: nextId('report'),
  category: REPORT_CATEGORIES[0],
  description: 'Synthetic fixture description',
  areaHierarchy: buildAreaHierarchy(),
  capturedAt: new Date('2026-11-03T18:00:00.000Z').toISOString(),
  moderationStatus: 'visible',
  authorDisplayName: null,
  hasMedia: true,
  mediaCount: 1,
  ...overrides,
});

export const buildProfile = (overrides: Record<string, unknown> = {}) => ({
  id: nextId('user'),
  phone: '+8801700000000',
  email: 'fixture@example.test',
  fullName: 'Test Fixture',
  role: 'citizen' as const,
  locale: 'bn' as const,
  theme: 'dark' as const,
  biometricOptIn: false,
  disabledAt: null,
  deletedAt: null,
  createdAt: new Date('2026-11-01T00:00:00.000Z').toISOString(),
  ...overrides,
});

export const buildEmergencyContact = (overrides: Record<string, unknown> = {}) => ({
  id: nextId('contact'),
  userId: 'user-fixture',
  name: 'Fixture Contact',
  phone: '+8801800000000',
  isPrimary: true,
  groupName: 'family' as const,
  sortOrder: 0,
  createdAt: new Date('2026-11-01T00:00:00.000Z').toISOString(),
  ...overrides,
});

export const buildStation = (overrides: Record<string, unknown> = {}) => ({
  id: nextId('station'),
  stationType: 'police' as const,
  name: 'Mirpur Thana',
  nameBn: 'মিরপুর থানা',
  phone: '+880255000000',
  lat: 23.8042,
  lng: 90.3794,
  address: 'Mirpur, Dhaka',
  distanceKm: 1.2,
  ...overrides,
});

export const buildHotline = (overrides: Record<string, unknown> = {}) => ({
  id: nextId('hotline'),
  name: 'Women & Children Helpline',
  nameBn: 'নারী ও শিশু হেল্পলাইন',
  phone: '109',
  category: 'women_children',
  description: '24/7 support for women and children',
  sortOrder: 0,
  ...overrides,
});
