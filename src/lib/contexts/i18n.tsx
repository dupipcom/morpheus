'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useTranslations } from '@/lib/hooks/useTranslations'
import { type Locale } from '@/lib/i18n'

interface I18nContextType {
  t: (key: string, params?: Record<string, string | number>) => string
  formatDate: (date: Date) => string
  locale: Locale
  isLoading: boolean
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

interface I18nProviderProps {
  children: ReactNode
  locale: Locale
}

export function I18nProvider({ children, locale }: I18nProviderProps) {
  const { t, formatDate, isLoading } = useTranslations(locale)

  return (
    <I18nContext.Provider value={{ t, formatDate, locale, isLoading }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
} 