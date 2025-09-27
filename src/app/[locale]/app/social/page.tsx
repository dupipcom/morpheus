'use client'

import React, { useState, useEffect, useContext } from 'react'
import { useAuth } from '@clerk/nextjs'

import { GlobalContext } from "@/lib/contexts"
import { SocialView } from "@/views/socialView"
import { ViewMenu } from "@/components/viewMenu"
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'
import { useI18n } from "@/lib/contexts/i18n"

export default function LocalizedSocial({ params }: { params: Promise<{ locale: string }> }) {
  const [globalContext, setGlobalContext] = useState({
    theme: 'light'
  })
  const { isLoaded, isSignedIn } = useAuth();
  const { t, formatDate } = useI18n();

  // Set login time when user is authenticated
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const loginTime = getLoginTime();
      
      // Set login time if not already set
      if (loginTime === null) {
        setLoginTime();
      }
    }
  }, [isLoaded, isSignedIn]);

  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
    }
  }

  return (
    <main className="">
      <ViewMenu active="social" />
      <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">{formatDate(new Date())}</h1>
      <h2 className="text-center scroll-m-20 text-lg font-semibold tracking-tight">Social</h2>

      <SocialView />
    </main>
  )
} 