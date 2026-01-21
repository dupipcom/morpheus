import { useCallback } from 'react'
import { TaskStatus, getTaskKey, calculateTaskStatus } from '@/lib/utils/taskUtils'

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
 * Ensure task has a valid Task collection ID
 * Returns the task's ID if valid, otherwise throws an error
 */
async function ensureTaskMigrated(
  task: any,
  taskListId: string
): Promise<{ id: string; migrated: boolean }> {
  if (isValidObjectId(task.id)) {
    return { id: task.id, migrated: false }
  }

  throw new Error(`Task "${task.name}" does not have a valid ID. Please refresh the page.`)
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

// Helper function to determine job status based on collaboration rules
function determineJobStatus(list: any, userId: string): 'VALIDATING' | 'ACCEPTED' {
  const isCollaborative = list?.users && list.users.length > 1
  const userRole = getUserRole(list, userId)
  return isCollaborative && userRole === 'COLLABORATOR' ? 'VALIDATING' : 'ACCEPTED'
}

// Helper to create a job via API
async function createJob(params: {
  taskId: string
  listId: string
  workerId: string
  status: string
  occurrenceDate: string
}): Promise<void> {
  await fetch('/api/v1/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
}

// Helper to delete the most recent job for a task/worker/date
async function deleteMostRecentJob(taskId: string, workerId: string, date: string): Promise<void> {
  const response = await fetch(`/api/v1/jobs?taskId=${taskId}&workerId=${workerId}&date=${date}`)
  if (!response.ok) return

  const data = await response.json()
  const mostRecentJob = data.jobs?.[0]

  if (mostRecentJob) {
    await fetch(`/api/v1/jobs/${mostRecentJob.id}`, { method: 'DELETE' })
  }
}

// Helper type for optimistic state setters
interface OptimisticStateSetters {
  setOptimisticStatuses?: (updater: (prev: Record<string, TaskStatus>) => Record<string, TaskStatus>) => void
  setOptimisticCounts?: (updater: (prev: Record<string, number>) => Record<string, number>) => void
  pendingCompletionsRef: React.MutableRefObject<Map<string, PendingCompletion>>
}

// Helper to clear optimistic state for a key
function clearOptimisticState(key: string, setters: OptimisticStateSetters): void {
  setters.pendingCompletionsRef.current.delete(key)
  if (setters.setOptimisticStatuses) {
    setters.setOptimisticStatuses(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }
  if (setters.setOptimisticCounts) {
    setters.setOptimisticCounts(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }
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

    const optimisticSetters = { setOptimisticStatuses, setOptimisticCounts, pendingCompletionsRef }

    try {
      const { id: taskId, migrated } = await ensureTaskMigrated(task, taskListId)
      const jobStatus = determineJobStatus(selectedTaskList, userId)

      if (!isCurrentlyCompleted) {
        await createJob({ taskId, listId: taskListId, workerId: userId, status: jobStatus, occurrenceDate: date })
        if (onTaskCompletedOptimistic) onTaskCompletedOptimistic()
      } else {
        await deleteMostRecentJob(taskId, userId, date)
      }

      if (onRefreshTasks) await onRefreshTasks()
      if (onRefreshUser) await onRefreshUser()
      if (onRefreshTaskLists) await onRefreshTaskLists()
      if (migrated && onRefresh) await onRefresh()

      clearOptimisticState(key, optimisticSetters)
    } catch (error) {
      console.error('Error completing task:', error)
      clearOptimisticState(key, optimisticSetters)
    }
  }, [taskListId, userId, selectedTaskList, tasks, date, onRefresh, onRefreshUser, onRefreshTasks, onRefreshTaskLists, pendingCompletionsRef, setTaskStatuses, optimisticStatuses, setOptimisticStatuses, setOptimisticCounts, optimisticCounts, onTaskCompletedOptimistic])

  const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
    const key = getTaskKey(task)
    const effectiveListId = taskListId || task.taskListId

    pendingStatusUpdatesRef.current.set(key, newStatus)

    if (setTaskStatuses) {
      setTaskStatuses(prev => ({ ...prev, [key]: newStatus }))
    }
    if (setOptimisticStatuses) {
      setOptimisticStatuses(prev => ({ ...prev, [key]: newStatus }))
    }

    if (!effectiveListId) return

    const optimisticSetters = { setOptimisticStatuses, setOptimisticCounts: undefined, pendingCompletionsRef }

    try {
      const { id: taskId, migrated } = await ensureTaskMigrated(task, effectiveListId)

      // When setting status to 'done', create jobs to match the expected count
      if (newStatus === 'done' && userId) {
        const currentDateCount = task.dateCount ?? task.count ?? 0
        const times = task.times || 1
        const jobsNeeded = times - currentDateCount

        if (jobsNeeded > 0) {
          const jobStatus = determineJobStatus(selectedTaskList, userId)
          for (let i = 0; i < jobsNeeded; i++) {
            await createJob({ taskId, listId: effectiveListId, workerId: userId, status: jobStatus, occurrenceDate: date })
          }
          if (onRefreshTasks) await onRefreshTasks()
        }
      }

      await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (onRefreshUser) await onRefreshUser()
      if (migrated && onRefresh) await onRefresh()

      pendingCompletionsRef.current.delete(key)
      pendingStatusUpdatesRef.current.delete(key)
    } catch (error) {
      console.error('Error saving task status:', error)
      pendingStatusUpdatesRef.current.delete(key)
      clearOptimisticState(key, optimisticSetters)
    }
  }, [taskListId, userId, selectedTaskList, date, tasks, onRefresh, onRefreshUser, onRefreshTasks, pendingCompletionsRef, pendingStatusUpdatesRef, setTaskStatuses, setOptimisticStatuses])

  const handleIncrementCount = useCallback(async (task: any) => {
    const effectiveListId = taskListId || task.taskListId
    if (!effectiveListId) return

    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1
    const newCount = currentCount + 1

    const isFullyCompleted = newCount >= times
    const { status } = calculateTaskStatus(newCount, times, optimisticStatuses?.[taskKey] || task.taskStatus)
    pendingCompletionsRef.current.set(taskKey, { count: newCount, status, inClosed: isFullyCompleted })

    if (setOptimisticCounts) setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    if (setOptimisticStatuses) setOptimisticStatuses(prev => ({ ...prev, [taskKey]: status }))
    if (setTaskStatuses) setTaskStatuses(prev => ({ ...prev, [taskKey]: status }))

    const optimisticSetters = { setOptimisticStatuses, setOptimisticCounts, pendingCompletionsRef }

    try {
      const { id: taskId, migrated } = await ensureTaskMigrated(task, effectiveListId)

      if (userId) {
        const jobStatus = determineJobStatus(selectedTaskList, userId)
        await createJob({ taskId, listId: effectiveListId, workerId: userId, status: jobStatus, occurrenceDate: date })
      }

      if (onRefreshTasks) await onRefreshTasks()
      if (onRefreshUser) await onRefreshUser()
      if (migrated && onRefresh) await onRefresh()

      clearOptimisticState(taskKey, optimisticSetters)
    } catch (error) {
      console.error('Error incrementing count:', error)
      clearOptimisticState(taskKey, optimisticSetters)
    }
  }, [taskListId, userId, selectedTaskList, tasks, date, onRefresh, onRefreshUser, onRefreshTasks, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleDecrementCount = useCallback(async (task: any) => {
    const effectiveListId = taskListId || task.taskListId
    if (!effectiveListId) return

    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1

    if (currentCount <= 0) return

    const newCount = currentCount - 1
    const { status } = calculateTaskStatus(newCount, times, optimisticStatuses?.[taskKey] || task.taskStatus)

    if (setOptimisticCounts) setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    if (setOptimisticStatuses) setOptimisticStatuses(prev => ({ ...prev, [taskKey]: status }))
    if (setTaskStatuses) {
      setTaskStatuses(prev => {
        if (newCount >= times) return { ...prev, [taskKey]: 'done' }
        if (newCount === 0) return { ...prev, [taskKey]: 'open' }
        const existingStatus = prev[taskKey]
        const newStatus = (!existingStatus || existingStatus === 'done' || existingStatus === 'open')
          ? 'in progress'
          : status
        return { ...prev, [taskKey]: newStatus }
      })
    }

    const optimisticSetters = { setOptimisticStatuses, setOptimisticCounts, pendingCompletionsRef }

    try {
      const { id: taskId, migrated } = await ensureTaskMigrated(task, effectiveListId)

      if (userId) {
        await deleteMostRecentJob(taskId, userId, date)
      }

      if (onRefreshTasks) await onRefreshTasks()
      if (onRefreshUser) await onRefreshUser()
      if (migrated && onRefresh) await onRefresh()

      clearOptimisticState(taskKey, optimisticSetters)
    } catch (error) {
      console.error('Error decrementing count:', error)
      clearOptimisticState(taskKey, optimisticSetters)
    }
  }, [taskListId, userId, tasks, date, onRefresh, onRefreshUser, onRefreshTasks, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleToggleRedacted = useCallback(async (task: any) => {
    const effectiveListId = taskListId || task.taskListId || task.listId
    if (!effectiveListId) return

    try {
      const { id: taskId } = await ensureTaskMigrated(task, effectiveListId)
      await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redacted: !task?.redacted })
      })
      if (onRefresh) await onRefresh()
    } catch (error) {
      console.error('Error toggling task redacted status:', error)
    }
  }, [taskListId, onRefresh])

  // Helper for updating jobs
  const updateJob = useCallback(async (jobId: string, data: Record<string, unknown>, errorContext: string) => {
    try {
      await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (onRefresh) await onRefresh()
    } catch (error) {
      console.error(`Error ${errorContext}:`, error)
      throw error
    }
  }, [onRefresh])

  const handleValidateJob = useCallback(async (
    jobId: string,
    accept: boolean,
    peerReview?: number,
    managerReview?: number
  ) => {
    await updateJob(jobId, {
      status: accept ? 'ACCEPTED' : 'REJECTED',
      peerReview,
      managerReview
    }, 'validating job')
  }, [updateJob])

  const handleAddPeerReview = useCallback(async (jobId: string, score: number) => {
    await updateJob(jobId, { peerReview: score }, 'adding peer review')
  }, [updateJob])

  const handleAddManagerReview = useCallback(async (jobId: string, score: number) => {
    await updateJob(jobId, { managerReview: score }, 'adding manager review')
  }, [updateJob])

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


