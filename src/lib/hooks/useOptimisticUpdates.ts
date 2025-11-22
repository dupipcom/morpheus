import { useRef } from 'react'
import { TaskStatus } from '@/lib/taskUtils'

export interface PendingCompletion {
  count: number
  status: TaskStatus
  inClosed: boolean
}

export function useOptimisticUpdates() {
  const pendingCompletionsRef = useRef<Map<string, PendingCompletion>>(new Map())
  const pendingStatusUpdatesRef = useRef<Map<string, TaskStatus>>(new Map())

  return {
    pendingCompletionsRef,
    pendingStatusUpdatesRef,
  }
}

