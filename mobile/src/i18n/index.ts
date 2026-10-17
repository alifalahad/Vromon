/**
 * i18next setup. English is the source language; Bangla falls back to English
 * for keys it doesn't have yet. The language follows the device until the user
 * picks one in Settings.
 */

import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { LANGUAGES, usePreferences, type Language } from '../features/preferences/store';
import bn from './bn.json';
import en from './en.json';

export function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return LANGUAGES.includes(code as Language) ? (code as Language) : 'en';
}

export function resolveLanguage(choice: Language | null): Language {
  return choice ?? deviceLanguage();
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: resolveLanguage(usePreferences.getState().language),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Keep i18next in sync with the persisted choice (including after rehydration).
usePreferences.subscribe((state, prev) => {
  if (state.language !== prev.language) i18n.changeLanguage(resolveLanguage(state.language));
});

export default i18n;
