import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_SET,
  FLAG_REASONS,
  FLAG_REASON_SET,
  MODERATION_STATUSES,
  PUBLICLY_VISIBLE_STATUSES,
  isPubliclyVisible,
  DEFAULT_PUBLIC_VISIBILITY,
  LOCALES,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_ICONS,
  REPORT_CATEGORY_LABELS,
  parseReportCategory,
} from '../enums'

describe('report category enum', () => {
  it('has exactly the 11 fixed values from the PRD', () => {
    expect(REPORT_CATEGORIES).toHaveLength(11)
    expect([...REPORT_CATEGORIES]).toEqual([
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
    ])
  })

  it('has a label, icon and accent for every category', () => {
    for (const category of REPORT_CATEGORIES) {
      expect(REPORT_CATEGORY_LABELS[category]).toBeDefined()
      expect(REPORT_CATEGORY_LABELS[category].en).toBeTruthy()
      expect(REPORT_CATEGORY_LABELS[category].bn).toBeTruthy()
      expect(REPORT_CATEGORY_ICONS[category]).toBeTruthy()
      expect(REPORT_CATEGORY_ACCENTS[category]).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('exposes a lookup set', () => {
    expect(REPORT_CATEGORY_SET.has('theft')).toBe(true)
    expect(REPORT_CATEGORY_SET.has('nope')).toBe(false)
  })
})

describe('flag reason enum', () => {
  it('has exactly the 5 fixed values from the PRD', () => {
    expect(FLAG_REASONS).toHaveLength(5)
    expect([...FLAG_REASONS]).toEqual([
      'misinformation',
      'harassment',
      'duplicate',
      'off_topic',
      'other',
    ])
  })

  it('exposes a lookup set', () => {
    expect(FLAG_REASON_SET.has('misinformation')).toBe(true)
    expect(FLAG_REASON_SET.has('spam')).toBe(false)
  })
})

describe('moderation status', () => {
  it('models visible → hidden_pending_review → restored | removed', () => {
    expect([...MODERATION_STATUSES]).toEqual([
      'visible',
      'hidden_pending_review',
      'restored',
      'removed',
    ])
  })

  it('treats only visible and restored as publicly visible', () => {
    expect(PUBLICLY_VISIBLE_STATUSES).toEqual(['visible', 'restored'])
    expect(isPubliclyVisible('visible')).toBe(true)
    expect(isPubliclyVisible('restored')).toBe(true)
    expect(isPubliclyVisible('hidden_pending_review')).toBe(false)
    expect(isPubliclyVisible('removed')).toBe(false)
  })
})

describe('defaults', () => {
  it('defaults public visibility to anonymous', () => {
    expect(DEFAULT_PUBLIC_VISIBILITY).toBe('anonymous')
  })

  it('defaults to Bangla', () => {
    expect(DEFAULT_LOCALE).toBe('bn')
    expect(LOCALES).toEqual(['bn', 'en'])
  })

  it('defaults to the dark theme, matching the prototype', () => {
    expect(DEFAULT_THEME).toBe('dark')
  })
})

describe('parseReportCategory', () => {
  it('parses every one of the 11 values', () => {
    for (const category of REPORT_CATEGORIES) {
      expect(parseReportCategory(category)).toBe(category)
    }
  })

  it('rejects a value outside the 11', () => {
    expect(() => parseReportCategory('arson')).toThrow(/Not a report category/)
  })

  it('rejects a value of the wrong type rather than coercing it', () => {
    expect(() => parseReportCategory(7)).toThrow(/Not a report category/)
    expect(() => parseReportCategory(null)).toThrow(/Not a report category/)
    expect(() => parseReportCategory(undefined)).toThrow(/Not a report category/)
  })

  it('does not trim or fold case — the value must be exact', () => {
    // A silently trimmed or case-folded category would put a report in a
    // bucket the user did not choose, with no trace.
    expect(() => parseReportCategory('theft ')).toThrow(/Not a report category/)
    expect(() => parseReportCategory('THEFT')).toThrow(/Not a report category/)
  })
})
