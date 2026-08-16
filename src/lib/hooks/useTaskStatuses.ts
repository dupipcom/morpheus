import { useState, useEffect, useMemo } from 'react'
import { getTaskEntryKey, getTaskStatus, STATUS_OPTIONS } from '@/lib/utils/taskUtils'
import type { TaskStatus } from '@/lib/utils/taskUtils'

interface Task {
  id?: string
  name?: string
  localeKey?: string
  status?: string
  dateStatus?: string
  count?: number
  dateCount?: number
  times?: number
}

interface UseTaskStatusesOptions {
  tasks: Task[]
  selectedTaskListId?: string
  date?: string
  optimisticStatuses?: Record<string, TaskStatus>
}

/**
 * Hook for managing task statuses with optimistic update support
 */
export function useTaskStatuses({
  tasks,
  selectedTaskListId,
  date,
  optimisticStatuses,
}: UseTaskStatusesOptions) {
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})

  // Initialize task statuses from API data
  useEffect(() => {
    if (!selectedTaskListId && !tasks.length) return
    const statuses: Record<string, TaskStatus> = {}

    tasks.forEach((task) => {
      // Occurrence-scoped: one recurring task row appears on many dates, so
      // each (task, date) entry gets its own status slot.
      const key = getTaskEntryKey(task, date)

      // IMPORTANT: For date views, prefer dateStatus (job-based) over task.status (global)
      // This ensures the UI reflects the actual job completion state for the specific date
      const statusToUse = task.dateStatus !== undefined ? task.dateStatus : task.status

      // Read status from dateStatus or Task model (new TaskStatus enum)
      if (statusToUse) {
        // Map new enum values to old format for backward compatibility
        const statusMap: Record<string, TaskStatus> = {
          'OPEN': 'open',
          'IN_PROGRESS': 'in progress',
          'STEADY': 'steady',
          'READY': 'ready',
          'DONE': 'done',
          'IGNORED': 'ignored',
          'SKIPPED': 'ignored', // Map SKIPPED to ignored for UI
          'COMPLETED': 'completed', // Map COMPLETED to completed
        }

        // If status is already in old format, use it; otherwise map from enum
        const normalizedStatus = statusMap[statusToUse] || statusToUse

        if (STATUS_OPTIONS.includes(normalizedStatus as TaskStatus)) {
          statuses[key] = normalizedStatus as TaskStatus
        }
      } else {
        // Fallback for tasks without status - calculate from count
        // Use dateCount for date views, fallback to global count
        const count = task.dateCount !== undefined ? task.dateCount : (task.count || 0)
        const times = task.times || 1

        if (count >= times) {
          statuses[key] = 'done'
        } else if (count > 0) {
          statuses[key] = 'in progress'
        } else {
          statuses[key] = 'open'
        }
      }
    })

    setTaskStatuses(statuses)
  }, [selectedTaskListId, date, tasks])

  // Get effective task status (considering optimistic updates)
  const getEffectiveStatus = useMemo(() => {
    return (task: any): TaskStatus => {
      const key = getTaskEntryKey(task, date)
      return optimisticStatuses?.[key] || taskStatuses[key] || getTaskStatus(task)
    }
  }, [taskStatuses, optimisticStatuses, date])

  return {
    taskStatuses,
    setTaskStatuses,
    getEffectiveStatus,
  }
}
