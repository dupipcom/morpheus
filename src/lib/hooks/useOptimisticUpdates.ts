import { useRef } from 'react'
import type { TaskStatus } from '@/lib/utils/taskUtils'

export interface PendingCompletion {
  count: number
  status: TaskStatus
  inClosed: boolean
}

export interface PendingTaskCreation {
  tempId: string
  task: any
  timestamp: number
}

export type PendingCompletionsMap = Map<string, PendingCompletion>
export type PendingStatusUpdatesMap = Map<string, TaskStatus>
export type PendingTaskCreationsMap = Map<string, PendingTaskCreation>

/**
 * Hook for managing optimistic updates in task management
 * Provides refs to track pending completions, status updates, and task creations
 */
export function useOptimisticUpdates() {
  const pendingCompletionsRef = useRef<PendingCompletionsMap>(new Map())
  const pendingStatusUpdatesRef = useRef<PendingStatusUpdatesMap>(new Map())
  const pendingTaskCreationsRef = useRef<PendingTaskCreationsMap>(new Map())

  return {
    pendingCompletionsRef,
    pendingStatusUpdatesRef,
    pendingTaskCreationsRef,
  }
}
