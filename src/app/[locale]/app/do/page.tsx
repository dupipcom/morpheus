'use client'

import React, { useRef, useState, useEffect, useContext, useMemo, useCallback } from 'react'
import ReactDOMServer from 'react-dom/server';
import prisma from "@/lib/prisma";
import { useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

import Link from 'next/link'

import { DoView } from "@/views/doView"
import { ViewMenu } from "@/components/viewMenu"
import { Button } from "@/components/ui/button"
import { DoToolbar } from '@/components/doToolbar'

import { getWeekNumber } from "@/app/helpers"
import { DAILY_ACTIONS, WEEKS } from "@/app/constants"

import { GlobalContext } from "@/lib/contexts"
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'
import { useI18n } from "@/lib/contexts/i18n"

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// Helper function to format date in local timezone (YYYY-MM-DD)
const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper functions for localStorage
const getLastListFromStorage = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('dpip_last_list')
}

const getLastListSelectionTime = (): number | null => {
  if (typeof window === 'undefined') return null
  const timeStr = localStorage.getItem('dpip_last_list_selection_time')
  return timeStr ? parseInt(timeStr, 10) : null
}

const setLastListInStorage = (listId: string) => {
  if (typeof window === 'undefined') return
  localStorage.setItem('dpip_last_list', listId)
  localStorage.setItem('dpip_last_list_selection_time', Date.now().toString())
}

// Helper to get the default list based on localStorage and time elapsed
const getDefaultListId = (allTaskLists: any[]): string | undefined => {
  if (allTaskLists.length === 0) return undefined
  
  const lastListId = getLastListFromStorage()
  const lastSelectionTime = getLastListSelectionTime()
  
  // Check if more than 2 hours (2 * 60 * 60 * 1000 ms) have elapsed
  const twoHoursInMs = 2 * 60 * 60 * 1000
  const timeElapsed = lastSelectionTime ? Date.now() - lastSelectionTime : Infinity
  
  if (timeElapsed > twoHoursInMs) {
    // More than 2 hours elapsed, find default.daily list
    const defaultDailyList = allTaskLists.find((l: any) => l.role === 'default.daily')
    if (defaultDailyList) {
      return defaultDailyList.id
    }
  } else if (lastListId) {
    // Less than 2 hours elapsed, check if last list still exists
    const lastListExists = allTaskLists.find((l: any) => l.id === lastListId)
    if (lastListExists) {
      return lastListId
    }
  }
  
  // Fallback to first list
  return allTaskLists[0]?.id
}

