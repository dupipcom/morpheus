'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

import { DoView } from '@/views/do/doView'
import { DoToolbar } from '@/components/doToolbar'
import { useTaskLists } from '@/lib/hooks/useTaskLists'

import { setLoginTime, getLoginTime } from '@/lib/utils/cookieManager'

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
const getDefaultListId = (allTaskLists: Array<{ id: string; role?: string | null }>): string | undefined => {
  if (allTaskLists.length === 0) return undefined

  const lastListId = getLastListFromStorage()
  const lastSelectionTime = getLastListSelectionTime()

  // Check if more than 2 hours (2 * 60 * 60 * 1000 ms) have elapsed
  const twoHoursInMs = 2 * 60 * 60 * 1000
  const timeElapsed = lastSelectionTime ? Date.now() - lastSelectionTime : Infinity

  if (timeElapsed > twoHoursInMs) {
    // More than 2 hours elapsed, find default.daily list
    const defaultDailyList = allTaskLists.find((l) => l.role === 'default.daily' || l.role === 'daily.default')
    if (defaultDailyList) {
      return defaultDailyList.id
    }
  } else if (lastListId) {
    // Less than 2 hours elapsed, check if last list still exists
    const lastListExists = allTaskLists.find((l) => l.id === lastListId)
    if (lastListExists) {
      return lastListId
    }
  }

  // Fallback to first list
  return allTaskLists[0]?.id
}

interface DoPageProps {
  locale: string
  listId?: string
  /** Deep-linked task id (/app/do/list/{id}/{taskId}): shown first + highlighted */
  taskId?: string
}

