'use client'

import React, { useRef, useState, useEffect, useContext, useMemo, useCallback } from 'react'
import ReactDOMServer from 'react-dom/server';
import prisma from "@/lib/prisma";
import { useAuth } from '@clerk/nextjs';

import Link from 'next/link'

import { DoView } from "@/views/doView"
import { ViewMenu } from "@/components/viewMenu"
import { Button } from "@/components/ui/button"
import { DoToolbar } from '@/views/doToolbar'

import { getWeekNumber } from "@/app/helpers"
import { DAILY_ACTIONS, WEEKS } from "@/app/constants"

import { GlobalContext } from "@/lib/contexts"
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'
import { useI18n } from "@/lib/contexts/i18n"

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;
export const dynamic = "force-dynamic"

// Helper function to format date in local timezone (YYYY-MM-DD)
const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function LocalizedDo({ params }: { params: Promise<{ locale: string }> }) {
  const { session, setGlobalContext, taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
  const { isLoaded, isSignedIn } = useAuth();
  const { t, formatDate, locale } = useI18n();

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

  // Get today's date in local timezone, normalized to midnight
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  // State for selected date (defaults to today)
  const [selectedDate, setSelectedDate] = useState<Date>(today)

  // Maintain stable task lists that never clear once loaded
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
    }
  }, [contextTaskLists])

  const allTaskLists = stableTaskLists.length > 0 ? stableTaskLists : (contextTaskLists || [])
  const [selectedTaskListId, setSelectedTaskListId] = useState<string | undefined>(allTaskLists[0]?.id)
  
  useEffect(() => {
    if (!selectedTaskListId && allTaskLists.length > 0) setSelectedTaskListId(allTaskLists[0].id)
  }, [allTaskLists, selectedTaskListId])

  const selectedTaskList = useMemo(() => allTaskLists.find((l: any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

  // Reset date to today when switching to a new task list
  useEffect(() => {
    const role = (selectedTaskList as any)?.role
    if (role && (role.startsWith('daily.') || role.startsWith('weekly.'))) {
      // Normalize to midnight in local timezone
      const d = new Date()
      setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    }
  }, [selectedTaskListId, selectedTaskList])

  const handleAddEphemeral = useCallback(async () => {
    if (!selectedTaskList) return
    const name = prompt('New task name?')
    if (!name) return
    await fetch('/api/v1/tasklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskListId: selectedTaskList.id,
        ephemeralTasks: { add: { name, cadence: 'day' } }
      })
    })
    await refreshTaskLists()
  }, [selectedTaskList, refreshTaskLists])

  const handleDateChange = useCallback((date: Date | undefined) => {
    if (date) {
      // Normalize date to midnight in local timezone to avoid time component issues
      const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      setSelectedDate(normalizedDate)
    }
  }, [])

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
      <div className="w-full max-w-[1200px] m-auto sticky top-[120px] z-50 bg-muted rounded-md p-4 opacity-90">
              <DoToolbar
          locale={locale}
          selectedTaskListId={selectedTaskListId}
          onChangeSelectedTaskListId={setSelectedTaskListId}
          onAddEphemeral={handleAddEphemeral}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
            />
      </div>
      <ViewMenu active="do">{null}</ViewMenu>
      <div className="container mx-auto px-4 py-6">
        <DoView 
          selectedTaskListId={selectedTaskListId}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          onAddEphemeral={handleAddEphemeral}
        />
      </div>
    </main>
  )
}


