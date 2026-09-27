import i18next, { type TFunction } from 'i18next';

import de from './locales/de.js';
import en from './locales/en.js';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof de;
    };
  }
}

export type SupportedLanguage = 'de' | 'en';
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['de', 'en'];
/** Each language's own name for itself — shown as-is in a language picker, never run through t(). */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = { de: 'Deutsch', en: 'English' };
const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

function isSupported(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

/**
 * Guesses the user's language from the OS locale, falling back to English.
 * `Intl` already resolves this cross-platform (Windows/macOS/Linux) without
 * digging through $LANG/$LC_ALL — those aren't always set anyway (e.g. in
 * containers), and Node ships full ICU by default since v13.
 */
export function detectLanguage(): SupportedLanguage {
  try {
    const primary = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).language;
    return isSupported(primary) ? primary : FALLBACK_LANGUAGE;
  } catch {
    return FALLBACK_LANGUAGE;
  }
}

/**
 * Initializes (first call) or switches (later calls) the active language.
 * Resources are plain in-memory objects, not files loaded from disk at
 * runtime — unlike a filesystem-backed i18next setup, that survives tsup
 * bundling untouched (see banner.ts's figlet font for the same lesson).
 */
export function initI18n(language: SupportedLanguage): Promise<TFunction> {
  return i18next.isInitialized
    ? i18next.changeLanguage(language)
    : i18next.init({
        lng: language,
        fallbackLng: FALLBACK_LANGUAGE,
        resources: { de: { translation: de }, en: { translation: en } },
        // Everything here renders to a terminal, not HTML — escaping would
        // corrupt e.g. a track name containing "&" or "<" on screen.
        interpolation: { escapeValue: false },
      });
}

export const t: TFunction = i18next.t.bind(i18next);

/** The active language's primary subtag (`i18next.language` can be a full tag like "de-DE"). */
export function currentLanguage(): SupportedLanguage {
  const primary = i18next.language?.split('-')[0] ?? '';
  return isSupported(primary) ? primary : FALLBACK_LANGUAGE;
}

/** `Intl`-compatible locale tag matching the active language, for date/number formatting. */
export function localeTag(): string {
  return currentLanguage() === 'de' ? 'de-DE' : 'en-US';
}
