import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { TaskStatus, mapStatusToEnum, getTaskEntryKey, getCounterWindow } from '@/lib/utils/taskUtils'
import { useI18n } from '@/lib/contexts/i18n'

interface UseTaskHandlersOptions {
  taskListId?: string
  date: string
  userId: string
  selectedTaskList?: any
  onRefresh: () => Promise<void>
  /** Called when a collaborator taps a task: opens the justification dialog */
  onRequestWork?: (task: any) => void
  /** Optimistic counter/times patch, keyed by getTaskEntryKey(task, date) */
  onOptimistic?: (key: string, patch: { dateCount?: number; times?: number }) => void
  /** Drop the optimistic patch for a key (server rejected / consolidation) */
  onOptimisticRevert?: (key: string) => void
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
 * All card-level mutations are optimistic (counter/times patch via
 * onOptimistic) and guarded per (task, occurrence) so rapid taps cannot
 * double-submit.
 */
export function useTaskHandlers({
  taskListId,
  date,
  userId,
  selectedTaskList,
  onRefresh,
  onRequestWork,
  onOptimistic,
  onOptimisticRevert,
}: UseTaskHandlersOptions) {
  const { t } = useI18n()
  /** Entry keys with an in-flight mutation — blocks duplicate submissions. */
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set())

