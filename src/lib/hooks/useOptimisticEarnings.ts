/**
 * Hook for optimistic earnings calculations
 * Provides immediate feedback for task completions before server response
 */

import { useCallback, useState, useEffect } from 'react'
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

export function useOptimisticEarnings({
  currentPrize,
  currentProfit,
  userEquity,
  selectedList
}: UseOptimisticEarningsParams) {
  const [optimisticDeltas, setOptimisticDeltas] = useState<Map<string, OptimisticEarningsState>>(new Map())
  const [pendingCompletions, setPendingCompletions] = useState<Map<string, TaskCompletionEvent>>(new Map())

  // Calculate total optimistic earnings
  const optimisticPrize = currentPrize + Array.from(optimisticDeltas.values()).reduce((sum, delta) => sum + delta.prize, 0)
  const optimisticProfit = currentProfit + Array.from(optimisticDeltas.values()).reduce((sum, delta) => sum + delta.profit, 0)
  const optimisticEarnings = optimisticPrize + optimisticProfit

  // Add optimistic earnings for a task completion
  const addOptimisticEarnings = useCallback((taskId: string, listId: string) => {
    if (!selectedList || selectedList.id !== listId) return

    // Calculate earnings for this task
    const tasksCount = (selectedList.tasks || []).length || (selectedList.templateTasks || []).length || 1

    const earningsCalculation = calculateTaskEarnings({
      listRole: selectedList.role,
      budgetPercentage: selectedList.budgetPercentage as number | undefined,
      listBudget: selectedList.budget,
      userEquity: String(userEquity),
      numTasks: tasksCount,
      date: new Date()
    })

    const prize = getPerCompleterPrize(earningsCalculation, selectedList.role)
    const profit = getPerCompleterProfit(earningsCalculation, selectedList.role)
    const earnings = prize + profit

    // Store optimistic delta
    const key = `${taskId}-${Date.now()}`
    setOptimisticDeltas(prev => new Map(prev).set(key, { prize, profit, earnings }))

    // Track pending completion
    setPendingCompletions(prev => new Map(prev).set(taskId, {
      taskId,
      listId,
      completed: true,
      timestamp: Date.now()
    }))

    // Auto-clear after 5 seconds (safety timeout)
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
    }, 5000)

    return { prize, profit, earnings }
  }, [selectedList, userEquity])

  // Remove optimistic earnings for a task uncompletion
  const removeOptimisticEarnings = useCallback((taskId: string, listId: string) => {
    if (!selectedList || selectedList.id !== listId) return

    // Calculate earnings for this task (to subtract)
    const tasksCount = (selectedList.tasks || []).length || (selectedList.templateTasks || []).length || 1

    const earningsCalculation = calculateTaskEarnings({
      listRole: selectedList.role,
      budgetPercentage: selectedList.budgetPercentage as number | undefined,
      listBudget: selectedList.budget,
      userEquity: String(userEquity),
      numTasks: tasksCount,
      date: new Date()
    })

    const prize = -getPerCompleterPrize(earningsCalculation, selectedList.role)
    const profit = -getPerCompleterProfit(earningsCalculation, selectedList.role)
    const earnings = prize + profit

    // Store optimistic delta (negative)
    const key = `${taskId}-${Date.now()}`
    setOptimisticDeltas(prev => new Map(prev).set(key, { prize, profit, earnings }))

    // Track pending uncompletion
    setPendingCompletions(prev => new Map(prev).set(taskId, {
      taskId,
      listId,
      completed: false,
      timestamp: Date.now()
    }))

    // Auto-clear after 5 seconds (safety timeout)
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
    }, 5000)

    return { prize, profit, earnings }
  }, [selectedList, userEquity])

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
