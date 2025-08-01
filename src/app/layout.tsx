'use client'
import { useState } from 'react'
import type { Metadata } from "next"
import { Comfortaa } from "next/font/google"
import { SessionProvider } from "next-auth/react"

import { Nav, Globals } from '@dreampipcom/oneiros'

import "@dreampipcom/oneiros/styles"
import "./globals.css"

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
      <body
        className={`${comfortaa.variable} antialiased`}
      >
        
        <Globals theme={globalContext.theme}>
        <Nav onThemeChange={handleThemeChange} />
        <SessionProvider>
          {children}
        </SessionProvider>
      </Globals>
        <footer>
            <div className="flex w-full flex-center 
              flex-col justify-center p-a2 bg-[#f1cfff]">
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
