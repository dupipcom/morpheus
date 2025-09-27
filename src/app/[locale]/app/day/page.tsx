'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import prisma from "@/lib/prisma";
import { useAuth } from '@clerk/nextjs';

import Link from 'next/link'

import { TaskView } from "@/views/taskView"
import { ViewMenu } from "@/components/viewMenu"
import { Button } from "@/components/ui/button"

import { getWeekNumber } from "@/app/helpers"
import { DAILY_ACTIONS, WEEKS } from "@/app/constants"

import { GlobalContext } from "@/lib/contexts"
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'
import { useI18n } from "@/lib/contexts/i18n"

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;
export const dynamic = "force-dynamic"

export default function LocalizedDay({ params }: { params: Promise<{ locale: string }> }) {
  const { session, setGlobalContext } = useContext(GlobalContext)
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

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const actions = ((session?.user as any)?.entries && (session?.user as any)?.entries[year] && (session?.user as any)?.entries[year][weekNumber] && (session?.user as any)?.entries[year][weekNumber].days[date] && (session?.user as any)?.entries[year][weekNumber].days[date].tasks) || DAILY_ACTIONS

  const flatDays = Object.values(WEEKS).flatMap((week: any) => week.days).reduce((acc: any, week: any) => {
    acc = {...acc, ...week}
    return acc
  }, {})

  return (
    <main className="min-h-[100vh]">
      <ViewMenu active="day" />

      <div className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">
        <label>{t('dashboard.todayIs', { date: formatDate(new Date()) })}</label>
      </div>
      <TaskView actions={actions} />
    </main>
  )
} 