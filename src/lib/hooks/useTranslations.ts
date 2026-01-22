'use client'

import { useState, useEffect, useCallback } from 'react'
import { loadTranslations, loadTranslationsSync, t, formatDate, type Locale } from '@/lib/i18n'

type TranslationParams = Record<string, string | number>

/**
 * Hook for loading and using translations with locale-specific date formatting
 */
export function useTranslations(locale: Locale) {
  // Preload synchronously for first render so placeholders don't flash
  const [translations, setTranslations] = useState<Record<string, unknown>>(() => loadTranslationsSync(locale))
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

  const translate = useCallback(
    (key: string, params: TranslationParams = {}): string => {
      return t(translations, key, params)
    },
    [translations]
  )

  const formatDateForLocale = useCallback(
    (date: Date): string => {
      return formatDate(date, locale)
    },
    [locale]
  )

  return {
    t: translate,
    formatDate: formatDateForLocale,
    translations,
    isLoading,
    locale
  }
} 