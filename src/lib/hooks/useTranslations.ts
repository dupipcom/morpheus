'use client'

import { useState, useEffect } from 'react'
import { loadTranslations, loadTranslationsSync, t, formatDate, type Locale } from '@/lib/i18n'

export function useTranslations(locale: Locale) {
  // Preload synchronously for first render so placeholders don't flash
  const [translations, setTranslations] = useState<any>(() => loadTranslationsSync(locale))
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    async function loadTranslationsForLocale() {
      setIsLoading(true)
      try {
        const loadedTranslations = await loadTranslations(locale)
        setTranslations(loadedTranslations)
      } catch (error) {
        console.error('Failed to load translations:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadTranslationsForLocale()
  }, [locale])

  const translate = (key: string, params: Record<string, string | number> = {}) => {
    return t(translations, key, params)
  }

  const formatDateForLocale = (date: Date) => {
    return formatDate(date, locale)
  }

  return {
    t: translate,
    formatDate: formatDateForLocale,
    translations,
    isLoading,
    locale
  }
} 