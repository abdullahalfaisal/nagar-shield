import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOCALE } from '@nagar-shield/shared';
import { bn } from './bn';
import { en } from './en';

const STORAGE_KEY = 'nagar-shield.locale';

function detectLocale(): 'bn' | 'en' {
  try {
    const tag = Localization.getLocales()[0]?.languageCode;
    if (tag === 'bn') return 'bn';
    if (tag === 'en') return 'en';
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_LOCALE;
}

export const resources = {
  bn: { translation: bn },
  en: { translation: en },
} as const;

export type SupportedLocale = keyof typeof resources;

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(),
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  returnNull: false,
  initImmediate: true,
});

/**
 * Persisted locale override. The Settings screen calls `setLocale`; the
 * detected device locale is used until the user picks one.
 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  await AsyncStorage.setItem(STORAGE_KEY, locale);
}

export async function loadStoredLocale(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'bn' || stored === 'en') {
      await i18n.changeLanguage(stored);
    }
  } catch {
    // Keep the detected locale.
  }
}

export default i18n;
