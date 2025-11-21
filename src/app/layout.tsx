'use client'
import { useState, useEffect, useMemo } from 'react'
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

  return (
    <html lang="en" className="notranslate">
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <body
        suppressHydrationWarning
        className={`${comfortaa.variable} ${isClient ? value : 'light'}`}
      >
        <Providers locale={locale}>
          <article className="">
            <div className="pb-[130px]">
              <Nav subHeader="" onThemeChange={handleThemeChange} />
              <AppContent>{children}</AppContent>
              <Footer />
            </div>
          </article>
          <BottomNav />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
