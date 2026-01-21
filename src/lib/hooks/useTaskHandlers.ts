import { useCallback, useRef } from 'react'
import { TaskStatus, getTaskKey, calculateTaskStatus, formatDateLocal } from '@/lib/utils/taskUtils'

interface PendingCompletion {
  count: number
  status: TaskStatus
  inClosed: boolean
}

/**
 * Check if a task ID is a valid MongoDB ObjectId (24-char hex string)
 */
function isValidObjectId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false
  return id.length === 24 && /^[a-f0-9]+$/i.test(id)
}

/**
 * Migrate a task on-the-fly if it doesn't have a valid Task collection ID
 * Returns the migrated task's new ID, or the original ID if already valid
 */
async function ensureTaskMigrated(
  task: any,
  taskListId: string
): Promise<{ id: string; migrated: boolean }> {
  // If task already has a valid ObjectId, no migration needed
  if (isValidObjectId(task.id)) {
    return { id: task.id, migrated: false }
  }

  // Task needs migration - call the migrate endpoint
  const taskKey = task.localeKey || task.id || (typeof task.name === 'string' ? task.name.toLowerCase() : '')

  if (!taskKey) {
    throw new Error('Task has no identifiable key for migration')
  }

  const response = await fetch('/api/v1/tasks/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listId: taskListId,
      taskKeys: [taskKey]
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to migrate task')
  }

  const result = await response.json()

  // Check if task was migrated
  if (result.migratedTasks && result.migratedTasks.length > 0) {
    return { id: result.migratedTasks[0].id, migrated: true }
  }

  // Task might already exist in collection - try to find it
  // This can happen if the task was migrated but we didn't have the latest ID
  const tasksResponse = await fetch(`/api/v1/tasks?listId=${taskListId}`)
  if (tasksResponse.ok) {
    const tasksData = await tasksResponse.json()
    const existingTask = tasksData.tasks?.find((t: any) => {
      const tKey = t.localeKey || t.id || (typeof t.name === 'string' ? t.name.toLowerCase() : '')
      return tKey === taskKey
    })
    if (existingTask && isValidObjectId(existingTask.id)) {
      return { id: existingTask.id, migrated: false }
    }
  }

  throw new Error('Task migration completed but no task ID returned')
}

