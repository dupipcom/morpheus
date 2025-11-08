'use client'

import React, { useMemo, useState, useEffect, useContext, useCallback } from 'react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DoToolbar } from '@/views/doToolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { User as UserIcon, Circle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { getWeekNumber } from '@/app/helpers'

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

  export const ListView = () => {
    const { session, taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
    const { t, locale } = useI18n()

    // Maintain stable task lists that never clear once loaded
    const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
    useEffect(() => {
      if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
        setStableTaskLists(contextTaskLists)
      }
    }, [contextTaskLists])

    const today = new Date()

    // State for selected date (defaults to today)
    const [selectedDate, setSelectedDate] = useState<Date>(today)

    // Compute date string and year from selected date
    const date = selectedDate.toISOString().split('T')[0]
    const year = Number(date.split('-')[0])
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
        setSelectedDate(new Date())
      }
    }, [selectedTaskListId])

    // Helper to get all dates in a week
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
        dates.push(weekDate.toISOString().split('T')[0])
      }
      return dates
    }, [selectedDate])

    // Determine if current list is weekly
    const isWeeklyList = useMemo(() => {
      const role = (selectedTaskList as any)?.role
      return role && typeof role === 'string' && role.startsWith('weekly.')
    }, [selectedTaskList])

    // Profiles cache (userId -> userName) for collaborators and completers
    const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
    useEffect(() => {
      let cancelled = false
      const run = async () => {
        try {
          // Collaborators
          const collaborators: string[] = Array.isArray((selectedTaskList as any)?.collaborators) ? (selectedTaskList as any).collaborators : []

          // Get completers - for weekly lists, check all dates in the week
          const completerIds = new Set<string>()
          const datesToCheck = isWeeklyList ? getWeekDates : [date]

          datesToCheck.forEach((checkDate: string) => {
            const completedForDay: any[] = (selectedTaskList as any)?.completedTasks?.[year]?.[checkDate] || []
            completedForDay.forEach((t: any) => {
              if (Array.isArray(t?.completers)) t.completers.forEach((c: any) => { if (c?.id) completerIds.add(String(c.id)) })
            })
          })

          const ids = Array.from(new Set([...(collaborators || []), ...Array.from(completerIds)]))
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
    }, [selectedTaskList?.id, JSON.stringify((selectedTaskList as any)?.collaborators || []), isWeeklyList, getWeekDates, date, year])

    // Build tasks: templateTasks + ephemeralTasks.open, overlay completedTasks[year][date or week]
    const mergedTasks = useMemo(() => {
      const base = (selectedTaskList?.templateTasks && selectedTaskList.templateTasks.length > 0)
        ? selectedTaskList.templateTasks
        : (selectedTaskList?.tasks || [])

      const ephemerals = (selectedTaskList?.ephemeralTasks?.open || []).map((t: any) => ({ ...t, isEphemeral: true }))

      // Include closed ephemeral tasks that were completed on the current date/timeframe
      const closedEphemerals = (selectedTaskList?.ephemeralTasks?.closed || [])
        .filter((t: any) => {
          if (!t.completedAt) return false
          const completedDate = new Date(t.completedAt).toISOString().split('T')[0]
          
          // For weekly lists, check if completed within the week
          if (isWeeklyList) {
            return getWeekDates.includes(completedDate)
          }
          
          // For daily lists, check if completed on the selected date
          return completedDate === date
        })
        .map((t: any) => ({ ...t, isEphemeral: true }))

      // For weekly lists, merge completedTasks from all dates in the week
      const datesToCheck = isWeeklyList ? getWeekDates : [date]
      const byKey: Record<string, any> = {}
      const keyOf = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : ''))

      datesToCheck.forEach((checkDate: string) => {
        const completedForDay: any[] = (selectedTaskList as any)?.completedTasks?.[year]?.[checkDate] || []
        completedForDay.forEach((t: any) => {
          const k = keyOf(t)
          if (!k) return

          // Merge completers from different days for weekly lists
          if (byKey[k]) {
            const existingCompleters = Array.isArray(byKey[k]?.completers) ? byKey[k].completers : []
            const newCompleters = Array.isArray(t?.completers) ? t.completers : []
            byKey[k] = {
              ...byKey[k],
              ...t,
              completers: [...existingCompleters, ...newCompleters]
            }
          } else {
            byKey[k] = t
          }
        })
      })

      const overlayed = base.map((t: any) => {
        const k = keyOf(t)
        const completed = k ? byKey[k] : undefined
        if (!completed) return t
        const doneCount = Array.isArray(completed?.completers) ? completed.completers.length : Number(completed?.count || 0)
        const times = Number(t?.times || completed?.times || 1)
        return { ...t, status: doneCount >= (times || 1) ? 'Done' : 'Open', count: Math.min(doneCount || 0, times || 1), completers: completed?.completers }
      })

      // Combine all ephemeral tasks (open + closed for current date/timeframe)
      const allEphemerals = [...ephemerals, ...closedEphemerals]
      
      // Dedup ephemeral by name against base
      const names = new Set(overlayed.map((t: any) => t.name))
      const dedupEphemeral = allEphemerals.filter((t: any) => !names.has(t.name))
      return [...overlayed, ...dedupEphemeral]
    }, [selectedTaskList, year, date, isWeeklyList, getWeekDates])

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

      // Update local state immediately
      setTaskStatuses(prev => ({ ...prev, [key]: effectiveStatus }))

      // Persist to API - we'll store this in the task's metadata
      if (!selectedTaskList) return

      try {
        // Store status in localStorage
        const statusKey = `task-status-${selectedTaskList.id}-${key}`
        localStorage.setItem(statusKey, effectiveStatus)

<<<<<<< Updated upstream
        // If status is "done", also mark the task as completed
        if (effectiveStatus === 'done' && taskName && !values.includes(taskName)) {
=======
        // If user selected "done", handle completion logic based on times/count
        if (effectiveStatus === 'done' && taskName && !values.includes(taskName)) {
          // If status is "done" and count >= times, mark the task as completed
>>>>>>> Stashed changes
          // Add to values to mark as toggled
          const newValues = [...values, taskName]
          setValues(newValues)
          setPrevValues(values)

          // Handle completion logic
          const regular = mergedTasks.filter((t: any) => !t.isEphemeral)
          const ephemerals = mergedTasks.filter((t: any) => t.isEphemeral)

          // Prepare next actions for regular tasks
          const nextActions = regular.map((action: any) => {
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

          // Persist to TaskList.completedTasks
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

          // Handle ephemerals
          const ephemeralTask = ephemerals.find((e: any) => e.name === taskName)
          if (ephemeralTask) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { close: { id: ephemeralTask.id } }
              })
            })
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

          // Refresh task lists
          await refreshTaskLists()
        } else if (newStatus !== 'done' && taskName && values.includes(taskName)) {
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

          // Persist uncompletion
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

          // Refresh task lists
          await refreshTaskLists()
        }
      } catch (error) {
        console.error('Error saving task status:', error)
      }
    }, [selectedTaskList, values, mergedTasks, date, today, refreshTaskLists])

    // Load task statuses from localStorage on mount
    useEffect(() => {
      if (!selectedTaskList) return
      const statuses: Record<string, TaskStatus> = {}

      mergedTasks.forEach((task: any) => {
        const key = task?.id || task?.localeKey || task?.name
        const statusKey = `task-status-${selectedTaskList.id}-${key}`
        const savedStatus = localStorage.getItem(statusKey) as TaskStatus | null
        if (savedStatus && STATUS_OPTIONS.includes(savedStatus)) {
          statuses[key] = savedStatus
        }
      })

      setTaskStatuses(statuses)
    }, [selectedTaskList?.id, mergedTasks.length])

    const refreshLists = useCallback(async () => { await refreshTaskLists() }, [refreshTaskLists])

    const handleToggleChange = async (newValues: string[]) => {
      setValues(newValues)
      const justCompleted = newValues.filter(v => !prevValues.includes(v))
      const justUncompleted = prevValues.filter(v => !newValues.includes(v))
      setPrevValues(newValues)

      if (!selectedTaskList) return

      // Update task statuses based on toggle state
      setTaskStatuses(prev => {
        const updated = { ...prev }

        // Set newly completed tasks to appropriate status based on times/count
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
            // Also save to localStorage
            try {
              const statusKey = `task-status-${selectedTaskList.id}-${key}`
              localStorage.setItem(statusKey, taskStatus)
            } catch (error) {
              console.error('Error saving task status:', error)
            }
          }
        })

        // Set newly uncompleted tasks to "open"
        justUncompleted.forEach(taskName => {
          const task = mergedTasks.find((t: any) => t.name === taskName)
          if (task) {
            const key = task?.id || task?.localeKey || task?.name
            updated[key] = 'open'
            // Also save to localStorage
            try {
              const statusKey = `task-status-${selectedTaskList.id}-${key}`
              localStorage.setItem(statusKey, 'open')
            } catch (error) {
              console.error('Error saving task status:', error)
            }
          }
        })

        return updated
      })

      // Split regular vs ephemerals based on mergedTasks
      const regular = mergedTasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = mergedTasks.filter((t: any) => t.isEphemeral)

      // Prepare next actions for regular tasks
      const nextActions = regular.map((action: any) => {
        const c = { ...action }
        if (newValues.includes(action.name) && (action.times - (action.count || 0)) === 1) {
          c.count = (c.count || 0) + 1
          c.status = 'Done'
        } else if (newValues.includes(action.name) && (action.times - (action.count || 0)) >= 1) {
          c.count = (c.count || 0) + 1
<<<<<<< Updated upstream
=======
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
>>>>>>> Stashed changes
        } else {
          if (!newValues.includes(action.name) && (c.times || 1) <= (c.count || 0)) {
            if ((c.count || 0) > 0) {
              c.count = (c.count || 0) - 1
              c.status = 'Open'
            }
          }
        }
        if ((c.count || 0) > 0 && c.status !== 'Done') {
          c.status = 'Open'
        }
        return c
      })

      // Persist: record completions into TaskList.completedTasks
      if (nextActions.length > 0) {
        await fetch('/api/v1/tasklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordCompletions: true,
            taskListId: selectedTaskList.id,
            dayActions: nextActions,
            date,
            justCompletedNames: justCompleted,
            justUncompletedNames: justUncompleted
          })
        })
      }

      // Handle ephemerals: move from open to closed when toggled done
      for (const eph of ephemerals) {
        const isNowDone = newValues.includes(eph.name)
        const wasDone = prevValues.includes(eph.name)
        if (isNowDone && !wasDone) {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId: selectedTaskList.id,
              ephemeralTasks: { close: { id: eph.id } }
            })
          })
        }
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
    }

    const handleDateChange = useCallback((date: Date | undefined) => {
      if (date) {
        setSelectedDate(date)
      }
    }, [])

    console.log("LISTVIEW", { selectedTaskListId, selectedTaskList, allTaskLists })

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
        >
          {sortedMergedTasks.map((task: any) => {
            const isDone = (task?.status === 'Done') || values.includes(task?.name)
            const lastCompleter = Array.isArray(task?.completers) && task.completers.length > 0 ? task.completers[task.completers.length - 1] : undefined
            const isCollabCompleter = lastCompleter && Array.isArray((selectedTaskList as any)?.collaborators) && (selectedTaskList as any).collaborators.includes(lastCompleter.id)
            const completerName = lastCompleter ? (collabProfiles[String(lastCompleter.id)] || String(lastCompleter.id)) : ''

            const key = task?.id || task?.localeKey || task?.name
<<<<<<< Updated upstream
            const taskStatus = taskStatuses[key] || (task?.taskStatus as TaskStatus) || 'open'
=======
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
>>>>>>> Stashed changes
            const statusColor = getStatusColor(taskStatus, 'css')
            const iconColor = getIconColor(taskStatus)

            return (
              <div key={`task__item--${task.name}`} className="flex flex-col items-center m-1">
                <div className="relative w-full flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full shrink-0 p-0"
                        style={{ backgroundColor: statusColor }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Circle 
                          className={`h-4 w-4`} 
                          style={taskStatus == "done" ? {fill: iconColor} : { color: iconColor }} 
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {STATUS_OPTIONS.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusChange(task, status)
                          }}
                        >
                          <Circle
                            className={`h-4 w-4 mr-2`}
                            style={{fill: getStatusColor(status), color: getStatusColor(status) }}
                          />
                          {t(`tasks.status.${status}`)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <ToggleGroupItem className="rounded-md leading-7 text-sm min-h-[40px] h-auto flex-1 whitespace-normal break-words py-2" value={task.name} aria-label={task.name}>
                    {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}{task.displayName || task.name}
                  </ToggleGroupItem>
                </div>
                {isDone
                  && Array.isArray((selectedTaskList as any)?.collaborators)
                  && (selectedTaskList as any).collaborators.length > 0
                  && isCollabCompleter
                  && lastCompleter
                  && completerName && (
                    <div className="mt-1">
                      <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted">
                        <UserIcon className="h-3 w-3 mr-1" />
                        {completerName}
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


