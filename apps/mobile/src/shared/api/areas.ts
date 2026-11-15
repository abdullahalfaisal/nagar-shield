import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'

/** One area a citizen can choose on the Capture screen. */
export interface AreaOption {
  id: string
  name: string
  nameBn: string
  thana: string
  city: string
  /** The area's centre, used when a report is filed by area instead of by GPS. */
  lat: number
  lng: number
}

interface AreaRow {
  id: string
  name: string
  name_bn: string
  thana: string
  city: string
  centroid: { coordinates?: [number, number] } | null
}

/**
 * Maps the `area_lookup` rows to options, sorted by their English name.
 *
 * PostgREST returns the PostGIS centroid as GeoJSON — `[lng, lat]` — and a row
 * without a usable centroid is left out rather than placed at `0, 0`.
 */
export function toAreaOptions(rows: AreaRow[]): AreaOption[] {
  return rows
    .flatMap((row) => {
      const [lng, lat] = row.centroid?.coordinates ?? []
      if (typeof lat !== 'number' || typeof lng !== 'number') return []
      return [
        {
          id: row.id,
          name: row.name,
          nameBn: row.name_bn,
          thana: row.thana,
          city: row.city,
          lat,
          lng,
        },
      ]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The reference areas — the same list the server checks a chosen area against. */
export async function fetchAreaOptions(): Promise<AreaOption[]> {
  const { data, error } = await supabase
    .from('area_lookup')
    .select('id, name, name_bn, thana, city, centroid')

  if (error) throw fromSupabaseError(error)

  return toAreaOptions((data ?? []) as unknown as AreaRow[])
}

export function useAreaOptions(): UseQueryResult<AreaOption[], Error> {
  return useQuery({
    queryKey: ['area-options'],
    queryFn: fetchAreaOptions,
    // The list is reference data; it changes with a migration, not a session.
    staleTime: 60 * 60_000,
  })
}

/**
 * The Bangla names of the divisions, which are also the names of their main
 * cities. `area_lookup` names areas, not divisions, so these are kept here.
 */
const DIVISION_NAMES_BN: Record<string, string> = {
  Barishal: 'বরিশাল',
  Barisal: 'বরিশাল',
  Chattogram: 'চট্টগ্রাম',
  Chittagong: 'চট্টগ্রাম',
  Dhaka: 'ঢাকা',
  Khulna: 'খুলনা',
  Mymensingh: 'ময়মনসিংহ',
  Rajshahi: 'রাজশাহী',
  Rangpur: 'রংপুর',
  Sylhet: 'সিলেট',
}

/**
 * Turns a place name the server stored in English into the app's language.
 *
 * Reports store their area in English (`area_hierarchy`), so a Bangla screen
 * used to show "Mirpur" in the middle of Bangla copy. The Bangla name comes
 * from the same `area_lookup` list the area picker reads, matched on the area
 * or thana name; a name the list does not know is shown as it was stored,
 * rather than guessed.
 */
export function areaNameTranslator(
  options: readonly AreaOption[] | undefined,
  language: string,
): (name: string) => string {
  if (language !== 'bn') return (name) => name

  const byName = new Map<string, string>(Object.entries(DIVISION_NAMES_BN))
  for (const option of options ?? []) {
    byName.set(option.name, option.nameBn)
    if (!byName.has(option.thana)) byName.set(option.thana, option.nameBn)
  }

  return (name) => byName.get(name.trim()) ?? name
}

/** {@link areaNameTranslator} for the current language, from the cached area list. */
export function useAreaName(): (name: string) => string {
  const { i18n } = useTranslation()
  const { data } = useAreaOptions()
  return useMemo(() => areaNameTranslator(data, i18n.language), [data, i18n.language])
}

/** An area's name in the app's language. */
export function areaOptionName(option: AreaOption, language: string): string {
  return language === 'bn' ? option.nameBn : option.name
}
