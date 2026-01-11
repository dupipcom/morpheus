import { useState, useEffect, useMemo } from 'react'
import { TaskStatus, STATUS_OPTIONS, getTaskKey, getTaskStatus } from '@/lib/utils/taskUtils'

interface UseTaskStatusesOptions {
  tasks: any[]
  selectedTaskListId?: string
  date?: string
  optimisticStatuses?: Record<string, TaskStatus>
}

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

    tasks.forEach((task: any) => {
      const key = getTaskKey(task)

      // Read status directly from Task model (new TaskStatus enum)
      if (task.status) {
        // Map new enum values to old format for backward compatibility
        const statusMap: Record<string, TaskStatus> = {
          'OPEN': 'open',
          'IN_PROGRESS': 'in progress',
          'STEADY': 'steady',
          'READY': 'ready',
          'DONE': 'done',
          'IGNORED': 'ignored',
          'SKIPPED': 'ignored', // Map SKIPPED to ignored for UI
        }

        // If status is already in old format, use it; otherwise map from enum
        const normalizedStatus = statusMap[task.status] || task.status

        if (STATUS_OPTIONS.includes(normalizedStatus as TaskStatus)) {
          statuses[key] = normalizedStatus as TaskStatus
        }
      } else {
        // Fallback for tasks without status - default to open
        if ((task.count || 0) >= (task.times || 1)) {
          statuses[key] = 'done'
        } else if ((task.count || 0) > 0) {
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
      const key = getTaskKey(task)
      return optimisticStatuses?.[key] || taskStatuses[key] || getTaskStatus(task)
    }
  }, [taskStatuses, optimisticStatuses])

  return {
    taskStatuses,
    setTaskStatuses,
    getEffectiveStatus,
  }
}

