import {
  alternatePhoneSchema,
  captureDescriptionSchema,
  CAPTURE_DESCRIPTION_MAX_LENGTH,
  emergencyContactSchema,
  historyQuerySchema,
  HISTORY_DEFAULT_RADIUS_KM,
  HISTORY_DEFAULT_WINDOW_HOURS,
  loginSchema,
  moderationDecisionSchema,
  bnDigitsToAscii,
  normalisePhone,
  phoneSchema,
  signupSchema,
  E164_PHONE_REGEX,
  FLAG_HIDE_THRESHOLD,
  FLAG_RATE_LIMIT_PER_HOUR,
  SEEK_THANA_FALLBACK_RADIUS_KM,
  SEEK_THANA_FALLBACK_NUMBER,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  BIOMETRIC_FAILS_TO_DISABLE,
  BIOMETRIC_FAILS_TO_PASSWORD,
  REMEMBER_ME_DAYS,
  ALERTS_REFRESH_INTERVAL_MS,
  ALERTS_BATTERY_PAUSE_THRESHOLD,
  areaHierarchySchema,
  contactSchema,
  parseAreaHierarchy,
} from '../schemas'

describe('phone normalisation', () => {
  it('normalises local Bangla formats to E.164', () => {
    expect(normalisePhone('01712345678')).toBe('+8801712345678')
    expect(normalisePhone('+8801712345678')).toBe('+8801712345678')
    expect(normalisePhone('8801712345678')).toBe('+8801712345678')
    expect(normalisePhone('+880 171-234-5678')).toBe('+8801712345678')
  })

  it('reads Bangla digits as the same number', () => {
    expect(bnDigitsToAscii('০১৭১২৩৪৫৬৭৮')).toBe('01712345678')
    expect(normalisePhone('০১৭১২৩৪৫৬৭৮')).toBe('+8801712345678')
    expect(normalisePhone('+৮৮০ ১৭১২-৩৪৫৬৭৮')).toBe('+8801712345678')
    expect(phoneSchema.safeParse('০১৭১২৩৪৫৬৭৮').success).toBe(true)
  })

  it('rejects a non-Bangladesh number', () => {
    expect(phoneSchema.safeParse('+14155552671').success).toBe(false)
    expect(phoneSchema.safeParse('12345').success).toBe(false)
  })

  it('accepts a well-formed BD number', () => {
    const parsed = phoneSchema.safeParse('01712345678')
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toMatch(E164_PHONE_REGEX)
    }
  })
})

describe('the alternate phone', () => {
  it('normalises to the same E.164 form as the primary phone', () => {
    // The wizard compares the two numbers to enforce "must be different", and
    // a comparison is only meaningful in one canonical form.
    const parsed = alternatePhoneSchema.safeParse('01711-111111')
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toBe('+8801711111111')
      expect(parsed.data).toBe(phoneSchema.safeParse('+8801711111111').data)
    }
  })

  it('makes the two spellings of one number comparable', () => {
    // This is the case the raw-string comparison got wrong: the same number
    // written two ways must compare equal after normalisation, or the
    // "must be different from your primary number" rule is trivially evaded.
    const primary = phoneSchema.safeParse('01711111111').data
    const alternate = alternatePhoneSchema.safeParse('01711-111111').data

    expect(primary).toBe(alternate)
  })

  it('still refuses a non-Bangladesh number', () => {
    expect(alternatePhoneSchema.safeParse('+14155550123').success).toBe(false)
    expect(alternatePhoneSchema.safeParse('12345').success).toBe(false)
  })
})

