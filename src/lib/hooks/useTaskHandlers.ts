import { useCallback } from 'react'
import { TaskStatus, mapStatusToEnum } from '@/lib/utils/taskUtils'

interface UseTaskHandlersOptions {
  taskListId?: string
  date: string
  userId: string
  selectedTaskList?: any
  onRefresh: () => Promise<void>
  /** Called when a collaborator taps a task: opens the justification dialog */
  onRequestWork?: (task: any) => void
}

// Helper function to determine user's role in a list
function getUserRole(list: any, userId: string): string {
  const users = Array.isArray(list?.users) ? list.users : []
  const userRef = users.find((u: any) => u.userId === userId)
  return userRef?.role || 'COLLABORATOR'
}

/**
 * Task interaction handlers for the rebuilt Do grid.
 * Single source for taps, status changes, counters, and job updates.
 */
export function useTaskHandlers({
  taskListId,
  date,
  userId,
  selectedTaskList,
  onRefresh,
  onRequestWork,
}: UseTaskHandlersOptions) {
  const createJob = useCallback(
    async (taskId: string, status: string, justification?: string, occurrenceDate?: string) => {
      await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          listId: taskListId,
          workerId: userId,
          status,
          occurrenceDate: occurrenceDate || date,
          justification,
        }),
      })
    },
    [taskListId, userId, date]
  )

  /**
   * Cancel the most recent ACCEPTED job for a task on the given date.
   * Jobs are never deleted — they are set to CANCELLED (financial history).
   */
  const cancelMostRecentJob = useCallback(
    async (taskId: string, occurrenceDate?: string) => {
      const params = new URLSearchParams({
        taskId,
        workerId: userId,
        date: occurrenceDate || date,
        status: 'ACCEPTED'
      })
      const response = await fetch(`/api/v1/jobs?${params.toString()}`)
      if (!response.ok) return
      const data = await response.json()
      const jobs = (data.jobs || []) as any[]
      if (jobs.length === 0) return
      const mostRecent = jobs[0]
      await fetch(`/api/v1/jobs/${mostRecent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
    },
    [userId, date]
  )

  /**
   * Tap to complete/uncomplete a task (criterion 5).
   * - Collaborators without an active job are prompted to justify a request.
   * - Owners/managers complete directly (ACCEPTED job).
   * - Tapping a completed task cancels the most recent accepted job.
   */
  const handleTaskClick = useCallback(
    async (task: any, occurrenceDate?: string) => {
      if (!taskListId || !userId) return

      const role = getUserRole(selectedTaskList, userId)
      const dateCount = task.dateCount ?? 0
      const times = task.times || 1
      const isDone =
        task.dateStatus === 'DONE' ||
        task.dateStatus === 'COMPLETED' ||
        task.status === 'COMPLETED' ||
        dateCount >= times

      if (isDone) {
        await cancelMostRecentJob(task.id, occurrenceDate)
      } else if (role === 'COLLABORATOR') {
        // Collaborators must justify their request (unless owner/manager)
        onRequestWork?.(task)
        return
      } else {
        await createJob(task.id, 'ACCEPTED', undefined, occurrenceDate)
      }

      await onRefresh()
    },
    [taskListId, userId, selectedTaskList, onRefresh, onRequestWork, createJob, cancelMostRecentJob]
  )

  /**
   * Set a task's status directly (criterion 5: setting to completed completes it).
   * Setting 'done' also creates the missing accepted jobs for the date.
   *
   * Occurrence scoping: a recurring task is ONE Task row materialized on many
   * dates. Status changes from a past-day card must operate on that
   * occurrence's jobs only — writing the task row globally would change the
   * status of every other date's entry, including today's.
   */
  const handleStatusChange = useCallback(
    async (task: any, newStatus: TaskStatus) => {
      if (!taskListId) return

      const dbStatus = mapStatusToEnum(newStatus)
      const occurrenceDate = task.pastOccurrenceDate
      const isPastCard = !!occurrenceDate
      const isRecurring = !!task.rrule

      if (newStatus === 'done' && userId) {
        const dateCount = task.dateCount ?? 0
        const times = task.times || 1
        const jobsNeeded = times - dateCount
        // Past-day cards carry their own occurrence date
        for (let i = 0; i < jobsNeeded; i++) {
          await createJob(task.id, 'ACCEPTED', undefined, occurrenceDate)
        }
      } else if (newStatus === 'open' && isPastCard) {
        // Un-completing a past occurrence: cancel its accepted jobs for that
        // date instead of touching the shared task row.
        await cancelMostRecentJob(task.id, occurrenceDate)
      }

      // Global status writes are only safe when the card represents the task
      // itself (one-off tasks, or a recurring task's current-day card).
      // Recurring tasks also materialize their next occurrence through the
      // job acceptances above (updateTaskOccurrenceDates marks the completed
      // row COMPLETED); a global status write would override that and make
      // the completed row appear done on every future date again.
      if (!(newStatus === 'done' && isRecurring) && !(isRecurring && isPastCard)) {
        await fetch(`/api/v1/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: dbStatus }),
        })
      }

      await onRefresh()
    },
    [taskListId, userId, onRefresh, createJob, cancelMostRecentJob]
  )

  /** Increase the per-day counter target */
  const handleIncrementTimes = useCallback(
    async (task: any) => {
      if (!task.id) return
      const newTimes = (task.times || 1) + 1
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ times: newTimes }),
      })
      await onRefresh()
    },
    [onRefresh]
  )

  /** Decrease the per-day counter target (minimum 1) */
  const handleDecrementTimes = useCallback(
    async (task: any) => {
      if (!task.id) return
      const currentTimes = task.times || 1
      if (currentTimes <= 1) return
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ times: currentTimes - 1 }),
      })
      await onRefresh()
    },
    [onRefresh]
  )

  /** Undo one completion for the task's occurrence date */
  const handleDecrementCount = useCallback(
    async (task: any) => {
      if (!task.id) return
      await cancelMostRecentJob(task.id, task.pastOccurrenceDate)
      await onRefresh()
    },
    [cancelMostRecentJob, onRefresh]
  )

  /** Toggle the sensitive/redacted flag */
  const handleToggleRedacted = useCallback(
    async (task: any) => {
      if (!task.id) return
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redacted: !task.redacted }),
      })
      await onRefresh()
    },
    [onRefresh]
  )

  /** Generic job update (status transitions, reviews, evidence) */
  const updateJob = useCallback(
    async (jobId: string, data: Record<string, unknown>) => {
      await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      await onRefresh()
    },
    [onRefresh]
  )

  return {
    handleTaskClick,
    handleStatusChange,
    handleIncrementTimes,
    handleDecrementTimes,
    handleDecrementCount,
    handleToggleRedacted,
    updateJob,
  }
}
