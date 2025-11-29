import { useState, useCallback } from 'react'

interface Task {
  id?: string
  name: string
  status: string
  localeKey?: string
  count?: number
  times?: number
  [key: string]: any
}

interface UseSimpleTaskHandlersOptions {
  listId?: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

/**
 * Simplified task handlers with direct optimistic updates
 * No debouncing, no complex ref tracking, just simple state management
 */
export function useSimpleTaskHandlers({ listId, onSuccess, onError }: UseSimpleTaskHandlersOptions) {
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({})
  const [isUpdating, setIsUpdating] = useState(false)

  const getTaskKey = useCallback((task: Task) => {
    return task.id || task.localeKey || task.name.toLowerCase()
  }, [])

  const updateTaskStatus = useCallback(async (task: Task, newStatus: string) => {
    const taskKey = getTaskKey(task)

    // Optimistic update
    setOptimisticStatuses(prev => ({ ...prev, [taskKey]: newStatus }))
    setIsUpdating(true)

    try {
      // If task has an ID, use new Task API
      if (task.id) {
        const response = await fetch(`/api/v1/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus.toUpperCase().replace(/ /g, '_') })
        })

        if (!response.ok) {
          throw new Error('Failed to update task')
        }

        const data = await response.json()
        onSuccess?.()
        return data.task
      } else {
        // Fallback to legacy tasklists API
        const response = await fetch(`/api/v1/tasklists`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listId,
            task: { ...task, status: newStatus }
          })
        })

        if (!response.ok) {
          throw new Error('Failed to update task (legacy)')
        }

        onSuccess?.()
        return task
      }
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticStatuses(prev => {
        const newStatuses = { ...prev }
        delete newStatuses[taskKey]
        return newStatuses
      })
      onError?.(error as Error)
      throw error
    } finally {
      setIsUpdating(false)
    }
  }, [listId, getTaskKey, onSuccess, onError])

  const completeTask = useCallback(async (task: Task) => {
    const currentCount = task.count || 0
    const maxTimes = task.times || 1
    const newCount = Math.min(currentCount + 1, maxTimes)
    const newStatus = newCount >= maxTimes ? 'done' : 'in progress'

    return updateTaskStatus(task, newStatus)
  }, [updateTaskStatus])

  const getOptimisticStatus = useCallback((task: Task): string | undefined => {
    const taskKey = getTaskKey(task)
    return optimisticStatuses[taskKey]
  }, [optimisticStatuses, getTaskKey])

  const clearOptimisticStatus = useCallback((task: Task) => {
    const taskKey = getTaskKey(task)
    setOptimisticStatuses(prev => {
      const newStatuses = { ...prev }
      delete newStatuses[taskKey]
      return newStatuses
    })
  }, [getTaskKey])

  return {
    updateTaskStatus,
    completeTask,
    getOptimisticStatus,
    clearOptimisticStatus,
    isUpdating,
    optimisticStatuses
  }
}
