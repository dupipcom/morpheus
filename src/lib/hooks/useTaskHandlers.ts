import { useCallback } from 'react'
import { TaskStatus, getTaskKey, calculateTaskStatus, formatDateLocal } from '@/lib/utils/taskUtils'

interface UseTaskHandlersOptions {
  taskListId: string
  tasks: any[]
  date: string
  onRefresh: () => Promise<void>
  onRefreshUser?: () => Promise<void>
  setTaskStatuses: (updater: (prev: Record<string, TaskStatus>) => Record<string, TaskStatus>) => void
}

export function useTaskHandlers({
  taskListId,
  tasks,
  date,
  onRefresh,
  onRefreshUser,
  setTaskStatuses,
}: UseTaskHandlersOptions) {
  
  const handleTaskClick = useCallback(async (task: any) => {
    if (!taskListId) return
    
    const key = getTaskKey(task)
    const currentCount = task?.count || 0
    const times = task?.times || 1
    const isCurrentlyCompleted = currentCount >= times
    
    // Toggle completion: if completed, uncomplete; otherwise complete
    const newCount = isCurrentlyCompleted 
      ? Math.max(0, currentCount - 1)  // Uncomplete: decrement count
      : currentCount + 1                // Complete: increment count
    
    // Calculate new status
    const existingStatus = task?.status
    const { status: calculatedStatus } = calculateTaskStatus(newCount, times, existingStatus)
    
    // Optimistic UI update - immediately update local state
    setTaskStatuses(prev => ({
      ...prev,
      [key]: calculatedStatus
    }))
    
    try {
      // Single API call to persist status change
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskCompletion: true,
          taskListId,
          taskId: task.id || task.localeKey || task.name,
          status: calculatedStatus,
          count: newCount,
          times: times,
          date,
          isCompleted: !isCurrentlyCompleted,
          isUncompleted: isCurrentlyCompleted
        })
      })
      
      // Handle ephemeral tasks
      if (task.isEphemeral) {
        const isFullyCompleted = newCount >= times
        if (isFullyCompleted && !isCurrentlyCompleted) {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { close: { id: task.id, count: newCount } }
            })
          })
        } else if (isCurrentlyCompleted && newCount < times) {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { reopen: { id: task.id, count: newCount } }
            })
          })
        } else {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { update: { id: task.id, count: newCount, status: calculatedStatus } }
            })
          })
        }
      }
      
      if (onRefreshUser) await onRefreshUser()
    } catch (error) {
      console.error('Error completing task:', error)
      // Revert optimistic update on error
      setTaskStatuses(prev => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, setTaskStatuses])

  const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
    if (!taskListId) return
    
    const key = getTaskKey(task)

    // Optimistic update - immediately update local state
    setTaskStatuses(prev => ({ ...prev, [key]: newStatus }))

    try {
      const foundTask = tasks.find((t: any) => getTaskKey(t) === key)
      if (!foundTask) return

      // Determine if this is a completion or uncompletion
      const isCompleting = newStatus === 'done'
      const isUncompleting = newStatus !== 'done' && task.status === 'done'
      
      // Get current count and times from the task
      const currentCount = foundTask?.count || 0
      const times = foundTask?.times || 1
      const newCount = isCompleting ? currentCount + 1 : (isUncompleting ? Math.max(0, currentCount - 1) : currentCount)
      
      // Single API call to persist status change
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskStatus: true,
          taskListId,
          taskId: task.id || task.localeKey || task.name,
          status: newStatus,
          count: newCount,
          times: times,
          date: date,
          isCompleted: isCompleting,
          isUncompleted: isUncompleting
        })
      })

      if (onRefreshUser) await onRefreshUser()
    } catch (error) {
      console.error('Error saving task status:', error)
      // Revert optimistic update on error
      setTaskStatuses(prev => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, setTaskStatuses])

  const handleIncrementCount = useCallback(async (task: any) => {
    if (!taskListId) return
    
    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1
    const newCount = currentCount + 1
    
    // Calculate new status
    const { status } = calculateTaskStatus(newCount, times, task.status)
    
    // Optimistic update
    setTaskStatuses(prev => ({ ...prev, [taskKey]: status }))
    
    try {
      const dateToUse = date || formatDateLocal(new Date())
      
      // Single API call
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskCompletion: true,
          taskListId,
          taskId: task.id || task.localeKey || task.name,
          status: status,
          count: newCount,
          times: times,
          date: dateToUse,
          isCompleted: true
        })
      })
      
      if (onRefreshUser) await onRefreshUser()
    } catch (error) {
      console.error('Error incrementing count:', error)
      // Revert optimistic update
      setTaskStatuses(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, setTaskStatuses])

  const handleDecrementCount = useCallback(async (task: any) => {
    if (!taskListId) return
    
    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1
    
    // Can't decrement below 0
    if (currentCount <= 0) return
    
    const newCount = currentCount - 1
    const { status } = calculateTaskStatus(newCount, times, task.status)
    
    // Optimistic update
    setTaskStatuses(prev => {
      const updated = { ...prev }
      if (newCount >= times) {
        updated[taskKey] = 'done'
      } else if (newCount > 0) {
        updated[taskKey] = status
      } else {
        updated[taskKey] = 'open'
      }
      return updated
    })
    
    try {
      const dateToUse = date || formatDateLocal(new Date())
      
      // Single API call
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskCompletion: true,
          taskListId,
          taskId: task.id || task.localeKey || task.name,
          status: status,
          count: newCount,
          times: times,
          date: dateToUse,
          isCompleted: false
        })
      })
      
      if (onRefreshUser) await onRefreshUser()
    } catch (error) {
      console.error('Error decrementing count:', error)
      // Revert optimistic update
      setTaskStatuses(prev => {
        const updated = { ...prev }
        delete updated[taskKey]
        return updated
      })
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, setTaskStatuses])

  const handleToggleRedacted = useCallback(async (task: any) => {
    if (!taskListId) return
    
    const key = getTaskKey(task)
    const currentRedacted = task?.redacted || false
    const newRedacted = !currentRedacted

    try {
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskRedacted: true,
          taskListId,
          taskKey: key,
          redacted: newRedacted
        })
      })
    } catch (error) {
      console.error('Error toggling task redacted status:', error)
    }
  }, [taskListId])

  return {
    handleTaskClick,
    handleStatusChange,
    handleIncrementCount,
    handleDecrementCount,
    handleToggleRedacted,
  }
}

