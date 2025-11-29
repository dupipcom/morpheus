import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'

interface EmbeddedTask {
  id?: string
  name: string
  categories: string[]
  area: string
  status: string
  localeKey?: string
  count?: number
  times?: number
  completers?: any[]
  isEphemeral?: boolean
  completedOn?: string
  [key: string]: any
}

interface Task {
  id: string
  name: string
  categories: string[]
  area: string
  status: string
  localeKey?: string
  listId?: string
  [key: string]: any
}

interface UseTasksHybridOptions {
  listId?: string
  date?: string // YYYY-MM-DD format
  enabled?: boolean
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

/**
 * Hybrid hook that loads tasks from both new (Day.tasks, Task collection)
 * and old (List.tasks, List.completedTasks) structures
 */
export function useTasksHybrid({ listId, date, enabled = true }: UseTasksHybridOptions) {
  const [tasks, setTasks] = useState<EmbeddedTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Try to load from Day.tasks first (new structure)
  const { data: dayData, error: dayError } = useSWR(
    enabled && date ? `/api/v1/days?date=${date}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Fallback to Task collection (new structure)
  const { data: taskCollectionData, error: taskCollectionError } = useSWR(
    enabled && listId ? `/api/v1/tasks?listId=${listId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Legacy: Load from List (old structure as backup)
  const { data: listData, error: listError } = useSWR(
    enabled && listId ? `/api/v1/tasklists/${listId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }

    // Priority 1: Day.tasks (embedded tasks for specific date)
    if (dayData?.day?.tasks && Array.isArray(dayData.day.tasks) && dayData.day.tasks.length > 0) {
      setTasks(dayData.day.tasks)
      setIsLoading(false)
      setError(null)
      return
    }

    // Priority 2: Task collection (new structure)
    if (taskCollectionData?.tasks && Array.isArray(taskCollectionData.tasks)) {
      // Convert Task[] to EmbeddedTask[] format for compatibility
      const convertedTasks = taskCollectionData.tasks.map((task: Task) => ({
        id: task.id,
        name: task.name,
        categories: task.categories || [],
        area: task.area,
        status: task.status?.toLowerCase().replace(/_/g, ' ') || 'open',
        localeKey: task.localeKey,
        count: 0,
        times: 1,
        completers: [],
        ...task
      }))
      setTasks(convertedTasks)
      setIsLoading(false)
      setError(null)
      return
    }

    // Priority 3: Legacy List.tasks or List.templateTasks (old structure)
    if (listData?.list) {
      const list = listData.list
      const legacyTasks = list.tasks?.length > 0 ? list.tasks : (list.templateTasks || [])

      if (legacyTasks.length > 0) {
        setTasks(legacyTasks)
        setIsLoading(false)
        setError(null)
        return
      }
    }

    // No data found
    if (dayData || taskCollectionData || listData) {
      setTasks([])
      setIsLoading(false)
    }

    // Handle errors
    if (dayError || taskCollectionError || listError) {
      setError(dayError || taskCollectionError || listError)
      setIsLoading(false)
    }
  }, [enabled, dayData, taskCollectionData, listData, dayError, taskCollectionError, listError])

  const dataSource = useMemo(() => {
    if (dayData?.day?.tasks?.length > 0) return 'day'
    if (taskCollectionData?.tasks?.length > 0) return 'collection'
    if (listData?.list?.tasks?.length > 0 || listData?.list?.templateTasks?.length > 0) return 'legacy'
    return 'none'
  }, [dayData, taskCollectionData, listData])

  return {
    tasks,
    isLoading,
    error,
    dataSource, // Useful for debugging and migration tracking
    refetch: () => {
      // Trigger refetch for all SWR hooks
      // This will be implemented based on your SWR configuration
    }
  }
}
