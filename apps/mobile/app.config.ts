import type { ConfigContext, ExpoConfig } from 'expo/config'
import appJson from './app.json'
import withCertPinning from './plugins/withCertPinning'

/**
 * The dynamic Expo config.
 *
 * `app.json` stays the readable, committed base — every value that does not
 * depend on the build environment lives there. This file adds only what must
 * be resolved at build time:
 *
 *   * the EAS project id, so `eas build` never needs an interactive login
 *   * the Android `versionCode`, so a sideloaded APK can be upgraded in place
 *     (there is no store to arbitrate versions)
 *   * the certificate-pinning plugin, which writes the Android
 *     network-security config at prebuild time
 *
 * The **service-role key is never an EAS env var**. The moment it was named
 * `EXPO_PUBLIC_*` it would be inlined into the JS bundle; the key is confined
 * to the Edge Functions and CI (`docs/operations/secrets.md`).
 */

const EAS_PROJECT_ID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

export default function withConfig(config: ConfigContext): ExpoConfig {
  const easProjectId = process.env.EAS_PROJECT_ID || EAS_PROJECT_ID_PLACEHOLDER
  const versionCode = Number.parseInt(process.env.APP_VERSION_CODE || '1', 10)

  // `app.json` is the committed base. It is typed as a literal object, so the
  // `extra` bag is read defensively — the key is optional and may be absent
  // from the base until a build profile needs it.
  const base = appJson.expo as ExpoConfig

  return {
    ...(config.config as ExpoConfig),
    ...base,
    android: {
      ...base.android,
      package: 'com.nagarshield.app',
      versionCode: Number.isFinite(versionCode) ? versionCode : 1,
    },
    extra: {
      ...base.extra,
      eas: {
        projectId: easProjectId,
      },
      // TEMPORARY (phone session): a dev client — Expo Go — reads
      // `process.env.EXPO_PUBLIC_*` from the manifest's `extra` bag at
      // runtime, not from the transform-time inline (which only happens in
      // production builds). Without these the app resolves no URL at all.
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
    plugins: [...(base.plugins ?? []), withCertPinning],
  } as ExpoConfig
}
