'use client'

import { ReactNode } from 'react'
import { I18nProvider } from "@/lib/contexts/i18n"
import { GlobalContext } from "@/lib/contexts"
import { Nav } from '@/components/ui/nav'
import { Footer } from '@/components/Footer'
import { Toaster } from '@/components/ui/sonner'
import { AuthWrapper } from '@/components/auth-wrapper'
import { AuthTracker } from '@/components/auth-tracker'
import { AuthToast } from '@/components/auth-toast'
import { Skeleton } from "@/components/ui/skeleton"

import { useLocalStorage } from 'usehooks-ts'
import { useState, useEffect } from 'react'
import { getLocaleCookie } from '@/lib/localeUtils'

interface LocalizedLayoutProps {
  children: ReactNode
  params: { locale: string }
}

export default function LocalizedLayout({ children, params }: LocalizedLayoutProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [value, setValue, removeValue] = useLocalStorage('theme', 'light')
  const [globalContext, setGlobalContext] = useState({ theme: value, session: { user: {} } })
  const signedIn = !!(globalContext?.session?.user as any)?.settings

  // Check if cookie locale differs from URL locale and redirect if needed
  useEffect(() => {
    const cookieLocale = getLocaleCookie()
    if (cookieLocale && cookieLocale !== params.locale) {
      const currentPath = window.location.pathname
      const newPath = currentPath.replace(`/${params.locale}`, `/${cookieLocale}`)
      window.location.pathname = newPath
    }
  }, [params.locale])

  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
      setValue('dark')
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
      setValue('light')
    }
  }

  useEffect(() => {
    setGlobalContext({ ...globalContext, theme: value })
    if (!!value) setIsLoading(false)
  }, [value])

  return (
    <I18nProvider locale={params.locale}>
      <AuthWrapper isLoading={isLoading}>
        <GlobalContext.Provider value={{ ...globalContext, setGlobalContext }}>
          <Nav subHeader="" onThemeChange={handleThemeChange} />
          <article className="p-2 md:p-8">
            {!isLoading ? undefined : <Skeleton className="bg-muted h-[75vh] w-full z-[999]" />}
            <div className={`${!isLoading ? "block" : "hidden"}`}>
              {(!signedIn || isLoading) ? children : <AuthTracker>
                {children}
              </AuthTracker>}
            </div>
          </article>
          <Footer />
          <AuthToast />
        </GlobalContext.Provider>
      </AuthWrapper>
      <Toaster />
    </I18nProvider>
  )
} 