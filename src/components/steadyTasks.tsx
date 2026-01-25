'use client'

import { useMemo, useContext, useEffect, useState, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { GlobalContext } from '@/lib/contexts'
import { Skeleton } from '@/components/ui/skeleton'
import { OptionsMenuItem } from '@/components/optionsButton'
import { Circle, Minus, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { TaskStatus, STATUS_OPTIONS, getStatusColor, getIconColor, getTaskKey, formatDateLocal } from '@/lib/utils/taskUtils'
import { useUserData } from '@/lib/utils/userUtils'
import { TaskItem } from '@/components/taskItem'
import { useOptimisticUpdates } from '@/lib/hooks/useOptimisticUpdates'
import { useTaskHandlers } from '@/lib/hooks/useTaskHandlers'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Priority ordering for task statuses and roles
const STATUS_PRIORITIES: Record<string, number> = {
  'in progress': 1,
  'steady': 2,
}

const ROLE_PRIORITIES: Record<string, number> = {
  'daily.default': 1,
  'weekly.default': 2,
}

function getStatusPriority(status: TaskStatus): number {
  return STATUS_PRIORITIES[status] ?? 3
}

function getRolePriority(role: string): number {
  if (ROLE_PRIORITIES[role]) return ROLE_PRIORITIES[role]
  if (role?.startsWith('daily.')) return 3
  if (role?.startsWith('weekly.')) return 4
  return 5
}

// Enrich a task with list metadata and optimistic state
function enrichTask(
  task: any,
  taskList: any,
  optimisticStatuses: Record<string, TaskStatus>,
  optimisticCounts: Record<string, number>,
  statusOverride?: string,
  countOverride?: number,
  isEphemeral = false
): any {
  const taskKey = getTaskKey(task)
  return {
    ...task,
    isEphemeral,
    taskListName: taskList.name || taskList.role,
    taskListId: taskList.id,
    taskListRole: taskList.role || '',
    taskStatus: optimisticStatuses[taskKey] || statusOverride || task.status,
    count: optimisticCounts[taskKey] !== undefined
      ? optimisticCounts[taskKey]
      : (countOverride !== undefined ? countOverride : (task.count || 0))
  }
}

export const SteadyTasks = () => {
  const { taskLists: contextTaskLists, refreshTaskLists, revealRedacted, session } = useContext(GlobalContext)
  const { t } = useI18n()
  const { refreshUser } = useUserData()
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, TaskStatus>>({})
  const [optimisticCounts, setOptimisticCounts] = useState<Record<string, number>>({})
  const initialFetchDone = useRef(false)
  const initialLoadDone = useRef(false)

  // Use shared hooks for optimistic updates
  const { pendingCompletionsRef, pendingStatusUpdatesRef } = useOptimisticUpdates()

  // Fetch steady/in-progress tasks from new API
  const { data: steadyTasksData } = useSWR(
    '/api/v1/tasks?status=IN_PROGRESS,STEADY',
    fetcher,
    { revalidateOnFocus: false }
  )
  const steadyTasksFromApi = steadyTasksData?.tasks || []

  // Maintain stable task lists that never clear once loaded
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      // When updating task lists, preserve optimistic state for pending completions
      setStableTaskLists(prevTaskLists => {
        const newTaskLists = contextTaskLists
        
        // If there are no pending completions, just use the new task lists
        if (pendingCompletionsRef.current.size === 0) {
          return newTaskLists
        }
        
          // Otherwise, merge optimistic state for pending tasks
          return newTaskLists.map((taskList: any) => {
            const prevTaskList = prevTaskLists.find((tl: any) => tl.id === taskList.id)
            if (!prevTaskList) return taskList
            
            const year = new Date().getFullYear()
            const today = new Date()
            const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            
            const prevCompletedTasks = (prevTaskList as any)?.completedTasks || {}
            const newCompletedTasks = (taskList as any)?.completedTasks || {}
            
            // Check if we need to preserve any optimistic state
            const prevDateBucket = prevCompletedTasks[year]?.[dateISO]
            if (!prevDateBucket) {
              // Even if no date bucket, we might have pending status updates
              if (pendingStatusUpdatesRef.current.size === 0) return taskList
            }
            
            const keyOf = getTaskKey
            
            // Find tasks that have pending completions or status updates in this task list
            const prevOpenTasks = prevDateBucket ? (Array.isArray(prevDateBucket.openTasks) ? prevDateBucket.openTasks : []) : []
            const prevClosedTasks = prevDateBucket ? (Array.isArray(prevDateBucket.closedTasks) ? prevDateBucket.closedTasks : []) : []
            
            const allPendingKeys = new Set([
              ...Array.from(pendingCompletionsRef.current.keys()),
              ...Array.from(pendingStatusUpdatesRef.current.keys())
            ])
            
            const hasPendingTasks = Array.from(allPendingKeys).some(taskKey => {
              // Check if this task exists in the task list (templateTasks is deprecated)
              const allTasks = [
                ...(Array.isArray(taskList.tasks) ? taskList.tasks : []),
                ...(Array.isArray(taskList.ephemeralTasks?.open) ? taskList.ephemeralTasks.open : []),
                ...(Array.isArray(taskList.ephemeralTasks?.closed) ? taskList.ephemeralTasks.closed : [])
              ]
              return allTasks.some((t: any) => keyOf(t) === taskKey) ||
                     prevOpenTasks.some((t: any) => keyOf(t) === taskKey) || 
                     prevClosedTasks.some((t: any) => keyOf(t) === taskKey)
            })
            
            if (!hasPendingTasks) return taskList
            
            if (!prevDateBucket) {
              // If no date bucket but we have pending status updates, we still need to preserve them
              // The status will be preserved via optimisticStatuses state, so we can just return the new list
              return taskList
            }
          
          // Merge completedTasks, preserving optimistic state for pending tasks
          const mergedCompletedTasks = { ...newCompletedTasks }
          const newDateBucket = newCompletedTasks[year]?.[dateISO] || {}
          
          const newOpenTasks = Array.isArray(newDateBucket.openTasks) ? [...newDateBucket.openTasks] : []
          const newClosedTasks = Array.isArray(newDateBucket.closedTasks) ? [...newDateBucket.closedTasks] : []
          
          // For each pending task, preserve its optimistic state
          allPendingKeys.forEach(taskKey => {
            const pendingCompletion = pendingCompletionsRef.current.get(taskKey)
            const pendingStatusUpdate = pendingStatusUpdatesRef.current.get(taskKey)
            
            const prevOpenTask = prevOpenTasks.find((t: any) => keyOf(t) === taskKey)
            const prevClosedTask = prevClosedTasks.find((t: any) => keyOf(t) === taskKey)
            
            // Remove from new data if present
            const newOpenIndex = newOpenTasks.findIndex((t: any) => keyOf(t) === taskKey)
            const newClosedIndex = newClosedTasks.findIndex((t: any) => keyOf(t) === taskKey)
            
            if (pendingCompletion) {
              // Handle pending completion
              if (pendingCompletion.inClosed) {
                // Task should be in closedTasks (optimistic)
                if (newClosedIndex >= 0) {
                  // Update existing closed task with optimistic state
                  newClosedTasks[newClosedIndex] = { 
                    ...newClosedTasks[newClosedIndex], 
                    ...prevClosedTask,
                    count: pendingCompletion.count,
                    status: pendingCompletion.status
                  }
                } else if (prevClosedTask) {
                  // Add optimistic closed task
                  newClosedTasks.push({ 
                    ...prevClosedTask, 
                    count: pendingCompletion.count,
                    status: pendingCompletion.status
                  })
                }
                // Remove from openTasks if present
                if (newOpenIndex >= 0) {
                  newOpenTasks.splice(newOpenIndex, 1)
                }
              } else {
                // Task should be in openTasks (optimistic)
                if (newOpenIndex >= 0) {
                  // Update existing open task with optimistic state
                  newOpenTasks[newOpenIndex] = { 
                    ...newOpenTasks[newOpenIndex], 
                    ...prevOpenTask,
                    count: pendingCompletion.count,
                    status: pendingCompletion.status
                  }
                } else if (prevOpenTask) {
                  // Add optimistic open task
                  newOpenTasks.push({ 
                    ...prevOpenTask, 
                    count: pendingCompletion.count,
                    status: pendingCompletion.status
                  })
                }
                // Remove from closedTasks if present
                if (newClosedIndex >= 0) {
                  newClosedTasks.splice(newClosedIndex, 1)
                }
              }
            } else if (pendingStatusUpdate) {
              // Handle pending status update (status change via icon button)
              // Preserve the optimistic status in the task data
              if (newOpenIndex >= 0) {
                // Update existing open task with optimistic status
                newOpenTasks[newOpenIndex] = { 
                  ...newOpenTasks[newOpenIndex], 
                  status: pendingStatusUpdate
                }
              } else if (newClosedIndex >= 0) {
                // Update existing closed task with optimistic status
                newClosedTasks[newClosedIndex] = { 
                  ...newClosedTasks[newClosedIndex], 
                  status: pendingStatusUpdate
                }
              } else if (prevOpenTask) {
                // Task was in openTasks, preserve it with new status
                newOpenTasks.push({ 
                  ...prevOpenTask, 
                  status: pendingStatusUpdate
                })
              } else if (prevClosedTask) {
                // Task was in closedTasks, preserve it with new status
                newClosedTasks.push({ 
                  ...prevClosedTask, 
                  status: pendingStatusUpdate
                })
              }
            }
          })
          
          mergedCompletedTasks[year] = {
            ...(mergedCompletedTasks[year] || {}),
            [dateISO]: {
              ...newDateBucket,
              openTasks: newOpenTasks,
              closedTasks: newClosedTasks
            }
          }
          
          return {
            ...taskList,
            completedTasks: mergedCompletedTasks
          }
        })
      })
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
    const today = new Date()
    const dateISO = formatDateLocal(today)
    const year = today.getFullYear()

    // Collect all tasks from all lists
    const allTasks = stableTaskLists.flatMap((taskList: any) => {
      const baseTasks = taskList?.tasks || []
      const dateBucket = taskList?.completedTasks?.[year]?.[dateISO]

      // Parse open tasks from completedTasks (supports legacy and new structure)
      const openTasksByKey: Record<string, any> = {}
      const openTasksFromCompleted: any[] = []
      const parseOpenTasks = (tasks: any[]) => {
        tasks.forEach((t: any) => {
          const k = getTaskKey(t)
          if (!k || openTasksByKey[k]) return
          if (t.status !== 'done' && (t.count || 0) < (t.times || 1)) {
            openTasksByKey[k] = t
            openTasksFromCompleted.push(t)
          }
        })
      }

      if (Array.isArray(dateBucket)) {
        parseOpenTasks(dateBucket)
      } else if (dateBucket?.openTasks) {
        parseOpenTasks(dateBucket.openTasks)
      }

      // Merge base tasks with open tasks data
      const mergedBaseTasks = baseTasks.map((baseTask: any) => {
        const k = getTaskKey(baseTask)
        const openTask = k ? openTasksByKey[k] : undefined
        return enrichTask(
          baseTask, taskList, optimisticStatuses, optimisticCounts,
          openTask?.status || baseTask.status,
          openTask?.count !== undefined ? openTask.count : baseTask.count
        )
      })

      // Add open tasks not in base tasks
      const baseKeys = new Set(baseTasks.map((t: any) => getTaskKey(t)))
      const additionalOpenTasks = openTasksFromCompleted
        .filter((t: any) => !baseKeys.has(getTaskKey(t)))
        .map((t: any) => enrichTask(t, taskList, optimisticStatuses, optimisticCounts))

      // Add ephemeral tasks
      const ephemeralTasks = (taskList?.ephemeralTasks?.open || [])
        .map((t: any) => enrichTask(t, taskList, optimisticStatuses, optimisticCounts, undefined, undefined, true))

      return [...mergedBaseTasks, ...additionalOpenTasks, ...ephemeralTasks]
    })

    // Filter, deduplicate, and sort
    const steadyOrInProgress = allTasks.filter((task: any) => {
      const status = (task?.taskStatus as TaskStatus) || 'open'
      return status === 'steady' || status === 'in progress'
    })

    const uniqueTasks = Array.from(
      new Map(steadyOrInProgress.map(t => [getTaskKey(t), t])).values()
    )

    return uniqueTasks.sort((a: any, b: any) => {
      const statusDiff = getStatusPriority(a?.taskStatus || 'open') - getStatusPriority(b?.taskStatus || 'open')
      if (statusDiff !== 0) return statusDiff
      return getRolePriority(a.taskListRole || '') - getRolePriority(b.taskListRole || '')
    })
  }, [stableTaskLists, optimisticStatuses, optimisticCounts])

  // Use shared task handlers
  const {
    handleStatusChange: handleStatusChangeBase,
    handleIncrementCount,
    handleDecrementCount,
    handleToggleRedacted: handleToggleRedactedBase,
  } = useTaskHandlers({
    taskListId: '', // Will be provided per-task
    tasks: steadyTasks,
    date: formatDateLocal(new Date()),
    onRefresh: refreshTaskLists,
    onRefreshUser: refreshUser,
    pendingCompletionsRef,
    pendingStatusUpdatesRef,
    optimisticStatuses,
    setOptimisticStatuses,
    optimisticCounts,
    setOptimisticCounts,
    findTaskList: (id: string) => stableTaskLists.find((tl: any) => tl.id === id),
  })

  // Wrapper handlers that provide taskListId from task
  const handleStatusChange = useCallback(async (task: any, taskListId: string, newStatus: TaskStatus) => {
    await handleStatusChangeBase(task, newStatus)
  }, [handleStatusChangeBase])

  const handleToggleRedacted = useCallback(async (task: any, taskListId: string) => {
    await handleToggleRedactedBase(task)
  }, [handleToggleRedactedBase])
  
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

  // Choose between new API data and legacy data
  const tasksToDisplay = useMemo(() => {
    // If we have tasks from the new API, use them
    if (steadyTasksFromApi.length > 0) {
      return steadyTasksFromApi.map((t: any) => ({
        ...t,
        taskStatus: t.status,
        taskListName: t.list?.name || '',
        taskListId: t.listId,
        taskListRole: t.list?.role || '',
        displayName: t.name,
      }))
    }

    // Fallback to legacy steadyTasks
    return steadyTasks
  }, [steadyTasksFromApi, steadyTasks])

  if (isLoading) {
    return (
      <div className="w-full px-1 sm:px-0 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 align-center justify-center w-full m-auto gap-2">
          {/* Show 1 skeleton on mobile, 8 on desktop */}
          {[...Array(2)].map((_, index) => (
            <div key={`skeleton-${index}`} className={`flex flex-col items-center ${index >= 1 ? 'hidden md:flex' : ''}`}>
              <Skeleton className="h-[40px] w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (tasksToDisplay.length === 0) {
    return null
  }

  // Limit tasks: 1 on mobile (expandable to 6), 8 on desktop
  const mobileInitialLimit = 1
  const mobileExpandedLimit = 5
  const desktopLimit = 10
  const hasMoreTasks = tasksToDisplay.length > mobileInitialLimit
  const mobileLimit = isExpanded ? mobileExpandedLimit : mobileInitialLimit

  return (
    <div className="space-y-4 w-full mt-4 px-1 sm:px-0 relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 align-center justify-center w-full m-auto gap-2">
        {tasksToDisplay.map((task: any, index: number) => {
          const taskStatus: TaskStatus = (task?.taskStatus as TaskStatus) || 'open'
          const statusColor = getStatusColor(taskStatus, 'css')
          const iconColor = getIconColor(taskStatus)
          
          // Hide tasks beyond limits using CSS with animation
          // Mobile: show 1 initially, or 6 when expanded
          // Desktop: show 8
          const isBeyondMobileLimit = index >= mobileLimit
          const isBeyondDesktopLimit = index >= desktopLimit
          
          // Calculate if this item should be visible
          const shouldShowOnMobile = !isBeyondMobileLimit || isExpanded
          const shouldShowOnDesktop = !isBeyondDesktopLimit
          
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
            {
              label: task?.redacted ? t('tasks.markAsNotSensitive', { defaultValue: 'Mark as not sensitive' }) : t('tasks.markAsSensitive', { defaultValue: 'Mark as sensitive' }),
              onClick: () => handleToggleRedacted(task, task.taskListId),
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
            <div
              key={`task__wrapper--${task.name || index}`}
              className="contents"
            >
              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  !shouldShowOnDesktop
                    ? 'max-h-0 opacity-0 md:max-h-0 md:opacity-0'
                    : !shouldShowOnMobile
                    ? 'max-h-0 opacity-0 md:max-h-[1000px] md:opacity-100'
                    : 'max-h-[1000px] opacity-100'
                }`}
                style={{
                  margin: (!shouldShowOnDesktop || !shouldShowOnMobile) ? '0' : undefined,
                  padding: (!shouldShowOnDesktop || !shouldShowOnMobile) ? '0' : undefined,
                }}
              >
                <TaskItem
                  task={task}
                  taskStatus={taskStatus}
                  statusColor={statusColor}
                  iconColor={iconColor}
                  optionsMenuItems={optionsMenuItems}
                  onClick={() => handleToggleClick(task)}
                  revealRedacted={revealRedacted}
                  variant="outline"
                />
              </div>
            </div>
          )
        })}
      </div>
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

