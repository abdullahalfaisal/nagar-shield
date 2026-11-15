jest.mock('@/shared/api/supabase', () => ({ supabase: { rpc: jest.fn() } }))

import { formatAddressLine, formatCoordinatesShort, parseReverseGeocode } from './geocode'

describe('parseReverseGeocode', () => {
  it('reads the levels from `area_hierarchy`, the shape the RPC returns', () => {
    // What `reverse_geocode` answers for 23.7806, 90.4066 on the local stack.
    const result = parseReverseGeocode(
      {
        source: 'local',
        area_hierarchy: {
          city: 'Dhaka',
          thana: 'Gulshan',
          division: 'Dhaka',
          neighborhood: 'Gulshan',
        },
      },
      23.7806,
      90.4066,
      12,
    )

    expect(result).toMatchObject({
      division: 'Dhaka',
      city: 'Dhaka',
      thana: 'Gulshan',
      neighborhood: 'Gulshan',
      source: 'local',
    })
    // The card had nothing to show before; now it names the place.
    expect(formatAddressLine(result)).toBe('Gulshan, Dhaka')
  })

  it('still reads a flat row', () => {
    const result = parseReverseGeocode(
      { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' },
      1,
      2,
      null,
    )
    expect(formatAddressLine(result)).toBe('Mirpur, Dhaka')
  })

  it('gives empty levels, never invented ones, when the RPC knows nothing', () => {
    const result = parseReverseGeocode({ source: 'unknown', area_hierarchy: null }, 1, 2, null)
    expect(formatAddressLine(result)).toBe('')
    expect(result.source).toBe('unknown')
  })
})

describe('formatCoordinatesShort', () => {
  it('prints three decimals and no hemisphere letters', () => {
    expect(formatCoordinatesShort(23.74612, 90.37421)).toBe('23.746, 90.374')
  })

  it('keeps the sign of a southern or western point', () => {
    expect(formatCoordinatesShort(-1.2346, -70.9876)).toBe('-1.235, -70.988')
  })

  it('uses Bangla digits in Bangla', () => {
    expect(formatCoordinatesShort(23.74612, 90.37421, 'bn')).toBe('২৩.৭৪৬, ৯০.৩৭৪')
  })
})
