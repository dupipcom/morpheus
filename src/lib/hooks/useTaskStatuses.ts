import { useState, useEffect, useMemo, useRef } from 'react'
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
  const isInitializedRef = useRef(false)

  // Initialize task statuses from API data
  useEffect(() => {
    if (!selectedTaskListId && !tasks.length) return

    const statuses: Record<string, TaskStatus> = {}

    tasks.forEach((task: any) => {
      const key = getTaskKey(task)

      // Use status from the task object if available - this preserves manually set statuses
      if (task.status && STATUS_OPTIONS.includes(task.status as TaskStatus)) {
        statuses[key] = task.status as TaskStatus
      } else if (task.status === 'done') {
        statuses[key] = 'done'
      } else if ((task.count || 0) > 0 && (task.count || 0) < (task.times || 1)) {
        statuses[key] = 'in progress'
      }
    })

    // On first load, just set the statuses
    if (!isInitializedRef.current) {
      setTaskStatuses(statuses)
      isInitializedRef.current = true
    } else {
      // On subsequent updates, preserve optimistic updates
      setTaskStatuses(prev => {
        const merged = { ...statuses }
        // Keep optimistic updates that differ from API data
        Object.keys(prev).forEach(key => {
          if (prev[key] !== statuses[key]) {
            merged[key] = prev[key]
          }
        })
        return merged
      })
    }
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

