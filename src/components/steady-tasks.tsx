'use client'

import { useMemo, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { GlobalContext } from '@/lib/contexts'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { OptionsButton, OptionsMenuItem } from '@/components/OptionsButton'
import { Circle, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { prepareIncrementActions, prepareDecrementActions, handleEphemeralTaskUpdate, updateUserEntriesForTasks, calculateTaskStatus } from '@/lib/taskUtils'
import { useUserData } from '@/lib/userUtils'
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

export const SteadyTasks = () => {
  const { taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
  const { t } = useI18n()
  const { refreshUser } = useUserData()
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, TaskStatus>>({})
  const [optimisticCounts, setOptimisticCounts] = useState<Record<string, number>>({})
  const initialFetchDone = useRef(false)
  const initialLoadDone = useRef(false)

  // Maintain stable task lists that never clear once loaded
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
      setIsLoading(false)
      initialLoadDone.current = true
    } else if (contextTaskLists === null || contextTaskLists === undefined) {
      // Still loading - only show skeleton on initial load
      setIsLoading(!initialLoadDone.current)
    }
  }, [contextTaskLists])

  // Only fetch task lists if we don't have any data yet and haven't fetched
  useEffect(() => {
    if (!initialFetchDone.current) {
      // If we already have data, don't fetch
      if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
        initialFetchDone.current = true
        return
      }
      // Otherwise, fetch once
      initialFetchDone.current = true
      refreshTaskLists()
    }
  }, [contextTaskLists, refreshTaskLists])

  // Get all tasks with status "steady" or "in progress" from all lists
  const steadyTasks = useMemo(() => {
    const allTasks: any[] = []
    
    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = new Date()
    const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const year = today.getFullYear()
    
    // Helper to get task key
    const keyOf = (t: any) => (t?.id || t?.localeKey || (typeof t?.name === 'string' ? t.name.toLowerCase() : '')) as string
    
    stableTaskLists.forEach((taskList: any) => {
      // Get base tasks from tasks array or templateTasks
      const baseTasks = (taskList?.tasks && taskList.tasks.length > 0)
        ? taskList.tasks
        : (taskList?.templateTasks || [])
      
      // Read tasks from completedTasks[year][date].openTasks for today
      const dateBucket = (taskList as any)?.completedTasks?.[year]?.[dateISO]
      const openTasksFromCompleted: any[] = []
      const openTasksByKey: Record<string, any> = {}
      
      if (dateBucket) {
        if (Array.isArray(dateBucket)) {
          // Legacy structure: migrate on read
          dateBucket.forEach((t: any) => {
            const k = keyOf(t)
            if (!k) return
            if (t.status !== 'Done' && (t.count || 0) < (t.times || 1)) {
              if (!openTasksByKey[k]) {
                openTasksByKey[k] = t
                openTasksFromCompleted.push(t)
              }
            }
          })
        } else {
          // New structure: read from openTasks
          const openTasks = Array.isArray(dateBucket.openTasks) ? dateBucket.openTasks : []
          openTasks.forEach((t: any) => {
            const k = keyOf(t)
            if (!k) return
            if (!openTasksByKey[k]) {
              openTasksByKey[k] = t
              openTasksFromCompleted.push(t)
            }
          })
        }
      }
      
      // Merge base tasks with openTasks from completedTasks
      // Use openTasks status if available, otherwise fall back to base task status
      const mergedBaseTasks = baseTasks.map((baseTask: any) => {
        const k = keyOf(baseTask)
        const openTask = k ? openTasksByKey[k] : undefined
        
        const taskKey = k
        const optimisticStatus = optimisticStatuses[taskKey]
        const optimisticCount = optimisticCounts[taskKey]
        
        return {
          ...baseTask,
          taskListName: taskList.name || taskList.role,
          taskListId: taskList.id,
          taskListRole: taskList.role || '',
          // Use status from openTasks if available, otherwise from base task, with optimistic override
          taskStatus: optimisticStatus || (openTask?.taskStatus || baseTask.taskStatus),
          count: optimisticCount !== undefined ? optimisticCount : (openTask?.count !== undefined ? openTask.count : (baseTask.count || 0))
        }
      })
      
      // Add any openTasks that aren't in base tasks
      const baseKeys = new Set(baseTasks.map((t: any) => keyOf(t)))
      const additionalOpenTasks = openTasksFromCompleted
        .filter((t: any) => {
          const k = keyOf(t)
          return k && !baseKeys.has(k)
        })
        .map((t: any) => {
          const taskKey = keyOf(t)
          const optimisticStatus = optimisticStatuses[taskKey]
          const optimisticCount = optimisticCounts[taskKey]
          return {
            ...t,
            taskListName: taskList.name || taskList.role,
            taskListId: taskList.id,
            taskListRole: taskList.role || '',
            taskStatus: optimisticStatus || t.taskStatus,
            count: optimisticCount !== undefined ? optimisticCount : (t.count || 0)
          }
        })
      
      // Get ephemeral tasks from ephemeralTasks.open (read status directly from there)
      const ephemeralTasks = (taskList?.ephemeralTasks?.open || []).map((t: any) => {
        const taskKey = keyOf(t)
        const optimisticStatus = optimisticStatuses[taskKey]
        const optimisticCount = optimisticCounts[taskKey]
        return {
          ...t,
          isEphemeral: true,
          taskListName: taskList.name || taskList.role,
          taskListId: taskList.id,
          taskListRole: taskList.role || '',
          // Use status from ephemeralTasks.open, with optimistic override
          taskStatus: optimisticStatus || t.taskStatus,
          count: optimisticCount !== undefined ? optimisticCount : (t.count || 0)
        }
      })
      
      // Combine all tasks
      const tasks = [...mergedBaseTasks, ...additionalOpenTasks, ...ephemeralTasks]
      allTasks.push(...tasks)
    })
    
    // Filter for tasks with status "steady" or "in progress" (excluding "done")
    const filteredTasks = allTasks.filter((task: any) => {
      const taskStatus = (task?.taskStatus as TaskStatus) || 'open'
      return taskStatus === 'steady' || taskStatus === 'in progress'
    })
    
    // Sort by role priority: daily.default > weekly.default > daily.* > weekly.* > one-off
    const getRolePriority = (role: string): number => {
      if (role === 'daily.default') return 1
      if (role === 'weekly.default') return 2
      if (role?.startsWith('daily.')) return 3
      if (role?.startsWith('weekly.')) return 4
      return 5 // one-off or other roles
    }
    
    return filteredTasks.sort((a: any, b: any) => {
      const priorityA = getRolePriority(a.taskListRole || '')
      const priorityB = getRolePriority(b.taskListRole || '')
      return priorityA - priorityB
    })
  }, [stableTaskLists, optimisticStatuses, optimisticCounts])

  const handleStatusChange = useCallback(async (task: any, taskListId: string, newStatus: TaskStatus) => {
    const key = task?.id || task?.localeKey || task?.name
    
    // Optimistic update - update UI immediately
    setOptimisticStatuses(prev => ({
      ...prev,
      [key]: newStatus
    }))
    
    try {
      // Get today's date in local timezone (YYYY-MM-DD format)
      const today = new Date()
      const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskStatus: true,
          taskListId: taskListId,
          taskKey: key,
          taskStatus: newStatus,
          date: dateISO // Include date so task is copied to completedTasks
        })
      })
      
      // Refresh task lists to get server state
      await refreshTaskLists()
      
      // Clear optimistic status after successful update
      setOptimisticStatuses(prev => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
    } catch (error) {
      console.error('Error updating task status:', error)
      // Revert optimistic update on error
      setOptimisticStatuses(prev => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
    }
  }, [refreshTaskLists])
  
  const handleIncrementCount = useCallback(async (task: any) => {
    if (!task.taskListId) return
    
    const taskKey = task?.id || task?.localeKey || task?.name
    const currentCount = task.count || 0
    const times = task.times || 1
    const newCount = currentCount + 1
    
    // Optimistic update
    setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    const { taskStatus } = calculateTaskStatus(newCount, times, task.taskStatus as TaskStatus)
    setOptimisticStatuses(prev => ({ ...prev, [taskKey]: taskStatus }))
    
    try {
      // Find the task list
      const taskList = stableTaskLists.find((tl: any) => tl.id === task.taskListId)
      if (!taskList) return
      
      // Get all tasks from the task list
      const baseTasks = (taskList?.tasks && taskList.tasks.length > 0)
        ? taskList.tasks
        : (taskList?.templateTasks || [])
      const ephemerals = (taskList?.ephemeralTasks?.open || [])
      const allTasks = [...baseTasks, ...ephemerals]
      
      // Prepare next actions
      const nextActions = prepareIncrementActions(
        allTasks,
        task.name,
        currentCount,
        times,
        task.taskStatus as TaskStatus
      )
      
      // Get today's date
      const today = new Date()
      const date = today.toISOString().split('T')[0]
      
      // Persist to backend
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: task.taskListId,
          dayActions: nextActions,
          date,
          justCompletedNames: [task.name],
          justUncompletedNames: []
        })
      })
      
      // Handle ephemeral tasks
      const ephemeralTask = ephemerals.find((e: any) => e.name === task.name)
      if (ephemeralTask) {
        const updatedAction = nextActions.find((a: any) => a.name === task.name)
        if (updatedAction) {
          const closedEphemerals = (taskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          await handleEphemeralTaskUpdate(ephemeralTask, updatedAction, task.taskListId, isInClosed)
        }
      }
      
      // Update user entries only if fully completed (count >= times)
      if (newCount >= times) {
        const doneTasks = nextActions.filter((a: any) => a.status === 'Done')
        if (doneTasks.length > 0) {
          await updateUserEntriesForTasks(
            doneTasks,
            date,
            taskList.role || '',
            [task.name],
            []
          )
        }
      }
      
      await refreshTaskLists()
      await refreshUser()
      
      // Clear optimistic updates
      setOptimisticCounts(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
      setOptimisticStatuses(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
    } catch (error) {
      console.error('Error incrementing count:', error)
      // Revert optimistic updates
      setOptimisticCounts(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
      setOptimisticStatuses(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
    }
  }, [stableTaskLists, refreshTaskLists, refreshUser])
  
  const handleDecrementCount = useCallback(async (task: any) => {
    if (!task.taskListId) return
    
    const taskKey = task?.id || task?.localeKey || task?.name
    const currentCount = task.count || 0
    const times = task.times || 1
    
    // Can't decrement below 0
    if (currentCount <= 0) return
    
    const newCount = currentCount - 1
    
    // Optimistic update
    setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    const { taskStatus } = calculateTaskStatus(newCount, times, task.taskStatus as TaskStatus)
    setOptimisticStatuses(prev => ({ ...prev, [taskKey]: taskStatus }))
    
    try {
      // Find the task list
      const taskList = stableTaskLists.find((tl: any) => tl.id === task.taskListId)
      if (!taskList) return
      
      // Get all tasks from the task list
      const baseTasks = (taskList?.tasks && taskList.tasks.length > 0)
        ? taskList.tasks
        : (taskList?.templateTasks || [])
      const ephemerals = (taskList?.ephemeralTasks?.open || [])
      const allTasks = [...baseTasks, ...ephemerals]
      
      // Prepare next actions
      const nextActions = prepareDecrementActions(
        allTasks,
        task.name,
        currentCount,
        times,
        task.taskStatus as TaskStatus
      )
      
      // Get today's date
      const today = new Date()
      const date = today.toISOString().split('T')[0]
      
      // Persist to backend
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: task.taskListId,
          dayActions: nextActions,
          date,
          justCompletedNames: [],
          justUncompletedNames: []
        })
      })
      
      // Handle ephemeral tasks
      const ephemeralTask = ephemerals.find((e: any) => e.name === task.name)
      if (ephemeralTask) {
        const updatedAction = nextActions.find((a: any) => a.name === task.name)
        if (updatedAction) {
          const closedEphemerals = (taskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          await handleEphemeralTaskUpdate(ephemeralTask, updatedAction, task.taskListId, isInClosed)
        }
      }
      
      // If task was fully completed and now isn't, remove from user entries
      if (currentCount >= times && newCount < times) {
        await updateUserEntriesForTasks(
          [],
          date,
          taskList.role || '',
          [],
          [task.name]
        )
      }
      
      await refreshTaskLists()
      await refreshUser()
      
      // Clear optimistic updates
      setOptimisticCounts(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
      setOptimisticStatuses(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
    } catch (error) {
      console.error('Error decrementing count:', error)
      // Revert optimistic updates
      setOptimisticCounts(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
      setOptimisticStatuses(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
    }
  }, [stableTaskLists, refreshTaskLists, refreshUser])
  
  const handleToggleClick = useCallback((task: any) => {
    // For tasks with times > 1, increment count instead of immediately marking as done
    const times = task.times || 1
    if (times > 1) {
      handleIncrementCount(task)
    } else {
      // For tasks with times === 1, mark as done immediately
      if (task.taskListId) {
        handleStatusChange(task, task.taskListId, 'done')
      }
    }
  }, [handleStatusChange, handleIncrementCount])

  if (isLoading) {
    return (
      <div className="w-full px-1 sm:px-0">
        <ToggleGroup
          value={[]}
          onValueChange={() => {}}
          variant="outline"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 align-center justify-center w-full m-auto"
          type="multiple"
          orientation="horizontal"
        >
          {/* Show 1 skeleton on mobile, 8 on desktop */}
          {[...Array(10)].map((_, index) => (
            <div key={`skeleton-${index}`} className={`flex flex-col items-center m-1 ${index >= 1 ? 'hidden md:flex' : ''}`}>
              <Skeleton className="h-[40px] w-full rounded-md" />
            </div>
          ))}
        </ToggleGroup>
      </div>
    )
  }

  if (steadyTasks.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No tasks with status "steady" or "in progress" found.
      </div>
    )
  }

  // Limit tasks: 1 on mobile (expandable to 6), 8 on desktop
  const mobileInitialLimit = 1
  const mobileExpandedLimit = 5
  const desktopLimit = 10
  const hasMoreTasks = steadyTasks.length > mobileInitialLimit
  const mobileLimit = isExpanded ? mobileExpandedLimit : mobileInitialLimit

  return (
    <div className="space-y-4 w-full px-1 sm:px-0 relative">
      <ToggleGroup
        value={[]}
        onValueChange={() => {}}
        variant="outline"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 align-center justify-center w-full m-auto"
        type="multiple"
        orientation="horizontal"
      >
        {steadyTasks.map((task: any, index: number) => {
          const taskStatus: TaskStatus = (task?.taskStatus as TaskStatus) || 'open'
          const statusColor = getStatusColor(taskStatus, 'css')
          const iconColor = getIconColor(taskStatus)
          
          // Hide tasks beyond limits using CSS
          // Mobile: show 1 initially, or 6 when expanded
          // Desktop: show 8
          const isBeyondMobileLimit = index >= mobileLimit
          const isBeyondDesktopLimit = index >= desktopLimit
          
          let visibilityClass = 'flex flex-col items-center m-1'
          if (isBeyondDesktopLimit) {
            // Hide on all screens
            visibilityClass += ' hidden'
          } else if (isBeyondMobileLimit) {
            // Hide on mobile, show on desktop
            visibilityClass += ' hidden md:flex'
          }
          
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
              onClick: () => handleStatusChange(task, task.taskListId, status),
              icon: null,
            })),
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
            <div 
              key={`task__item--${task.name || index}`} 
              className={visibilityClass}
            >
              <div className="relative w-full flex items-center gap-2">
                <OptionsButton
                  items={optionsMenuItems}
                  statusColor={statusColor}
                  iconColor={iconColor}
                  iconFilled={taskStatus === "done"}
                  align="start"
                />
                <ToggleGroupItem 
                  className="rounded-md leading-7 text-sm min-h-[40px] h-auto flex-1 whitespace-normal break-words py-2 cursor-pointer" 
                  value={task.name} 
                  aria-label={task.name}
                  onClick={() => handleToggleClick(task)}
                >
                  {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}{task.displayName || task.name}
                </ToggleGroupItem>
              </div>
            </div>
          )
        })}
      </ToggleGroup>
      {/* Expand button: overlay on first task when collapsed, below tasks when expanded */}
      {hasMoreTasks && (
        <>
          {!isExpanded ? (
            // When collapsed: overlay on top of first task, centered
            <div className="md:hidden absolute top-0 left-1/2 transform -translate-x-1/2 z-10">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-background/95 backdrop-blur-sm border border-border rounded-full p-2 shadow-lg hover:bg-background transition-colors"
                aria-label={t('tasks.showMore')}
              >
                <ChevronDown className="h-5 w-5 text-foreground" />
              </button>
            </div>
          ) : (
            // When expanded: appear below last visible task
            <div className="md:hidden flex justify-center mt-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-background/95 backdrop-blur-sm border border-border rounded-full p-2 shadow-lg hover:bg-background transition-colors z-10"
                aria-label={t('tasks.showLess')}
              >
                <ChevronUp className="h-5 w-5 text-foreground" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

