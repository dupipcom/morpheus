'use client'
import { useState, useEffect } from 'react'
import type { Metadata } from "next"
import { shadcn } from '@clerk/themes'

import { GlobalContext } from "@/lib/contexts"
import { I18nProvider } from "@/lib/contexts/i18n"
import { ContentLoadingWrapper } from "@/components/ContentLoadingWrapper"

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
import { AuthTracker } from '@/components/auth-tracker'
import { AuthToast } from '@/components/auth-toast'
import { getLocaleFromPath } from './helpers'
import { defaultLocale } from './constants'
import { getLocaleCookie } from '@/lib/localeUtils'


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
  const [globalContext, setGlobalContext] = useState({ theme: value, session: { user: {} } })
  const signedIn = !!(globalContext?.session?.user as any)?.settings
  
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

  // Check if current path is a localized route
  const isLocalizedRoute = typeof window !== 'undefined' 
    ? window.location.pathname.startsWith('/' + locale + '/')
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

  useEffect(() => {
    setGlobalContext({ ...globalContext, theme: value })
    if (!!value) setIsLoading(false)
  }, [value])

  return (
    <html lang="en" className="notranslate">
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <head>
        <title>DreamPip · Fintech for compassion</title>
        <meta name="title" content="DreamPip · Fintech for compassion" />
        <meta name="description" content="DreamPip is fintech for compassion." />
        <meta name="keywords" content="mental health, fintech, atomic habits, game" />
        <meta name="robots" content="index, follow" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="language" content="English" />
        <meta name="revisit-after" content="7 days" />
        <meta name="author" content="DreamPip" />
        <meta property="og:image" content="https://www.dreampip.com/images/logo-social.jpg" />
      </head>
      { isLoading ? <body><Skeleton /> </body>: (

              <body
        suppressHydrationWarning
        className={`${comfortaa.variable} ${value}`}
      >
        
        <ClerkProvider redirectUrl="/app/dashboard" appearance={{
        cssLayerName: 'clerk',
        baseTheme: shadcn,
        }}>
          <AuthWrapper isLoading={isLoading}>
            <I18nProvider locale={locale}>
              <GlobalContext.Provider value={{ ...globalContext, setGlobalContext }}>
                {!isLocalizedRoute && <Nav subHeader="" onThemeChange={handleThemeChange} />}
                <ContentLoadingWrapper>
                  <article className="p-2 md:p-8">
                    {!isLoading ? undefined : <Skeleton className="bg-muted h-[75vh] w-full z-[999]" />}
                    <div className={`${!isLoading ? "block" : "hidden"}`}>
                      {(!signedIn || isLoading) ? children : <AuthTracker>
                        {children}
                      </AuthTracker>}
                    </div>
                  </article>
                </ContentLoadingWrapper>
                {!isLocalizedRoute && <Footer />}
                <AuthToast />
              </GlobalContext.Provider>
            </I18nProvider>
          </AuthWrapper>
        </ClerkProvider>
        <Toaster />
      </body>
      )}

    </html>
  );
}
