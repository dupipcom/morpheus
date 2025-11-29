import { useMemo } from 'react'
import { TaskStatus, getTaskKey, getTaskStatus } from '@/lib/utils/taskUtils'

interface UseTaskStatusesOptions {
  tasks: any[]
  selectedTaskListId?: string
  date?: string
}

export function useTaskStatuses({
  tasks,
  selectedTaskListId,
  date,
}: UseTaskStatusesOptions) {
  // Derive status directly from tasks prop
  const taskStatuses = useMemo(() => {
    const statuses: Record<string, TaskStatus> = {}
    tasks.forEach((task: any) => {
      const key = getTaskKey(task)
      statuses[key] = getTaskStatus(task)
    })
    return statuses
  }, [tasks])

  // Simple setter for optimistic updates (used by handlers)
  const setTaskStatuses = (updater: (prev: Record<string, TaskStatus>) => Record<string, TaskStatus>) => {
    // This will be used with useState in the component for optimistic updates
    // The actual implementation is in the component that uses this hook
  }

  return {
    taskStatuses,
    setTaskStatuses,
  }
}

