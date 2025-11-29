'use client'

import React, { useMemo, useState, useEffect, useContext, useCallback, useRef } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { TaskGrid } from '@/components/taskGrid'

import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { getWeekNumber } from '@/app/helpers'
import { useUserData } from '@/lib/utils/userUtils'
import { getProfitPerTask } from '@/lib/utils/earningsUtils'

type TaskStatus = 'in progress' | 'steady' | 'ready' | 'open' | 'done' | 'ignored'

const STATUS_OPTIONS: TaskStatus[] = ['in progress', 'steady', 'ready', 'open', 'done', 'ignored']

const getStatusColor = (status: TaskStatus, format = "css"): string => {
  if (format === 'css') {
    const colorMap: Record<TaskStatus, string> = {
      'in progress': 'var(--status-in-progress)',
      'steady': 'var(--status-steady)',
      'ready': 'var(--status-ready)',
      'open': 'var(--status-open)',
      'done': 'var(--status-done)',
      'ignored': 'var(--status-ignored)',
    }
    return colorMap[status] || 'transparent'
  } else if (format === 'tailwind') {
    const colorMap: Record<TaskStatus, string> = {
      'in progress': 'status-in-progress',
      'steady': 'status-steady',
      'ready': 'status-ready',
      'open': 'status-open',
      'done': 'status-done',
      'ignored': 'status-ignored',
    }
    return colorMap[status] || 'transparent'
  }
  return 'transparent'
}

const getIconColor = (status: TaskStatus): string => {
    const colorMap: Record<TaskStatus, string> = {
      'in progress': 'var(--accent-foreground)',
      'steady': 'var(--accent-foreground)',
      'ready': 'var(--accent-foreground)',
      'open': 'var(--accent)',
      'done': 'var(--background)',
      'ignored': 'var(--accent)',
    }
    return colorMap[status] || 'transparent'
}

