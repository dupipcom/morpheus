'use client'
import { useState, useEffect, useMemo, useContext, useRef } from 'react'
import type { Metadata } from "next"
import { usePathname } from 'next/navigation'

import { Comfortaa } from "next/font/google"

import { Nav } from '@/components/ui/nav'
import { Footer } from '@/components/footer'
import { BottomNav } from '@/components/bottomNav'
import { Providers } from '@/components/providers'

import "./globals.css"

import { useLocalStorage } from 'usehooks-ts';

import { Toaster } from '@/components/ui/sonner'
import { AppContent } from '@/components/appContent'
import { getLocaleFromPath } from './helpers'
import { defaultLocale } from './constants'
import { getLocaleCookie } from '@/lib/localeUtils'
import { GlobalContext } from '@/lib/contexts'
import { Skeleton } from '@/components/ui/skeleton'


const comfortaa = Comfortaa({
  variable: "--font-comforta",
  subsets: ["latin"],
});

// export const metadata: Metadata = {
//   title: "Dupip",
//   description: "Fintech for compassion.",
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [value, setValue] = useLocalStorage('theme', 'light');
  const [isClient, setIsClient] = useState(false)
  const pathname = usePathname()
  
  // Get locale from URL path, cookie, or default - reactive to pathname changes
  const locale = useMemo(() => {
    if (typeof window === 'undefined') return defaultLocale
    
    const cookieLocale = getLocaleCookie()
    const pathLocale = getLocaleFromPath(pathname || window.location.pathname)
    
    if (cookieLocale && cookieLocale !== pathLocale) {
      // If cookie locale differs from path locale, redirect to cookie locale
      if (pathLocale && pathLocale !== cookieLocale) {
        const currentPath = pathname || window.location.pathname
        const newPath = currentPath.replace(`/${pathLocale}`, `/${cookieLocale}`)
        window.location.pathname = newPath
        return cookieLocale
      }
    }
    return pathLocale || cookieLocale || defaultLocale
  }, [pathname])

  // Set client flag on mount
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Get theme from GlobalContext for theme change handler
  const handleThemeChange = () => {
    const newTheme = value === 'light' ? 'dark' : 'light'
    setValue(newTheme)
    // The GlobalContext will be updated by the Providers component
  }

  // Wrapper component to show navigation skeleton
  function NavigationSkeletonWrapper({ children }: { children: React.ReactNode }) {
    const { isNavigating, setIsNavigating } = useContext(GlobalContext)
    const currentPathname = usePathname()
    const previousPathnameRef = useRef<string>(currentPathname)
    
    // Track navigation completion by watching pathname changes
    useEffect(() => {
      if (isNavigating && currentPathname !== previousPathnameRef.current) {
        // Navigation completed - pathname changed
        setIsNavigating(false)
        previousPathnameRef.current = currentPathname
      } else if (!isNavigating) {
        // Update ref when not navigating to keep it in sync
        previousPathnameRef.current = currentPathname
      }
    }, [currentPathname, isNavigating, setIsNavigating])
    
    // Safety timeout: reset navigation state after 3 seconds if it hasn't been reset
    // This handles cases where pathname doesn't change or navigation fails
    useEffect(() => {
      if (isNavigating) {
        const timeout = setTimeout(() => {
          setIsNavigating(false)
        }, 3000)
        
        return () => clearTimeout(timeout)
      }
    }, [isNavigating, setIsNavigating])
    
    if (isNavigating) {
      return (
        <>
          <article className="">
            <div className="pb-[130px]">
              <Nav subHeader="" onThemeChange={handleThemeChange} />
              <div className="p-4 md:p-8 space-y-4">
                <Skeleton className="h-8 w-64 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-8" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              </div>
              <Footer />
            </div>
          </article>
          <BottomNav />
          <Toaster />
        </>
      )
    }
    
    return <>{children}</>
  }

  return (
    <html lang="en" className="notranslate">
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <body
        suppressHydrationWarning
        className={`${comfortaa.variable} ${isClient ? value : 'light'}`}
      >
        <Providers locale={locale}>
          <NavigationSkeletonWrapper>
          <article className="">
            <div className="pb-[130px]">
              <Nav subHeader="" onThemeChange={handleThemeChange} />
              <AppContent>{children}</AppContent>
              <Footer />
            </div>
          </article>
          <BottomNav />
          <Toaster />
          </NavigationSkeletonWrapper>
        </Providers>
      </body>
    </html>
  );
}
