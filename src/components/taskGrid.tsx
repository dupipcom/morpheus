'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User as UserIcon } from 'lucide-react'
import { OptionsButton, OptionsMenuItem } from '@/components/optionsButton'
import { Circle, Minus, Plus, Eye, EyeOff } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { getProfitPerTask } from '@/lib/earningsUtils'

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

interface TaskGridProps {
  tasks: any[]
  selectedTaskList: any
  collabProfiles: Record<string, string>
  revealRedacted: boolean
  date: string
  onRefresh: () => Promise<void>
  onRefreshUser: () => Promise<void>
}

export const TaskGrid = ({
  tasks,
  selectedTaskList,
  collabProfiles,
  revealRedacted,
  date,
  onRefresh,
  onRefreshUser,
}: TaskGridProps) => {
  const { t } = useI18n()
  
  // Track task statuses
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})
  
  // Track pending completion requests and status updates to protect optimistic updates
  const pendingCompletionsRef = useRef<Map<string, { count: number; status: TaskStatus; inClosed: boolean }>>(new Map())
  const pendingStatusUpdatesRef = useRef<Map<string, TaskStatus>>(new Map())
  
  // Initialize task statuses from API data
  useEffect(() => {
    if (!selectedTaskList) return
    const statuses: Record<string, TaskStatus> = {}

    tasks.forEach((task: any) => {
      const key = task?.id || task?.localeKey || task?.name
      
      // Use status from the task object if available - this preserves manually set statuses
      if (task.status && STATUS_OPTIONS.includes(task.status as TaskStatus)) {
        statuses[key] = task.status as TaskStatus
      } else if (task.status === 'done') {
        statuses[key] = 'done'
      } else if ((task.count || 0) > 0 && (task.count || 0) < (task.times || 1)) {
        statuses[key] = 'in progress'
      }
    })

    setTaskStatuses(statuses)
  }, [selectedTaskList?.id, date, tasks])
  
  // Sort tasks: by status order first, then incomplete before completed
  const sortedTasks = useMemo(() => {
    const isDone = (t: any) => {
      const key = t?.id || t?.localeKey || t?.name
      const taskStatus = taskStatuses[key] || (t?.status as TaskStatus)
      return taskStatus === 'done'
    }
    const getTaskStatus = (t: any): TaskStatus => {
      const key = t?.id || t?.localeKey || t?.name
      return taskStatuses[key] || (t?.status as TaskStatus) || 'open'
    }

    return [...tasks].sort((a: any, b: any) => {
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
  }, [tasks, taskStatuses])
  
  const handleTaskClick = useCallback(async (task: any) => {
    if (!selectedTaskList) return
    
    const key = task?.id || task?.localeKey || task?.name
    const currentCount = task?.count || 0
    const times = task?.times || 1
    const newCount = currentCount + 1
    const isFullyCompleted = newCount >= times
    
    // Track pending completion
    pendingCompletionsRef.current.set(key, {
      count: newCount,
      status: isFullyCompleted ? 'done' : 'in progress',
      inClosed: isFullyCompleted
    })
    
    // Optimistic UI update
    setTaskStatuses(prev => ({
      ...prev,
      [key]: isFullyCompleted ? 'done' : 'in progress'
    }))
    
    try {
      // Prepare next actions
      const regular = tasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = tasks.filter((t: any) => t.isEphemeral)
      const allTasks = [...regular, ...ephemerals]
      
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        const actionKey = action?.id || action?.localeKey || action?.name
        if (actionKey === key) {
          c.count = newCount
          c.status = isFullyCompleted ? 'done' : 'in progress'
        }
        return c
      })
      
      // Persist to API
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: selectedTaskList.id,
          dayActions: nextActions,
          date,
          justCompletedNames: [task.name],
          justUncompletedNames: []
        })
      })
      
      // Handle ephemeral tasks
      if (task.isEphemeral) {
        if (isFullyCompleted) {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId: selectedTaskList.id,
              ephemeralTasks: { close: { id: task.id, count: newCount } }
            })
          })
        } else {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId: selectedTaskList.id,
              ephemeralTasks: { update: { id: task.id, count: newCount, status: 'in progress' } }
            })
          })
        }
      }
      
      await onRefresh()
      await onRefreshUser()
      
      // Clear pending completion
      pendingCompletionsRef.current.delete(key)
    } catch (error) {
      console.error('Error completing task:', error)
      pendingCompletionsRef.current.delete(key)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser])
  
  const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
    const key = task?.id || task?.localeKey || task?.name
    const taskName = task?.name
    const effectiveStatus = newStatus

    // Track pending status update
    pendingStatusUpdatesRef.current.set(key, effectiveStatus)

    // Update local state immediately (optimistic update)
    setTaskStatuses(prev => ({ ...prev, [key]: effectiveStatus }))

    // Persist to API
    if (!selectedTaskList) return

    try {
      // Persist task status to API
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskStatus: true,
          taskListId: selectedTaskList.id,
          taskKey: key,
          status: effectiveStatus,
          date: date
        })
      })

      // If status is "done", also mark the task as completed
      if (effectiveStatus === 'done') {
        const task = tasks.find((t: any) => {
          const tKey = t?.id || t?.localeKey || t?.name
          return tKey === key
        })
        if (task) {
          const currentCount = task?.count || 0
          const times = task?.times || 1
          const newCount = currentCount + 1
          const isFullyCompleted = newCount >= times
          
          pendingCompletionsRef.current.set(key, {
            count: newCount,
            status: effectiveStatus,
            inClosed: isFullyCompleted
          })

          // Handle completion logic
          const regular = tasks.filter((t: any) => !t.isEphemeral)
          const ephemerals = tasks.filter((t: any) => t.isEphemeral)

          // Prepare next actions
          const allTasks = [...regular, ...ephemerals]
          const nextActions = allTasks.map((action: any) => {
            const c = { ...action }
            const actionKey = action?.id || action?.localeKey || action?.name
            if (actionKey === key) {
              if ((action.times - (action.count || 0)) === 1) {
                c.count = (c.count || 0) + 1
                c.status = 'done'
              } else if ((action.times - (action.count || 0)) >= 1) {
                c.count = (c.count || 0) + 1
              }
            }
            if ((c.count || 0) > 0 && c.status !== 'done') {
              c.status = 'open'
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
          const ephemeralTask = ephemerals.find((e: any) => e.id === task.id)
          if (ephemeralTask) {
            const updatedEph = nextActions.find((a: any) => {
              const aKey = a?.id || a?.localeKey || a?.name
              return aKey === key
            })
            if (updatedEph && updatedEph.status === 'done') {
              await fetch('/api/v1/tasklists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskListId: selectedTaskList.id,
                  ephemeralTasks: { close: { id: ephemeralTask.id, count: updatedEph.count } }
                })
              })
            } else if (updatedEph) {
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

          await onRefresh()
          await onRefreshUser()
          
          pendingCompletionsRef.current.delete(key)
          pendingStatusUpdatesRef.current.delete(key)
        }
      } else if (effectiveStatus !== 'done') {
        // If status is changed away from "done", handle uncompletion
        const foundTask = tasks.find((t: any) => {
          const tKey = t?.id || t?.localeKey || t?.name
          return tKey === key
        })
        if (foundTask) {
          const regular = tasks.filter((t: any) => !t.isEphemeral)
          const nextActions = regular.map((action: any) => {
            const c = { ...action }
            const actionKey = action?.id || action?.localeKey || action?.name
            if (actionKey === key && (c.times || 1) <= (c.count || 0)) {
              if ((c.count || 0) > 0) {
                c.count = (c.count || 0) - 1
                c.status = 'open'
              }
            }
            if ((c.count || 0) > 0 && c.status !== 'done') {
              c.status = 'open'
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

          // Handle ephemeral task uncompletion
          const ephemerals = tasks.filter((t: any) => t.isEphemeral)
          const ephemeralTask = ephemerals.find((e: any) => e.id === foundTask.id)
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

          await onRefresh()
          await onRefreshUser()
          
          pendingCompletionsRef.current.delete(key)
          pendingStatusUpdatesRef.current.delete(key)
        } else {
          // Status change that doesn't affect completion
          await onRefresh()
          await onRefreshUser()
          pendingStatusUpdatesRef.current.delete(key)
        }
      } else {
        // Status change that doesn't affect completion
        await onRefresh()
        await onRefreshUser()
        pendingStatusUpdatesRef.current.delete(key)
      }
    } catch (error) {
      console.error('Error saving task status:', error)
      pendingCompletionsRef.current.delete(key)
      pendingStatusUpdatesRef.current.delete(key)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser])
  
  const handleDecrementCount = useCallback(async (task: any) => {
    if (!selectedTaskList) return
    const taskName = task?.name
    const currentCount = task?.count || 0
    
    if (currentCount <= 0) return

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
      const regular = tasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = tasks.filter((t: any) => t.isEphemeral)
      const allTasks = [...regular, ...ephemerals]
      
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        const actionKey = action?.id || action?.localeKey || action?.name
        if (actionKey === key) {
          c.count = Math.max(0, (c.count || 0) - 1)
          if (c.count >= (c.times || 1)) {
            c.status = 'done'
          } else {
            const actionKey = action?.id || action?.localeKey || action?.name
            const existingStatus = taskStatuses[actionKey]
            if (c.count > 0 && (!existingStatus || existingStatus === 'done' || existingStatus === 'open')) {
              c.status = 'in progress'
            } else if (c.count === 0) {
              c.status = 'open'
            } else {
              c.status = existingStatus || 'open'
            }
          }
        }
        return c
      })

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

      const ephemeralTask = ephemerals.find((e: any) => e.id === task.id)
      if (ephemeralTask) {
        const updatedEph = nextActions.find((a: any) => {
          const aKey = a?.id || a?.localeKey || a?.name
          return aKey === key
        })
        if (updatedEph) {
          const newCount = updatedEph.count || 0
          const times = updatedEph.times || 1
          
          const closedEphemerals = (selectedTaskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          
          if (isInClosed && newCount < times) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { reopen: { id: ephemeralTask.id, count: newCount } }
              })
            })
          } else if (!isInClosed) {
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

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error decrementing count:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses])
  
  const handleIncrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList) return
    const taskName = task?.name
    const key = task?.id || task?.localeKey || task?.name
    const currentTimes = task?.times || 1
    const newTimes = currentTimes + 1

    try {
      const regular = tasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = tasks.filter((t: any) => t.isEphemeral)
      const allTasks = [...regular, ...ephemerals]
      
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        const actionKey = action?.id || action?.localeKey || action?.name
        if (actionKey === key) {
          c.times = newTimes
          const currentCount = c.count || 0
          if (currentCount >= newTimes) {
            c.status = 'done'
          } else if (currentCount > 0) {
            const actionKey = action?.id || action?.localeKey || action?.name
            const existingStatus = taskStatuses[actionKey]
            if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
              c.status = 'in progress'
            } else {
              c.status = existingStatus
            }
          } else {
            c.status = 'open'
          }
        }
        return c
      })

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

      const ephemeralTask = ephemerals.find((e: any) => e.id === task.id)
      if (ephemeralTask) {
        const updatedEph = nextActions.find((a: any) => {
          const aKey = a?.id || a?.localeKey || a?.name
          return aKey === key
        })
        if (updatedEph) {
          const newCount = updatedEph.count || 0
          const newTimes = updatedEph.times || 1
          
          const closedEphemerals = (selectedTaskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          
          if (isInClosed && newCount < newTimes) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { reopen: { id: ephemeralTask.id, count: newCount } }
              })
            })
          } else if (!isInClosed) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { update: { id: ephemeralTask.id, count: newCount, status: updatedEph.status, times: newTimes } }
              })
            })
          }
        }
      }

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error incrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses])
  
  const handleDecrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList) return
    const taskName = task?.name
    const key = task?.id || task?.localeKey || task?.name
    const currentTimes = task?.times || 1
    const currentCount = task?.count || 0
    
    if (currentTimes <= 1) return

    const newTimes = currentTimes - 1
    const newCount = (currentTimes === currentCount) ? Math.max(0, currentCount - 1) : currentCount

    setTaskStatuses(prev => {
      const updated = { ...prev }
      if (newCount >= newTimes) {
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
      const regular = tasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = tasks.filter((t: any) => t.isEphemeral)
      const allTasks = [...regular, ...ephemerals]
      
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        const actionKey = action?.id || action?.localeKey || action?.name
        if (actionKey === key) {
          c.times = newTimes
          c.count = newCount
          if (c.count >= c.times) {
            c.status = 'done'
          } else {
            const actionKey = action?.id || action?.localeKey || action?.name
            const existingStatus = taskStatuses[actionKey]
            if (c.count > 0 && (!existingStatus || existingStatus === 'done' || existingStatus === 'open')) {
              c.status = 'in progress'
            } else if (c.count === 0) {
              c.status = 'open'
            } else {
              c.status = existingStatus || 'open'
            }
          }
        }
        return c
      })

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

      const ephemeralTask = ephemerals.find((e: any) => e.id === task.id)
      if (ephemeralTask) {
        const updatedEph = nextActions.find((a: any) => {
          const aKey = a?.id || a?.localeKey || a?.name
          return aKey === key
        })
        if (updatedEph) {
          const updatedCount = updatedEph.count || 0
          const updatedTimes = updatedEph.times || 1
          
          const closedEphemerals = (selectedTaskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          
          if (isInClosed && updatedCount < updatedTimes) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { reopen: { id: ephemeralTask.id, count: updatedCount } }
              })
            })
          } else if (!isInClosed) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { update: { id: ephemeralTask.id, count: updatedCount, status: updatedEph.status, times: updatedTimes } }
              })
            })
          }
        }
      }

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error decrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses])
  
  const handleToggleRedacted = useCallback(async (task: any) => {
    if (!selectedTaskList) return
    const key = task?.id || task?.localeKey || task?.name
    const currentRedacted = task?.redacted || false
    const newRedacted = !currentRedacted

    try {
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskRedacted: true,
          taskListId: selectedTaskList.id,
          taskKey: key,
          redacted: newRedacted
        })
      })
      await onRefresh()
    } catch (error) {
      console.error('Error toggling task redacted status:', error)
    }
  }, [selectedTaskList, onRefresh])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
      {sortedTasks.map((task: any) => {
        const key = task?.id || task?.localeKey || task?.name
        const taskStatus = taskStatuses[key] || (task?.status as TaskStatus)
        const isDone = taskStatus === 'done' || (task?.count || 0) >= (task?.times || 1)
        
        const lastCompleter = Array.isArray(task?.completers) && task.completers.length > 0 
          ? task.completers[task.completers.length - 1] 
          : undefined
        
        // Extract owners and collaborators from users array (new model) or fallback to old fields
        const users = Array.isArray((selectedTaskList as any)?.users) ? (selectedTaskList as any).users : []
        const ownersFromUsers = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
        const collaboratorsFromUsers = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER').map((u: any) => u.userId)
        const ownersFromOld = Array.isArray((selectedTaskList as any)?.owners) ? (selectedTaskList as any).owners : []
        const collaboratorsFromOld = Array.isArray((selectedTaskList as any)?.collaborators) ? (selectedTaskList as any).collaborators : []
        const allOwners = ownersFromUsers.length > 0 ? ownersFromUsers : ownersFromOld
        const allCollaborators = collaboratorsFromUsers.length > 0 ? collaboratorsFromUsers : collaboratorsFromOld
        
        const hasCollaborators = allCollaborators.length > 0
        
        // Get the completer name: only show if there's actually a completer (don't fallback to owner)
        const completerName = lastCompleter 
          ? (collabProfiles[String(lastCompleter.id)] || String(lastCompleter.id))
          : null
        
        // Calculate earnings for THIS specific task completion
        const listBudget = (selectedTaskList as any)?.budget
        const listRole = (selectedTaskList as any)?.role
        const totalTasks = (selectedTaskList?.tasks as any[])?.length || (selectedTaskList?.templateTasks as any[])?.length || 1
        
        const taskEarnings = getProfitPerTask(listBudget, totalTasks, listRole)

        // Determine task status
        const storedStatus = taskStatuses[key] || (task?.status as TaskStatus)
        let finalTaskStatus: TaskStatus
        if (storedStatus) {
          finalTaskStatus = storedStatus
        } else if ((task.count || 0) > 0 && (task.count || 0) < (task.times || 1)) {
          finalTaskStatus = 'in progress'
        } else if ((task.count || 0) >= (task.times || 1)) {
          finalTaskStatus = 'done'
        } else {
          finalTaskStatus = 'open'
        }
        
        const statusColor = getStatusColor(finalTaskStatus, 'css')
        const iconColor = getIconColor(finalTaskStatus)

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
          {
            label: t('tasks.incrementTimes', { defaultValue: 'Increment times' }),
            onClick: () => handleIncrementTimes(task),
            icon: <Plus className="h-4 w-4" />,
            separator: true,
          },
          {
            label: t('tasks.decrementTimes', { defaultValue: 'Decrement times' }),
            onClick: () => handleDecrementTimes(task),
            icon: <Minus className="h-4 w-4" />,
          },
          {
            label: task?.redacted ? t('tasks.markAsNotSensitive', { defaultValue: 'Mark as not sensitive' }) : t('tasks.markAsSensitive', { defaultValue: 'Mark as sensitive' }),
            onClick: () => handleToggleRedacted(task),
            icon: task?.redacted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
            separator: true,
          },
          ...((task.times || 1) > 1 && (task.count || 0) > 0
            ? [
                {
                  label: t('tasks.decrementCount'),
                  onClick: () => handleDecrementCount(task),
                  icon: <Minus className="h-4 w-4" />,
                  separator: true,
                },
              ]
            : []),
        ]

        return (
          <div key={`task__item--${key}`} className="flex flex-col h-full w-full">
            <Button
              variant="outline"
              className="rounded-md leading-7 text-sm min-h-[40px] h-full w-full whitespace-normal break-words py-2 flex items-center gap-2 justify-start"
              onClick={() => handleTaskClick(task)}
              aria-label={(task?.redacted === true && !revealRedacted) ? 'Redacted task' : (task.displayName || task.name)}
            >
              <OptionsButton
                items={optionsMenuItems}
                statusColor={statusColor}
                iconColor={iconColor}
                iconFilled={finalTaskStatus === "done"}
                align="start"
              />
              <span className="flex-1 text-left">
                {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}
                {(task?.redacted === true && !revealRedacted) ? '·····' : (task.displayName || task.name)}
              </span>
            </Button>
            {isDone
              && hasCollaborators
              && completerName && lastCompleter && (
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
    </div>
  )
}

