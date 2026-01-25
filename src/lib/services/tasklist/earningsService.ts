/**
 * Earnings aggregation and calculation service
 * Handles earnings, premium, and profit calculations for task completions
 */

import prisma from '@/lib/prisma'
import {
  calculateStashAndEarningsDeltas,
  calculateUpdatedUserValues
} from '@/lib/utils/earningsUtils'
import type {
  TaskList,
  CompletedTasks,
  Task,
  AggregatedEarnings,
  StashProfitDeltas
} from './types'
import { getListRoleType, parseNumericValue } from './helpers'

/**
 * Aggregate completer earnings from a task list for a specific user and date
 * Returns { earnings, premium, totalGains }
 */
export async function aggregateCompleterEarningsFromTaskList(
  taskListId: string,
  userId: string,
  year: number,
  dateISO: string
): Promise<AggregatedEarnings> {
  try {
    const taskList = await prisma.list.findUnique({ where: { id: taskListId } })
    if (!taskList) return { earnings: 0, premium: 0, totalGains: 0 }

    const completedTasks = (taskList.completedTasks as CompletedTasks) || {}
    const yearData = completedTasks[year]
    if (!yearData) return { earnings: 0, premium: 0, totalGains: 0 }

    const dateBucket = yearData[dateISO]
    if (!dateBucket) return { earnings: 0, premium: 0, totalGains: 0 }

    // Support both old structure (array) and new structure (openTasks/closedTasks)
    let tasksForDate: Task[] = []
    if (Array.isArray(dateBucket)) {
      tasksForDate = dateBucket
    } else if (dateBucket && ('openTasks' in dateBucket || 'closedTasks' in dateBucket)) {
      tasksForDate = [
        ...(Array.isArray(dateBucket.openTasks) ? dateBucket.openTasks : []),
        ...(Array.isArray(dateBucket.closedTasks) ? dateBucket.closedTasks : [])
      ]
    }

    let totalEarnings = 0
    let totalPremium = 0
    let totalGains = 0

    // Filter completers by logged-in user and sum their earnings/premium
    for (const task of tasksForDate) {
      if (Array.isArray(task.completers)) {
        for (const completer of task.completers) {
          // Only count completers for the logged-in user
          if (completer.id === userId) {
            const completerEarnings = parseNumericValue(completer.earnings)
            const completerPremium = parseNumericValue(completer.premium)

            totalGains += completerEarnings + completerPremium
            totalPremium += completerPremium
            totalEarnings += completerEarnings
          }
        }
      }
    }

    return { earnings: totalEarnings, premium: totalPremium, totalGains }
  } catch (error) {
    console.error('Error aggregating completer earnings from taskList:', error)
    return { earnings: 0, premium: 0, totalGains: 0 }
  }
}

/**
 * Calculate stash and earnings deltas for a task list based on role and date
 */
export async function calculateStashAndProfitDeltasForTaskList(
  taskListId: string,
  userId: string,
  year: number,
  dateISO: string,
  isCompleted: boolean
): Promise<StashProfitDeltas> {
  const taskList = await prisma.list.findUnique({ where: { id: taskListId } })
  if (!taskList) return { stashDelta: 0, profitDelta: 0 }

  const { isDaily, isWeekly, isOneOff } = getListRoleType(taskList.role)

  let stashDelta = 0
  let totalEarningsDelta = 0

  if (isDaily) {
    const aggregated = await aggregateCompleterEarningsFromTaskList(taskListId, userId, year, dateISO)
    const deltas = calculateStashAndEarningsDeltas(
      isCompleted ? aggregated.premium : -aggregated.premium,
      isCompleted ? aggregated.earnings : -aggregated.earnings,
      isCompleted
    )
    stashDelta += deltas.stashDelta
    totalEarningsDelta += deltas.profitDelta
  } else if (isWeekly) {
    const weekStart = new Date(dateISO)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    let totalPremium = 0
    let totalEarnings = 0

    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      const aggregated = await aggregateCompleterEarningsFromTaskList(taskListId, userId, year, dateStr)
      totalPremium += aggregated.premium
      totalEarnings += aggregated.earnings
    }

    const deltas = calculateStashAndEarningsDeltas(
      isCompleted ? totalPremium : -totalPremium,
      isCompleted ? totalEarnings : -totalEarnings,
      isCompleted
    )
    stashDelta += deltas.stashDelta
    totalEarningsDelta += deltas.profitDelta
  } else if (isOneOff) {
    const aggregated = await aggregateCompleterEarningsFromTaskList(taskListId, userId, year, dateISO)
    const deltas = calculateStashAndEarningsDeltas(
      isCompleted ? aggregated.premium : -aggregated.premium,
      isCompleted ? aggregated.earnings : -aggregated.earnings,
      isCompleted
    )
    stashDelta += deltas.stashDelta
    totalEarningsDelta += deltas.profitDelta
  }

  return { stashDelta, profitDelta: totalEarningsDelta }
}

/**
 * Update user stash and earnings values
 * Returns updated values or null if no changes
 */
export async function updateUserStashAndProfit(
  userId: string,
  stashDelta: number,
  profitDelta: number
): Promise<{ availableBalance: number; stash: number; equity: number } | null> {
  if (stashDelta === 0 && profitDelta === 0) return null

  try {
    const refreshedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, availableBalance: true, stash: true, equity: true, profit: true }
    })

    if (!refreshedUser) return null

    const currentStash = parseNumericValue(refreshedUser.stash)
    const currentProfit = parseNumericValue((refreshedUser as Record<string, unknown>).profit)
    const availableBalance = parseNumericValue(refreshedUser.availableBalance)

    const updatedValues = calculateUpdatedUserValues({
      currentStash,
      currentProfit,
      currentAvailableBalance: availableBalance,
      currentTotalGains: 0,
      stashDelta,
      profitDelta
    })

    await prisma.user.update({
      where: { id: refreshedUser.id },
      data: {
        stash: updatedValues.newStash as number,
        profit: updatedValues.newProfit as number,
        equity: updatedValues.newEquity as number
      } as Record<string, unknown>
    })

    return {
      availableBalance: updatedValues.newAvailableBalance,
      stash: updatedValues.newStash,
      equity: updatedValues.newEquity
    }
  } catch (error) {
    console.error('Error updating user stash and profit:', error)
    return null
  }
}
