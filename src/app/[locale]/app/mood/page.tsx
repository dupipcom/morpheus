'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import { useAuth } from '@clerk/nextjs';

import Link from 'next/link'

import { GlobalContext } from "@/lib/contexts"

import { MoodView } from "@/views/moodView"
import { ViewMenu } from "@/components/viewMenu"
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'
import { useI18n } from "@/lib/contexts/i18n"

export default function LocalizedMood({ params }: { params: { locale: string } }) {
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

  const session = {
    user: {}
  }

  return (
    <main className="min-h-[100vh]">
      <ViewMenu active="mood" />
      <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">{t('mood.title', { date: formatDate(new Date()) })}</h1>
      <p className="text-center scroll-m-20 text-lg font-semibold tracking-tight mb-8">{t('mood.subtitle')}</p>
      <MoodView />
    </main>
  )
} 