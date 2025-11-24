'use client'

import { ReactNode, useState, useEffect, useMemo, useCallback } from 'react'
import { shadcn } from '@clerk/themes'
import {
  ClerkProvider,
} from '@clerk/nextjs'

import { GlobalContext } from "@/lib/contexts"
import { I18nProvider } from "@/lib/contexts/i18n"
import { NotesRefreshProvider } from "@/lib/contexts/notesRefresh"
import { AuthWrapper } from '@/components/authWrapper'
import { AuthToast } from '@/components/authToast'
import { LocaleSuggestionToast } from '@/components/localeSuggestionToast'
import { getLocaleFromPath } from '@/app/helpers'
import { defaultLocale } from '@/app/constants'
import { getLocaleCookie } from '@/lib/localeUtils'
import { getClerkLocalization } from '@/lib/clerkLocalization'
import { SWRConfig } from 'swr'
import { useLocalStorage } from 'usehooks-ts'

interface ProvidersProps {
  children: ReactNode
  locale?: string
}

export function Providers({ children, locale: providedLocale }: ProvidersProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [value] = useLocalStorage('theme', 'light')
  const [redactedValue] = useLocalStorage('dpip_redacted', 0)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isNavigating, setIsNavigating] = useState(false)
  const [globalContext, setGlobalContext] = useState({ 
    theme: 'light', 
    session: { user: {} }, 
    taskLists: [] as any[], 
    refreshTaskLists: async () => {},
    templates: [] as any[],
    refreshTemplates: async () => {},
    revealRedacted: false,
    selectedDate: undefined as Date | undefined,
    setSelectedDate: (date: Date | undefined) => {},
    isNavigating: false,
    setIsNavigating: (isNavigating: boolean) => {}
  })
  const [isClient, setIsClient] = useState(false)
  const [providerKey, setProviderKey] = useState(0)

  // Use provided locale or fallback to default
  // The locale prop should be reactive from the parent component
  const locale = providedLocale || defaultLocale

  // Memoize Clerk localization to prevent unnecessary re-renders
  const clerkLocalization = useMemo(() => getClerkLocalization(locale), [locale])

  // Set client flag on mount
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Listen for cookie clearing events to re-render provider
  useEffect(() => {
    const handleCookiesCleared = () => {
      setProviderKey(prev => prev + 1)
    }

    window.addEventListener('dpip:cookiesCleared', handleCookiesCleared)
    return () => {
      window.removeEventListener('dpip:cookiesCleared', handleCookiesCleared)
    }
  }, [])

  // Update theme and revealRedacted from localStorage once client is ready
  useEffect(() => {
    if (isClient) {
      setGlobalContext(prev => ({ 
        ...prev, 
        theme: value || 'light',
        revealRedacted: redactedValue === 1
      }))
      setIsLoading(false)
    }
  }, [isClient, value, redactedValue])

  const refreshTaskLists = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/tasklists')
      if (!res.ok) {
        // Don't clear existing task lists on error - preserve them
        console.warn('Failed to refresh task lists:', res.status)
        return
      }
      const data = await res.json()
      setGlobalContext(prev => ({ ...prev, taskLists: Array.isArray(data?.taskLists) ? data.taskLists : [] }))
    } catch (error) {
      // Don't clear existing task lists on error - preserve them
      console.warn('Error refreshing task lists:', error)
    }
  }, [])

  const refreshTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/templates')
      if (!res.ok) {
        // Don't clear existing templates on error - preserve them
        console.warn('Failed to refresh templates:', res.status)
        return
      }
      const data = await res.json()
      setGlobalContext(prev => ({ ...prev, templates: Array.isArray(data?.templates) ? data.templates : [] }))
    } catch (error) {
      // Don't clear existing templates on error - preserve them
      console.warn('Error refreshing templates:', error)
    }
  }, [])

  // Fetch tasklists and templates once on mount
  useEffect(() => {
    if (isClient) {
      refreshTaskLists()
      refreshTemplates()
    }
  }, [isClient, refreshTaskLists, refreshTemplates])

  return (
    <ClerkProvider 
      key={providerKey}
      redirectUrl="/app/dashboard" 
      appearance={{
        cssLayerName: 'clerk',
        baseTheme: shadcn,
      }}
      localization={clerkLocalization}
    >
      <AuthWrapper isLoading={isLoading}>
        <I18nProvider locale={locale}>
          <GlobalContext.Provider value={{ ...globalContext, setGlobalContext, refreshTaskLists, refreshTemplates, selectedDate, setSelectedDate, isNavigating, setIsNavigating }}>
            <NotesRefreshProvider>
              <SWRConfig value={{
                revalidateOnFocus: false,
                revalidateOnReconnect: false,
                shouldRetryOnError: false,
                dedupingInterval: 15000,
              }}>
                {children}
                <AuthToast />
                <LocaleSuggestionToast />
              </SWRConfig>
            </NotesRefreshProvider>
          </GlobalContext.Provider>
        </I18nProvider>
      </AuthWrapper>
    </ClerkProvider>
  )
}

