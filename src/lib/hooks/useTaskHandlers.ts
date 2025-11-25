import { useCallback, useRef } from 'react'
import { TaskStatus, getTaskKey, calculateTaskStatus, formatDateLocal } from '@/lib/utils/taskUtils'

interface PendingCompletion {
  count: number
  status: TaskStatus
  inClosed: boolean
}

interface UseTaskHandlersOptions {
  taskListId: string
  tasks: any[]
  date: string
  onRefresh: () => Promise<void>
  onRefreshUser?: () => Promise<void>
  pendingCompletionsRef: React.MutableRefObject<Map<string, PendingCompletion>>
  pendingStatusUpdatesRef: React.MutableRefObject<Map<string, TaskStatus>>
  setTaskStatuses?: (updater: (prev: Record<string, TaskStatus>) => Record<string, TaskStatus>) => void
  optimisticStatuses?: Record<string, TaskStatus>
  setOptimisticStatuses?: (updater: (prev: Record<string, TaskStatus>) => Record<string, TaskStatus>) => void
  optimisticCounts?: Record<string, number>
  setOptimisticCounts?: (updater: (prev: Record<string, number>) => Record<string, number>) => void
  findTaskList?: (taskListId: string) => any
}

export function useTaskHandlers({
  taskListId,
  tasks,
  date,
  onRefresh,
  onRefreshUser,
  pendingCompletionsRef,
  pendingStatusUpdatesRef,
  setTaskStatuses,
  optimisticStatuses,
  setOptimisticStatuses,
  optimisticCounts,
  setOptimisticCounts,
  findTaskList,
}: UseTaskHandlersOptions) {
  
  const handleTaskClick = useCallback(async (task: any) => {
    if (!taskListId) return
    
    const key = getTaskKey(task)
    // Use optimistic count if available, otherwise use task count, or check pending completions
    const optimisticCount = optimisticCounts?.[key]
    const pendingCompletion = pendingCompletionsRef.current.get(key)
    const currentCount = pendingCompletion?.count ?? optimisticCount ?? (task?.count || 0)
    const times = task?.times || 1
    const isCurrentlyCompleted = currentCount >= times
    
    // Toggle completion: if completed, uncomplete; otherwise complete
    const newCount = isCurrentlyCompleted 
      ? Math.max(0, currentCount - 1)  // Uncomplete: decrement count
      : currentCount + 1                // Complete: increment count
    const isFullyCompleted = newCount >= times
    
    // Track pending completion/uncompletion
    pendingCompletionsRef.current.set(key, {
      count: newCount,
      status: isFullyCompleted ? 'done' : (newCount > 0 ? 'in progress' : 'open'),
      inClosed: isFullyCompleted
    })
    
    // Calculate new status
    const existingStatus = optimisticStatuses?.[key] || task?.status
    const { status: calculatedStatus } = calculateTaskStatus(newCount, times, existingStatus)
    
    // Optimistic UI update
    if (setTaskStatuses) {
      setTaskStatuses(prev => ({
        ...prev,
        [key]: calculatedStatus
      }))
    }
    if (setOptimisticStatuses && setOptimisticCounts) {
      setOptimisticStatuses(prev => ({ ...prev, [key]: calculatedStatus }))
      setOptimisticCounts(prev => ({ ...prev, [key]: newCount }))
    }
    
    try {
      const newStatus = calculatedStatus
      
      // Persist to API - send task.id, status, count, and times
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskCompletion: true,
          taskListId,
          taskId: task.id || task.localeKey || task.name,
          status: newStatus,
          count: newCount,
          times: times,
          date,
          isCompleted: !isCurrentlyCompleted,  // true if completing, false if uncompleting
          isUncompleted: isCurrentlyCompleted  // true if uncompleting
        })
      })
      
      // Handle ephemeral tasks
      if (task.isEphemeral) {
        if (isFullyCompleted && !isCurrentlyCompleted) {
          // Task just became fully completed - close it
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { close: { id: task.id, count: newCount } }
            })
          })
        } else if (isCurrentlyCompleted && newCount < times) {
          // Task was completed but is now being uncompleted - reopen it
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { reopen: { id: task.id, count: newCount } }
            })
          })
        } else {
          // Update count and status
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { update: { id: task.id, count: newCount, status: newStatus } }
            })
          })
        }
      }
      
      if (onRefreshUser) await onRefreshUser()
      
      // Keep pending completion in ref until next tasklists refresh (happens every 30s)
      // This ensures subsequent clicks use the updated count
      // The pending completion will be cleared when tasklists are refreshed and mergedTasks are updated
    } catch (error) {
      console.error('Error completing task:', error)
      pendingCompletionsRef.current.delete(key)
      if (setOptimisticStatuses && setOptimisticCounts) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, setTaskStatuses, optimisticStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
    const key = getTaskKey(task)
    const taskName = task?.name
    const effectiveStatus = newStatus

    // Track pending status update
    pendingStatusUpdatesRef.current.set(key, effectiveStatus)

    // Update local state immediately (optimistic update)
    if (setTaskStatuses) {
      setTaskStatuses(prev => ({ ...prev, [key]: effectiveStatus }))
    }
    if (setOptimisticStatuses) {
      setOptimisticStatuses(prev => ({ ...prev, [key]: effectiveStatus }))
    }

    // Persist to API
    if (!taskListId) return

    try {
      const foundTask = tasks.find((t: any) => getTaskKey(t) === key)
      if (!foundTask) {
        pendingStatusUpdatesRef.current.delete(key)
        return
      }

      // Determine if this is a completion or uncompletion
      const isCompleting = effectiveStatus === 'done'
      const isUncompleting = effectiveStatus !== 'done' && task.status === 'done'
      
      // Get current count and times from the task
      const currentCount = foundTask?.count || 0
      const times = foundTask?.times || 1
      const newCount = isCompleting ? currentCount + 1 : (isUncompleting ? Math.max(0, currentCount - 1) : currentCount)
      
      // Persist task status to API - send task.id, status, count, and times
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskStatus: true,
          taskListId,
          taskId: task.id || task.localeKey || task.name,
          status: effectiveStatus,
          count: newCount,
          times: times,
          date: date,
          isCompleted: isCompleting,
          isUncompleted: isUncompleting
        })
      })

      if (onRefreshUser) await onRefreshUser()
      
      pendingCompletionsRef.current.delete(key)
      pendingStatusUpdatesRef.current.delete(key)
    } catch (error) {
      console.error('Error saving task status:', error)
      pendingCompletionsRef.current.delete(key)
      pendingStatusUpdatesRef.current.delete(key)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, pendingStatusUpdatesRef, setTaskStatuses, setOptimisticStatuses])

  const handleIncrementCount = useCallback(async (task: any) => {
    if (!taskListId && !task.taskListId) return
    
    const taskListIdToUse = taskListId || task.taskListId
    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1
    const newCount = currentCount + 1
    
    // Track pending completion
    const isFullyCompleted = newCount >= times
    const { status } = calculateTaskStatus(newCount, times, optimisticStatuses?.[taskKey] || task.taskStatus)
    pendingCompletionsRef.current.set(taskKey, {
      count: newCount,
      status,
      inClosed: isFullyCompleted
    })
    
    // Optimistic update
    if (setOptimisticCounts) {
      setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    }
    if (setOptimisticStatuses) {
      setOptimisticStatuses(prev => ({ ...prev, [taskKey]: status }))
    }
    if (setTaskStatuses) {
      setTaskStatuses(prev => ({ ...prev, [taskKey]: status }))
    }
    
    try {
      // Get today's date
      const dateToUse = date || formatDateLocal(new Date())
      
      // Persist to backend - send task.id, status, count, and times
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskCompletion: true,
          taskListId: taskListIdToUse,
          taskId: task.id || task.localeKey || task.name,
          status: status,
          count: newCount,
          times: times,
          date: dateToUse,
          isCompleted: true
        })
      })
      
      if (onRefreshUser) await onRefreshUser()
      
      // Clear optimistic updates and pending completion
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    } catch (error) {
      console.error('Error incrementing count:', error)
      // Revert optimistic updates
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts, findTaskList])

  const handleDecrementCount = useCallback(async (task: any) => {
    if (!taskListId && !task.taskListId) return
    
    const taskListIdToUse = taskListId || task.taskListId
    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1
    
    // Can't decrement below 0
    if (currentCount <= 0) return
    
    const newCount = currentCount - 1
    const { status } = calculateTaskStatus(newCount, times, optimisticStatuses?.[taskKey] || task.taskStatus)
    
    // Optimistic update
    if (setOptimisticCounts) {
      setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    }
    if (setOptimisticStatuses) {
      setOptimisticStatuses(prev => ({ ...prev, [taskKey]: status }))
    }
    if (setTaskStatuses) {
      setTaskStatuses(prev => {
        const updated = { ...prev }
        if (newCount >= times) {
          updated[taskKey] = 'done'
        } else if (newCount > 0) {
          const existingStatus = prev[taskKey]
          if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
            updated[taskKey] = 'in progress'
          } else {
            updated[taskKey] = status
          }
        } else if (newCount === 0) {
          updated[taskKey] = 'open'
        }
        return updated
      })
    }
    
    try {
      // Get today's date
      const dateToUse = date || formatDateLocal(new Date())
      
      // Persist to backend - send task.id, status, count, and times
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskCompletion: true,
          taskListId: taskListIdToUse,
          taskId: task.id || task.localeKey || task.name,
          status: status,
          count: newCount,
          times: times,
          date: dateToUse,
          isCompleted: false
        })
      })
      
      if (onRefreshUser) await onRefreshUser()
      
      // Clear optimistic updates and pending completion
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    } catch (error) {
      console.error('Error decrementing count:', error)
      // Revert optimistic updates
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts, findTaskList])

  const handleToggleRedacted = useCallback(async (task: any) => {
    const taskListIdToUse = taskListId || task.taskListId
    if (!taskListIdToUse) return
    
    const key = getTaskKey(task)
    const currentRedacted = task?.redacted || false
    const newRedacted = !currentRedacted

    try {
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskRedacted: true,
          taskListId: taskListIdToUse,
          taskKey: key,
          redacted: newRedacted
        })
      })
    } catch (error) {
      console.error('Error toggling task redacted status:', error)
    }
  }, [taskListId, onRefresh])

  return {
    handleTaskClick,
    handleStatusChange,
    handleIncrementCount,
    handleDecrementCount,
    handleToggleRedacted,
  }
}

