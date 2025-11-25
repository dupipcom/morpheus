/**
 * Utility functions for calculating task earnings and budget consumption
 */

/**
 * Get the number of days in a specific month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Get the number of weeks in a specific month
 */
export function getWeeksInMonth(year: number, month: number): number {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  
  // Get the week number for first and last day
  const firstWeek = getWeekNumber(firstDay)
  const lastWeek = getWeekNumber(lastDay)
  
  // Calculate weeks in month
  return lastWeek - firstWeek + 1
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

export interface EarningsCalculation {
  actionPrize: number
  actionProfit: number
  actionValuation: number
  dailyPrize?: number
  dailyProfit?: number
  dailyEarnings?: number
  weeklyPrize?: number
  weeklyProfit?: number
  weeklyEarnings?: number
}

interface CalculateEarningsParams {
  listRole?: string | null
  budgetPercentage?: number
  listBudget?: string | null
  userEquity?: string | null
  numTasks: number
  date: Date
}

/**
 * Calculate earnings for a completed task
 * Note: Prize calculations use user.equity (not availableBalance) for security
 */
export function calculateTaskEarnings({
  listRole,
  budgetPercentage,
  listBudget,
  userEquity,
  numTasks,
  date
}: CalculateEarningsParams): EarningsCalculation {
  const result: EarningsCalculation = {
    actionPrize: 0,
    actionProfit: 0,
    actionValuation: 0
  }

  // Early return if no tasks
  if (numTasks === 0) return result

  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  const equity = parseFloat(userEquity || '0')
  const budget = parseFloat(listBudget || '0')
  const budgetAllocation = (budgetPercentage || 0) / 100 // Convert percentage to decimal

  // 1. Calculate actionPrize (if budgetPercentage is set)
  // Prize is calculated from equity (availableBalance - stash)
  if (budgetAllocation > 0 && equity > 0) {
    result.actionPrize = (budgetAllocation * equity) / numTasks
    
    // For daily/weekly lists, divide by 30 or 4 respectively
    if (isDaily) {
      result.dailyPrize = result.actionPrize / 30
    } else if (isWeekly) {
      result.weeklyPrize = result.actionPrize / 4
    }
  } else if (budgetAllocation > 0 && equity <= 0) {
    // If budgetPercentage is set but equity is 0 or null, still set actionPrize to 0
    // This ensures the structure is consistent even when equity is missing
    result.actionPrize = 0
    if (isDaily) {
      result.dailyPrize = 0
    } else if (isWeekly) {
      result.weeklyPrize = 0
    }
  }

  // 2. Calculate actionProfit (if list has budget)
  if (budget > 0) {
    result.actionProfit = budget / numTasks
    
    // For daily/weekly lists, divide by 30 or 4 respectively
    if (isDaily) {
      result.dailyProfit = result.actionProfit / 30
    } else if (isWeekly) {
      result.weeklyProfit = result.actionProfit / 4
    }
  }

  // 3. Calculate actionValuation (total earnings)
  result.actionValuation = result.actionProfit + result.actionPrize
  
  // For daily/weekly lists, calculate daily/weekly earnings
  if (isDaily) {
    result.dailyEarnings = result.actionValuation / 30
  } else if (isWeekly) {
    result.weeklyEarnings = result.actionValuation / 4
  }

  return result
}

/**
 * Calculate budget consumption after task completion
 */
export function calculateBudgetConsumption(
  currentRemainingBudget: string | null | undefined,
  listBudget: string | null | undefined,
  numTasks: number
): string {
  if (numTasks === 0) return currentRemainingBudget || listBudget || '0'
  
  const remaining = parseFloat(currentRemainingBudget || listBudget || '0')
  const budget = parseFloat(listBudget || '0')
  
  if (budget === 0) return remaining.toString()
  
  const consumption = budget / numTasks
  const newRemaining = Math.max(0, remaining - consumption)
  
  return newRemaining.toString()
}

/**
 * Initialize remainingBudget if not set
 */
export function initializeRemainingBudget(
  remainingBudget: string | null | undefined,
  listBudget: string | null | undefined
): string {
  if (remainingBudget !== null && remainingBudget !== undefined) {
    return remainingBudget
  }
  return listBudget || '0'
}

/**
 * Get per-completer prize based on list role (cadence)
 * Returns the appropriate prize value (dailyPrize, weeklyPrize, or actionPrize)
 */
export function getPerCompleterPrize(
  earnings: EarningsCalculation,
  listRole?: string | null
): number {
  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  
  if (isDaily) {
    // If dailyPrize is explicitly set, use it; otherwise fall back to actionPrize
    return earnings.dailyPrize !== undefined ? earnings.dailyPrize : (earnings.actionPrize || 0)
  } else if (isWeekly) {
    // If weeklyPrize is explicitly set, use it; otherwise fall back to actionPrize
    return earnings.weeklyPrize !== undefined ? earnings.weeklyPrize : (earnings.actionPrize || 0)
  } else {
    return earnings.actionPrize || 0
  }
}

/**
 * Get per-completer profit based on list role (cadence)
 * Returns the appropriate profit value (dailyProfit, weeklyProfit, or actionProfit)
 */
export function getPerCompleterProfit(
  earnings: EarningsCalculation,
  listRole?: string | null
): number {
  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  
  if (isDaily) {
    return earnings.dailyProfit || 0
  } else if (isWeekly) {
    return earnings.weeklyProfit || 0
  } else {
    return earnings.actionProfit || 0
  }
}

/**
 * Calculate profit per task based on budget, number of tasks, and cadence
 * This is a convenience function for cases where you only need profit calculation
 */
export function getProfitPerTask(
  listBudget: number | string | null | undefined,
  numTasks: number,
  listRole?: string | null
): number {
  if (numTasks === 0) return 0
  
  const budget = typeof listBudget === 'number' 
    ? listBudget 
    : parseFloat(String(listBudget || '0'))
  
  if (budget <= 0) return 0
  
  const actionProfit = budget / numTasks
  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  
  if (isDaily) {
    return actionProfit / 30
  } else if (isWeekly) {
    return actionProfit / 4
  } else {
    return actionProfit
  }
}

/**
 * Calculate stash delta (prize only) and profit delta separately
 * Stash should only contain prize, profit is tracked separately in user.profit
 * Returns { stashDelta, profitDelta } where both are guaranteed to be >= 0 for additions
 */
export function calculateStashAndProfitDeltas(
  prizeDelta: number,
  profitDelta: number,
  isAddition: boolean = true
): { stashDelta: number; profitDelta: number } {
  if (isAddition) {
    // For additions: only positive deltas go to stash/profit
    return {
      stashDelta: Math.max(0, prizeDelta),
      profitDelta: Math.max(0, profitDelta)
    }
  } else {
    // For removals: only negative deltas are allowed
    return {
      stashDelta: Math.min(0, prizeDelta),
      profitDelta: Math.min(0, profitDelta)
    }
  }
}

/**
 * Calculate updated user values ensuring they never go below 0
 * Returns { newStash, newProfit, newEquity, newAvailableBalance }
 * All values are guaranteed to be >= 0
 */
export function calculateUpdatedUserValues(params: {
  currentStash: number
  currentProfit: number
  currentAvailableBalance: number
  stashDelta: number
  profitDelta: number
}): {
  newStash: number
  newProfit: number
  newEquity: number
  newAvailableBalance: number
} {
  const {
    currentStash,
    currentProfit,
    currentAvailableBalance,
    stashDelta,
    profitDelta
  } = params

  // Ensure current values are never negative
  const safeStash = Math.max(0, currentStash)
  const safeProfit = Math.max(0, currentProfit)
  const safeAvailableBalance = Math.max(0, currentAvailableBalance)

  // Calculate new values
  const newStash = Math.max(0, safeStash + stashDelta)
  const newProfit = Math.max(0, safeProfit + profitDelta)
  const newAvailableBalance = Math.max(0, safeAvailableBalance)
  
  // Equity = availableBalance - stash (stash only contains prize, not profit)
  const newEquity = Math.max(0, newAvailableBalance - newStash)

  return {
    newStash,
    newProfit,
    newEquity,
    newAvailableBalance
  }
}

