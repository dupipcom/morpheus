import { useRef } from 'react'
import type { TaskStatus } from '@/lib/utils/taskUtils'

export interface PendingCompletion {
  count: number
  status: TaskStatus
  inClosed: boolean
}

export type PendingCompletionsMap = Map<string, PendingCompletion>
export type PendingStatusUpdatesMap = Map<string, TaskStatus>

/**
 * Hook for managing optimistic updates in task management
 * Provides refs to track pending completions and status updates
 */
export function useOptimisticUpdates() {
  const pendingCompletionsRef = useRef<PendingCompletionsMap>(new Map())
  const pendingStatusUpdatesRef = useRef<PendingStatusUpdatesMap>(new Map())

  return {
    pendingCompletionsRef,
    pendingStatusUpdatesRef,
  }
}
