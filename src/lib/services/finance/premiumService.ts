/**
 * Premium service - single source of truth for simplified task financials
 *
 * Replaces calculateTaskBudgetFromDistribution and the inlined premium-factor
 * blocks. Model: a list has a budget (fiat, or % of its budget sources), each
 * task has a premium (fiat, or % of the list budget). Earnings are the task's
 * equal share of the list budget.
 */

import { applyPremiumFactors, PremiumFactorSettings } from '@/lib/utils/earningsUtils'
import { rruleFrequency } from '@/lib/services/task/recurrenceService'

export interface TaskFinancials {
  earnings: number
  premium: number
  totalGains: number
}

export interface ListBudgetInput {
  budget?: number | null
  budgetType?: string | null
  budgetPercent?: number | null
  budgetSources?: Array<{ remainingAmount?: number | null }> | null
}

/**
 * Resolve the effective fiat budget of a list.
 * - PERCENT: sum of budget sources' remaining amounts × budgetPercent / 100
 * - FIAT (default): the list's own budget
 */
export function resolveListBudget(list: ListBudgetInput): number {
  if (list.budgetType === 'PERCENT' && list.budgetPercent && list.budgetPercent > 0) {
    const sources = list.budgetSources || []
    const total = sources.reduce((sum, source) => sum + (source.remainingAmount || 0), 0)
    return (total * list.budgetPercent) / 100
  }
  return list.budget || 0
}

/**
 * Apply the user's premium factors using the RRULE frequency as the divisor
 * selector (DAILY → dailyPremiumFactor, WEEKLY → weeklyPremiumFactor, always
 * globalPremiumFactor). Reuses applyPremiumFactors via a pseudo list role.
 */
export function applyPremiumFactorsForRRule(
  premium: number,
  rrule: string | null | undefined,
  settings?: PremiumFactorSettings | null
): number {
  if (premium === 0) return 0

  const frequency = rruleFrequency(rrule)
  const pseudoRole =
    frequency === 'DAILY' ? 'daily.auto' : frequency === 'WEEKLY' ? 'weekly.auto' : null

  return applyPremiumFactors(premium, pseudoRole, settings)
}

/**
 * Resolve a task's premium.
 * - PERCENT: percent of the resolved list budget
 * - FIAT (default): the stored amount
 * Premium factors (user settings) are then applied.
 */
export function resolveTaskPremium(
  task: { premium?: number | null; premiumType?: string | null; rrule?: string | null },
  listBudget: number,
  settings?: PremiumFactorSettings | null
): number {
  const raw = task.premium || 0
  if (raw <= 0) return 0

  const base = task.premiumType === 'PERCENT' ? (listBudget * raw) / 100 : raw
  return applyPremiumFactorsForRRule(base, task.rrule, settings)
}

/**
 * Resolve a task's earnings: equal share of the list budget across all tasks
 */
export function resolveTaskEarnings(listBudget: number, numTasks: number): number {
  if (listBudget <= 0 || numTasks <= 0) return 0
  return listBudget / numTasks
}

/**
 * Resolve the full financials (earnings + premium + totalGains) for a task
 */
export function resolveTaskFinancials(
  task: { premium?: number | null; premiumType?: string | null; rrule?: string | null },
  listBudget: number,
  numTasks: number,
  settings?: PremiumFactorSettings | null
): TaskFinancials {
  const premium = resolveTaskPremium(task, listBudget, settings)
  const earnings = resolveTaskEarnings(listBudget, numTasks)
  return { earnings, premium, totalGains: earnings + premium }
}
