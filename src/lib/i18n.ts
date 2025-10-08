import { locales, defaultLocale } from '@/app/constants'

export type Locale = typeof locales[number]

// Load translations for a specific locale
export async function loadTranslations(locale: Locale) {
  try {
    const translations = await import(`@/locales/${locale}.json`)
    return translations.default || translations
  } catch (error) {
    console.warn(`Failed to load translations for locale: ${locale}`, error)
    // Fallback to default locale
    if (locale !== defaultLocale) {
      return loadTranslations(defaultLocale)
    }
    return {}
  }
}

// Synchronous loader for server-side or first render hydration
export function loadTranslationsSync(locale: Locale) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const translations = require(`@/locales/${locale}.json`)
    return translations.default || translations
  } catch (error) {
    console.warn(`Failed to synchronously load translations for locale: ${locale}`, error)
    if (locale !== defaultLocale) {
      return loadTranslationsSync(defaultLocale)
    }
    return {}
  }
}

// Get nested translation value using dot notation (e.g., "common.day")
export function getTranslationValue(translations: any, key: string): string {
  return key.split('.').reduce((obj, k) => obj?.[k], translations) || key
}

// Format translation with parameters
export function formatTranslation(
  translation: string,
  params: Record<string, string | number> = {}
): string {
  return translation.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key]?.toString() || match
  })
}

// Get translation with formatting
export function t(
  translations: any,
  key: string,
  params: Record<string, string | number> = {}
): string {
  const translation = getTranslationValue(translations, key)
  return formatTranslation(translation, params)
}

// Validate if a locale is supported
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale)
}

// Get the best matching locale from browser preferences
export function getBestLocale(acceptLanguage: string): Locale {
  const languages = acceptLanguage
    .split(',')
    .map((lang: string) => lang.split(';')[0].trim())
    .filter((lang: string) => lang.length > 0)

  for (const lang of languages) {
    // Try exact match
    if (isValidLocale(lang)) {
      return lang as Locale
    }
    
    // Try language code match (e.g., "en-US" -> "en")
    const langCode = lang.split('-')[0]
    if (isValidLocale(langCode)) {
      return langCode as Locale
    }
  }

  return defaultLocale
}

// Format date according to locale
export function formatDate(date: Date, locale: Locale): string {
  const localeMap: Record<Locale, string> = {
    'en': 'en-US',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'it': 'it-IT',
    'de': 'de-DE',
    'pt': 'pt-BR',
    'ar': 'ar-SA',
    'bn': 'bn-BD',
    'ca': 'ca-ES',
    'cs': 'cs-CZ',
    'da': 'da-DK',
    'el': 'el-GR',
    'et': 'et-EE',
    'eu': 'eu-ES',
    'fi': 'fi-FI',
    'gl': 'gl-ES',
    'he': 'he-IL',
    'hi': 'hi-IN',
    'hu': 'hu-HU',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'ms': 'ms-MY',
    'nl': 'nl-NL',
    'pa': 'pa-IN',
    'pl': 'pl-PL',
    'ro': 'ro-RO',
    'ru': 'ru-RU',
    'sv': 'sv-SE',
    'tr': 'tr-TR',
    'zh': 'zh-CN'
  }

  const browserLocale = localeMap[locale] || 'en-US'
  
  return date.toLocaleString(browserLocale, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric"
  })
} 