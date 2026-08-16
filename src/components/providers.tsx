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
import { defaultLocale } from '@/app/constants'
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
  const [dayData, setDayDataState] = useState<Record<string, any>>({})
  const [globalContext, setGlobalContext] = useState({
    theme: 'light',
    session: { user: {} },
    revealRedacted: false,
    selectedDate: undefined as Date | undefined,
    setSelectedDate: (_date: Date | undefined) => { void _date },
    isNavigating: false,
    setIsNavigating: (_isNavigating: boolean) => { void _isNavigating },
    dayData: {} as Record<string, any>,
    setDayData: (_date: string, _data: any) => { void _date; void _data },
  })

  const setDayData = useCallback((date: string, data: any) => {
    setDayDataState(prev => ({ ...prev, [date]: data }))
  }, [])
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
          <GlobalContext.Provider value={{ ...globalContext, setGlobalContext, selectedDate, setSelectedDate, isNavigating, setIsNavigating, dayData: dayData, setDayData }}>
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
