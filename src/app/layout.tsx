'use client'
import { useState, useEffect } from 'react'
import type { Metadata } from "next"
import { shadcn } from '@clerk/themes'

import { GlobalContext } from "@/lib/contexts"
import { I18nProvider } from "@/lib/contexts/i18n"


import { Comfortaa } from "next/font/google"

import {
  ClerkProvider,
} from '@clerk/nextjs'

import { Nav } from '@/components/ui/nav'
import { Footer } from '@/components/Footer'

import "./globals.css"

import { useLocalStorage } from 'usehooks-ts';

import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from '@/components/ui/sonner'
import { AuthWrapper } from '@/components/auth-wrapper'
import { AuthToast } from '@/components/auth-toast'
import { AppContent } from '@/components/app-content'
import { getLocaleFromPath } from './helpers'
import { defaultLocale } from './constants'
import { getLocaleCookie } from '@/lib/localeUtils'
import { getClerkLocalization } from '@/lib/clerkLocalization'
import { SWRConfig } from 'swr'


const comfortaa = Comfortaa({
  variable: "--font-comforta",
  subsets: ["latin"],
});

// export const metadata: Metadata = {
//   title: "DreamPip",
//   description: "Fintech for compassion.",
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isLoading, setIsLoading] = useState(true);
  const [value, setValue, removeValue] = useLocalStorage('theme', 'light');
  const [globalContext, setGlobalContext] = useState({ theme: 'light', session: { user: {} } })
  const [isClient, setIsClient] = useState(false)
  
  // Get locale from URL path, cookie, or default
  const locale = typeof window !== 'undefined' 
    ? (() => {
        const cookieLocale = getLocaleCookie()
        if (cookieLocale && cookieLocale !== getLocaleFromPath(window.location.pathname)) {
          // If cookie locale differs from path locale, redirect to cookie locale
          const currentPath = window.location.pathname
          const pathLocale = getLocaleFromPath(currentPath)
          if (pathLocale && pathLocale !== cookieLocale) {
            const newPath = currentPath.replace(`/${pathLocale}`, `/${cookieLocale}`)
            window.location.pathname = newPath
            return cookieLocale
          }
        }
        return getLocaleFromPath(window.location.pathname) || cookieLocale || defaultLocale
      })()
    : defaultLocale

  // Check if current path is a localized route (any path starting with /locale/)
  const isLocalizedRoute = typeof window !== 'undefined' 
    ? window.location.pathname.match(/^\/([a-z]{2})(\/|$)/) !== null
    : false

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

  // removed debug log

  // Update theme from localStorage once client is ready
  useEffect(() => {
    if (isClient && value) {
      setGlobalContext(prev => ({ ...prev, theme: value }))
      setIsLoading(false)
    }
  }, [isClient, value])

  return (
    <html lang="en" className="notranslate">
      <meta name="viewport" content="width=device-width, initial-scale=1" />

              <body
        suppressHydrationWarning
        className={`${comfortaa.variable} ${isClient ? value : 'light'}`}
      >
        
        <ClerkProvider 
          forceRedirectUrl="/app/dashboard" 
          appearance={{
            cssLayerName: 'clerk',
            baseTheme: shadcn,
          }}
          localization={getClerkLocalization(locale)}
        >
          <AuthWrapper isLoading={isLoading}>
            <I18nProvider locale={locale}>
              <GlobalContext.Provider value={{ ...globalContext, setGlobalContext }}>

                <SWRConfig value={{
                  revalidateOnFocus: false,
                  revalidateOnReconnect: false,
                  shouldRetryOnError: false,
                  dedupingInterval: 15000,
                }}>
                  <article className="">
                    <div>
                      <Nav subHeader="" onThemeChange={handleThemeChange} />
                      <AppContent>{children}</AppContent>
                      <Footer />
                    </div>
                  </article>
                </SWRConfig>
                <AuthToast />
              </GlobalContext.Provider>
            </I18nProvider>
          </AuthWrapper>
        </ClerkProvider>
        <Toaster />
      </body>

    </html>
  );
}
