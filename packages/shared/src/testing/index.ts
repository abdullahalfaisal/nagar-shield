import { REPORT_CATEGORIES } from '../enums'
import type {
  AreaHierarchy,
  EmergencyContact,
  Hotline,
  OwnedReport,
  Profile,
  PublicReport,
  ReportFlag,
  Station,
} from '../types'

/**
 * Deterministic factories for fixtures and tests.
 * Source: `memory-bank/standards/coding-standards.md` § Test data management.
 * Never use production PII in fixtures.
 *
 * **Every factory is typed end to end.** The override parameter is
 * `Partial<T>` for the concrete shape it builds, and the return type is
 * that same shape. A factory that takes `Record<string, unknown>` accepts an
 * override of *any* shape — `buildProfile({ role: 'not-a-role' })` compiles
 * and the mistake surfaces three screens later as a runtime error. The
 * story's edge-case table says it directly: *"the factory's parameter type
 * is `Partial<T>` and never `any`"*. `Partial<T>` is what makes a wrong
 * override a **compile** error.
 *
 * The values are synthetic: `.test` email domains, `+880` numbers in the
 * reserved-fixture ranges, and names that are obviously fixtures. The
 * hotline `109` is a **public** number the app already publishes, so a
 * fixture carrying it is not production PII.
 */

/** A fixed seed keeps generated fixtures stable across runs. */
let counter = 0

function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(6, '0')}`
}

export function resetFactoryCounter(): void {
  counter = 0
}

/** The area hierarchy every Bangladesh fixture sits inside. */
export const buildAreaHierarchy = (overrides: Partial<AreaHierarchy> = {}): AreaHierarchy => ({
  division: 'Dhaka',
  city: 'Dhaka',
  thana: 'Mirpur',
  neighborhood: 'Kazipara',
  ...overrides,
})

/**
 * A report as the public feed sees it.
 *
 * `authorDisplayName` is `null` by default — the *identified* case is the
 * exception, not the norm, so the default fixture is the privacy-preserving
 * one.
 */
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
})

/**
 * A report as the **author** sees it — it carries `authorId`, which the
 * public projection deliberately omits.
 */
export const buildOwnedReport = (overrides: Partial<OwnedReport> = {}): OwnedReport => ({
  id: nextId('report'),
  authorId: nextId('user'),
  publicVisibility: 'anonymous',
  category: REPORT_CATEGORIES[0],
  description: 'Synthetic fixture description',
  lat: 23.8042,
  lng: 90.3794,
  areaHierarchy: buildAreaHierarchy(),
  capturedAt: new Date('2026-11-03T18:00:00.000Z').toISOString(),
  moderationStatus: 'visible',
  createdAt: new Date('2026-11-03T18:00:00.000Z').toISOString(),
  media: [],
  ...overrides,
})

/** A flag against a report — the moderation queue's input. */
export const buildReportFlag = (overrides: Partial<ReportFlag> = {}): ReportFlag => ({
  id: nextId('flag'),
  reportId: nextId('report'),
  flaggerId: nextId('user'),
  reason: 'misinformation',
  createdAt: new Date('2026-11-03T18:00:00.000Z').toISOString(),
  ...overrides,
})

export const buildProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: nextId('user'),
  phone: '+8801700000000',
  email: 'fixture@example.test',
  fullName: 'Test Fixture',
  role: 'citizen',
  locale: 'bn',
  theme: 'dark',
  biometricOptIn: false,
  disabledAt: null,
  deletedAt: null,
  createdAt: new Date('2026-11-01T00:00:00.000Z').toISOString(),
  ...overrides,
})

export const buildEmergencyContact = (
  overrides: Partial<EmergencyContact> = {},
): EmergencyContact => ({
  id: nextId('contact'),
  userId: nextId('user'),
  name: 'Fixture Contact',
  phone: '+8801800000000',
  isPrimary: true,
  groupName: 'family',
  sortOrder: 0,
  createdAt: new Date('2026-11-01T00:00:00.000Z').toISOString(),
  ...overrides,
})

export const buildStation = (overrides: Partial<Station> = {}): Station => ({
  id: nextId('station'),
  stationType: 'police',
  name: 'Mirpur Thana',
  nameBn: 'মিরপুর থানা',
  // A `+880` **mobile**-shaped number, not a Dhaka landline. The shared
  // `phoneSchema` accepts `+880` followed by ten digits, so a landline
  // (`+8802…`) would fail the app's own phone contract — a fixture that
  // the server rejects is a fixture that cannot test anything.
  phone: '+8801550000000',
  lat: 23.8042,
  lng: 90.3794,
  address: 'Mirpur, Dhaka',
  distanceKm: 1.2,
  ...overrides,
})

export const buildHotline = (overrides: Partial<Hotline> = {}): Hotline => ({
  id: nextId('hotline'),
  name: 'Women & Children Helpline',
  nameBn: 'নারী ও শিশু হেল্পলাইন',
  phone: '109',
  category: 'women_children',
  description: '24/7 support for women and children',
  sortOrder: 0,
  ...overrides,
})
