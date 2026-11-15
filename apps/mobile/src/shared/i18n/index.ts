import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import * as Localization from 'expo-localization'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_LOCALE } from '@nagar-shield/shared'
import { bn } from './bn'
import { en } from './en'

const STORAGE_KEY = 'nagar-shield.locale'

function detectLocale(): 'bn' | 'en' {
  try {
    const tag = Localization.getLocales()[0]?.languageCode
    if (tag === 'bn') return 'bn'
    if (tag === 'en') return 'en'
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_LOCALE
}

export const resources = {
  bn: { translation: bn },
  en: { translation: en },
} as const

export type SupportedLocale = keyof typeof resources

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/** A number, or a string that is only a number (`12`, `3.4`, `04:05`). */
const NUMERIC = /^[+-]?[\d.,:/ ]*\d[\d.,:/ ]*$/

/**
 * Every number put into a sentence follows the sentence's language.
 *
 * The copy is written per language, but the counts, minutes and distances
 * interpolated into it were printed in ASCII, so a Bangla sentence read
 * "ধাপ 2 / 4" or "4 মিনিট". Only numbers and number-only strings are changed;
 * a name that contains a digit ("Road 10") is left as it is.
 */
export function formatInterpolation(value: unknown, _format?: string, lng?: string): string {
  // Anything that is not a number is handed back untouched, as i18next's own
  // default formatter does; the cast only satisfies its declared return type.
  if (lng !== 'bn') return value as string
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || !NUMERIC.test(text)) return value as string
  return text.replace(/\d/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit)
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(),
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'translation',
  interpolation: { escapeValue: false, alwaysFormat: true, format: formatInterpolation },
  returnNull: false,
  initImmediate: true,
})

/**
 * Persisted locale override. The Settings screen calls `setLocale`; the
 * detected device locale is used until the user picks one.
 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale)
  await AsyncStorage.setItem(STORAGE_KEY, locale)
}

export async function loadStoredLocale(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    if (stored === 'bn' || stored === 'en') {
      await i18n.changeLanguage(stored)
    }
  } catch {
    // Keep the detected locale.
  }
}

export default i18n
