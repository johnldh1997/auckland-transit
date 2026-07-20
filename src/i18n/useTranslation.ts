import { useSettings } from '../context/SettingsContext';
import { Language } from '../types';
import { translations, TranslationKey } from './translations';

// Pulled out of useTranslation so code that can't call a hook (e.g. the background
// journey-notification task in journeyNotification.ts, which runs outside the React tree)
// can still produce localized text — it reads the persisted language itself instead.
export function translate(language: Language, key: TranslationKey, params?: Record<string, string | number>): string {
  let text: string = translations[language][key] ?? translations.en[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}

export function useTranslation() {
  const { language } = useSettings();
  return function t(key: TranslationKey, params?: Record<string, string | number>): string {
    return translate(language, key, params);
  };
}
