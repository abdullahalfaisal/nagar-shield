import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Expo app config points at files that exist.
 *
 * ## The defect this pins
 *
 * `app.json` referenced two assets that were **never in the repository**:
 *
 * > ```json
 * > "splash": { "image": "./assets/splash.png" }
 * > "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png" }
 * > ```
 *
 * The files in `assets/` are `splash-icon.png` and
 * `android-icon-foreground.png`. The names had drifted apart, and the config
 * was never corrected — from the baseline commit onwards.
 *
 * The failure is quiet in development and loud in production. The Expo CLI
 * prints:
 *
 * > `Unable to resolve asset "./assets/adaptive-icon.png"`
 *
 * and carries on, because a dev client does not need a launcher icon. But an
 * EAS build resolves these paths for real: the splash screen and the adaptive
 * icon are **native resources**, so the build either fails or ships an app
 * with no icon at all. Nothing in the test suite noticed, because nothing
 * looked.
 *
 * So the config is checked against the filesystem. Every asset path it names
 * must exist.
 *
 * ## The check is not vacuous
 *
 * A guard that cannot fail guards nothing. So the file carries a **positive
 * control**: a path that is deliberately wrong must be reported as missing by
 * the same function the real check uses.
 */

/** The app root — two levels up from `src/__tests__/`. */
const APP_ROOT = join(__dirname, '..', '..')

interface ExpoConfig {
  expo?: {
    icon?: string
    splash?: { image?: string }
    android?: { adaptiveIcon?: { foregroundImage?: string; backgroundImage?: string } }
  }
}

function readConfig(): ExpoConfig {
  return JSON.parse(readFileSync(join(APP_ROOT, 'app.json'), 'utf8')) as ExpoConfig
}

/**
 * Every asset path the config names, with the label it was named under.
 *
 * The paths are relative to the app root, so they are resolved against it.
 */
function assetPaths(config: ExpoConfig): Array<{ label: string; path: string }> {
  const paths: Array<{ label: string; path: string }> = []
  const expo = config.expo ?? {}

  if (expo.icon) paths.push({ label: 'icon', path: expo.icon })
  if (expo.splash?.image) paths.push({ label: 'splash.image', path: expo.splash.image })
  if (expo.android?.adaptiveIcon?.foregroundImage) {
    paths.push({
      label: 'android.adaptiveIcon.foregroundImage',
      path: expo.android.adaptiveIcon.foregroundImage,
    })
  }
  if (expo.android?.adaptiveIcon?.backgroundImage) {
    paths.push({
      label: 'android.adaptiveIcon.backgroundImage',
      path: expo.android.adaptiveIcon.backgroundImage,
    })
  }

  return paths
}

/** The paths that do not resolve to a file. */
function missing(config: ExpoConfig): string[] {
  return assetPaths(config)
    .filter((entry) => !existsSync(join(APP_ROOT, entry.path)))
    .map((entry) => `${entry.label} -> ${entry.path}`)
}

describe('the app config names only assets that exist', () => {
  it('reports no missing asset', () => {
    expect(missing(readConfig())).toEqual([])
  })

  it('names at least one asset, so the check is not vacuous', () => {
    // If the config named no assets, "no missing asset" would be true for the
    // wrong reason. This pins that the check has something to check.
    expect(assetPaths(readConfig()).length).toBeGreaterThan(0)
  })

  it('detects a missing asset — the positive control', () => {
    // The same function, against a config that deliberately names a file
    // which does not exist. If this passes silently, the check is blind.
    const broken: ExpoConfig = {
      expo: { icon: './assets/definitely-not-here.png' },
    }

    expect(missing(broken)).toEqual(['icon -> ./assets/definitely-not-here.png'])
  })

  it('names the splash image that is in the repository', () => {
    // The file is `splash-icon.png`. The config said `splash.png`.
    expect(readConfig().expo?.splash?.image).toBe('./assets/splash-icon.png')
    expect(existsSync(join(APP_ROOT, './assets/splash-icon.png'))).toBe(true)
  })

  it('names the adaptive icon that is in the repository', () => {
    // The file is `android-icon-foreground.png`. The config said
    // `adaptive-icon.png`.
    expect(readConfig().expo?.android?.adaptiveIcon?.foregroundImage).toBe(
      './assets/android-icon-foreground.png',
    )
    expect(existsSync(join(APP_ROOT, './assets/android-icon-foreground.png'))).toBe(true)
  })
})

describe('the dynamic config keeps the static config', () => {
  it('does not drop the asset paths when it adds the EAS project id', () => {
    // `app.config.ts` spreads `app.json` over the CLI's config. If it ever
    // stopped spreading the `expo` key, the assets would silently vanish
    // again — and the check above would pass, because `app.json` would still
    // be correct.
    const source = readFileSync(join(APP_ROOT, 'app.config.ts'), 'utf8')

    expect(source).toContain('...base')
    expect(source).toContain('base.extra')
  })
})