interface UseTaskHandlersOptions {
  taskListId: string
  tasks: any[]
  date: string
  userId: string
  selectedTaskList?: any
  onRefresh: () => Promise<void>
  onRefreshUser?: () => Promise<void>
  onRefreshTasks?: () => Promise<void>
  onRefreshTaskLists?: () => Promise<void>
  onTaskCompletedOptimistic?: () => void
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
  onRefreshTasks,
  onRefreshTaskLists,
  onTaskCompletedOptimistic,
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
      // Ensure task is migrated to Task collection before completing
      const { id: taskId, migrated } = await ensureTaskMigrated(task, taskListId)

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
            taskId,
            listId: taskListId,
            workerId: userId,
            status: jobStatus,
            occurrenceDate: date  // Date-specific completion tracking
          })
        })
      } else {
        // If uncompleting, find and delete the most recent job for this task/worker/date
        const jobsResponse = await fetch(
          `/api/v1/jobs?taskId=${taskId}&workerId=${userId}&date=${date}`
        )

        if (jobsResponse.ok) {
          const jobsData = await jobsResponse.json()
          const mostRecentJob = jobsData.jobs?.[0]

          if (mostRecentJob) {
            await fetch(`/api/v1/jobs/${mostRecentJob.id}`, {
              method: 'DELETE'
            })
          }
        }
      }

      // Count and status are now automatically calculated from Jobs
      // No need to update task directly - backend maintains occurrence dates and count

      // Trigger optimistic UI updates BEFORE API calls for immediate feedback
      if (!isCurrentlyCompleted && onTaskCompletedOptimistic) {
        onTaskCompletedOptimistic()
      }

      // Refresh tasks data to get updated dateStatus/dateCount
      if (onRefreshTasks) {
        await onRefreshTasks()
      }

      if (onRefreshUser) await onRefreshUser()

      // Refresh task lists to update completion percentage in toolbar
      if (onRefreshTaskLists) {
        await onRefreshTaskLists()
      }

      // If task was migrated, trigger a refresh to get updated task IDs
      if (migrated && onRefresh) {
        await onRefresh()
      }

      // Clear optimistic state after refresh completes
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
  }, [taskListId, userId, selectedTaskList, tasks, date, onRefresh, onRefreshUser, onRefreshTasks, pendingCompletionsRef, setTaskStatuses, optimisticStatuses, setOptimisticStatuses, setOptimisticCounts, optimisticCounts])

  const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
    const key = getTaskKey(task)
    const effectiveStatus = newStatus
    const effectiveListId = taskListId || task.taskListId

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
    if (!effectiveListId) return

    try {
      // Ensure task is migrated to Task collection before updating status
      const { id: taskId, migrated } = await ensureTaskMigrated(task, effectiveListId)

      // IMPORTANT: When setting status to 'done', we need to create jobs to match
      // This ensures the dateStatus is calculated from jobs, not from task.status
      if (newStatus === 'done' && userId) {
        const currentDateCount = task.dateCount !== undefined ? task.dateCount : (task.count || 0)
        const times = task.times || 1
        const jobsNeeded = times - currentDateCount

        // Create jobs to fill the remaining count
        if (jobsNeeded > 0) {
          const isCollaborative = selectedTaskList?.users && selectedTaskList.users.length > 1
          const userRole = getUserRole(selectedTaskList, userId)
          const jobStatus = isCollaborative && userRole === 'COLLABORATOR'
            ? 'VALIDATING'
            : 'ACCEPTED'

          // Create multiple jobs if times > 1
          for (let i = 0; i < jobsNeeded; i++) {
            await fetch('/api/v1/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId,
                listId: effectiveListId,
                workerId: userId,
                status: jobStatus,
                occurrenceDate: date
              })
            })
          }

          // Refresh tasks to get updated dateStatus/dateCount from jobs
          if (onRefreshTasks) {
            await onRefreshTasks()
          }
        }
      }

      // Update task status via new endpoint (for manual status like 'steady', 'ready', etc.)
      await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: effectiveStatus
        })
      })

      if (onRefreshUser) await onRefreshUser()

      // If task was migrated, trigger a refresh to get updated task IDs
      if (migrated && onRefresh) {
        await onRefresh()
      }

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
  }, [taskListId, userId, selectedTaskList, date, tasks, onRefresh, onRefreshUser, onRefreshTasks, pendingCompletionsRef, pendingStatusUpdatesRef, setTaskStatuses, setOptimisticStatuses])

  const handleIncrementCount = useCallback(async (task: any) => {
    const effectiveListId = taskListId || task.taskListId
    if (!effectiveListId) return

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
      // Ensure task is migrated to Task collection before incrementing
      const { id: taskId, migrated } = await ensureTaskMigrated(task, effectiveListId)

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
            taskId,
            listId: effectiveListId,
            workerId: userId,
            status: jobStatus,
            occurrenceDate: date  // Date-specific completion tracking
          })
        })
      }

      // Count and status are now automatically calculated from Jobs
      // No need to update task directly - backend maintains occurrence dates and count

      // Refresh tasks data to get updated dateStatus/dateCount
      if (onRefreshTasks) {
        await onRefreshTasks()
      }

      if (onRefreshUser) await onRefreshUser()

      // If task was migrated, trigger a refresh to get updated task IDs
      if (migrated && onRefresh) {
        await onRefresh()
      }

      // Clear optimistic updates and pending completion after refresh completes
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
  }, [taskListId, userId, selectedTaskList, tasks, date, onRefresh, onRefreshUser, onRefreshTasks, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleDecrementCount = useCallback(async (task: any) => {
    const effectiveListId = taskListId || task.taskListId
    if (!effectiveListId) return

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
      // Ensure task is migrated to Task collection before decrementing
      const { id: taskId, migrated } = await ensureTaskMigrated(task, effectiveListId)

      // Delete the most recent Job for this task and worker for the current date
      if (userId) {
        const jobsResponse = await fetch(
          `/api/v1/jobs?taskId=${taskId}&workerId=${userId}&date=${date}`
        )

        if (jobsResponse.ok) {
          const jobsData = await jobsResponse.json()
          const mostRecentJob = jobsData.jobs?.[0]

          if (mostRecentJob) {
            await fetch(`/api/v1/jobs/${mostRecentJob.id}`, {
              method: 'DELETE'
            })
          }
        }
      }

      // Count and status are now automatically calculated from Jobs
      // No need to update task directly - backend maintains occurrence dates and count

      // Refresh tasks data to get updated dateStatus/dateCount
      if (onRefreshTasks) {
        await onRefreshTasks()
      }

      if (onRefreshUser) await onRefreshUser()

      // If task was migrated, trigger a refresh to get updated task IDs
      if (migrated && onRefresh) {
        await onRefresh()
      }

      // Clear optimistic updates and pending completion after refresh completes
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
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, onRefreshTasks, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleToggleRedacted = useCallback(async (task: any) => {
    const effectiveListId = taskListId || task.taskListId || task.listId
    if (!effectiveListId) return

    const currentRedacted = task?.redacted || false
    const newRedacted = !currentRedacted

    try {
      // Ensure task is migrated to Task collection before toggling redacted
      const { id: taskId } = await ensureTaskMigrated(task, effectiveListId)

      await fetch(`/api/v1/tasks/${taskId}`, {
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
  }, [taskListId, onRefresh])

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


