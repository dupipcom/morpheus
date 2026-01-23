'use client'

import React, { useMemo, useState, useEffect, useContext, useCallback, useRef } from 'react'
import useSWR from 'swr'

import { Skeleton } from '@/components/ui/skeleton'
import { TaskGrid } from '@/components/taskGrid'
import { PendingTaskCreation } from '@/lib/hooks/useOptimisticUpdates'

import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { getWeekNumber } from '@/app/helpers'
import { useUserData } from '@/lib/utils/userUtils'
import { getProfitPerTask } from '@/lib/utils/earningsUtils'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

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
    pendingTaskCreationsRef,
  }: {
    selectedTaskListId?: string
    selectedDate?: Date
    onDateChange?: (date: Date | undefined) => void
    onAddEphemeral?: () => Promise<void> | void
    pendingTaskCreationsRef?: React.MutableRefObject<Map<string, PendingTaskCreation>>
  } = {}) => {
    const { session, taskLists: contextTaskLists, refreshTaskLists, revealRedacted, isInitializingTaskLists } = useContext(GlobalContext)
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

    // Get current user ID
    const userId = (session?.user as any)?.id

    // Fetch tasks from new API with date parameter
    const tasksUrl = selectedTaskListId ? `/api/v1/tasks?listId=${selectedTaskListId}&date=${date}` : null
    const { data: tasksData, mutate: mutateTasks, isLoading: isLoadingTasks } = useSWR(tasksUrl, fetcher, {
      revalidateOnFocus: false,
    })
    const tasksFromApi = tasksData?.tasks || []

    // Track migration state - use Set to track multiple lists
    const migrationInProgressRef = useRef(false)
    const migratedListsRef = useRef(new Set<string>())

    // Track optimistic task creations
    const [optimisticTasks, setOptimisticTasks] = useState<any[]>([])

    // Sync optimistic tasks from ref and clean up confirmed tasks
    useEffect(() => {
      if (!pendingTaskCreationsRef) return

      const pendingMap = pendingTaskCreationsRef.current
      const pendingTasks = Array.from(pendingMap.values()).map(p => p.task)

      // Filter out tasks that match the current list and date
      const relevantTasks = pendingTasks.filter(t => 
        t.listId === selectedTaskListId
      )

      // Create a map of task names for efficient lookup
      const taskNamesSet = new Set(
        tasksFromApi.map((t: any) => t.name?.toLowerCase()).filter(Boolean)
      )

      // Remove optimistic tasks that are now in the API response
      const keysToDelete: string[] = []
      const stillPending = relevantTasks.filter(t => {
        const taskName = t.name?.toLowerCase()
        if (taskName && taskNamesSet.has(taskName)) {
          // Find the key for this task to delete it later
          for (const [key, value] of pendingMap.entries()) {
            if (value.task.id === t.id) {
              keysToDelete.push(key)
              break
            }
          }
          return false
        }
        return true
      })

      // Clean up confirmed tasks from the pending map
      keysToDelete.forEach(key => pendingMap.delete(key))

      setOptimisticTasks(stillPending)
    }, [pendingTaskCreationsRef, selectedTaskListId, tasksFromApi])


    // Fetch jobs from new API (for the selected date or week)
    const jobsUrl = useMemo(() => {
      if (!selectedTaskListId) return null
      if (isWeeklyList) {
        // For weekly lists, we don't filter by date in the API call
        // We'll filter on the client side
        return `/api/v1/jobs?listId=${selectedTaskListId}`
      }
      return `/api/v1/jobs?listId=${selectedTaskListId}&date=${date}`
    }, [selectedTaskListId, date, isWeeklyList])

    const { data: jobsData, mutate: mutateJobs } = useSWR(jobsUrl, fetcher, {
      revalidateOnFocus: false,
      refreshInterval: 60000, // Refresh every 60 seconds
    })
    const jobsFromApi = jobsData?.jobs || []

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

    // Memoize datesToCheck to ensure it's reactive for both daily and weekly lists
    const datesToCheck = useMemo(() => {
      return isWeeklyList ? getWeekDates : [date]
    }, [isWeeklyList, getWeekDates, date])

    // Build tasks: read from completedTasks[year][date].openTasks if exists, otherwise from tasklist.tasks
    // Overlay completedTasks[year][date].closedTasks for completed tasks
    const mergedTasks = useMemo(() => {
      const keyOf = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : ''))
      
      // Collect openTasks and closedTasks from all dates in the timeframe
      const allOpenTasks: any[] = []
      const allClosedTasks: any[] = []
      const openTasksByKey: Record<string, any> = {}
      const closedTasksByKey: Record<string, any> = {}
      
      datesToCheck.forEach((checkDate: string) => {
        const dateBucket = (selectedTaskList as any)?.completedTasks?.[year]?.[checkDate]
        
        if (dateBucket) {
          // Support both old structure (array) and new structure (openTasks/closedTasks)
          if (Array.isArray(dateBucket)) {
            // Legacy structure: migrate on read
            dateBucket.forEach((t: any) => {
              const k = keyOf(t)
              if (!k) return
              if (t.status === 'done' || (t.count || 0) >= (t.times || 1)) {
                if (!closedTasksByKey[k]) {
                  closedTasksByKey[k] = t
                  allClosedTasks.push(t)
                }
              } else {
                if (!openTasksByKey[k]) {
                  openTasksByKey[k] = t
                  allOpenTasks.push(t)
                }
              }
            })
          } else {
            // New structure
            const openTasks = Array.isArray(dateBucket.openTasks) ? dateBucket.openTasks : []
            const closedTasks = Array.isArray(dateBucket.closedTasks) ? dateBucket.closedTasks : []
            
            openTasks.forEach((t: any) => {
              const k = keyOf(t)
              if (!k) return
              if (!openTasksByKey[k]) {
                openTasksByKey[k] = t
                allOpenTasks.push(t)
              } else {
                // Merge completers from different days for weekly lists
                const existingCompleters = Array.isArray(openTasksByKey[k]?.completers) ? openTasksByKey[k].completers : []
                const newCompleters = Array.isArray(t?.completers) ? t.completers : []
                openTasksByKey[k] = {
                  ...openTasksByKey[k],
                  ...t,
                  completers: [...existingCompleters, ...newCompleters]
                }
              }
            })
            
            closedTasks.forEach((t: any) => {
              const k = keyOf(t)
              if (!k) return
              if (!closedTasksByKey[k]) {
                closedTasksByKey[k] = t
                allClosedTasks.push(t)
              } else {
                // Merge completers from different days for weekly lists
                const existingCompleters = Array.isArray(closedTasksByKey[k]?.completers) ? closedTasksByKey[k].completers : []
                const newCompleters = Array.isArray(t?.completers) ? t.completers : []
                closedTasksByKey[k] = {
                  ...closedTasksByKey[k],
                  ...t,
                  completers: [...existingCompleters, ...newCompleters]
                }
              }
            })
          }
        }
      })
      
      // Determine base tasks: use openTasks if they exist, otherwise fall back to tasklist.tasks
      let base: any[] = []
      const blueprintTasks = (selectedTaskList?.tasks && selectedTaskList.tasks.length > 0)
        ? selectedTaskList.tasks
        : (selectedTaskList?.templateTasks || [])
      
      if (allOpenTasks.length > 0) {
        // Use openTasks as base
        base = allOpenTasks
        
        // Check for new tasks in tasklist.tasks that aren't in openTasks
        const openTasksKeys = new Set(allOpenTasks.map((t: any) => keyOf(t)))
        const newTasks = blueprintTasks.filter((t: any) => {
          const k = keyOf(t)
          return k && !openTasksKeys.has(k)
        })
        
        // Add new tasks to base (they'll be saved to completedTasks on first completion)
        if (newTasks.length > 0) {
          base = [...base, ...newTasks.map((t: any) => ({ ...t, count: 0, status: 'open' }))]
        }
      } else {
        // Fall back to tasklist.tasks or templateTasks
        base = blueprintTasks
      }

      // Only show open ephemeral tasks from the selected task list
      // Ensure we're using the correct task list by checking selectedTaskListId
      const ephemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.open) 
        ? (selectedTaskList.ephemeralTasks.open || []).map((t: any) => ({ ...t, isEphemeral: true }))
        : []

      // Only include closed ephemeral tasks from the selected task list that were closed on the selected date (or within selected week for weekly lists)
      // Use completedOn field (YYYY-MM-DD format) to filter by date
      const closedEphemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.closed)
        ? (selectedTaskList.ephemeralTasks.closed || [])
            .filter((t: any) => {
              // Must have a completedOn date (YYYY-MM-DD format)
              if (!t.completedOn) return false
              
              const completedDate = t.completedOn
              
              // For weekly lists, check if completed within the selected week
              if (isWeeklyList) {
                return getWeekDates.includes(completedDate)
              }
              
              // For daily lists, only show if completed on the exact selected date
              return completedDate === date
            })
            .map((t: any) => ({ ...t, isEphemeral: true }))
        : []

      // Get all ephemeral task IDs/keys to filter them out of base tasks
      // Ephemeral tasks should only come from ephemeralTasks.open/closed, not from completedTasks
      const allEphemeralKeys = new Set<string>()
      ;[...ephemerals, ...closedEphemerals].forEach((t: any) => {
        const k = keyOf(t)
        if (k) allEphemeralKeys.add(k)
      })
      
      // Also check if any tasks in base/allOpenTasks/allClosedTasks are ephemeral tasks
      // by checking if they have an id that matches ephemeral task IDs
      const ephemeralTaskIds = new Set<string>()
      if (selectedTaskList?.ephemeralTasks?.open) {
        (selectedTaskList.ephemeralTasks.open || []).forEach((t: any) => {
          if (t.id) ephemeralTaskIds.add(String(t.id))
        })
      }
      if (selectedTaskList?.ephemeralTasks?.closed) {
        (selectedTaskList.ephemeralTasks.closed || []).forEach((t: any) => {
          if (t.id) ephemeralTaskIds.add(String(t.id))
        })
      }
      
      // Filter out ephemeral tasks from base (they should only come from ephemeralTasks)
      const baseWithoutEphemerals = base.filter((t: any) => {
        const k = keyOf(t)
        // If task has an id that matches an ephemeral task ID, exclude it
        if (t.id && ephemeralTaskIds.has(String(t.id))) return false
        // If task key is in ephemeral keys, exclude it
        if (k && allEphemeralKeys.has(k)) return false
        // If task is already marked as ephemeral, exclude it
        if (t.isEphemeral) return false
        return true
      })

      // Merge base tasks with closedTasks (closedTasks take precedence for completed tasks)
      const overlayed = baseWithoutEphemerals.map((t: any) => {
        const k = keyOf(t)
        const closedTask = k ? closedTasksByKey[k] : undefined
        
        if (closedTask) {
          // Task is completed - use closedTask data
          const times = Number(closedTask?.times || t?.times || 1)
          const completedCount = Array.isArray(closedTask?.completers) ? closedTask.completers.length : Number(closedTask?.count || 0)
          // Always use the status from closedTask if it exists (preserves manually set statuses like "ready", "steady", etc.)
          // Only fall back to calculated status if closedTask.status is not set
          const taskStatus = closedTask?.status
            ? closedTask.status
            : (t?.status || (completedCount >= times ? 'done' : (completedCount > 0 ? 'in progress' : 'open')))

          return {
            ...t, // Start with base task from list.tasks (includes recurrence metadata)
            ...closedTask, // Override with closedTask completion data
            // Always preserve recurrence metadata from base task (completedTasks are snapshots and don't store this)
            recurrence: t?.recurrence,
            nextOccurrence: t?.nextOccurrence,
            firstOccurrence: t?.firstOccurrence,
            lastOccurrence: t?.lastOccurrence,
            status: taskStatus, // Use the status from closedTask (preserves manual status changes)
            count: Math.min(completedCount || 0, times || 1),
            completers: closedTask?.completers
          }
        }
        
        // Task is open - use base task data (from openTasks or tasklist.tasks)
        return { ...t, count: t.count || 0 }
      })
      
      // Add any closedTasks that aren't in base (shouldn't happen, but handle edge cases)
      // Filter out ephemeral tasks from additionalClosedTasks as well
      const baseKeys = new Set(baseWithoutEphemerals.map((t: any) => keyOf(t)))
      const additionalClosedTasks = allClosedTasks.filter((t: any) => {
        const k = keyOf(t)
        if (!k) return false
        // Exclude ephemeral tasks from additionalClosedTasks
        if (t.id && ephemeralTaskIds.has(String(t.id))) return false
        if (t.isEphemeral) return false
        return !baseKeys.has(k)
      })

      // Combine all ephemeral tasks (open + closed for current date/timeframe)
      const allEphemerals = [...ephemerals, ...closedEphemerals]

      // Dedup ephemeral tasks by key against overlayed and additionalClosedTasks
      // Use key-based deduplication (id, localeKey, or name) for more accurate matching
      const overlayedKeys = new Set(overlayed.map((t: any) => keyOf(t)).filter(Boolean))
      const additionalClosedKeys = new Set(additionalClosedTasks.map((t: any) => keyOf(t)).filter(Boolean))
      const allExistingKeys = new Set([...overlayedKeys, ...additionalClosedKeys])
      
      const dedupEphemeral = allEphemerals.filter((t: any) => {
        const k = keyOf(t)
        return k && !allExistingKeys.has(k)
      })
      
      return [...overlayed, ...additionalClosedTasks, ...dedupEphemeral]
    }, [selectedTaskList, year, date, isWeeklyList, getWeekDates, selectedDate, datesToCheck])

    // New simpler tasks display using API data (with fallback to old mergedTasks)
    const tasksToDisplay = useMemo(() => {
      // If we have tasks from the new API, use them
      if (tasksFromApi.length > 0 || optimisticTasks.length > 0) {
        // Combine API tasks with optimistic tasks
        const apiTasks = tasksFromApi.map((t: any) => ({
          ...t,
          displayName: t.name,
          // Use date-specific count when available (from date-aware API), otherwise fall back to global count
          count: t.dateCount !== undefined ? t.dateCount : (t.count || 0),
          times: t.times || 1,
          // Preserve dateStatus and dateCount for status determination
          dateStatus: t.dateStatus,
          dateCount: t.dateCount,
        }))

        // Add optimistic tasks at the beginning
        const optimisticTasksMapped = optimisticTasks.map((t: any) => ({
          ...t,
          displayName: t.name,
          count: 0,
          times: t.times || 1,
          isOptimistic: true,  // Mark as optimistic for UI feedback
        }))

        return [...optimisticTasksMapped, ...apiTasks]
      }

      // Fallback to old mergedTasks logic during migration
      return mergedTasks
    }, [tasksFromApi, optimisticTasks, mergedTasks])

    // Detect tasks needing migration (old embedded tasks without Task collection records)
    const tasksNeedingMigration = useMemo(() => {
      const templateTasks = mergedTasks || []
      if (!templateTasks.length) return []

      // Helper to get task key
      const keyOf = (t: any) => t?.localeKey || t?.id || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')

      // Get keys of tasks already in the collection
      const existingTaskKeys = new Set(
        tasksFromApi.map((t: any) => keyOf(t)).filter(Boolean)
      )

      const returnedTasks = templateTasks.filter((t: any) => {
        const key = keyOf(t)
        return key && !existingTaskKeys.has(key)
      })

      // Find templateTasks that aren't in the collection
      return returnedTasks
    }, [mergedTasks])

    // Trigger migration when needed
    useEffect(() => {
      // Skip if still initializing task lists (prevents duplicate tasks during first load)
      if (isInitializingTaskLists) return

      // Skip if no tasks need migration
      if (tasksNeedingMigration.length === 0) return

      // Skip if no list selected
      if (!selectedTaskListId) return

      // Skip if migration is already in progress (global lock)
      if (migrationInProgressRef.current) return

      // Skip if we already migrated this list in this session
      if (migratedListsRef.current.has(selectedTaskListId)) return

      // Check if user has permission to migrate (must be owner or manager)
      const userRef = selectedTaskList?.users?.find((u: any) => u.userId === userId)
      const userRole = userRef?.role
      if (!userRole || !['OWNER', 'MANAGER'].includes(userRole)) return

      // Trigger migration
      migrationInProgressRef.current = true
      migratedListsRef.current.add(selectedTaskListId)

      const keyOf = (t: any) => t?.localeKey || t?.id || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')
      const taskKeys = tasksNeedingMigration.map((t: any) => keyOf(t)).filter(Boolean)

      console.log(`[Migration] Starting migration for list ${selectedTaskListId} with ${taskKeys.length} tasks`)

      fetch('/api/v1/tasks/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId: selectedTaskListId,
          taskKeys
        })
      })
        .then(async (res) => {
          if (res.ok) {
            const result = await res.json()
            console.log(`[Migration] Success for list ${selectedTaskListId}:`, result)
            // Refresh tasks after successful migration
            await mutateTasks()
            await refreshTaskLists()
          } else {
            // Remove from migrated set on failure so it can be retried
            console.error(`[Migration] Request failed for list ${selectedTaskListId}:`, await res.text())
            migratedListsRef.current.delete(selectedTaskListId)
          }
        })
        .catch((err) => {
          console.error(`[Migration] Error for list ${selectedTaskListId}:`, err)
          // Remove from migrated set on error so it can be retried
          migratedListsRef.current.delete(selectedTaskListId)
        })
        .finally(() => {
          migrationInProgressRef.current = false
        })
    }, [isInitializingTaskLists, tasksNeedingMigration.length, selectedTaskListId, selectedTaskList?.users, userId, mutateTasks, refreshTaskLists])

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

    // Callback to refresh both jobs and tasks after job actions
    const handleRefreshJobData = useCallback(async () => {
      await Promise.all([
        mutateJobs(),
        mutateTasks(),
        refreshTaskLists(),
      ])
    }, [mutateJobs, mutateTasks, refreshTaskLists])

    // Check if tasks are loading for the selected date
    const isLoadingTasksForDate = isLoadingTasks && tasksUrl !== null

    // Check if task lists are loading (only show skeleton on initial load, not on refreshes)
    const hasNoTaskLists = contextTaskLists === null || contextTaskLists === undefined || (Array.isArray(contextTaskLists) && contextTaskLists.length === 0)
    const isTaskListsLoading = !initialLoadDone.current && hasNoTaskLists
    const isWaitingForListSelection = !initialLoadDone.current && (!selectedTaskListId || !selectedTaskList)
    const isLoading = isTaskListsLoading || isInitializingTaskLists || isWaitingForListSelection

    // Show loading state during initial task list creation (new user experience)
    if (isInitializingTaskLists) {
      return (
        <div className="space-y-4">
          {/* Toolbar skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <Skeleton className="h-9 w-full sm:w-[260px]" />
            <Skeleton className="h-9 w-full sm:w-[240px]" />
            <Skeleton className="h-9 w-20" />
          </div>

          {/* Initializing message with spinner */}
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <span className="text-muted-foreground text-center">
              {t('tasks.initializingTasks', { defaultValue: 'Setting up your tasks...' })}
            </span>
          </div>
        </div>
      )
    }

    // Show loading state when date changes and tasks are being fetched
    if (isLoadingTasksForDate && initialLoadDone.current) {
      return (
        <div className="space-y-4">
          {/* Toolbar skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <Skeleton className="h-9 w-full sm:w-[260px]" />
            <Skeleton className="h-9 w-full sm:w-[240px]" />
            <Skeleton className="h-9 w-20" />
          </div>

          {/* Loading message */}
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
            <span className="text-muted-foreground">{t('tasks.loadingForDate')}</span>
          </div>
        </div>
      )
    }

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
          tasks={tasksToDisplay}
          selectedTaskList={selectedTaskList}
          collabProfiles={collabProfiles}
          revealRedacted={revealRedacted}
          date={date}
          userId={userId}
          jobs={jobsFromApi}
          onRefresh={handleRefreshJobData}
          onRefreshUser={refreshUser}
          onRefreshTasks={mutateTasks}
        />
      </div>
    )
  }


