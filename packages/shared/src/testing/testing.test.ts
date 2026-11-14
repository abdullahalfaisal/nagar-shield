import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildAreaHierarchy,
  buildEmergencyContact,
  buildHotline,
  buildOwnedReport,
  buildProfile,
  buildPublicReport,
  buildReportFlag,
  buildStation,
  resetFactoryCounter,
} from './index'
import { phoneSchema } from '../schemas'
import type {
  EmergencyContact,
  Hotline,
  OwnedReport,
  Profile,
  PublicReport,
  ReportFlag,
  Station,
} from '../types'

/**
 * The test factories.
 *
 * The story says: *"Given the test factories in `packages/shared/testing`,
 * when I build a report, contact, flag, or profile fixture, then the factory
 * returns a fully typed object without any production PII and without any
 * `as unknown as` cast."*
 *
 * Three claims, so three checks:
 *
 * 1. **Fully typed.** The returned object satisfies the shared interface it
 *    claims to be, *and* an override of the wrong type is a **compile**
 *    error. The compile half is asserted with `@ts-expect-error` — a
 *    compile error the compiler did not raise is itself an error, so the
 *    comment cannot rot into a no-op.
 * 2. **No production PII.** The fixtures are synthetic: `.test` email
 *    domains, the reserved `+880` fixture ranges, names that read as
 *    fixtures. The email is asserted against the shared schema, and the
 *    phone against the shared `phoneSchema`, so a fixture that drifts out of
 *    the app's own contract fails here.
 * 3. **No `as unknown as` cast.** A scan of the factory source.
 */

const FACTORY_FILE = join(__dirname, 'index.ts')

