import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'
import { useCurrentFix } from '@/shared/services/location'
import { useReverseGeocode } from '@/shared/api/geocode'
import type { AreaChip } from '@/shared/ui/AreaChipRow'

/**
 * The area filter chip list.
 *
 * ## The list is data, not code
 *
 * The story is explicit:
 *
 * > **Given** the chip list is built, **When** its source is inspected, **Then**
 * > the chips are **data-driven from `area_hierarchy`** — the list is derived
 * > from the resolved area hierarchy (the prototype's five chips being the
 * > seeded instance), and no chip label is a hardcoded literal in the
 * > component
 *
 * The prototype's five chips — **All BD**, **My division**, **My city**,
 * **Mirpur**, **Dhanmondi** — are the *seeded instance* of that list, not the
 * list itself. A hardcoded array in the component means a new area is a code
 * change and a change to two files at once; the story wants it to be a data
 * change.
 *
 * The source is the **`area_lookup`** table — the server's curated area
 * reference — which is publicly readable (`area_lookup_select_all` uses
 * `using (true)`). The chip's label is the area's **English** name, because
 * the chip is a filter control and the prototype's chips are the English
 * thana names.
 *
 * ## The filter and the chip are one thing
 *
 * `resolveAreaFilter` is the **single mapping function** from a chip to the
 * RPC's area parameters. The chip row and the Home search bar feed the same
 * function and the same `alerts_feed` parameters, so a narrowed feed can
 * never be produced by a second, divergent mapping.
 *
 * The `alerts_feed` RPC matches **each level independently, by equality** —
 * `area_hierarchy ->> 'thana' = p_thana` and so on — and a `null` parameter
 * matches everything at that level. So a chip's payload carries the levels
 * **above** the one it names: a chip for a thana sends its division and city
 * too, because a bare thana would match a thana of the same name in another
 * division.
 */

/** The area levels the `alerts_feed` RPC accepts. */
export interface AreaFilter {
  division?: string
  city?: string
  thana?: string
  neighborhood?: string
}

/** One row of the `area_lookup` reference table. */
export interface AreaLookupRow {
  id: string
  name: string
  name_bn: string
  division: string
  city: string
  thana: string
  neighborhood: string | null
}

/**
 * The reference areas the chip row offers.
 *
 * Ordered by the hierarchy — division, then city, then thana — so the row
 * reads top-down the way the country is organised, and so two runs produce
 * the same order. The order is a **database** decision here: the query asks
 * for `division, city, thana` and the rows come back grouped.
 */
export async function fetchAreaLookup(): Promise<AreaLookupRow[]> {
  const { data, error } = await supabase
    .from('area_lookup')
    .select('id, name, name_bn, division, city, thana, neighborhood')
    .order('division', { ascending: true })
    .order('city', { ascending: true })
    .order('thana', { ascending: true })

  if (error) throw fromSupabaseError(error)

  return (data ?? []) as AreaLookupRow[]
}

export function useAreaLookup(): UseQueryResult<AreaLookupRow[], Error> {
  return useQuery({
    queryKey: ['area-lookup'],
    queryFn: fetchAreaLookup,
    // The reference table changes on a quarterly refresh — the same cadence as
    // the station list. It is cached for the session.
    staleTime: 15 * 60_000,
    retry: 0,
  })
}

/**
 * The chip row's list.
 *
 * The row is **All BD**, then the **location-derived** chips, then the
 * reference areas. The location chips come first because they are the ones
 * the story's own edge-case table is about — with no fix they are disabled and
 * visibly marked, and the feed still serves All BD.
 *
 * The **thana** level is what the chips filter on. A `neighborhood` chip would
 * be a different control — the story says the chip row is the prototype's
 * five-chip visual contract and the search bar is the neighbourhood
 * autocomplete, and *"they are not merged into one control."*
 */
