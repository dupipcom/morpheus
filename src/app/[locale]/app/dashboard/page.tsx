'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import '@mux/mux-video';
import { useAuth } from '@clerk/nextjs';

import Link from 'next/link'

import { GlobalContext } from "@/lib/contexts"
import { AnalyticsView } from "@/views/analyticsView"
import { ViewMenu } from "@/components/viewMenu"
import { PublishNote } from '@/components/publish-note'
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'
import { useI18n } from "@/lib/contexts/i18n"

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;
export const dynamic = "force-dynamic"

export default function LocalizedDashboard({ params }: { params: Promise<{ locale: string }> }) {
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
      <ViewMenu active="feel" />
      <div className="w-full max-w-[1200px] m-auto px-4 sticky top-[120px] z-50">
        <PublishNote />
      </div>
      <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center my-8">{formatDate(new Date())}</h1>
      <h2 className="text-center scroll-m-20 text-lg font-semibold tracking-tight">{t('dashboard.title')}</h2>

      <AnalyticsView />
    </main>
  )
} 