/**
 * Hook for optimistic earnings calculations
 * Provides immediate feedback for task completions before server response
 */

import { useCallback, useState } from 'react'
import { calculateTaskEarnings, getPerCompleterPremium, getPerCompleterEarnings } from '@/lib/utils/earningsUtils'

interface OptimisticEarningsState {
  premium: number
  earnings: number
  totalGains: number
}

interface TaskCompletionEvent {
  taskId: string
  listId: string
  completed: boolean
  timestamp: number
}

interface UseOptimisticEarningsParams {
  currentPremium: number
  currentEarnings: number
  userEquity: number
  selectedList: any
}

const AUTO_CLEAR_TIMEOUT = 5000

export function useOptimisticEarnings({
  currentPremium,
  currentEarnings,
  userEquity,
  selectedList
}: UseOptimisticEarningsParams) {
  const [optimisticDeltas, setOptimisticDeltas] = useState<Map<string, OptimisticEarningsState>>(new Map())
  const [pendingCompletions, setPendingCompletions] = useState<Map<string, TaskCompletionEvent>>(new Map())

  // Sum all optimistic deltas
  const deltaTotals = Array.from(optimisticDeltas.values()).reduce(
    (acc, delta) => ({ premium: acc.premium + delta.premium, earnings: acc.earnings + delta.earnings }),
    { premium: 0, earnings: 0 }
  )
  const optimisticPremium = currentPremium + deltaTotals.premium
  const optimisticEarnings = currentEarnings + deltaTotals.earnings
  const optimisticTotalGains = optimisticPremium + optimisticEarnings

  // Core function to update optimistic earnings (shared by add/remove)
  const updateOptimisticEarnings = useCallback((
    taskId: string,
    listId: string,
    isAddition: boolean
  ): OptimisticEarningsState | undefined => {
    if (!selectedList || selectedList.id !== listId) return undefined

    // Use tasks from Task collection only (templateTasks is deprecated)
    const tasksCount = (selectedList.tasks || []).length || 1

    const earningsCalculation = calculateTaskEarnings({
      listRole: selectedList.role,
      premiumPercentage: selectedList.premiumPercentage as number | undefined,
      listBudget: selectedList.budget,
      userEquity: String(userEquity),
      numTasks: tasksCount,
      date: new Date()
    })

    const multiplier = isAddition ? 1 : -1
    const premium = multiplier * getPerCompleterPremium(earningsCalculation, selectedList.role)
    const earnings = multiplier * getPerCompleterEarnings(earningsCalculation, selectedList.role)
    const totalGains = premium + earnings

    const key = `${taskId}-${Date.now()}`
    setOptimisticDeltas(prev => new Map(prev).set(key, { premium, earnings, totalGains }))

    setPendingCompletions(prev => new Map(prev).set(taskId, {
      taskId,
      listId,
      completed: isAddition,
      timestamp: Date.now()
    }))

    // Auto-clear after timeout
    setTimeout(() => {
      setOptimisticDeltas(prev => {
        const updated = new Map(prev)
        updated.delete(key)
        return updated
      })
      setPendingCompletions(prev => {
        const updated = new Map(prev)
        updated.delete(taskId)
        return updated
      })
    }, AUTO_CLEAR_TIMEOUT)

    return { premium, earnings, totalGains }
  }, [selectedList, userEquity])

  const addOptimisticEarnings = useCallback(
    (taskId: string, listId: string) => updateOptimisticEarnings(taskId, listId, true),
    [updateOptimisticEarnings]
  )

  const removeOptimisticEarnings = useCallback(
    (taskId: string, listId: string) => updateOptimisticEarnings(taskId, listId, false),
    [updateOptimisticEarnings]
  )

  // Clear all optimistic updates
  const clearOptimisticEarnings = useCallback(() => {
    setOptimisticDeltas(new Map())
    setPendingCompletions(new Map())
  }, [])

  // Clear optimistic updates for a specific task
  const clearTaskOptimistic = useCallback((taskId: string) => {
    setOptimisticDeltas(prev => {
      const updated = new Map(prev)
      // Remove all entries for this taskId
      Array.from(updated.keys()).forEach(key => {
        if (key.startsWith(`${taskId}-`)) {
          updated.delete(key)
        }
      })
      return updated
    })
    setPendingCompletions(prev => {
      const updated = new Map(prev)
      updated.delete(taskId)
      return updated
    })
  }, [])

  return {
    optimisticPremium,
    optimisticEarnings,
    optimisticTotalGains,
    hasOptimisticUpdates: optimisticDeltas.size > 0,
    pendingCompletions,
    addOptimisticEarnings,
    removeOptimisticEarnings,
    clearOptimisticEarnings,
    clearTaskOptimistic
  }
}