// Helper function to format date in local timezone (YYYY-MM-DD)
const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

  export const ListView = ({
    selectedTaskListId: propSelectedTaskListId,
    selectedDate: propSelectedDate,
    onDateChange: propOnDateChange,
    onAddEphemeral: propOnAddEphemeral,
  }: {
    selectedTaskListId?: string
    selectedDate?: Date
    onDateChange?: (date: Date | undefined) => void
    onAddEphemeral?: () => Promise<void> | void
  } = {}) => {
    const { session, taskLists: contextTaskLists, refreshTaskLists, revealRedacted } = useContext(GlobalContext)
    const { t, locale } = useI18n()
    const { refreshUser } = useUserData()

    // Track if initial load has been done
    const initialLoadDone = useRef(false)


    // Maintain stable task lists that never clear once loaded
    const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
    useEffect(() => {
      if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
        // When updating task lists, preserve optimistic state for pending completions
        setStableTaskLists(contextTaskLists)
        initialLoadDone.current = true
      }
    }, [contextTaskLists])

    // Get today's date in local timezone, normalized to midnight
    const today = useMemo(() => {
      const d = new Date()
      return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    }, [])

    // Use prop selectedDate if provided, otherwise use local state
    const [internalSelectedDate, setInternalSelectedDate] = useState<Date>(today)
    const selectedDate = propSelectedDate !== undefined ? propSelectedDate : internalSelectedDate
    const setSelectedDate = propOnDateChange || setInternalSelectedDate

    // Compute date string and year from selected date (using local timezone)
    // Memoize these so React can properly track changes
    const date = useMemo(() => formatDateLocal(selectedDate), [selectedDate])
    const year = useMemo(() => Number(date.split('-')[0]), [date])
    const allTaskLists = stableTaskLists.length > 0 ? stableTaskLists : (contextTaskLists || [])

    // Use prop selectedTaskListId if provided, otherwise use local state
    const [internalSelectedTaskListId, setInternalSelectedTaskListId] = useState<string | undefined>(allTaskLists[0]?.id)
    const selectedTaskListId = propSelectedTaskListId !== undefined ? propSelectedTaskListId : internalSelectedTaskListId
    const setSelectedTaskListId = propSelectedTaskListId !== undefined 
      ? (() => {}) // No-op if controlled from parent
      : setInternalSelectedTaskListId

    useEffect(() => {
      if (!selectedTaskListId && allTaskLists.length > 0 && propSelectedTaskListId === undefined) {
        setInternalSelectedTaskListId(allTaskLists[0].id)
      }
    }, [allTaskLists, selectedTaskListId, propSelectedTaskListId])

    const selectedTaskList = useMemo(() => allTaskLists.find((l: any) => l.id === selectedTaskListId), [allTaskLists, selectedTaskListId])

    // Helper to get all dates in a week (using local timezone)
    const getWeekDates = useMemo(() => {
      const dates: string[] = []
      const d = new Date(selectedDate)
      // Get Monday of the week (start of week)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
      const monday = new Date(d.setDate(diff))

      // Get all 7 days of the week
      for (let i = 0; i < 7; i++) {
        const weekDate = new Date(monday)
        weekDate.setDate(monday.getDate() + i)
        dates.push(formatDateLocal(weekDate))
      }
      return dates
    }, [selectedDate])

    // Determine if current list is weekly
    const isWeeklyList = useMemo(() => {
      const role = (selectedTaskList as any)?.role
      return role && typeof role === 'string' && role.startsWith('weekly.')
    }, [selectedTaskList])

    // Profiles cache (userId -> userName) for owners, collaborators and completers
    const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
    useEffect(() => {
      let cancelled = false
      const run = async () => {
        try {
          // Extract owners and collaborators from users array (new model) or fallback to old fields
          const users = Array.isArray((selectedTaskList as any)?.users) ? (selectedTaskList as any).users : []
          const ownersFromUsers = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
          const collaboratorsFromUsers = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER').map((u: any) => u.userId)
          
          // Fallback to old fields for backward compatibility
          const ownersFromOld = Array.isArray((selectedTaskList as any)?.owners) ? (selectedTaskList as any).owners : []
          const collaboratorsFromOld = Array.isArray((selectedTaskList as any)?.collaborators) ? (selectedTaskList as any).collaborators : []
          
          const owners: string[] = ownersFromUsers.length > 0 ? ownersFromUsers : ownersFromOld
          const collaborators: string[] = collaboratorsFromUsers.length > 0 ? collaboratorsFromUsers : collaboratorsFromOld

          // Get completers - for weekly lists, check all dates in the week
          const completerIds = new Set<string>()
          const datesToCheck = isWeeklyList ? getWeekDates : [date]

          datesToCheck.forEach((checkDate: string) => {
            const dateBucket = (selectedTaskList as any)?.completedTasks?.[year]?.[checkDate]
            if (dateBucket) {
              // Support both old structure (array) and new structure (openTasks/closedTasks)
              let tasksToCheck: any[] = []
              if (Array.isArray(dateBucket)) {
                tasksToCheck = dateBucket
              } else {
                tasksToCheck = [
                  ...(Array.isArray(dateBucket.openTasks) ? dateBucket.openTasks : []),
                  ...(Array.isArray(dateBucket.closedTasks) ? dateBucket.closedTasks : [])
                ]
              }
              tasksToCheck.forEach((t: any) => {
                if (Array.isArray(t?.completers)) t.completers.forEach((c: any) => { if (c?.id) completerIds.add(String(c.id)) })
              })
            }
          })

          // Include current user ID to ensure their profile is always in cache
          const currentUserId = (session?.user as any)?.id
          const allIds = new Set([...(owners || []), ...(collaborators || []), ...Array.from(completerIds)])
          if (currentUserId) {
            allIds.add(String(currentUserId))
          }
          
          const ids = Array.from(allIds)
          if (!ids.length) { setCollabProfiles({}); return }
          const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(ids.join(','))}`)
          if (!cancelled && res.ok) {
            const data = await res.json()
            const map: Record<string, string> = {}
              ; (data.profiles || []).forEach((p: any) => { map[p.userId] = p.userName || p.userId })
            setCollabProfiles(map)
          } else if (!cancelled) {
            setCollabProfiles({})
          }
        } catch {
          if (!cancelled) setCollabProfiles({})
        }
      }
      run()
      return () => { cancelled = true }
    }, [selectedTaskList?.id, JSON.stringify((selectedTaskList as any)?.users || []), JSON.stringify((selectedTaskList as any)?.owners || []), JSON.stringify((selectedTaskList as any)?.collaborators || []), isWeeklyList, getWeekDates, date, year, (session?.user as any)?.id])

    // Simple task loading: from Day.tasks first, then fallback to Task collection or list.tasks
    const [dayTasks, setDayTasks] = useState<any[]>([])
    const [collectionTasks, setCollectionTasks] = useState<any[]>([])
    const [isLoadingTasks, setIsLoadingTasks] = useState(false)

    // Load tasks from Day API for selected date
    useEffect(() => {
      let cancelled = false
      const loadTasks = async () => {
        if (!selectedTaskListId || !date) {
          setDayTasks([])
          setCollectionTasks([])
          return
        }

        setIsLoadingTasks(true)
        try {
          // Step 1: Try loading from Day.tasks
          const dayRes = await fetch(`/api/v1/days?date=${date}`)
          if (!cancelled && dayRes.ok) {
            const dayData = await dayRes.json()
            if (dayData.day?.tasks && Array.isArray(dayData.day.tasks) && dayData.day.tasks.length > 0) {
              // Filter tasks by listId if tasks have listId field, otherwise use all tasks
              const filteredTasks = dayData.day.tasks.filter((t: any) => 
                !t.listId || t.listId === selectedTaskListId
              )
              if (!cancelled) {
                setDayTasks(filteredTasks)
                setCollectionTasks([])
                setIsLoadingTasks(false)
                return
              }
            }
          }

          // Step 2: Fallback to Task collection API
          const tasksRes = await fetch(`/api/v1/tasks?listId=${selectedTaskListId}`)
          if (!cancelled && tasksRes.ok) {
            const tasksData = await tasksRes.json()
            if (tasksData.tasks && Array.isArray(tasksData.tasks)) {
              // Filter tasks by date if they have a date field
              const filteredTasks = tasksData.tasks.filter((t: any) => {
                if (t.date) return t.date === date
                // If no date field, include all tasks (they'll be filtered by listId already)
                return true
              })
              if (!cancelled) {
                setDayTasks([])
                setCollectionTasks(filteredTasks)
                setIsLoadingTasks(false)
                return
              }
            }
          }

          // Step 3: If no data, use list.tasks (master structure) without creating Day entry
          if (!cancelled) {
            setDayTasks([])
            setCollectionTasks([])
            setIsLoadingTasks(false)
          }
        } catch (error) {
          console.error('Error loading tasks:', error)
          if (!cancelled) {
            setDayTasks([])
            setCollectionTasks([])
            setIsLoadingTasks(false)
          }
        }
      }

      loadTasks()
      return () => { cancelled = true }
    }, [selectedTaskListId, date])

    // Simple merged tasks: use Day tasks if available, otherwise collection tasks, otherwise list.tasks
    const mergedTasks = useMemo(() => {
      const keyOf = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : ''))

      // Use Day tasks if available
      if (dayTasks.length > 0) {
        const tasks = dayTasks.map((t: any) => ({
          ...t,
          count: t.count || 0,
          status: t.status || 'open'
        }))

        // Add ephemeral tasks
        const ephemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.open) 
          ? (selectedTaskList.ephemeralTasks.open || []).map((t: any) => ({ ...t, isEphemeral: true }))
          : []

        const closedEphemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.closed)
          ? (selectedTaskList.ephemeralTasks.closed || [])
              .filter((t: any) => {
                if (!t.completedOn) return false
                if (isWeeklyList) return getWeekDates.includes(t.completedOn)
                return t.completedOn === date
              })
              .map((t: any) => ({ ...t, isEphemeral: true }))
          : []

        const taskKeys = new Set(tasks.map((t: any) => keyOf(t)).filter(Boolean))
        const dedupEphemerals = [...ephemerals, ...closedEphemerals].filter((t: any) => {
          const k = keyOf(t)
          return k && !taskKeys.has(k)
        })

        return [...tasks, ...dedupEphemerals]
      }

      // Use collection tasks if available
      if (collectionTasks.length > 0) {
        const tasks = collectionTasks.map((t: any) => ({
          ...t,
          count: t.count || 0,
          status: t.status || 'open'
        }))

        // Add ephemeral tasks
        const ephemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.open) 
          ? (selectedTaskList.ephemeralTasks.open || []).map((t: any) => ({ ...t, isEphemeral: true }))
          : []

        const closedEphemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.closed)
          ? (selectedTaskList.ephemeralTasks.closed || [])
              .filter((t: any) => {
                if (!t.completedOn) return false
                if (isWeeklyList) return getWeekDates.includes(t.completedOn)
                return t.completedOn === date
              })
              .map((t: any) => ({ ...t, isEphemeral: true }))
          : []

        const taskKeys = new Set(tasks.map((t: any) => keyOf(t)).filter(Boolean))
        const dedupEphemerals = [...ephemerals, ...closedEphemerals].filter((t: any) => {
          const k = keyOf(t)
          return k && !taskKeys.has(k)
        })

        return [...tasks, ...dedupEphemerals]
      }

      // Fallback to list.tasks (master structure)
      const blueprintTasks = (selectedTaskList?.tasks && selectedTaskList.tasks.length > 0)
        ? selectedTaskList.tasks
        : (selectedTaskList?.templateTasks || [])

      const tasks = blueprintTasks.map((t: any) => ({
        ...t,
        count: 0,
        status: 'open'
      }))

      // Add ephemeral tasks
      const ephemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.open) 
        ? (selectedTaskList.ephemeralTasks.open || []).map((t: any) => ({ ...t, isEphemeral: true }))
        : []

      const closedEphemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.closed)
        ? (selectedTaskList.ephemeralTasks.closed || [])
            .filter((t: any) => {
              if (!t.completedOn) return false
              if (isWeeklyList) return getWeekDates.includes(t.completedOn)
              return t.completedOn === date
            })
            .map((t: any) => ({ ...t, isEphemeral: true }))
        : []

      const taskKeys = new Set(tasks.map((t: any) => keyOf(t)).filter(Boolean))
      const dedupEphemerals = [...ephemerals, ...closedEphemerals].filter((t: any) => {
        const k = keyOf(t)
        return k && !taskKeys.has(k)
      })

      return [...tasks, ...dedupEphemerals]
    }, [dayTasks, collectionTasks, selectedTaskList, selectedTaskListId, date, isWeeklyList, getWeekDates])


    const handleAddEphemeral = useCallback(async () => {
      if (propOnAddEphemeral) {
        await propOnAddEphemeral()
        return
      }
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
    }, [selectedTaskList, refreshTaskLists, propOnAddEphemeral])

    const handleDateChange = useCallback((date: Date | undefined) => {
      if (propOnDateChange) {
        propOnDateChange(date)
      } else if (date) {
        // Normalize date to midnight in local timezone to avoid time component issues
        const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        setInternalSelectedDate(normalizedDate)
      }
    }, [propOnDateChange])

    // Check if task lists are loading (only show skeleton on initial load, not on refreshes)
    const isTaskListsLoading = !initialLoadDone.current && (contextTaskLists === null || contextTaskLists === undefined || (Array.isArray(contextTaskLists) && contextTaskLists.length === 0))
    const isLoading = isTaskListsLoading || (!initialLoadDone.current && (!selectedTaskListId || !selectedTaskList)) || isLoadingTasks

    if (isLoading) {
      return (
        <div className="space-y-4">
          {/* Toolbar skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <Skeleton className="h-9 w-full sm:w-[260px]" />
            <Skeleton className="h-9 w-full sm:w-[240px]" />
            <Skeleton className="h-9 w-20" />
          </div>
          
          {/* Tasks grid skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center m-1">
                <div className="relative w-full flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-10 flex-1 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (!selectedTaskListId) return null
    return (
      <div className="space-y-4">
        <TaskGrid
          tasks={mergedTasks}
          selectedTaskList={selectedTaskList}
          collabProfiles={collabProfiles}
          revealRedacted={revealRedacted}
          date={date}
          onRefresh={refreshTaskLists}
          onRefreshUser={refreshUser}
        />
      </div>
    )
  }


