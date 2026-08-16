'use client'

import useSWR from 'swr'
import { jsonFetcher } from '@/lib/utils/utils'
import type { List } from '@/generated/prisma'

interface TaskListsResponse {
  taskLists: (List & { jobCompletedTasks?: Record<string, unknown> })[]
}

/**
 * Fetch the authenticated user's task lists (owned, managed, collaborated).
 * Replaces the GlobalContext taskLists + 30s polling pattern with plain SWR.
 */
export function useTaskLists() {
  const { data, error, isLoading, mutate } = useSWR<TaskListsResponse>(
    '/api/v1/tasklists',
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 15000,
    }
  )

  return {
    taskLists: data?.taskLists || [],
    isLoading,
    error,
    refreshTaskLists: mutate
  }
}
