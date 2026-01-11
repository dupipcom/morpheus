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
  userId: string
  selectedTaskList?: any
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

// Helper function to determine user's role in a list
function getUserRole(list: any, userId: string): string {
  if (!list?.users) return 'COLLABORATOR'
  const userRef = list.users.find((u: any) => u.userId === userId)
  return userRef?.role || 'COLLABORATOR'
}

export function useTaskHandlers({
  taskListId,
  tasks,
  date,
  userId,
  selectedTaskList,
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
    if (!taskListId || !userId) return

    const key = getTaskKey(task)
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

    // Calculate new status
    const existingStatus = optimisticStatuses?.[key] || task?.status
    const { status: calculatedStatus } = calculateTaskStatus(newCount, times, existingStatus)

    // Track pending completion/uncompletion
    pendingCompletionsRef.current.set(key, {
      count: newCount,
      status: calculatedStatus,
      inClosed: isFullyCompleted
    })

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
      // Determine if list is collaborative and user role
      const isCollaborative = selectedTaskList?.users && selectedTaskList.users.length > 1
      const userRole = getUserRole(selectedTaskList, userId)

      // Determine job status based on hybrid validation
      const jobStatus = isCollaborative && userRole === 'COLLABORATOR'
        ? 'VALIDATING'  // Requires review
        : 'ACCEPTED'    // Auto-accept for solo or owner/manager

      // If completing (not uncompleting), create a Job record
      if (!isCurrentlyCompleted) {
        await fetch('/api/v1/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            listId: taskListId,
            workerId: userId,
            status: jobStatus
          })
        })
      } else {
        // If uncompleting, delete the most recent job for this task and worker
        // This would require fetching and deleting the most recent job
        // For now, we'll leave this as a TODO for the migration
      }

      // Update task count and status
      const taskStatus = isFullyCompleted ? 'DONE' : (newCount > 0 ? 'IN_PROGRESS' : 'OPEN')
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: newCount,
          status: taskStatus
        })
      })

      if (onRefreshUser) await onRefreshUser()

      // Keep pending completion in ref until next refresh
      // Will be cleared on next refresh
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
  }, [taskListId, userId, selectedTaskList, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, setTaskStatuses, optimisticStatuses, setOptimisticStatuses, setOptimisticCounts, optimisticCounts])

  const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
    const key = getTaskKey(task)
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
    if (!taskListId || !task.id) return

    try {
      // Update task status via new endpoint
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: effectiveStatus
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
  }, [taskListId, tasks, onRefreshUser, pendingCompletionsRef, pendingStatusUpdatesRef, setTaskStatuses, setOptimisticStatuses])

  const handleIncrementCount = useCallback(async (task: any) => {
    if (!taskListId && !task.taskListId) return
    if (!task.id) return

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
      // Create a Job record for this completion
      if (userId) {
        const isCollaborative = selectedTaskList?.users && selectedTaskList.users.length > 1
        const userRole = getUserRole(selectedTaskList, userId)
        const jobStatus = isCollaborative && userRole === 'COLLABORATOR'
          ? 'VALIDATING'
          : 'ACCEPTED'

        await fetch('/api/v1/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            listId: taskListId || task.taskListId,
            workerId: userId,
            status: jobStatus
          })
        })
      }

      // Update task count and status
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: newCount,
          status: status
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
  }, [taskListId, userId, selectedTaskList, tasks, date, onRefreshUser, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleDecrementCount = useCallback(async (task: any) => {
    if (!taskListId && !task.taskListId) return
    if (!task.id) return

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
      // TODO: Delete the most recent Job for this task and worker
      // For now, we'll just update the task count and status

      // Update task count and status
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: newCount,
          status: status
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
  }, [taskListId, tasks, date, onRefreshUser, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleToggleRedacted = useCallback(async (task: any) => {
    if (!task.id) return

    const currentRedacted = task?.redacted || false
    const newRedacted = !currentRedacted

    try {
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redacted: newRedacted
        })
      })

      // Refresh to get updated task
      if (onRefresh) await onRefresh()
    } catch (error) {
      console.error('Error toggling task redacted status:', error)
    }
  }, [onRefresh])

  // Handler for owners/managers to validate jobs
  const handleValidateJob = useCallback(async (
    jobId: string,
    accept: boolean,
    peerReview?: number,
    managerReview?: number
  ) => {
    try {
      await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: accept ? 'ACCEPTED' : 'REJECTED',
          peerReview,
          managerReview
        })
      })

      if (onRefresh) await onRefresh()
    } catch (error) {
      console.error('Error validating job:', error)
      throw error
    }
  }, [onRefresh])

  // Handler to add peer review score
  const handleAddPeerReview = useCallback(async (jobId: string, score: number) => {
    try {
      await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerReview: score
        })
      })

      if (onRefresh) await onRefresh()
    } catch (error) {
      console.error('Error adding peer review:', error)
      throw error
    }
  }, [onRefresh])

  // Handler to add manager review score
  const handleAddManagerReview = useCallback(async (jobId: string, score: number) => {
    try {
      await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managerReview: score
        })
      })

      if (onRefresh) await onRefresh()
    } catch (error) {
      console.error('Error adding manager review:', error)
      throw error
    }
  }, [onRefresh])

  return {
    handleTaskClick,
    handleStatusChange,
    handleIncrementCount,
    handleDecrementCount,
    handleToggleRedacted,
    handleValidateJob,
    handleAddPeerReview,
    handleAddManagerReview,
  }
}


