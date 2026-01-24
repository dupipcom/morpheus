/**
 * Hook for optimistic earnings calculations
 * Provides immediate feedback for task completions before server response
 */

import { useCallback, useState } from 'react'
import { calculateTaskEarnings, getPerCompleterPrize, getPerCompleterProfit } from '@/lib/utils/earningsUtils'

interface OptimisticEarningsState {
  prize: number
  profit: number
  earnings: number
}

interface TaskCompletionEvent {
  taskId: string
  listId: string
  completed: boolean
  timestamp: number
}

interface UseOptimisticEarningsParams {
  currentPrize: number
  currentProfit: number
  userEquity: number
  selectedList: any
}

const AUTO_CLEAR_TIMEOUT = 5000

export function useOptimisticEarnings({
  currentPrize,
  currentProfit,
  userEquity,
  selectedList
}: UseOptimisticEarningsParams) {
  const [optimisticDeltas, setOptimisticDeltas] = useState<Map<string, OptimisticEarningsState>>(new Map())
  const [pendingCompletions, setPendingCompletions] = useState<Map<string, TaskCompletionEvent>>(new Map())

  // Sum all optimistic deltas
  const deltaTotals = Array.from(optimisticDeltas.values()).reduce(
    (acc, delta) => ({ prize: acc.prize + delta.prize, profit: acc.profit + delta.profit }),
    { prize: 0, profit: 0 }
  )
  const optimisticPrize = currentPrize + deltaTotals.prize
  const optimisticProfit = currentProfit + deltaTotals.profit
  const optimisticEarnings = optimisticPrize + optimisticProfit

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
      budgetPercentage: selectedList.budgetPercentage as number | undefined,
      listBudget: selectedList.budget,
      userEquity: String(userEquity),
      numTasks: tasksCount,
      date: new Date()
    })

    const multiplier = isAddition ? 1 : -1
    const prize = multiplier * getPerCompleterPrize(earningsCalculation, selectedList.role)
    const profit = multiplier * getPerCompleterProfit(earningsCalculation, selectedList.role)
    const earnings = prize + profit

    const key = `${taskId}-${Date.now()}`
    setOptimisticDeltas(prev => new Map(prev).set(key, { prize, profit, earnings }))

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

    return { prize, profit, earnings }
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
    optimisticPrize,
    optimisticProfit,
    optimisticEarnings,
    hasOptimisticUpdates: optimisticDeltas.size > 0,
    pendingCompletions,
    addOptimisticEarnings,
    removeOptimisticEarnings,
    clearOptimisticEarnings,
    clearTaskOptimistic
  }
}
