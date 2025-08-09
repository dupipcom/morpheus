'use client'
import { useState, useEffect } from 'react'
import type { Metadata } from "next"

import { GlobalContext } from "@/lib/contexts"

import { Comfortaa } from "next/font/google"

import {
  ClerkProvider,
} from '@clerk/nextjs'

import { Nav } from '@/components/ui/nav'

import "./globals.css"

import { useLocalStorage } from 'usehooks-ts';


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
  const [globalContext, setGlobalContext] = useState({ theme: "light", session: { user: {} } })

  const [value, setValue, removeValue] = useLocalStorage('theme', 0);

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
    setGlobalContext({ ...globalContext, theme: value  === "dark" ? "dark" : "light"})
  }, [])

  return (
    <html lang="en">
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
      <body
        className={`${comfortaa.variable} ${globalContext.theme}`}
      >
        
        <ClerkProvider appearance={{
        cssLayerName: 'clerk',
      }}>
        <GlobalContext.Provider value={{...globalContext, setGlobalContext, theme: value }}>
          <Nav onThemeChange={handleThemeChange} />
          {children}
        </GlobalContext.Provider>
        </ClerkProvider>
        <footer>
            <div className={`flex w-full flex-col items-start p-8 py-32`}>
              <small className="mb-4">
                © 2012—Present DreamPip
                <br /><br />Insights are AI generated via RAG and prompt engineering.
                <br /><br />We use cookies, and by using this site you agree to it.
              </small>
              <a href="/code" className="text-sm"><small>Code</small></a>              
              <a href="/terms" className="text-sm"><small>Terms of Service</small></a>
              <a href="/privacy" className="text-sm"><small>Privacy Policy</small></a>
            </div>
          </footer>
      </body>
    </html>
  );
}
