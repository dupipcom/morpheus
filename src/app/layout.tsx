'use client'
import { useState, useEffect } from 'react'
import type { Metadata } from "next"
import { shadcn } from '@clerk/themes'

import { GlobalContext } from "@/lib/contexts"

import { Comfortaa } from "next/font/google"

import {
  ClerkProvider,
} from '@clerk/nextjs'

import { Nav } from '@/components/ui/nav'

import "./globals.css"

import { useLocalStorage } from 'usehooks-ts';

import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from '@/components/ui/sonner'
import { AuthWrapper } from '@/components/auth-wrapper'
import { AuthTracker } from '@/components/auth-tracker'


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
        
        <ClerkProvider forceRedirectUrl="/app/dashboard" appearance={{
        cssLayerName: 'clerk',
        baseTheme: shadcn,
        }}>
          <AuthWrapper isLoading={isLoading}>
            <GlobalContext.Provider value={{ ...globalContext, setGlobalContext }}>
              <Nav subHeader="" onThemeChange={handleThemeChange} />
              <article className="p-2 md:p-8">
                {!isLoading ? undefined : <Skeleton className="bg-muted h-[75vh] w-full z-[999]" />}
                <div className={`${!isLoading ? "block" : "hidden"}`}>
                  {!signedIn ? children : <AuthTracker>
                    {children}
                  </AuthTracker>}
                </div>
              </article>
            </GlobalContext.Provider>
          </AuthWrapper>
        </ClerkProvider>
        <Toaster />
        <footer className="mt-8 md:mt-32 p-2">
            <div className={`m-auto max-w-[1200px] grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 text-[12px] flex w-full flex-col items-start p-2 pb-16 place-items-center`}>
              <small className="mb-4">
                © 2012—Present Purizu and Remotelys dba DreamPip
                <br />IVA IT02925300903 
                <br />REA 572763 
                <br />CNPJ 37.553.462/0001-46
                <br /><br />
              </small>
              <div className="text-foreground">
                <div className="rounded bg-accent dark:text-muted mb-2 flex overflow-hidden max-h-[32px] w-[128px]">
                  <img src="/images/brazil.webp" className="w-[32px] object-cover" />
                  <small className="p-2 text-[8px] font-bold">LGPD Compliant</small>
                </div>
                <div className="rounded bg-accent dark:text-muted mb-2 flex overflow-hidden max-h-[32px] w-[128px]">
                  <img src="/images/europe.png" className="w-[32px] object-cover" />
                  <small className="p-2 text-[8px] font-bold">GDPR Compliant</small>
                </div>
                <div className="rounded bg-accent dark:text-muted mb-8 flex overflow-hidden max-h-[32px] w-[128px]">
                  <img src="/images/europe.png" className="w-[32px] object-cover" />
                  <small className="p-2 text-[8px] font-bold">DORA Ready</small>
                </div>
              </div>
              <div className="flex flex-col">
                              <small className="">Insights are AI generated via RAG and prompt engineering.
              <br /><br />We use cookies, and by using this app you agree to it.<br /><br /></small>
              <a href="/code" className=""><small>Code</small></a>              
              <a href="/terms" className=""><small>Terms of Service</small></a>
              <a href="/privacy" className=""><small>Privacy Policy</small></a>
            </div>
            </div>
          </footer>
      </body>
      )}

    </html>
  );
}