export function buildAreaChips(options: {
  /** The area the current fix resolved to, or `null` when there is no fix. */
  currentArea: AreaFilter | null
  /** The labels — `All BD`, `My division`, `My city`. */
  labels: { all: string; division: string; city: string }
  /** The reference areas the chip row offers. */
  areas: AreaLookupRow[]
}): AreaChip[] {
  const chips: AreaChip[] = [{ id: 'all', label: options.labels.all, value: null }]

  const current = options.currentArea

  // **My division** and **My city** need a fix. With no fix they are
  // **disabled** — the story is explicit: "the chip is disabled or visibly
  // marked unavailable, no `division` / `city` parameter is sent, and the feed
  // keeps the previous result set instead of filtering to an empty area."
  chips.push({
    id: 'division',
    label: options.labels.division,
    value: current?.division ? { division: current.division } : null,
    disabled: !current?.division,
  })

  chips.push({
    id: 'city',
    label: options.labels.city,
    value: current?.city ? { division: current.division, city: current.city } : null,
    disabled: !current?.city,
  })

  for (const area of options.areas) {
    chips.push({
      id: `area:${area.id}`,
      label: area.name,
      value: {
        division: area.division,
        city: area.city,
        thana: area.thana,
        ...(area.neighborhood ? { neighborhood: area.neighborhood } : {}),
      },
    })
  }

  return chips
}

/**
 * The area parameters a chip sends to `alerts_feed`.
 *
 * This is the **single mapping function** — the story names it
 * `resolveAreaFilter`. Both the chip row and the Home search bar feed it, so
 * the two can never disagree about what a selection means.
 *
 * A **disabled** chip resolves to **no filter at all**. That is the whole
 * point of disabling it: an unavailable chip sends nothing, so the feed keeps
 * the result set it had. Returning a partial filter here would narrow the
 * feed to an area the user never chose.
 */
export function resolveAreaFilter(chip: Pick<AreaChip, 'value' | 'disabled'>): AreaFilter {
  if (chip.disabled) return {}
  if (!chip.value) return {}
  return chip.value
}

/**
 * The chip the row starts on.
 *
 * **All BD** on every launch — the story says Phase 1 *"keeps **All BD** as
 * the default on every launch"* and the last selection is never persisted.
 */
export const DEFAULT_AREA_CHIP_ID = 'all'

/**
 * The chip row, ready to render.
 *
 * This is the **one** place the row is built, and both feed screens call it —
 * the Home feed block and the Alerts screen. Two screens building their own
 * lists is how they came to disagree.
 *
 * ## The fix is taken just-in-time, and the feed does not depend on it
 *
 * The story says it plainly:
 *
 * > *"My division" / "My city" need a fix. … The fix is requested just-in-time
 * > (never at app open, never on the panic path) and the feed must not
 * > **depend** on it — with no fix, the two location-derived chips are
 * > unavailable and the feed still serves All BD.*
 *
 * So the fix is **requested when the feed screen opens** — not at app open,
 * and never on the panic path — and the row renders either way. With no fix
 * the two location chips are **disabled**, the feed serves All BD, and
 * nothing is blocked waiting for a permission dialog.
 */
export function useAreaChips(
  allLabel: string,
  divisionLabel: string,
  cityLabel: string,
): AreaChip[] {
  const { data: areas } = useAreaLookup()
  const { state: fixState } = useCurrentFix()

  const lat = fixState.status === 'ready' ? fixState.fix.lat : null
  const lng = fixState.status === 'ready' ? fixState.fix.lng : null
  const accuracyM = fixState.status === 'ready' ? fixState.fix.accuracyM : null

  const { data: geocode } = useReverseGeocode(lat, lng, accuracyM)

  return useMemo(() => {
    // The current area is only real when the geocode **named** something.
    // A degraded geocode returns empty strings, and an empty division would
    // make the "My division" chip look available while sending a filter that
    // matches nothing.
    const currentArea =
      geocode && geocode.division.trim().length > 0
        ? { division: geocode.division, city: geocode.city }
        : null

    return buildAreaChips({
      currentArea,
      labels: { all: allLabel, division: divisionLabel, city: cityLabel },
      areas: areas ?? [],
    })
  }, [areas, geocode, allLabel, divisionLabel, cityLabel])
}