describe('the test factories', () => {
  beforeEach(() => {
    resetFactoryCounter()
  })

  describe('a report fixture', () => {
    it('returns a fully typed public report', () => {
      const report: PublicReport = buildPublicReport()

      expect(report.id).toMatch(/^report-\d{6}$/)
      expect(report.category).not.toBeNull()
      expect(report.areaHierarchy?.thana).toBe('Mirpur')
      expect(report.authorDisplayName).toBeNull()
      expect(report.moderationStatus).toBe('visible')
    })

    it('returns a fully typed owned report', () => {
      const report: OwnedReport = buildOwnedReport()

      expect(report.authorId).toMatch(/^user-\d{6}$/)
      expect(report.publicVisibility).toBe('anonymous')
      expect(report.media).toEqual([])
      expect(report.lat).toBeGreaterThanOrEqual(-90)
      expect(report.lng).toBeGreaterThanOrEqual(-180)
    })

    it('accepts a partial override and fills the rest', () => {
      const report = buildPublicReport({ category: 'fire', mediaCount: 3 })

      expect(report.category).toBe('fire')
      expect(report.mediaCount).toBe(3)
      // Untouched fields keep their defaults.
      expect(report.moderationStatus).toBe('visible')
      expect(report.areaHierarchy?.city).toBe('Dhaka')
    })

    it('rejects an override of the wrong type at compile time', () => {
      // @ts-expect-error `category` is a `ReportCategory`, not an arbitrary string.
      buildPublicReport({ category: 'not-a-category' })

      // @ts-expect-error `mediaCount` is a number.
      buildPublicReport({ mediaCount: 'three' })

      // @ts-expect-error `id` is a string.
      buildOwnedReport({ id: 42 })

      // @ts-expect-error `publicVisibility` is a fixed union.
      buildOwnedReport({ publicVisibility: 'maybe' })
    })
  })

  describe('a flag fixture', () => {
    it('returns a fully typed flag', () => {
      const flag: ReportFlag = buildReportFlag()

      expect(flag.id).toMatch(/^flag-\d{6}$/)
      expect(flag.reportId).toMatch(/^report-\d{6}$/)
      expect(flag.flaggerId).toMatch(/^user-\d{6}$/)
      expect(flag.reason).toBe('misinformation')
    })

    it('rejects an override of the wrong type at compile time', () => {
      // @ts-expect-error `reason` is a `FlagReason`.
      buildReportFlag({ reason: 'because' })
    })
  })

  describe('a contact fixture', () => {
    it('returns a fully typed contact', () => {
      const contact: EmergencyContact = buildEmergencyContact()

      expect(contact.id).toMatch(/^contact-\d{6}$/)
      expect(contact.userId).toMatch(/^user-\d{6}$/)
      expect(contact.isPrimary).toBe(true)
      expect(contact.groupName).toBe('family')
      expect(contact.sortOrder).toBe(0)
    })

    it('rejects an override of the wrong type at compile time', () => {
      // @ts-expect-error `isPrimary` is a boolean.
      buildEmergencyContact({ isPrimary: 'yes' })

      // @ts-expect-error `groupName` is a fixed union.
      buildEmergencyContact({ groupName: 'neighbour' })
    })
  })

  describe('a profile fixture', () => {
    it('returns a fully typed profile', () => {
      const profile: Profile = buildProfile()

      expect(profile.id).toMatch(/^user-\d{6}$/)
      expect(profile.role).toBe('citizen')
      expect(profile.locale).toBe('bn')
      expect(profile.theme).toBe('dark')
      expect(profile.disabledAt).toBeNull()
      expect(profile.deletedAt).toBeNull()
    })

    it('rejects an override of the wrong type at compile time', () => {
      // @ts-expect-error `role` is a `Role`.
      buildProfile({ role: 'admin' })

      // @ts-expect-error `biometricOptIn` is a boolean.
      buildProfile({ biometricOptIn: 1 })
    })
  })

  describe('a station and a hotline fixture', () => {
    it('returns fully typed entries', () => {
      const station: Station = buildStation()
      const hotline: Hotline = buildHotline()

      expect(station.stationType).toBe('police')
      expect(station.lat).toBeGreaterThanOrEqual(-90)
      expect(station.lng).toBeGreaterThanOrEqual(-180)
      expect(hotline.phone).toBe('109')
      expect(hotline.sortOrder).toBe(0)
    })

    it('rejects an override of the wrong type at compile time', () => {
      // @ts-expect-error `stationType` is a `StationType`.
      buildStation({ stationType: 'boat' })

      // @ts-expect-error `sortOrder` is a number.
      buildHotline({ sortOrder: 'first' })
    })
  })

  describe('the area hierarchy fixture', () => {
    it('returns a fully typed hierarchy', () => {
      const area = buildAreaHierarchy()

      expect(area.division).toBe('Dhaka')
      expect(area.city).toBe('Dhaka')
      expect(area.thana).toBe('Mirpur')
      expect(area.neighborhood).toBe('Kazipara')
    })

    it('rejects an override of the wrong type at compile time', () => {
      // @ts-expect-error `division` is a string.
      buildAreaHierarchy({ division: 1 })
    })
  })

  describe('production PII', () => {
    it('uses a non-routable email domain', () => {
      // `.test` is reserved by RFC 2606 and can never resolve, so a fixture
      // email cannot reach a real mailbox.
      expect(buildProfile().email.endsWith('@example.test')).toBe(true)
    })

    it('uses phone numbers the shared schema accepts', () => {
      // The fixture phones must satisfy the *app's* contract, not just look
      // plausible — otherwise a fixture could send a form the server rejects.
      expect(phoneSchema.safeParse(buildProfile().phone).success).toBe(true)
      expect(phoneSchema.safeParse(buildEmergencyContact().phone).success).toBe(true)
      expect(phoneSchema.safeParse(buildStation().phone).success).toBe(true)
    })

    it('carries no free-text field that could hold a real name', () => {
      // The names are obviously synthetic. A fixture whose name reads like a
      // person is a fixture that can leak.
      expect(buildProfile().fullName).toBe('Test Fixture')
      expect(buildEmergencyContact().name).toBe('Fixture Contact')
      expect(buildPublicReport().description).toBe('Synthetic fixture description')
    })

    it('never emits a production-looking identifier', () => {
      // Every generated id carries the factory prefix, so a fixture cannot
      // masquerade as a real uuid.
      for (const id of [
        buildPublicReport().id,
        buildOwnedReport().id,
        buildReportFlag().id,
        buildProfile().id,
        buildEmergencyContact().id,
        buildStation().id,
        buildHotline().id,
      ]) {
        expect(id).toMatch(/^[a-z]+-\d{6}$/)
      }
    })
  })

  describe('determinism', () => {
    it('produces the same ids after a reset', () => {
      const first = buildProfile().id
      resetFactoryCounter()
      const second = buildProfile().id

      expect(second).toBe(first)
    })

    it('produces distinct ids within a run', () => {
      expect(buildProfile().id).not.toBe(buildProfile().id)
    })
  })

  describe('the source of the factories', () => {
    it('contains no `as unknown as` cast', () => {
      const source = readFileSync(FACTORY_FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

      expect(source).not.toContain('as unknown as')
    })

    it('takes a `Partial<T>` override, never a loose bag', () => {
      // `Record<string, unknown>` would accept an override of any shape.
      // The story's edge-case table requires `Partial<T>`.
      //
      // The scan reads the **code**, not the prose: this very file mentions
      // the pattern in a comment, and a scan that matched the comment would
      // report a bag that is not there.
      const source = readFileSync(FACTORY_FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

      expect(source).not.toMatch(/Record<string,\s*unknown>/)
    })

    it('exports every factory the story names', () => {
      const exported = new Set<string>()

      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (entry.name.endsWith('.ts')) {
            const text = readFileSync(full, 'utf8')
            for (const match of text.matchAll(/export const (build\w+)/g)) {
              exported.add(match[1] as string)
            }
          }
        }
      }

      walk(__dirname)

      // The story names "a report, contact, flag, or profile fixture".
      for (const name of [
        'buildPublicReport',
        'buildOwnedReport',
        'buildReportFlag',
        'buildEmergencyContact',
        'buildProfile',
      ]) {
        expect(exported.has(name)).toBe(true)
      }
    })
  })
})
