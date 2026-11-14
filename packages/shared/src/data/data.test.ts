import {
  EMERGENCY_NUMBERS,
  HOTLINES,
  MORE_HELP_ROWS,
  REFERENCE_DATA_VERSION,
  SEEK_FALLBACK_NUMBER,
  STATIONS,
  distanceKm,
  findHotline,
  findStation,
  hotlineEntrySchema,
  stationsWithin,
  stationEntrySchema,
} from '../data';

/**
 * The curated dataset is the source of truth for the offline dial path and
 * the Postgres mirror. These tests guard the product facts that must never
 * drift, and the geometry the 10 km fallback depends on.
 */

describe('the station entry schema', () => {
  const valid = {
    id: 'st-dhanmondi-police',
    stationType: 'police',
    name: 'Dhanmondi Police Station',
    nameBn: 'ধানমন্ডি থানা',
    phone: '0229120000',
    lat: 23.7461,
    lng: 90.3774,
    address: 'Dhanmondi, Dhaka',
    isActive: true,
  };

  it('accepts a well-formed entry', () => {
    expect(stationEntrySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a null Bangla name and a null address', () => {
    const parsed = stationEntrySchema.safeParse({ ...valid, nameBn: null, address: null });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty id', () => {
    expect(stationEntrySchema.safeParse({ ...valid, id: '' }).success).toBe(false);
  });

  it('rejects an unknown station type', () => {
    expect(stationEntrySchema.safeParse({ ...valid, stationType: 'boat' }).success).toBe(false);
  });

  it('rejects a non-numeric coordinate', () => {
    expect(stationEntrySchema.safeParse({ ...valid, lat: '23.7461' }).success).toBe(false);
  });

  it('rejects a missing active flag', () => {
    const { isActive, ...withoutFlag } = valid;
    expect(isActive).toBe(true);
    expect(stationEntrySchema.safeParse(withoutFlag).success).toBe(false);
  });

  it('accepts every station in the shipped dataset', () => {
    for (const station of STATIONS) {
      expect(stationEntrySchema.safeParse(station).success).toBe(true);
    }
  });
});

describe('the hotline entry schema', () => {
  const valid = {
    id: 'hl-women-children',
    name: 'Women & Children Helpline',
    nameBn: 'নারী ও শিশু হেল্পলাইন',
    phone: '109',
    category: 'women_children',
    description: '24/7 support for women and children',
    sortOrder: 0,
    isActive: true,
    lastVerifiedAt: '2026-09-30',
  };

  it('accepts a well-formed entry', () => {
    expect(hotlineEntrySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a null Bangla name and a null description', () => {
    const parsed = hotlineEntrySchema.safeParse({ ...valid, nameBn: null, description: null });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty hotline id', () => {
    expect(hotlineEntrySchema.safeParse({ ...valid, id: '' }).success).toBe(false);
  });

  it('rejects an empty phone number', () => {
    expect(hotlineEntrySchema.safeParse({ ...valid, phone: '' }).success).toBe(false);
  });

  it('rejects a non-numeric sort order', () => {
    expect(hotlineEntrySchema.safeParse({ ...valid, sortOrder: 'first' }).success).toBe(false);
  });

  it('rejects a missing verification date', () => {
    const { lastVerifiedAt, ...withoutDate } = valid;
    expect(lastVerifiedAt).toBe('2026-09-30');
    expect(hotlineEntrySchema.safeParse(withoutDate).success).toBe(false);
  });

  it('accepts every hotline in the shipped dataset', () => {
    for (const hotline of HOTLINES) {
      expect(hotlineEntrySchema.safeParse(hotline).success).toBe(true);
    }
  });
});

describe('curated reference data', () => {
  it('carries a version stamp', () => {
    expect(REFERENCE_DATA_VERSION).toMatch(/^\d{4}-Q[1-4]$/);
  });

  it('ships stations and hotlines', () => {
    expect(STATIONS.length).toBeGreaterThan(0);
    expect(HOTLINES.length).toBeGreaterThan(0);
  });

  it('has no duplicate station or hotline ids', () => {
    const stationIds = STATIONS.map((station) => station.id);
    const hotlineIds = HOTLINES.map((hotline) => hotline.id);
    expect(new Set(stationIds).size).toBe(stationIds.length);
    expect(new Set(hotlineIds).size).toBe(hotlineIds.length);
  });

  it('keeps every station inside Bangladesh', () => {
    for (const station of STATIONS) {
      expect(station.lat).toBeGreaterThanOrEqual(20.5);
      expect(station.lat).toBeLessThanOrEqual(26.7);
      expect(station.lng).toBeGreaterThanOrEqual(87.5);
      expect(station.lng).toBeLessThanOrEqual(92.7);
    }
  });

  it('stores hotline numbers as digits only', () => {
    for (const hotline of HOTLINES) {
      expect(hotline.phone).toMatch(/^\d+$/);
    }
  });

  it('sorts hotlines by their display order', () => {
    const orders = HOTLINES.map((hotline) => hotline.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('locked emergency numbers (PRD A-7)', () => {
  it('locks Police to 999', () => {
    expect(EMERGENCY_NUMBERS.police).toBe('999');
  });

  it('locks Medical to 999', () => {
    expect(EMERGENCY_NUMBERS.medical).toBe('999');
  });

  it('locks Fire to 102 — not 999 and not 16123', () => {
    expect(EMERGENCY_NUMBERS.fire).toBe('102');
  });

  it('routes the station fallback to 999', () => {
    expect(SEEK_FALLBACK_NUMBER).toBe('999');
  });
});

describe('the More Help sheet', () => {
  it('keeps the four dialled rows from the prototype', () => {
    expect(MORE_HELP_ROWS.map((row) => row.phone)).toEqual(['109', '333', '999', '16116']);
  });

  it('points every row at a hotline that exists in the dataset', () => {
    for (const row of MORE_HELP_ROWS) {
      expect(findHotline(row.id)).toBeDefined();
    }
  });
});

describe('station lookup', () => {
  it('finds a station by its curated slug', () => {
    const station = findStation('st-dhanmondi-police');
    expect(station?.nameBn).toBe('ধানমন্ডি থানা');
  });

  it('returns undefined for an unknown slug', () => {
    expect(findStation('st-does-not-exist')).toBeUndefined();
  });
});

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(23.7461, 90.3774, 23.7461, 90.3774)).toBeCloseTo(0, 5);
  });

  it('matches a known Dhaka distance within 1%', () => {
    // Dhanmondi → Mirpur is roughly 7 km.
    const distance = distanceKm(23.7461, 90.3774, 23.8042, 90.4027);
    expect(distance).toBeGreaterThan(6);
    expect(distance).toBeLessThan(8);
  });

  it('is symmetric', () => {
    const forward = distanceKm(23.7461, 90.3774, 23.8042, 90.4027);
    const backward = distanceKm(23.8042, 90.4027, 23.7461, 90.3774);
    expect(forward).toBeCloseTo(backward, 6);
  });
});

describe('stationsWithin', () => {
  it('finds the Dhanmondi station from Dhanmondi', () => {
    const nearby = stationsWithin(23.7461, 90.3774, 10);
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby[0]?.id).toBe('st-dhanmondi-police');
  });

  it('returns nothing far away, so the 999 fallback applies', () => {
    expect(stationsWithin(21.5, 88.0, 10)).toHaveLength(0);
  });

  it('orders the results nearest first', () => {
    const nearby = stationsWithin(23.7461, 90.3774, 10);
    const distances = nearby.map((station) => station.distanceKm);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('excludes retired stations', () => {
    for (const station of stationsWithin(23.8, 90.4, 50)) {
      expect(station.isActive).toBe(true);
    }
  });
});