  const createJob = useCallback(
    async (taskId: string, status: string, justification?: string, occurrenceDate?: string): Promise<boolean> => {
      const res = await fetch('/api/v1/jobs', {
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
      return res.ok
    },
    [taskListId, userId, date]
  )

  /**
   * Cancel the most recent ACCEPTED job for a task within its counter window.
   * Owner/manager only (workers cannot un-accept); the window comes from the
   * task's RRULE frequency so weekly/monthly/yearly tasks un-complete the
   * right occurrence. Returns false on rejection/no-op so the caller reverts
   * any optimistic patch.
   */
  const cancelMostRecentJob = useCallback(
    async (task: any, occurrenceDate?: string): Promise<boolean> => {
      const role = getUserRole(selectedTaskList, userId)
      if (!['OWNER', 'MANAGER'].includes(role)) return false

      const effectiveDate = occurrenceDate || date
      const win = getCounterWindow(task, effectiveDate)
      const params = new URLSearchParams({
        taskId: task.id,
        status: 'ACCEPTED',
        dateStart: win.start,
        dateEnd: win.end,
      })
      const response = await fetch(`/api/v1/jobs?${params.toString()}`)
      if (!response.ok) return false
      const data = await response.json()
      const jobs = (data.jobs || []) as any[]
      if (jobs.length === 0) return false
      const mostRecent = jobs[0]
      const putRes = await fetch(`/api/v1/jobs/${mostRecent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      return putRes.ok
    },
    [selectedTaskList, userId, date]
  )

  /**
   * Serialize one mutation per (task, occurrence): block re-entry, apply the
   * handler (which patches optimistically), revert on server rejection with a
   * toast, consolidate on success (onRefresh rebuilds server truth), and keep
   * the optimistic state on network failure until the next revalidation.
   */
  const runGuarded = useCallback(
    async (task: any, mutate: (key: string) => Promise<boolean>): Promise<void> => {
      if (!task?.id) return
      const key = getTaskEntryKey(task, date)
      if (pendingKeys.has(key)) return
      setPendingKeys((prev) => new Set(prev).add(key))
      try {
        const ok = await mutate(key)
        if (ok === false) {
          onOptimisticRevert?.(key)
          toast.error(t('tasks.error.updateFailed', { defaultValue: "Couldn't update the task" }))
          return
        }
        await onRefresh()
        onOptimisticRevert?.(key)
      } catch (error) {
        console.warn('Task mutation failed; keeping optimistic state until next revalidation', error)
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [pendingKeys, date, onRefresh, onOptimisticRevert, t]
  )

  /**
   * Tap to complete/uncomplete a task (criterion 5).
   * - Collaborators without an active job are prompted to justify a request.
   * - Owners/managers complete directly (ACCEPTED job), +1 on the counter.
   * - Tapping a completed task cancels the most recent accepted job (-1).
   */
  const handleTaskClick = useCallback(
    async (task: any, occurrenceDate?: string) => {
      if (!taskListId || !userId) return

      await runGuarded(task, async (key) => {
        const role = getUserRole(selectedTaskList, userId)
        const dateCount = task.dateCount ?? 0
        const times = task.times || 1
        const isDone =
          task.dateStatus === 'DONE' ||
          task.dateStatus === 'COMPLETED' ||
          task.status === 'COMPLETED' ||
          dateCount >= times

        if (isDone) {
          onOptimistic?.(key, { dateCount: Math.max(0, dateCount - 1) })
          return cancelMostRecentJob(task, occurrenceDate)
        }

        if (role === 'COLLABORATOR') {
          // Opens the justification dialog; no optimistic patch applied.
          onRequestWork?.(task)
          return true
        }

        onOptimistic?.(key, { dateCount: dateCount + 1 })
        return createJob(task.id, 'ACCEPTED', undefined, occurrenceDate)
      })
    },
    [taskListId, userId, selectedTaskList, runGuarded, onOptimistic, cancelMostRecentJob, onRequestWork, createJob]
  )

  /**
   * Set a task's status directly (criterion 5: setting to completed completes it).
   * Setting 'done' fills the counter for the occurrence (one job at a time,
   * stopping at the server cap); past occurrences never touch the shared task row.
   */
  const handleStatusChange = useCallback(
    async (task: any, newStatus: TaskStatus) => {
      if (!taskListId) return

      await runGuarded(task, async (key) => {
        const dbStatus = mapStatusToEnum(newStatus)
        const occurrenceDate = task.pastOccurrenceDate
        const isPastCard = !!occurrenceDate
        const isRecurring = !!task.rrule
        const times = task.times || 1
        const dateCount = task.dateCount ?? 0

        if (newStatus === 'done' && userId) {
          onOptimistic?.(key, { dateCount: times })
          const jobsNeeded = Math.max(0, times - dateCount)
          for (let i = 0; i < jobsNeeded; i++) {
            // Stop on the first rejection (server caps at `times` per window)
            if (!(await createJob(task.id, 'ACCEPTED', undefined, occurrenceDate))) {
              return false
            }
          }
        } else if (newStatus === 'open' && isPastCard) {
          // Un-completing a past occurrence: cancel its jobs for that window
          onOptimistic?.(key, { dateCount: Math.max(0, dateCount - 1) })
          if (!(await cancelMostRecentJob(task, occurrenceDate))) {
            return false
          }
        }

        // Global status writes are only safe when the card represents the task
        // itself (one-off tasks, or a recurring task's current-day card).
        if (!(newStatus === 'done' && isRecurring) && !(isRecurring && isPastCard)) {
          const res = await fetch(`/api/v1/tasks/${task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: dbStatus }),
          })
          return res.ok
        }

        return true
      })
    },
    [taskListId, userId, runGuarded, onOptimistic, cancelMostRecentJob, createJob]
  )

  /** Increase the per-period counter target */
  const handleIncrementTimes = useCallback(
    async (task: any) => {
      await runGuarded(task, async (key) => {
        const newTimes = (task.times || 1) + 1
        onOptimistic?.(key, { times: newTimes })
        const res = await fetch(`/api/v1/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ times: newTimes }),
        })
        return res.ok
      })
    },
    [runGuarded, onOptimistic]
  )

  /** Decrease the per-period counter target (minimum 1) */
  const handleDecrementTimes = useCallback(
    async (task: any) => {
      const currentTimes = task.times || 1
      if (currentTimes <= 1) return
      await runGuarded(task, async (key) => {
        const newTimes = currentTimes - 1
        onOptimistic?.(key, { times: newTimes })
        const res = await fetch(`/api/v1/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ times: newTimes }),
        })
        return res.ok
      })
    },
    [runGuarded, onOptimistic]
  )

  /** Undo one completion for the task's occurrence window */
  const handleDecrementCount = useCallback(
    async (task: any) => {
      await runGuarded(task, async (key) => {
        onOptimistic?.(key, { dateCount: Math.max(0, (task.dateCount ?? 0) - 1) })
        return cancelMostRecentJob(task, task.pastOccurrenceDate)
      })
    },
    [runGuarded, onOptimistic, cancelMostRecentJob]
  )

  /** Toggle the sensitive/redacted flag */
  const handleToggleRedacted = useCallback(
    async (task: any) => {
      await runGuarded(task, async () => {
        const res = await fetch(`/api/v1/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redacted: !task.redacted }),
        })
        return res.ok
      })
    },
    [runGuarded]
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
    pendingKeys,
    handleTaskClick,
    handleStatusChange,
    handleIncrementTimes,
    handleDecrementTimes,
    handleDecrementCount,
    handleToggleRedacted,
    updateJob,
  }
}
