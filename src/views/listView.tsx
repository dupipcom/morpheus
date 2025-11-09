'use client'

import React, { useMemo, useState, useEffect, useContext, useCallback, useRef } from 'react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DoToolbar } from '@/views/doToolbar'
import { Badge } from '@/components/ui/badge'
import { User as UserIcon, Circle, Minus } from 'lucide-react'
import { OptionsButton, OptionsMenuItem } from '@/components/OptionsButton'
import { Skeleton } from '@/components/ui/skeleton'

import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { getWeekNumber } from '@/app/helpers'
import { useUserData } from '@/lib/userUtils'

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

  export const ListView = () => {
    const { session, taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
    const { t, locale } = useI18n()
    const { refreshUser } = useUserData()

    // Track if initial load has been done
    const initialLoadDone = useRef(false)

    // Maintain stable task lists that never clear once loaded
    const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
    useEffect(() => {
      if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
        setStableTaskLists(contextTaskLists)
        initialLoadDone.current = true
      }
    }, [contextTaskLists])

    // Get today's date in local timezone, normalized to midnight
    const today = useMemo(() => {
      const d = new Date()
      return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    }, [])

    // State for selected date (defaults to today)
    const [selectedDate, setSelectedDate] = useState<Date>(today)

    // Compute date string and year from selected date (using local timezone)
    // Memoize these so React can properly track changes
    const date = useMemo(() => formatDateLocal(selectedDate), [selectedDate])
    const year = useMemo(() => Number(date.split('-')[0]), [date])
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
    }, [selectedTaskListId])

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
          // Owners
          const owners: string[] = Array.isArray((selectedTaskList as any)?.owners) ? (selectedTaskList as any).owners : []
          
          // Collaborators
          const collaborators: string[] = Array.isArray((selectedTaskList as any)?.collaborators) ? (selectedTaskList as any).collaborators : []

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

          const ids = Array.from(new Set([...(owners || []), ...(collaborators || []), ...Array.from(completerIds)]))
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
    }, [selectedTaskList?.id, JSON.stringify((selectedTaskList as any)?.owners || []), JSON.stringify((selectedTaskList as any)?.collaborators || []), isWeeklyList, getWeekDates, date, year])

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
              if (t.status === 'Done' || (t.count || 0) >= (t.times || 1)) {
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
          base = [...base, ...newTasks.map((t: any) => ({ ...t, count: 0, status: 'Open' }))]
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
      const closedEphemerals = (selectedTaskList && selectedTaskList.id === selectedTaskListId && selectedTaskList?.ephemeralTasks?.closed)
        ? (selectedTaskList.ephemeralTasks.closed || [])
            .filter((t: any) => {
              // Must have a completedAt timestamp
              if (!t.completedAt) return false
              
              // Format completed date in local timezone for comparison
              const completedDate = formatDateLocal(new Date(t.completedAt))
              
              // For weekly lists, check if completed within the selected week
              if (isWeeklyList) {
                return getWeekDates.includes(completedDate)
              }
              
              // For daily lists, only show if completed on the exact selected date
              return completedDate === date
            })
            .map((t: any) => ({ ...t, isEphemeral: true }))
        : []

      // Merge base tasks with closedTasks (closedTasks take precedence for completed tasks)
      const overlayed = base.map((t: any) => {
        const k = keyOf(t)
        const closedTask = k ? closedTasksByKey[k] : undefined
        
        if (closedTask) {
          // Task is completed - use closedTask data
          const times = Number(closedTask?.times || t?.times || 1)
          const completedCount = Array.isArray(closedTask?.completers) ? closedTask.completers.length : Number(closedTask?.count || 0)
          const status = completedCount >= times ? 'Done' : 'Open'
          const taskStatus = closedTask?.taskStatus || t?.taskStatus || (status === 'Done' ? 'done' : (completedCount > 0 ? 'in progress' : undefined))
          
          return { 
            ...t, // Start with base task
            ...closedTask, // Override with closedTask data (takes precedence)
            status, 
            count: Math.min(completedCount || 0, times || 1), 
            completers: closedTask?.completers,
            taskStatus
          }
        }
        
        // Task is open - use base task data (from openTasks or tasklist.tasks)
        return { ...t, count: t.count || 0 }
      })
      
      // Add any closedTasks that aren't in base (shouldn't happen, but handle edge cases)
      const baseKeys = new Set(base.map((t: any) => keyOf(t)))
      const additionalClosedTasks = allClosedTasks.filter((t: any) => {
        const k = keyOf(t)
        return k && !baseKeys.has(k)
      })

      // Combine all ephemeral tasks (open + closed for current date/timeframe)
      const allEphemerals = [...ephemerals, ...closedEphemerals]

      
      // Dedup ephemeral by name against base
      const names = new Set(overlayed.map((t: any) => t.name))
      const dedupEphemeral = allEphemerals.filter((t: any) => !names.has(t.name))
      
      return [...overlayed, ...additionalClosedTasks, ...dedupEphemeral]
    }, [selectedTaskList, year, date, isWeeklyList, getWeekDates, selectedDate, datesToCheck])

    const doneNames = useMemo(() => mergedTasks.filter((t: any) => t.status === 'Done').map((t: any) => t.name), [mergedTasks])
    const [values, setValues] = useState<string[]>(doneNames)
    const [prevValues, setPrevValues] = useState<string[]>(doneNames)
    useEffect(() => { setValues(doneNames); setPrevValues(doneNames) }, [doneNames])

    // Track task statuses
    const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})

    // Sort tasks: by status order first, then incomplete before completed. Use current toggles as well.
    const sortedMergedTasks = useMemo(() => {
      const isDone = (t: any) => (t?.status === 'Done') || values.includes(t?.name)
      const getTaskStatus = (t: any): TaskStatus => {
        const key = t?.id || t?.localeKey || t?.name
        return taskStatuses[key] || (t?.taskStatus as TaskStatus) || 'open'
      }

      return [...mergedTasks].sort((a: any, b: any) => {
        const aStatus = getTaskStatus(a)
        const bStatus = getTaskStatus(b)
        const aStatusIndex = STATUS_OPTIONS.indexOf(aStatus)
        const bStatusIndex = STATUS_OPTIONS.indexOf(bStatus)

        // Sort by status order first
        if (aStatusIndex !== bStatusIndex) {
          return aStatusIndex - bStatusIndex
        }

        // Then sort by completion
        const aDone = isDone(a)
        const bDone = isDone(b)
        if (aDone === bDone) return 0
        return aDone ? 1 : -1
      })
    }, [mergedTasks, values, taskStatuses])

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

    const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
      const key = task?.id || task?.localeKey || task?.name
      const taskName = task?.name

      // Allow manual status setting to take precedence
      // Only auto-determine status based on count/times when clicking "done" to increment count
      const effectiveStatus = newStatus

      // Update local state immediately (optimistic update)
      setTaskStatuses(prev => ({ ...prev, [key]: effectiveStatus }))

      // Persist to API
      if (!selectedTaskList) return

      try {
        // Persist task status to API (include date so task is copied to completedTasks)
        await fetch('/api/v1/tasklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updateTaskStatus: true,
            taskListId: selectedTaskList.id,
            taskKey: key,
            taskStatus: effectiveStatus,
            date: date // Include current date so task is copied to completedTasks
          })
        })

        // If status is "done", also mark the task as completed
        if (effectiveStatus === 'done' && taskName && !values.includes(taskName)) {
          // If status is "done" and count >= times, mark the task as completed
          // Add to values to mark as toggled
          const newValues = [...values, taskName]
          setValues(newValues)
          setPrevValues(values)

          // Handle completion logic
          const regular = mergedTasks.filter((t: any) => !t.isEphemeral)
          const ephemerals = mergedTasks.filter((t: any) => t.isEphemeral)

          // Prepare next actions for both regular and ephemeral tasks
          const allTasks = [...regular, ...ephemerals]
          const nextActions = allTasks.map((action: any) => {
            const c = { ...action }
            if (action.name === taskName) {
              // This is the task being marked as done
              if ((action.times - (action.count || 0)) === 1) {
                c.count = (c.count || 0) + 1
                c.status = 'Done'
              } else if ((action.times - (action.count || 0)) >= 1) {
                c.count = (c.count || 0) + 1
              }
            } else if (newValues.includes(action.name) && (action.times - (action.count || 0)) === 1) {
              c.count = (c.count || 0) + 1
              c.status = 'Done'
            } else if (newValues.includes(action.name) && (action.times - (action.count || 0)) >= 1) {
              c.count = (c.count || 0) + 1
            }
            if ((c.count || 0) > 0 && c.status !== 'Done') {
              c.status = 'Open'
            }
            return c
          })

          // Persist to TaskList.completedTasks (backend handles earnings and user entries)
          if (nextActions.length > 0) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recordCompletions: true,
                taskListId: selectedTaskList.id,
                dayActions: nextActions,
                date,
                justCompletedNames: [taskName],
                justUncompletedNames: []
              })
            })
          }

          // Handle ephemerals - only close if fully completed
          const ephemeralTask = ephemerals.find((e: any) => e.name === taskName)
          if (ephemeralTask) {
            const updatedEph = nextActions.find((a: any) => a.name === taskName)
            if (updatedEph && updatedEph.status === 'Done') {
              // Fully completed - close it
              await fetch('/api/v1/tasklists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskListId: selectedTaskList.id,
                  ephemeralTasks: { close: { id: ephemeralTask.id, count: updatedEph.count } }
                })
              })
            } else if (updatedEph) {
              // Partially completed - update count
              await fetch('/api/v1/tasklists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskListId: selectedTaskList.id,
                  ephemeralTasks: { update: { id: ephemeralTask.id, count: updatedEph.count, status: updatedEph.status } }
                })
              })
            }
          }
          // Update user entries for weekly lists
          try {
            const isWeekly = typeof (selectedTaskList as any)?.role === 'string' && (selectedTaskList as any).role.startsWith('weekly')
            if (isWeekly) {
              const doneForWeek = nextActions.filter((a: any) => a?.status === 'Done')
              if (doneForWeek.length > 0) {
                const week = getWeekNumber(today)[1]
                await fetch('/api/v1/user', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ weekTasksAppend: doneForWeek, week, date, listRole: (selectedTaskList as any)?.role })
                })
              }
            }
          } catch { }

          // Update user entries for day
          try {
            const doneForDay = nextActions.filter((a: any) => a?.status === 'Done')
            if (doneForDay.length > 0) {
              await fetch('/api/v1/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dayTasksAppend: doneForDay, date, listRole: (selectedTaskList as any)?.role })
              })
            }
          } catch { }

          // Refresh task lists and user data
          await refreshTaskLists()
          await refreshUser()
        } else if (effectiveStatus !== 'done' && taskName && values.includes(taskName)) {
          // If status is changed away from "done", unmark the task
          const newValues = values.filter(v => v !== taskName)
          setValues(newValues)
          setPrevValues(values)

          // Handle uncompletion logic
          const regular = mergedTasks.filter((t: any) => !t.isEphemeral)
          const nextActions = regular.map((action: any) => {
            const c = { ...action }
            if (action.name === taskName && (c.times || 1) <= (c.count || 0)) {
              if ((c.count || 0) > 0) {
                c.count = (c.count || 0) - 1
                c.status = 'Open'
              }
            } else if (newValues.includes(action.name) && (action.times - (action.count || 0)) === 1) {
              c.count = (c.count || 0) + 1
              c.status = 'Done'
            } else if (newValues.includes(action.name) && (action.times - (action.count || 0)) >= 1) {
              c.count = (c.count || 0) + 1
            }
            if ((c.count || 0) > 0 && c.status !== 'Done') {
              c.status = 'Open'
            }
            return c
          })

          // Persist uncompletion (backend handles user entry removal)
          if (nextActions.length > 0) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recordCompletions: true,
                taskListId: selectedTaskList.id,
                dayActions: nextActions,
                date,
                justCompletedNames: [],
                justUncompletedNames: [taskName]
              })
            })
          }

          // Update user entries
          try {
            const isWeekly = typeof (selectedTaskList as any)?.role === 'string' && (selectedTaskList as any).role.startsWith('weekly')
            if (isWeekly) {
              const week = getWeekNumber(today)[1]
              await fetch('/api/v1/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weekTasksRemoveNames: [taskName], week, date, listRole: (selectedTaskList as any)?.role })
              })
            }
          } catch { }

          try {
            await fetch('/api/v1/user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dayTasksRemoveNames: [taskName], date, listRole: (selectedTaskList as any)?.role })
            })
          } catch { }

          // Handle ephemeral task uncompletion - reopen it if it was in closed
          const ephemerals = mergedTasks.filter((t: any) => t.isEphemeral)
          const ephemeralTask = ephemerals.find((e: any) => e.name === taskName)
          if (ephemeralTask) {
            const newCount = Math.max(0, (ephemeralTask.count || 1) - 1)
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { reopen: { id: ephemeralTask.id, count: newCount } }
              })
            })
          }

          // Refresh task lists and user data
          await refreshTaskLists()
          await refreshUser()
        } else if (effectiveStatus !== 'done' && taskName && !values.includes(taskName)) {
          // Task status changed to non-done and already uncompleted
          // Just refresh to ensure UI is in sync
          await refreshTaskLists()
          await refreshUser()
        }
      } catch (error) {
        console.error('Error saving task status:', error)
      }
    }, [selectedTaskList, values, mergedTasks, date, today, refreshTaskLists, refreshUser])

    const handleDecrementCount = useCallback(async (task: any) => {
      if (!selectedTaskList) return
      const taskName = task?.name
      const currentCount = task?.count || 0
      
      // Can't decrement below 0
      if (currentCount <= 0) return

      // Optimistic UI update for taskStatus
      const key = task?.id || task?.localeKey || task?.name
      const newCount = currentCount - 1
      const times = task?.times || 1
      
      setTaskStatuses(prev => {
        const updated = { ...prev }
        if (newCount >= times) {
          updated[key] = 'done'
        } else if (newCount > 0) {
          const existingStatus = prev[key]
          if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
            updated[key] = 'in progress'
          }
        } else if (newCount === 0) {
          updated[key] = 'open'
        }
        return updated
      })

      try {
        // Prepare next actions with decremented count
        const regular = mergedTasks.filter((t: any) => !t.isEphemeral)
        const ephemerals = mergedTasks.filter((t: any) => t.isEphemeral)
        const allTasks = [...regular, ...ephemerals]
        
        const nextActions = allTasks.map((action: any) => {
          const c = { ...action }
          if (action.name === taskName) {
            c.count = Math.max(0, (c.count || 0) - 1)
            // Update status and taskStatus based on new count
            if (c.count >= (c.times || 1)) {
              c.status = 'Done'
              c.taskStatus = 'done'
            } else {
              c.status = 'Open'
              // Preserve manually set status or default based on count
              const key = action?.id || action?.localeKey || action?.name
              const existingStatus = taskStatuses[key]
              if (c.count > 0 && (!existingStatus || existingStatus === 'done' || existingStatus === 'open')) {
                c.taskStatus = 'in progress'
              } else if (c.count === 0) {
                c.taskStatus = 'open'
              }
              // Otherwise preserve existing taskStatus
            }
          }
          return c
        })

        // Persist to backend
        await fetch('/api/v1/tasklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordCompletions: true,
            taskListId: selectedTaskList.id,
            dayActions: nextActions,
            date,
            justCompletedNames: [],
            justUncompletedNames: []
          })
        })

        // Handle ephemeral tasks
        const ephemeralTask = ephemerals.find((e: any) => e.name === taskName)
        if (ephemeralTask) {
          const updatedEph = nextActions.find((a: any) => a.name === taskName)
          if (updatedEph) {
            const newCount = updatedEph.count || 0
            const times = updatedEph.times || 1
            
            // Check if the ephemeral task is in the closed array
            const closedEphemerals = (selectedTaskList?.ephemeralTasks?.closed || [])
            const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
            
            if (isInClosed && newCount < times) {
              // Task is closed but count is now below times - reopen it
              await fetch('/api/v1/tasklists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskListId: selectedTaskList.id,
                  ephemeralTasks: { reopen: { id: ephemeralTask.id, count: newCount } }
                })
              })
              // Remove from values since it's no longer completed
              setValues(values.filter(v => v !== taskName))
              setPrevValues(values.filter(v => v !== taskName))
            } else if (!isInClosed) {
              // Task is in open array - just update the count
              await fetch('/api/v1/tasklists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskListId: selectedTaskList.id,
                  ephemeralTasks: { update: { id: ephemeralTask.id, count: newCount, status: updatedEph.status } }
                })
              })
            }
          }
        }

        // If task was in values and count is now less than times, remove it
        if (values.includes(taskName)) {
          const newCount = currentCount - 1
          const times = task?.times || 1
          if (newCount < times) {
            setValues(values.filter(v => v !== taskName))
            setPrevValues(values.filter(v => v !== taskName))
          }
        }

        await refreshTaskLists()
        await refreshUser()
      } catch (error) {
        console.error('Error decrementing count:', error)
      }
    }, [selectedTaskList, mergedTasks, values, date, refreshTaskLists, refreshUser, taskStatuses])

    // Initialize task statuses from API data
    useEffect(() => {
      if (!selectedTaskList) return
      const statuses: Record<string, TaskStatus> = {}

      mergedTasks.forEach((task: any) => {
        const key = task?.id || task?.localeKey || task?.name
        
        // Use taskStatus from the task object if available
        if (task.taskStatus && STATUS_OPTIONS.includes(task.taskStatus as TaskStatus)) {
          statuses[key] = task.taskStatus as TaskStatus
        } else if (task.status === 'Done') {
          // If task is completed but doesn't have taskStatus, default to 'done'
          statuses[key] = 'done'
        } else if ((task.count || 0) > 0 && (task.count || 0) < (task.times || 1)) {
          // If task has partial progress, mark as 'in progress'
          statuses[key] = 'in progress'
        }
        // Otherwise, leave it undefined and it will default to 'open' in the render
      })

      setTaskStatuses(statuses)
    }, [selectedTaskList?.id, mergedTasks.length])

    const refreshLists = useCallback(async () => { await refreshTaskLists() }, [refreshTaskLists])

    const handleToggleChange = async (newValues: string[]) => {
      const justCompleted = newValues.filter(v => !prevValues.includes(v))
      const justUncompleted = prevValues.filter(v => !newValues.includes(v))

      if (!selectedTaskList) return

      // Filter out tasks that shouldn't be marked as completed yet (times > count + 1)
      const actuallyCompleted: string[] = []
      const tasksToRemoveFromValues: string[] = []

      justCompleted.forEach(taskName => {
        const task = mergedTasks.find((t: any) => t.name === taskName)
        if (task) {
          const currentCount = task?.count || 0
          const times = task?.times || 1
          const newCount = currentCount + 1
          
          // Only mark as completed in values if newCount >= times
          if (newCount >= times) {
            actuallyCompleted.push(taskName)
          } else {
            // Remove from values since it shouldn't show as completed yet
            tasksToRemoveFromValues.push(taskName)
          }
        }
      })

      // Adjust newValues to exclude tasks that aren't fully completed yet
      const adjustedValues = newValues.filter(v => !tasksToRemoveFromValues.includes(v))
      setValues(adjustedValues)
      setPrevValues(adjustedValues)

      // Update task statuses based on toggle state (optimistic UI update)
      setTaskStatuses(prev => {
        const updated = { ...prev }

        // Set newly clicked tasks to appropriate status based on times/count
        justCompleted.forEach(taskName => {
          const task = mergedTasks.find((t: any) => t.name === taskName)
          if (task) {
            const key = task?.id || task?.localeKey || task?.name
            const currentCount = task?.count || 0
            const times = task?.times || 1
            const newCount = currentCount + 1
            
            // Check if there's a manually set status to preserve
            const existingStatus = prev[key] || (task?.taskStatus as TaskStatus)
            
            // Determine the appropriate status based on times and count
            let taskStatus: TaskStatus = 'done'
            if (newCount < times) {
              // Preserve manually set status (except 'open' and 'done')
              if (existingStatus && existingStatus !== 'open' && existingStatus !== 'done') {
                taskStatus = existingStatus
              } else {
                taskStatus = 'in progress'
              }
            } else if (newCount >= times) {
              taskStatus = 'done'
            }
            
            updated[key] = taskStatus
          }
        })

        // Set newly uncompleted tasks to "open"
        justUncompleted.forEach(taskName => {
          const task = mergedTasks.find((t: any) => t.name === taskName)
          if (task) {
            const key = task?.id || task?.localeKey || task?.name
            updated[key] = 'open'
          }
        })

        return updated
      })

      // Split regular vs ephemerals based on mergedTasks
      const regular = mergedTasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = mergedTasks.filter((t: any) => t.isEphemeral)

      // Prepare next actions for regular tasks AND ephemeral tasks (both need count logic)
      const allTasks = [...regular, ...ephemerals]
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        // Check if this task was just clicked (whether fully completed or not)
        const wasJustClicked = justCompleted.includes(action.name)
        const isFullyCompleted = adjustedValues.includes(action.name)
        
        if (wasJustClicked) {
          // Increment count for any clicked task
          c.count = (c.count || 0) + 1
          // Only mark as Done if count reaches times
          if (c.count >= (c.times || 1)) {
            c.status = 'Done'
            c.taskStatus = 'done'
          } else {
            c.status = 'Open'
            // Preserve manually set status if it exists (except 'open' and 'done')
            const manualStatus = c.taskStatus
            if (!manualStatus || manualStatus === 'open' || manualStatus === 'done') {
              c.taskStatus = 'in progress'
            }
            // Otherwise keep the existing taskStatus
          }
        } else if (isFullyCompleted) {
          // Task is in values but wasn't just clicked (was already completed)
          // Ensure taskStatus is 'done'
          if (c.status === 'Done') {
            c.taskStatus = 'done'
          }
        } else {
          // Task is not in values - check if it should be uncompleted
          if (!adjustedValues.includes(action.name) && (c.times || 1) <= (c.count || 0)) {
            if ((c.count || 0) > 0) {
              c.count = (c.count || 0) - 1
              c.status = 'Open'
              c.taskStatus = 'open'
            }
          }
        }
        if ((c.count || 0) > 0 && c.status !== 'Done') {
          c.status = 'Open'
          if (!c.taskStatus || c.taskStatus === 'done') {
            c.taskStatus = (c.count || 0) > 0 ? 'in progress' : 'open'
          }
        }
        return c
      })

      // Persist: record completions into TaskList.completedTasks (backend handles earnings and user entries)
      // Send ALL clicked tasks (justCompleted) so backend increments count for all of them
      // But only mark as fully "completed" in user entries for actuallyCompleted
      if (nextActions.length > 0) {
        await fetch('/api/v1/tasklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordCompletions: true,
            taskListId: selectedTaskList.id,
            dayActions: nextActions,
            date,
            justCompletedNames: justCompleted, // Send all clicked tasks to increment count
            justUncompletedNames: justUncompleted
          })
        })
      }

      // Handle ephemerals: batch all operations into a single API call
      const ephemeralToClose: any[] = []
      const ephemeralToUpdate: any[] = []
      const ephemeralToReopen: any[] = []
      
      for (const eph of ephemerals) {
        const wasJustClicked = justCompleted.includes(eph.name)
        const wasJustUncompleted = justUncompleted.includes(eph.name)
        const isFullyCompleted = adjustedValues.includes(eph.name)
        const wasDone = prevValues.includes(eph.name)
        
        if (wasJustClicked) {
          const updatedEph = nextActions.find((a: any) => a.name === eph.name)
          
          if (updatedEph && updatedEph.status === 'Done' && isFullyCompleted && !wasDone) {
            // Fully completed - add to close batch
            ephemeralToClose.push({ id: eph.id, count: updatedEph.count })
          } else if (updatedEph) {
            // Partially completed - add to update batch
            ephemeralToUpdate.push({ id: eph.id, count: updatedEph.count, status: updatedEph.status })
          }
        } else if (wasJustUncompleted && wasDone) {
          // Task was uncompleted - reopen it (move from closed to open)
          const updatedEph = nextActions.find((a: any) => a.name === eph.name)
          const newCount = Math.max(0, (eph.count || 1) - 1)
          ephemeralToReopen.push({ id: eph.id, count: newCount })
        }
      }
      
      // Make a single API call with all ephemeral operations
      if (ephemeralToClose.length > 0 || ephemeralToUpdate.length > 0 || ephemeralToReopen.length > 0) {
        const ephemeralOperations: any = {}
        if (ephemeralToClose.length > 0) ephemeralOperations.close = ephemeralToClose
        if (ephemeralToUpdate.length > 0) ephemeralOperations.update = ephemeralToUpdate
        if (ephemeralToReopen.length > 0) ephemeralOperations.reopen = ephemeralToReopen
        
        await fetch('/api/v1/tasklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskListId: selectedTaskList.id,
            ephemeralTasks: ephemeralOperations
          })
        })
      }

      // If this is a weekly list, also persist tasks under user.entries[year].weeks[weekNumber].tasks
      try {
        const isWeekly = typeof (selectedTaskList as any)?.role === 'string' && (selectedTaskList as any).role.startsWith('weekly')
        if (isWeekly) {
          const doneForWeek = nextActions.filter((a: any) => a?.status === 'Done')
          if (doneForWeek.length > 0) {
            const week = getWeekNumber(today)[1]
            await fetch('/api/v1/user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ weekTasksAppend: doneForWeek, week, date, listRole: (selectedTaskList as any)?.role })
            })
          }
          // Remove uncompleted from week entry
          if (justUncompleted.length > 0) {
            const week = getWeekNumber(today)[1]
            await fetch('/api/v1/user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ weekTasksRemoveNames: justUncompleted, week, date, listRole: (selectedTaskList as any)?.role })
            })
          }
        }
      } catch { }

      // Always append all Done tasks to user.entries[year].days[date].tasks
      try {
        const doneForDay = nextActions.filter((a: any) => a?.status === 'Done')
        if (doneForDay.length > 0) {
          await fetch('/api/v1/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dayTasksAppend: doneForDay, date, listRole: (selectedTaskList as any)?.role })
          })
        }
        if (justUncompleted.length > 0) {
          await fetch('/api/v1/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dayTasksRemoveNames: justUncompleted, date, listRole: (selectedTaskList as any)?.role })
          })
        }
      } catch { }

      await refreshTaskLists()
      await refreshUser()
    }

    const handleDateChange = useCallback((date: Date | undefined) => {
      if (date) {
        // Normalize date to midnight in local timezone to avoid time component issues
        const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        setSelectedDate(normalizedDate)
      }
    }, [])

    // Check if task lists are loading (only show skeleton on initial load, not on refreshes)
    const isTaskListsLoading = !initialLoadDone.current && (contextTaskLists === null || contextTaskLists === undefined || (Array.isArray(contextTaskLists) && contextTaskLists.length === 0))
    const isLoading = isTaskListsLoading || (!initialLoadDone.current && (!selectedTaskListId || !selectedTaskList))

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <DoToolbar
          locale={locale}
          selectedTaskListId={selectedTaskListId}
          onChangeSelectedTaskListId={setSelectedTaskListId}
          onAddEphemeral={handleAddEphemeral}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
        />

        <ToggleGroup
          value={values}
          onValueChange={handleToggleChange}
          variant="outline"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto"
          type="multiple"
          orientation="horizontal"
          key={`list__selected--${selectedTaskListId}--${date}`}
        >
          {sortedMergedTasks.map((task: any) => {
            const isDone = (task?.status === 'Done') || values.includes(task?.name)
            const lastCompleter = Array.isArray(task?.completers) && task.completers.length > 0 ? task.completers[task.completers.length - 1] : undefined
            const isCollabCompleter = lastCompleter && Array.isArray((selectedTaskList as any)?.collaborators) && (selectedTaskList as any).collaborators.includes(lastCompleter.id)
            const isOwnerCompleter = lastCompleter && Array.isArray((selectedTaskList as any)?.owners) && (selectedTaskList as any).owners.includes(lastCompleter.id)
            const hasCollaborators = Array.isArray((selectedTaskList as any)?.collaborators) && (selectedTaskList as any).collaborators.length > 0
            
            // Get the completer name: if there's a lastCompleter use them, otherwise use the owner
            const ownerId = Array.isArray((selectedTaskList as any)?.owners) && (selectedTaskList as any).owners.length > 0 ? (selectedTaskList as any).owners[0] : undefined
            const completerName = lastCompleter 
              ? (collabProfiles[String(lastCompleter.id)] || String(lastCompleter.id))
              : (ownerId ? (collabProfiles[String(ownerId)] || String(ownerId)) : '')
            
            // Calculate earnings for THIS specific task completion
            const listBudget = parseFloat((selectedTaskList as any)?.budget || '0')
            const listRole = (selectedTaskList as any)?.role
            const isDaily = listRole?.startsWith('daily.')
            const isWeekly = listRole?.startsWith('weekly.')
            const totalTasks = (selectedTaskList?.tasks as any[])?.length || (selectedTaskList?.templateTasks as any[])?.length || 1
            
            let taskEarnings = 0
            if (listBudget > 0 && totalTasks > 0) {
              const actionProfit = listBudget / totalTasks
              
              if (isDaily) {
                taskEarnings = actionProfit / 30 // Daily profit per task
              } else if (isWeekly) {
                taskEarnings = actionProfit / 4 // Weekly profit per task
              } else {
                taskEarnings = actionProfit // One-off profit per task
              }
            }

            const key = task?.id || task?.localeKey || task?.name
            // Prioritize manually set status over automatic count-based status
            let taskStatus: TaskStatus
            
            // First check if there's a manually set status
            const storedStatus = taskStatuses[key] || (task?.taskStatus as TaskStatus)
            
            if (values.includes(task?.name)) {
              // Task is in values (completed) - use 'done' status
              taskStatus = 'done'
            } else if (storedStatus) {
              // Use manually set status if available (takes precedence)
              // But don't allow 'done' if task is not in values
              taskStatus = storedStatus === 'done' ? 'open' : storedStatus
            } else if ((task.count || 0) > 0 && (task.count || 0) < (task.times || 1)) {
              // Fall back to count-based status if no manual status set
              taskStatus = 'in progress'
            } else {
              // Default to 'open'
              taskStatus = 'open'
            }
            const statusColor = getStatusColor(taskStatus, 'css')
            const iconColor = getIconColor(taskStatus)

            // Build options menu items
            const optionsMenuItems: OptionsMenuItem[] = [
              ...STATUS_OPTIONS.map((status) => ({
                label: (
                  <>
                    <Circle
                      className="h-4 w-4"
                      style={{ fill: getStatusColor(status), color: getStatusColor(status) }}
                    />
                    <span className="ml-2">{t(`tasks.status.${status}`)}</span>
                  </>
                ),
                onClick: () => handleStatusChange(task, status),
                icon: null,
              })),
              ...((task.times || 1) > 1 && (task.count || 0) > 0
                ? [
                    {
                      label: 'Decrement count',
                      onClick: () => handleDecrementCount(task),
                      icon: <Minus className="h-4 w-4" />,
                      separator: true,
                    },
                  ]
                : []),
            ]

            return (
              <div key={`task__item--${task.name}`} className="flex flex-col items-center m-1">
                <div className="relative w-full flex items-center gap-2">
                  <OptionsButton
                    items={optionsMenuItems}
                    statusColor={statusColor}
                    iconColor={iconColor}
                    iconFilled={taskStatus === "done"}
                    align="start"
                  />

                  <ToggleGroupItem className="rounded-md leading-7 text-sm min-h-[40px] h-auto flex-1 whitespace-normal break-words py-2" value={task.name} aria-label={task.name}>
                    {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}{task.displayName || task.name}
                  </ToggleGroupItem>
                </div>
                {isDone
                  && hasCollaborators
                  && completerName && (
                    <div className="mt-1">
                      <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted">
                        <UserIcon className="h-3 w-3 mr-1" />
                        @{completerName}{taskEarnings > 0 ? `: $${taskEarnings.toFixed(2)}` : ''}
                      </Badge>
                    </div>
                  )}
              </div>
            )
          })}
        </ToggleGroup>
      </div>
    )
  }


