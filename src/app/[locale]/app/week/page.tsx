'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import { useAuth } from '@clerk/nextjs';

import Link from 'next/link'

import { GlobalContext } from "@/lib/contexts"

import { TaskView } from "@/views/taskView"
import { ViewMenu } from "@/components/viewMenu"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/contexts/i18n"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, WEEKS } from "@/app/constants"
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'

export default function LocalizedWeek({ params }: { params: { locale: string } }) {
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

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const Weeks = () => 
      Object.values(WEEKS).map((week) => {
        return <div className="flex flex-col text-center m-2">
          <small>${week.earnings}</small>
          <label>{t('week.weekNumber', { number: week.week })}</label>
          <small>{week.startDay} {t('week.to')} {week.endDay}</small>
          <Button>{t('week.closeWeek')}</Button>
        </div>
  })

  return (
    <main className="min-h-[100vh]">
      <ViewMenu active="week" />
      <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">{t('week.weekNumber', { number: weekNumber })}</h1>
      <p className="text-center scroll-m-20 text-lg font-semibold tracking-tight mb-8">What did you accomplish this week?</p>

      <TaskView timeframe="week" actions={WEEKLY_ACTIONS} />
    </main>
  )
} 