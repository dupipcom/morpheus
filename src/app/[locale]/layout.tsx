'use client'

import { ReactNode } from 'react'
import type { Metadata } from 'next'
import { buildMetadata } from '@/app/metadata'
import { I18nProvider } from "@/lib/contexts/i18n"
import { GlobalContext } from "@/lib/contexts"
import { Nav } from '@/components/ui/nav'
import { Footer } from '@/components/Footer'
import { Toaster } from '@/components/ui/sonner'
import { AuthWrapper } from '@/components/auth-wrapper'
import { AuthToast } from '@/components/auth-toast'
import { AppContent } from '@/components/app-content'
import { Skeleton } from "@/components/ui/skeleton"

import { useLocalStorage } from 'usehooks-ts'
import { useState, useEffect } from 'react'
import { getLocaleCookie } from '@/lib/localeUtils'

interface LocalizedLayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export default function LocalizedLayout({ children, params }: LocalizedLayoutProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [value, setValue, removeValue] = useLocalStorage('theme', 'light')
  const [globalContext, setGlobalContext] = useState({ theme: 'light', session: { user: {} } })
  const [isClient, setIsClient] = useState(false)
  const [resolvedParams, setResolvedParams] = useState<{ locale: string } | null>(null)

  // Resolve params promise
  useEffect(() => {
    const resolveParams = async () => {
      const resolved = await params
      setResolvedParams(resolved)
    }
    resolveParams()
  }, [params])

  // Check if cookie locale differs from URL locale and redirect if needed
  useEffect(() => {
    if (!resolvedParams) return
    
    const cookieLocale = getLocaleCookie()
    if (cookieLocale && cookieLocale !== resolvedParams.locale) {
      const currentPath = window.location.pathname
      const newPath = currentPath.replace(`/${resolvedParams.locale}`, `/${cookieLocale}`)
      window.location.pathname = newPath
    }
  }, [resolvedParams])

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

  // Don't render until params are resolved
  if (!resolvedParams) {
    return null
  }

  return (
    <I18nProvider locale={resolvedParams.locale}>
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

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return buildMetadata({ locale })
}