import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { MAP_MARKER_CAP, capMarkers, type StationMarker } from './StationMap'

/**
 * The theme is stubbed out.
 *
 * The wrapper imports `useTheme`, and the theme provider pulls in
 * AsyncStorage — a native module that needs its own mock under Jest. The
 * marker cap has nothing to do with the theme, so the module is replaced
 * rather than configuring a global setup file for one suite.
 */
jest.mock('../theme', () => ({
  useTheme: () => ({
    colors: { surface: { white: '#FFFFFF' }, ink: { 100: '#EEEEEE' } },
    palette: { violet: { 600: '#6B4EFF' }, sky: { 600: '#0EA5E9' } },
  }),
}))

/**
 * The shared map wrapper.
 *
 * `006-alerts / 008-history-map` (FR-SEEK-4).
 *
 * The rule this file protects: **one wrapper, no fork.** The History map and
 * the Find-a-station map share one component, because forking is how the OSM
 * attribution gets silently dropped from one of them — and the attribution is
 * a condition of using the public OSM tile servers.
 *
 * The wrapper is not rendered here. `@maplibre/maplibre-react-native` needs a
 * native module that is absent under Jest, so the screen-level assertions are
 * made over the source text instead. What *is* exercised as a real function is
 * `capMarkers`, which is the marker cap the story's AC #4 asks for.
 */

const APP_ROOT = join(__dirname, '..', '..', '..')

const CENTER = { lat: 23.8103, lng: 90.4125 }

function marker(id: string, lat: number, lng: number): StationMarker {
  return { id, lat, lng, title: id, onPress: () => undefined }
}

/** Every source file under the app root's `app/` and `src/`. */
function collectSourceFiles(): string[] {
  const files: string[] = []
  const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.expo', 'coverage'])

  const walk = (directory: string) => {
    let entries: string[]
    try {
      entries = readdirSync(directory)
    } catch {
      return
    }

    for (const entry of entries) {
      if (ignored.has(entry)) continue

      const absolute = join(directory, entry)
      let stats
      try {
        stats = statSync(absolute)
      } catch {
        continue
      }

      if (stats.isDirectory()) {
        walk(absolute)
        continue
      }

      const path = relative(APP_ROOT, absolute).split(sep).join('/')
      if (path.endsWith('.ts') || path.endsWith('.tsx')) files.push(path)
    }
  }

  walk(join(APP_ROOT, 'app'))
  walk(join(APP_ROOT, 'src'))

  return files
}

const sourceFiles = collectSourceFiles()

describe('the marker cap', () => {
  it('is documented at 150 markers', () => {
    expect(MAP_MARKER_CAP).toBe(150)
  })

  it('leaves a small marker set untouched', () => {
    const markers = [marker('a', 23.81, 90.41), marker('b', 23.82, 90.42)]

    expect(capMarkers(markers, CENTER)).toEqual(markers)
  })

  it('leaves a set exactly at the cap untouched', () => {
    const markers = Array.from({ length: MAP_MARKER_CAP }, (_, index) =>
      marker(`m${index}`, CENTER.lat + index * 0.0001, CENTER.lng),
    )

    expect(capMarkers(markers, CENTER)).toHaveLength(MAP_MARKER_CAP)
  })

  it('caps a dense set, so the map never freezes', () => {
    const markers = Array.from({ length: 500 }, (_, index) =>
      marker(`m${index}`, CENTER.lat + index * 0.0001, CENTER.lng),
    )

    expect(capMarkers(markers, CENTER)).toHaveLength(MAP_MARKER_CAP)
  })

  it('keeps the markers nearest the centre, not the newest', () => {
    // The marker nearest the centre is the *last* one in the list. A cap that
    // took the first N would keep the ones the user is not looking at.
    const markers = [
      marker('far-1', CENTER.lat + 0.5, CENTER.lng),
      marker('far-2', CENTER.lat + 0.6, CENTER.lng),
      marker('near', CENTER.lat + 0.0001, CENTER.lng),
    ]

    const capped = capMarkers(markers, CENTER, 1)

    expect(capped.map((entry) => entry.id)).toEqual(['near'])
  })

  it('places a surviving marker at its true coordinate, never at an approximation', () => {
    // The cap is a *selection* heuristic — a cheap planar distance is enough
    // to choose which markers to keep, but the marker itself stays put.
    const markers = [marker('a', 23.9, 90.5), marker('b', 23.81031, 90.41251)]

    const capped = capMarkers(markers, CENTER, 1)

    expect(capped[0]?.lat).toBe(23.81031)
    expect(capped[0]?.lng).toBe(90.41251)
  })

  it('does not mutate the caller array', () => {
    const markers = Array.from({ length: 300 }, (_, index) =>
      marker(`m${index}`, CENTER.lat + index * 0.0001, CENTER.lng),
    )
    const before = markers.map((entry) => entry.id)

    capMarkers(markers, CENTER)

    expect(markers.map((entry) => entry.id)).toEqual(before)
  })
})

describe('the map is one shared component', () => {
  it('reads the attribution from the wrapper itself', () => {
    const wrapper = readFileSync(join(__dirname, 'StationMap.tsx'), 'utf8')

    // The attribution is a condition of using any tile provider, so it cannot
    // be opt-in — a consumer that forgets it is the defect. The default comes
    // from the one tile-source module.
    expect(wrapper).toContain('attribution = TILE_ATTRIBUTION')

    const source = readFileSync(join(__dirname, 'tileSource.ts'), 'utf8')
    expect(source).toContain('© OpenStreetMap contributors')
  })

  it('has exactly one map wrapper and one map style in the app', () => {
    const wrappers = sourceFiles.filter((path) => /StationMap\.tsx$/.test(path))
    const localMaps = sourceFiles.filter(
      (path) =>
        /Map\.tsx$/.test(path) &&
        !path.endsWith('shared/ui/StationMap.tsx') &&
        !path.includes('.test.'),
    )

    expect(wrappers).toEqual(['src/shared/ui/StationMap.tsx'])
    // A second map component is a fork, and a fork is how the attribution gets
    // dropped from one of the two surfaces.
    expect(localMaps).toEqual([])
  })

  it('reads its tiles from the one tile-source module and hardcodes no tile URL', () => {
    // The public OSM servers block applications, so the source is a single,
    // configurable module. A tile URL written anywhere else would be a second
    // source that ignores the setting.
    const withTileUrl = sourceFiles.filter((path) => {
      if (path.includes('.test.')) return false
      const code = readFileSync(join(APP_ROOT, path), 'utf8')
      return /https:\/\/[^'"`\s]*\{z\}[^'"`\s]*/.test(code)
    })

    // There is no default provider, so no tile URL is written out anywhere:
    // the URL comes from `EXPO_PUBLIC_MAP_TILE_URL` via `tileSource.ts`.
    expect(withTileUrl).toEqual([])

    const wrapper = readFileSync(join(__dirname, 'StationMap.tsx'), 'utf8')
    expect(wrapper).toContain('TILE_URL_TEMPLATE')
  })

  it('is consumed by the History map, not a local copy', () => {
    const historyMap = readFileSync(join(APP_ROOT, 'app', '(app)', 'history-map.tsx'), 'utf8')

    expect(historyMap).toContain('StationMap')
    expect(historyMap).not.toMatch(/from\s+['"]@maplibre\//)
  })
})
