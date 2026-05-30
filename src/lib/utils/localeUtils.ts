import { locales } from '@/app/constants'

// Locale display names mapping
export const localeNames: Record<string, string> = {
  'ar': 'العربية', // Arabic
  'bn': 'বাংলা', // Bengali
  'ca': 'Català', // Catalan
  'cs': 'Čeština', // Czech
  'da': 'Dansk', // Danish
  'de': 'Deutsch', // German
  'el': 'Ελληνικά', // Greek
  'en': 'English', // English
  'es': 'Español', // Spanish
  'et': 'Eesti', // Estonian
  'eu': 'Euskara', // Basque
  'fi': 'Suomi', // Finnish
  'fr': 'Français', // French
  'gl': 'Galego', // Galician
  'ha': 'Hausa', // Hausa
  'he': 'עברית', // Hebrew
  'hi': 'हिन्दी', // Hindi
  'hu': 'Magyar', // Hungarian
  'it': 'Italiano', // Italian
  'ja': '日本語', // Japanese
  'ko': '한국어', // Korean
  'ms': 'Bahasa Melayu', // Malay
  'nl': 'Nederlands', // Dutch
  'pa': 'ਪੰਜਾਬੀ', // Punjabi
  'pl': 'Polski', // Polish
  'pt': 'Português', // Portuguese
  'ro': 'Română', // Romanian
  'ru': 'Русский', // Russian
  'sv': 'Svenska', // Swedish
  'sw': 'Kiswahili', // Swahili
  'tr': 'Türkçe', // Turkish
  'yo': 'Yorùbá', // Yoruba
  'zh': '中文', // Chinese
}

// Get locale display name
export function getLocaleName(locale: string): string {
  return localeNames[locale] || locale
}

// Get all available locales with their display names
export function getAvailableLocales() {
  return locales.map(locale => ({
    value: locale,
    label: getLocaleName(locale)
  }))
}

// Cookie management functions
export function setLocaleCookie(locale: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `dpip_user_locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
  }
}

export function getLocaleCookie(): string | null {
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';')
    const localeCookie = cookies.find(cookie => cookie.trim().startsWith('dpip_user_locale='))
    if (localeCookie) {
      return localeCookie.split('=')[1]
    }
  }
  return null
}

// Server-side cookie parsing
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=')
      if (name && value) {
        cookies[name] = value
      }
    })
  }
  
  return cookies
} 