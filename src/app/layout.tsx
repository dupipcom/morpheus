'use client'
import { useState } from 'react'
import type { Metadata } from "next"
import { Comfortaa } from "next/font/google"
import { SessionProvider } from "next-auth/react"

import { Nav, Globals } from '@dreampipcom/oneiros'

import "./globals.css"

import "@dreampipcom/oneiros/styles"


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
  const [globalContext, setGlobalContext] = useState({ theme: "light" })

  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
    }
  }

  return (
    <html lang="en">
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <head>
        <title>DreamPip · Fintech for compassion</title>
        <meta name="title" content="DreamPip · Fintech for compassion" />
        <meta name="description" content="DreamPip is fintech for compassion." />
        <meta name="keywords" content="mental health, fintech, atomic habits, game" />
        <meta name="robots" content="index, follow" />
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="language" content="English" />
        <meta name="revisit-after" content="7 days" />
        <meta name="author" content="DreamPip" />
        <meta property="og:image" content="https://www.dreampip.com/images/logo-social.jpg" />
      </head>
      <body
        className={`${comfortaa.variable} antialiased`}
      >
        
        <Globals theme={globalContext.theme}>
        <SessionProvider>
          <Nav className="z-[999]" onThemeChange={handleThemeChange} />
          {children}
        </SessionProvider>
      </Globals>
        <footer>
            <div className={`${ globalContext.theme == "dark" ? "bg-[#3e365c] text-[#f1cfff]" : "bg-[#f1cfff] text-[#3e365c]" } flex w-full 
              flex-col items-start p-8 py-32 `}>
              <small>
                © 2012—Present DreamPip
              </small>
              <a href="/terms" className="text-sm">Terms of Service</a>
              <a href="/privacy" className="text-sm">Privacy Policy</a>
            </div>
          </footer>
      </body>
    </html>
  );
}