describe('signup schema', () => {
  it('requires email, password and phone', () => {
    const result = signupSchema.safeParse({
      email: 'User@Example.com',
      password: 'supersecret',
      phone: '01712345678',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('user@example.com')
      expect(result.data.phone).toBe('+8801712345678')
    }
  })

  it('rejects a short password', () => {
    expect(
      signupSchema.safeParse({ email: 'a@b.test', password: 'short', phone: '01712345678' })
        .success,
    ).toBe(false)
  })

  it('rejects a duplicate-shape phone that is not E.164', () => {
    expect(
      signupSchema.safeParse({ email: 'a@b.test', password: 'supersecret', phone: '123' }).success,
    ).toBe(false)
  })
})

describe('login schema', () => {
  it('accepts a phone identifier', () => {
    expect(loginSchema.safeParse({ identifier: '01712345678', password: 'x' }).success).toBe(true)
  })

  it('accepts an email identifier', () => {
    expect(loginSchema.safeParse({ identifier: 'a@b.test', password: 'x' }).success).toBe(true)
  })

  it('defaults rememberMe to false', () => {
    const result = loginSchema.safeParse({ identifier: 'a@b.test', password: 'x' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.rememberMe).toBe(false)
  })
})

describe('capture description', () => {
  it('caps at 140 characters (FR-CAPTURE-6)', () => {
    expect(CAPTURE_DESCRIPTION_MAX_LENGTH).toBe(140)
    expect(captureDescriptionSchema.safeParse('a'.repeat(140)).success).toBe(true)
    expect(captureDescriptionSchema.safeParse('a'.repeat(141)).success).toBe(false)
  })

  it('trims surrounding whitespace', () => {
    const result = captureDescriptionSchema.safeParse('  hello  ')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe('hello')
  })
})

describe('history query', () => {
  it('defaults to 1 km and 24 hours (FR-HIST-1)', () => {
    const result = historyQuerySchema.safeParse({ lat: 23.78, lng: 90.4 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.radiusKm).toBe(HISTORY_DEFAULT_RADIUS_KM)
      expect(result.data.windowHours).toBe(HISTORY_DEFAULT_WINDOW_HOURS)
      expect(result.data.radiusKm).toBe(1)
      expect(result.data.windowHours).toBe(24)
    }
  })
})

describe('moderation decision', () => {
  it('requires a non-empty note (FR-MOD-3)', () => {
    const base = { reportId: 'a3b7c1d2-0000-4000-8000-000000000000', decision: 'remove' as const }
    expect(moderationDecisionSchema.safeParse({ ...base, note: '' }).success).toBe(false)
    expect(moderationDecisionSchema.safeParse({ ...base, note: '   ' }).success).toBe(false)
    expect(moderationDecisionSchema.safeParse({ ...base, note: 'Removed: spam' }).success).toBe(
      true,
    )
  })
})

describe('emergency contact', () => {
  it('normalises the phone and defaults the group', () => {
    const result = emergencyContactSchema.safeParse({ name: 'Ayesha', phone: '01812345678' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBe('+8801812345678')
      expect(result.data.groupName).toBe('other')
    }
  })
})

describe('business-rule constants', () => {
  it('locks the flag threshold at 3 (OQ-4)', () => {
    expect(FLAG_HIDE_THRESHOLD).toBe(3)
  })

  it('locks the flag rate limit at 10 per hour (FR-ALERTS-10)', () => {
    expect(FLAG_RATE_LIMIT_PER_HOUR).toBe(10)
  })

  it('locks the thana fallback at 10 km → 999 (FR-SEEK-3)', () => {
    expect(SEEK_THANA_FALLBACK_RADIUS_KM).toBe(10)
    expect(SEEK_THANA_FALLBACK_NUMBER).toBe('999')
  })

  it('locks the OTP and biometric rules (FR-AUTH-3, FR-AUTH-5)', () => {
    expect(OTP_TTL_MINUTES).toBe(10)
    expect(OTP_MAX_ATTEMPTS).toBe(3)
    expect(BIOMETRIC_FAILS_TO_PASSWORD).toBe(3)
    expect(BIOMETRIC_FAILS_TO_DISABLE).toBe(5)
  })

  it('locks the Remember me window at 30 days (FR-AUTH-2)', () => {
    expect(REMEMBER_ME_DAYS).toBe(30)
  })

  it('locks the Alerts refresh interval at 60 seconds (FR-ALERTS-2)', () => {
    // Story `002-auto-refresh-and-pull-to-refresh` names the gap:
    //
    // > **The interval constant has no test.** `ALERTS_REFRESH_INTERVAL_MS` is
    // > asserted nowhere; its value is a product decision with no guard.
    //
    // The value is the story's own: the header tells the user the feed
    // "Auto-refreshes every 60s", so the constant and that label are the same
    // promise.
    expect(ALERTS_REFRESH_INTERVAL_MS).toBe(60_000)
    expect(ALERTS_REFRESH_INTERVAL_MS / 1000).toBe(60)
  })

  it('locks the Alerts battery pause threshold at 20 % (FR-ALERTS-2)', () => {
    // The comparison is *strictly less than*, so exactly 20 % still refreshes.
    // The boundary is pinned in `refreshGuard.test.ts`; the value is pinned
    // here.
    expect(ALERTS_BATTERY_PAUSE_THRESHOLD).toBe(20)
  })

  it('keeps the Alerts refresh constants whole numbers', () => {
    // A fractional millisecond or a fractional percent would mean the
    // constants were *derived* rather than chosen.
    expect(Number.isInteger(ALERTS_REFRESH_INTERVAL_MS)).toBe(true)
    expect(Number.isInteger(ALERTS_BATTERY_PAUSE_THRESHOLD)).toBe(true)
  })
})

describe('areaHierarchySchema', () => {
  const valid = { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur', neighborhood: 'Kazipara' }

  it('accepts a complete hierarchy', () => {
    expect(areaHierarchySchema.parse(valid)).toEqual(valid)
  })

  it('accepts a hierarchy without a neighborhood — the area table is not exhaustive', () => {
    const parsed = areaHierarchySchema.parse({ division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' })
    expect(parsed.neighborhood).toBeUndefined()
  })

  it('normalises a null neighborhood to absent, not to null', () => {
    // A consumer should not have to check two shapes for "no neighborhood".
    const parsed = areaHierarchySchema.parse({ ...valid, neighborhood: null })
    expect(parsed.neighborhood).toBeUndefined()
    expect('neighborhood' in parsed && parsed.neighborhood === null).toBe(false)
  })

  it('requires division, city and thana', () => {
    for (const missing of ['division', 'city', 'thana'] as const) {
      const payload: Record<string, unknown> = { ...valid }
      delete payload[missing]
      expect(() => areaHierarchySchema.parse(payload)).toThrow()
    }
  })

  it('rejects a blank required field', () => {
    expect(() => areaHierarchySchema.parse({ ...valid, thana: '   ' })).toThrow()
  })
})

describe('parseAreaHierarchy', () => {
  it('returns the normalised hierarchy', () => {
    const parsed = parseAreaHierarchy({
      division: 'Dhaka',
      city: 'Dhaka',
      thana: 'Mirpur',
      neighborhood: null,
    })

    expect(parsed.division).toBe('Dhaka')
    expect(parsed.neighborhood).toBeUndefined()
  })

  it('throws on a malformed payload rather than returning a partial', () => {
    expect(() => parseAreaHierarchy({ division: 'Dhaka' })).toThrow()
  })
})

describe('contactSchema', () => {
  it("is the same schema as emergencyContactSchema, under the story's name", () => {
    // An alias, not a second definition — so the two names cannot drift.
    expect(contactSchema).toBe(emergencyContactSchema)
  })

  it('validates a contact', () => {
    const parsed = contactSchema.parse({
      name: 'Fixture Contact',
      phone: '+8801800000000',
      isPrimary: true,
      sortOrder: 0,
    })

    expect(parsed.groupName).toBe('other')
  })
})
