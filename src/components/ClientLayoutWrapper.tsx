'use client'

import { ReactNode } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { useState, useEffect } from 'react'
import { getLocaleCookie } from '@/lib/localeUtils'
import { I18nProvider } from "@/lib/contexts/i18n"
import { GlobalContext } from "@/lib/contexts"
import { Nav } from '@/components/ui/nav'
import { Footer } from '@/components/Footer'
import { Toaster } from '@/components/ui/sonner'
import { AuthWrapper } from '@/components/auth-wrapper'
import { AuthToast } from '@/components/auth-toast'
import { AppContent } from '@/components/app-content'

interface ClientLayoutWrapperProps {
  children: ReactNode
  locale: string
}

export default function ClientLayoutWrapper({ children, locale }: ClientLayoutWrapperProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [value, setValue, removeValue] = useLocalStorage('theme', 'light')
  const [globalContext, setGlobalContext] = useState({ theme: 'light', session: { user: {} } })
  const [isClient, setIsClient] = useState(false)

  // Check if cookie locale differs from URL locale and redirect if needed
  useEffect(() => {
    const cookieLocale = getLocaleCookie()
    if (cookieLocale && cookieLocale !== locale) {
      const currentPath = window.location.pathname
      const newPath = currentPath.replace(`/${locale}`, `/${cookieLocale}`)
      window.location.pathname = newPath
    }
  }, [locale])

  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
      setValue('dark')
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
      setValue('light')
    }
  }

  // Set client flag on mount
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Update theme from localStorage once client is ready
  useEffect(() => {
    if (isClient && value) {
      setGlobalContext(prev => ({ ...prev, theme: value }))
      setIsLoading(false)
    }
  }, [isClient, value])

  return (
    <I18nProvider locale={locale}>
      <AuthWrapper isLoading={isLoading}>
        <GlobalContext.Provider value={{ ...globalContext, setGlobalContext }}>
          <Nav subHeader="" onThemeChange={handleThemeChange} />
          <article className="p-2 md:p-8"> 
              <AppContent>{children}</AppContent>
          </article>
          <Footer />
          <AuthToast />
        </GlobalContext.Provider>
      </AuthWrapper>
      <Toaster />
    </I18nProvider>
  )
}
