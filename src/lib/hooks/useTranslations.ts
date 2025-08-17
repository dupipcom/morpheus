'use client'

import { useState, useEffect } from 'react'
import { loadTranslations, t, formatDate, type Locale } from '@/lib/i18n'

export function useTranslations(locale: Locale) {
  const [translations, setTranslations] = useState<any>({})
  const [isLoading, setIsLoading] = useState(true)

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