export default function DoPage({ locale, listId, taskId }: DoPageProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const { taskLists, isLoading: listsLoading, refreshTaskLists } = useTaskLists()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Set login time when user is authenticated
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const loginTime = getLoginTime()

      // Set login time if not already set
      if (loginTime === null) {
        setLoginTime()
      }
    }
  }, [isLoaded, isSignedIn])

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

  // Add date query parameter on load if not present
  useEffect(() => {
    if (!dateParam && selectedDate && pathname) {
      const dateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
      const basePath = pathname.split('?')[0]
      // Only update if the URL doesn't already have the date parameter
      if (!pathname.includes('date=')) {
        router.replace(`${basePath}?date=${dateString}`, { scroll: false })
      }
    }
  }, [dateParam, selectedDate, pathname, router])

  // Initialize selectedTaskListId from URL param, fallback to default
  const [selectedTaskListId, setSelectedTaskListId] = useState<string | undefined>(listId)

  // Redirect to a default list when the URL listId is missing/invalid (or no listId given)
  useEffect(() => {
    if (listsLoading || taskLists.length === 0) return

    if (listId) {
      const listExists = taskLists.find((l) => l.id === listId)
      if (listExists) {
        setSelectedTaskListId(listId)
        setLastListInStorage(listId)
      } else {
        // List doesn't exist, redirect to default list
        const defaultListId = getDefaultListId(taskLists)
        if (defaultListId) {
          router.replace(`/${locale}/app/do/${defaultListId}`)
        }
      }
    } else {
      // No listId in URL: redirect to default list
      const defaultListId = getDefaultListId(taskLists)
      if (defaultListId) {
        router.replace(`/${locale}/app/do/${defaultListId}?date=${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`)
      }
    }
  }, [listId, taskLists, listsLoading, locale, router, selectedDate])

  // When the selected list disappears (e.g. deleted elsewhere), fall back to default
  useEffect(() => {
    if (listsLoading || taskLists.length === 0 || !selectedTaskListId) return
    const selectedExists = taskLists.find((l) => l.id === selectedTaskListId)
    if (!selectedExists) {
      const defaultListId = getDefaultListId(taskLists)
      if (defaultListId) {
        setSelectedTaskListId(defaultListId)
        router.replace(`/${locale}/app/do/${defaultListId}`)
      }
    }
  }, [taskLists, listsLoading, selectedTaskListId, locale, router])

  const selectedTaskList = useMemo(
    () => taskLists.find((l) => l.id === selectedTaskListId),
    [taskLists, selectedTaskListId]
  )

  // Reset date to today when switching to a different daily/weekly list
  const prevSelectedTaskListIdRef = React.useRef<string | undefined>(undefined)
  useEffect(() => {
    if (
      prevSelectedTaskListIdRef.current !== undefined &&
      prevSelectedTaskListIdRef.current !== selectedTaskListId
    ) {
      const role = selectedTaskList?.role
      if (role && (role.startsWith('daily.') || role.startsWith('weekly.'))) {
        const d = new Date()
        setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      }
    }
    prevSelectedTaskListIdRef.current = selectedTaskListId
  }, [selectedTaskListId, selectedTaskList])

  const handleDateChange = useCallback((date: Date | undefined) => {
    if (date) {
      // Normalize date to midnight in local timezone to avoid time component issues
      const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      setSelectedDate(normalizedDate)

      // Update URL query parameter with the selected date
      const dateString = `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedDate.getDate()).padStart(2, '0')}`
      const basePath = pathname?.split('?')[0] || (selectedTaskListId ? `/${locale}/app/do/${selectedTaskListId}` : '')
      if (basePath) {
        router.replace(`${basePath}?date=${dateString}`, { scroll: false })
      }
    }
  }, [pathname, locale, router, selectedTaskListId])

  // Deep link: resolve the deeplinked task's occurrence date before the grid
  // renders, so the date-scoped task query includes it. Falls back silently
  // when the list/task is unknown (TaskGrid shows the plain list view).
  useEffect(() => {
    if (!taskId || !listId || listsLoading || taskLists.length === 0) return
    if (!taskLists.some((l) => l.id === listId)) return
    let cancelled = false
    fetch(`/api/v1/tasklists/${listId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: any) => {
        if (cancelled || !data?.taskList?.tasks) return
        const task = data.taskList.tasks.find((t: any) => t.id === taskId)
        if (task?.dtstart) {
          const parsed = new Date(task.dtstart + 'T00:00:00')
          if (!isNaN(parsed.getTime())) {
            const normalized = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
            setSelectedDate(normalized)
            const dateString = `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}-${String(normalized.getDate()).padStart(2, '0')}`
            const basePath = pathname?.split('?')[0]
            if (basePath) {
              router.replace(`${basePath}?date=${dateString}`, { scroll: false })
            }
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [taskId, listId, listsLoading, taskLists, pathname, router])

  // Form state management
  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddList, setShowAddList] = useState(false)
  const [isEditingList, setIsEditingList] = useState(false)

  const closeAllForms = useCallback(() => {
    setShowAddTask(false)
    setShowAddList(false)
    setIsEditingList(false)
  }, [])

  // Close all forms when selected list changes
  useEffect(() => {
    closeAllForms()
  }, [selectedTaskListId, closeAllForms])

  const handleListChange = useCallback((newListId: string) => {
    setSelectedTaskListId(newListId)
    setLastListInStorage(newListId)

    // Preserve date query parameter when changing lists
    const dateParam = searchParams?.get('date')
    const dateQuery = dateParam ? `?date=${dateParam}` : ''
    router.push(`/${locale}/app/do/${newListId}${dateQuery}`)
  }, [locale, router, searchParams])

  return (
    <main className="">
      <div className="w-full max-w-[1200px] m-auto sticky top-[115px] z-50 p-4">
        <DoToolbar
          selectedTaskListId={selectedTaskListId}
          onChangeSelectedTaskListId={handleListChange}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          onShowAddTask={() => { closeAllForms(); setShowAddTask(true) }}
          onShowAddList={() => { closeAllForms(); setIsEditingList(false); setShowAddList(true) }}
          onShowEditList={() => { if (selectedTaskList) { closeAllForms(); setIsEditingList(true); setShowAddList(true) } }}
          hasFormOpen={showAddTask || showAddList}
        />
      </div>
      <div className="container mx-auto px-4 py-6">
        <DoView
          selectedTaskListId={selectedTaskListId}
          selectedDate={selectedDate}
          initialTaskId={taskId}
          onDateChange={handleDateChange}
          showAddTask={showAddTask}
          showAddList={showAddList}
          isEditingList={isEditingList}
          onCloseAddTask={() => setShowAddTask(false)}
          onCloseAddList={() => { setShowAddList(false); setIsEditingList(false) }}
          onListCreated={async (newListId) => {
            await refreshTaskLists()
            if (newListId) {
              handleListChange(newListId)
            }
          }}
        />
      </div>
    </main>
  )
}
