'use client'

import React, { useState, useEffect, useContext } from 'react'
import { useAuth } from '@clerk/nextjs'

import { GlobalContext } from "@/lib/contexts"
import { BeView } from "@/views/beView"
import { ViewMenu } from "@/components/viewMenu"
import { PublishNote } from '@/components/publishNote'
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'
import { useI18n } from "@/lib/contexts/i18n"

export default function LocalizedSocial({ params }: { params: Promise<{ locale: string }> }) {
  const [globalContext, setGlobalContext] = useState({
    theme: 'light'
  })
  const { isLoaded, isSignedIn } = useAuth();
  const { t } = useI18n();

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
    <main className="relative">
      <div className="w-full max-w-[1200px] m-auto px-4 sticky top-[115px] z-50">
        <PublishNote defaultVisibility="FRIENDS" />
      </div>
      <ViewMenu active="be" />
      <BeView />
    </main>
  )
} 