export default function LocalizedDo({ params }: { params: Promise<{ locale: string }> }) {
  const { session, setGlobalContext, taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
  const { isLoaded, isSignedIn } = useAuth();
  const { t, formatDate, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [resolvedParams, setResolvedParams] = useState<{ locale: string } | null>(null)
  const searchParams = useSearchParams()

  // Resolve params promise
  useEffect(() => {
    params.then(setResolvedParams)
  }, [params])

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

  // Initialize selected date from query parameter or default to today
  const initialDate = useMemo(() => {
    const dateParam = searchParams?.get('date')
    if (dateParam) {
      // Parse YYYY-MM-DD format
      const parsedDate = new Date(dateParam + 'T00:00:00')
      if (!isNaN(parsedDate.getTime())) {
        return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate())
      }
    }
    return today
  }, [searchParams, today])

  // State for selected date (defaults to today or date from query param)
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate)

  // Update selected date when query parameter changes
  const dateParam = searchParams?.get('date')
  useEffect(() => {
    if (dateParam) {
      const parsedDate = new Date(dateParam + 'T00:00:00')
      if (!isNaN(parsedDate.getTime())) {
        const normalizedDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate())
        // Only update if the date is different to avoid unnecessary updates
        setSelectedDate(prevDate => {
          if (!prevDate || normalizedDate.getTime() !== prevDate.getTime()) {
            return normalizedDate
          }
          return prevDate
        })
      }
    } else {
      // Reset to today if no date param
      setSelectedDate(prevDate => {
        if (!prevDate || prevDate.getTime() !== today.getTime()) {
          return today
        }
        return prevDate
      })
    }
  }, [dateParam, today])

  // Add date query parameter on load if not present (only after redirect to list page)
  // Note: This page redirects to a list, so we don't add the date param here
  // The date param will be added by the [listId] page after redirect

  // Maintain stable task lists that never clear once loaded
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
    }
  }, [contextTaskLists])

  const allTaskLists = stableTaskLists.length > 0 ? stableTaskLists : (contextTaskLists || [])
  
  // Redirect to default list (from localStorage or default.daily) if available
  useEffect(() => {
    if (resolvedParams && allTaskLists.length > 0) {
      const defaultListId = getDefaultListId(allTaskLists)
      if (defaultListId) {
        router.replace(`/${resolvedParams.locale}/app/do/${defaultListId}`)
      }
    }
  }, [resolvedParams, allTaskLists, router])
  
  const [selectedTaskListId, setSelectedTaskListId] = useState<string | undefined>(() => getDefaultListId(allTaskLists))
  
  useEffect(() => {
    if (!selectedTaskListId && allTaskLists.length > 0) {
      const defaultListId = getDefaultListId(allTaskLists)
      if (defaultListId) {
        setSelectedTaskListId(defaultListId)
      }
    } else if (selectedTaskListId && allTaskLists.length > 0) {
      // Check if selected list still exists, if not select default list
      const selectedExists = allTaskLists.find((l: any) => l.id === selectedTaskListId)
      if (!selectedExists) {
        const defaultListId = getDefaultListId(allTaskLists)
        if (defaultListId) {
          setSelectedTaskListId(defaultListId)
        }
      }
    }
  }, [allTaskLists, selectedTaskListId])

  const selectedTaskList = useMemo(() => allTaskLists.find((l: any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

  // Track previous selectedTaskListId to detect actual list changes (not refetches)
  const prevSelectedTaskListIdRef = useRef<string | undefined>(undefined)

  // Reset date to today only when switching to a different task list (not on refetch)
  useEffect(() => {
    // Only reset if the list ID actually changed (not just the object reference)
    // Skip on initial mount (when prevSelectedTaskListIdRef.current is undefined)
    if (prevSelectedTaskListIdRef.current !== undefined && prevSelectedTaskListIdRef.current !== selectedTaskListId) {
      const role = (selectedTaskList as any)?.role
      if (role && (role.startsWith('daily.') || role.startsWith('weekly.'))) {
        // Normalize to midnight in local timezone
        const d = new Date()
        setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      }
    }
    // Update the ref to track the current list ID
    prevSelectedTaskListIdRef.current = selectedTaskListId
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
      
      // Update URL query parameter with the selected date
      // Note: This page redirects to a list, so we'll update the URL after redirect
      // For now, we'll update the current URL if we have a selectedTaskListId
      if (selectedTaskListId && resolvedParams) {
        const dateString = `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedDate.getDate()).padStart(2, '0')}`
        router.push(`/${resolvedParams.locale}/app/do/${selectedTaskListId}?date=${dateString}`)
      }
    } else {
      // Remove date parameter if date is cleared
      if (selectedTaskListId && resolvedParams) {
        router.push(`/${resolvedParams.locale}/app/do/${selectedTaskListId}`)
      }
    }
  }, [selectedTaskListId, resolvedParams, router])

  const handleListChange = useCallback((newListId: string) => {
    setSelectedTaskListId(newListId)
    // Store in localStorage when user selects a list
    setLastListInStorage(newListId)
    if (resolvedParams) {
      router.push(`/${resolvedParams.locale}/app/do/${newListId}`)
    }
  }, [resolvedParams, router])

  // Form state management
  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddList, setShowAddList] = useState(false)
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [isEditingList, setIsEditingList] = useState(false)

  const closeAllForms = useCallback(() => {
    setShowAddTask(false)
    setShowAddList(false)
    setShowAddTemplate(false)
    setIsEditingList(false)
  }, [])

  // Close all forms when selected list changes
  useEffect(() => {
    closeAllForms()
  }, [selectedTaskListId, closeAllForms])

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
    <main className="">
      <div className="w-full max-w-[1200px] m-auto sticky top-[115px] z-50 p-4">
              <DoToolbar
          locale={locale}
          selectedTaskListId={selectedTaskListId}
          onChangeSelectedTaskListId={handleListChange}
          onAddEphemeral={handleAddEphemeral}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          onShowAddTask={() => { closeAllForms(); setShowAddTask(true) }}
          onShowAddList={() => { closeAllForms(); setIsEditingList(false); setShowAddList(true) }}
          onShowAddTemplate={() => { closeAllForms(); setShowAddTemplate(true) }}
          onShowEditList={() => { if (selectedTaskList) { closeAllForms(); setIsEditingList(true); setShowAddList(true) } }}
          hasFormOpen={showAddTask || showAddList || showAddTemplate}
            />
      </div>
      <div className="container mx-auto px-4 py-6">
        <DoView 
          selectedTaskListId={selectedTaskListId}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          onAddEphemeral={handleAddEphemeral}
          showAddTask={showAddTask}
          showAddList={showAddList}
          showAddTemplate={showAddTemplate}
          isEditingList={isEditingList}
          onCloseAddTask={() => setShowAddTask(false)}
          onCloseAddList={() => { setShowAddList(false); setIsEditingList(false) }}
          onCloseAddTemplate={() => setShowAddTemplate(false)}
          onTaskCreated={refreshTaskLists}
          onListCreated={async (newListId) => {
            await refreshTaskLists()
            if (newListId) {
              handleListChange(newListId)
            }
            // The useEffect above will handle selecting the first list if the deleted list was selected
          }}
          onTemplateCreated={refreshTaskLists}
        />
      </div>
    </main>
  )
}


