jest.mock('@/shared/api/supabase', () => ({ supabase: { from: jest.fn() } }))
// The card module reaches the theme, which reads the saved theme on mount.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}))

import { formatAreaHierarchy } from '@/shared/ui/AlertCard'
import { formatInterpolation } from '@/shared/i18n'
import { formatAddressLine } from './geocode'
import { areaNameTranslator, toAreaOptions, type AreaOption } from './areas'

const point = (lng: number, lat: number) => ({
  type: 'Point',
  coordinates: [lng, lat] as [number, number],
})

describe('toAreaOptions', () => {
  it('reads the GeoJSON centroid as lat / lng and sorts by name', () => {
    const options = toAreaOptions([
      {
        id: 'b',
        name: 'Mirpur',
        name_bn: 'মিরপুর',
        thana: 'Mirpur',
        city: 'Dhaka',
        centroid: point(90.4027, 23.8042),
      },
      {
        id: 'a',
        name: 'Dhanmondi',
        name_bn: 'ধানমন্ডি',
        thana: 'Dhanmondi',
        city: 'Dhaka',
        centroid: point(90.3774, 23.7461),
      },
    ])

    expect(options.map((option) => option.name)).toEqual(['Dhanmondi', 'Mirpur'])
    expect(options[1]).toMatchObject({ id: 'b', nameBn: 'মিরপুর', lat: 23.8042, lng: 90.4027 })
  })

  it('leaves out an area with no usable centroid rather than placing it at 0, 0', () => {
    const options = toAreaOptions([
      { id: 'x', name: 'Nowhere', name_bn: '—', thana: 'X', city: 'Dhaka', centroid: null },
    ])
    expect(options).toEqual([])
  })
})

describe('area names follow the app language', () => {
  const mirpur: AreaOption = {
    id: 'b',
    name: 'Mirpur',
    nameBn: 'মিরপুর',
    thana: 'Mirpur',
    city: 'Dhaka',
    lat: 23.8069,
    lng: 90.3687,
  }

  it('puts a stored English area into Bangla on a Bangla screen', () => {
    const translate = areaNameTranslator([mirpur], 'bn')
    expect(translate('Mirpur')).toBe('মিরপুর')
    expect(translate('Dhaka')).toBe('ঢাকা')
    expect(
      formatAreaHierarchy({ division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' }, translate),
    ).toBe('মিরপুর')
    expect(
      formatAddressLine(
        { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur', neighborhood: 'Mirpur' },
        translate,
      ),
    ).toBe('মিরপুর, ঢাকা')
  })

  it('leaves a name the list does not know as it was stored, rather than guess', () => {
    expect(areaNameTranslator([mirpur], 'bn')('Narsingdi')).toBe('Narsingdi')
  })

  it('changes nothing on an English screen', () => {
    expect(areaNameTranslator([mirpur], 'en')('Mirpur')).toBe('Mirpur')
  })
})

describe('numbers in a sentence follow the app language', () => {
  it('writes a count in Bangla digits on a Bangla screen', () => {
    expect(formatInterpolation(4, undefined, 'bn')).toBe('৪')
    expect(formatInterpolation('04:05', undefined, 'bn')).toBe('০৪:০৫')
  })

  it('leaves a name that contains a digit alone', () => {
    expect(formatInterpolation('Road 10', undefined, 'bn')).toBe('Road 10')
  })

  it('leaves English as it is', () => {
    expect(formatInterpolation(4, undefined, 'en')).toBe(4)
  })
})

describe('formatAreaHierarchy with a place', () => {
  it('puts the place the citizen typed before the area', () => {
    expect(
      formatAreaHierarchy({
        division: 'Dhaka',
        city: 'Dhaka',
        thana: 'Mirpur',
        neighborhood: 'Mirpur',
        place: 'Road 10, near the bus stand',
      }),
    ).toBe('Road 10, near the bus stand, Mirpur')
  })

  it('reads as before when there is no place', () => {
    expect(formatAreaHierarchy({ division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' })).toBe(
      'Mirpur',
    )
  })
})
