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

interface EarningsCalculation {
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

