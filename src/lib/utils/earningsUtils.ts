/**
 * Utility functions for calculating task earnings and budget consumption
 */

// Default premium factor values (must match Prisma schema defaults)
export const DEFAULT_DAILY_PREMIUM_FACTOR = 30
export const DEFAULT_WEEKLY_PREMIUM_FACTOR = 4
export const DEFAULT_GLOBAL_PREMIUM_FACTOR = 1

// Minimum premium factor value (enforced at Prisma level)
export const MIN_PREMIUM_FACTOR = 1

/**
 * Premium factor settings from user.settings
 */
export interface PremiumFactorSettings {
  dailyPremiumFactor?: number | null
  weeklyPremiumFactor?: number | null
  globalPremiumFactor?: number | null
}

/**
 * Apply premium factors based on list role
 * - For daily lists: divides by dailyPremiumFactor AND globalPremiumFactor
 * - For weekly lists: divides by weeklyPremiumFactor AND globalPremiumFactor
 * - For all other lists: divides by globalPremiumFactor only
 * 
 * @param premium - The raw premium value to apply factors to
 * @param listRole - The list role (e.g., 'daily.default', 'weekly.custom')
 * @param settings - User settings containing premium factors
 * @returns The premium value after applying the appropriate factors
 */
export function applyPremiumFactors(
  premium: number,
  listRole: string | null | undefined,
  settings?: PremiumFactorSettings | null
): number {
  if (premium === 0) return 0

  // Get factor values with defaults, ensuring minimum of 1
  const dailyFactor = Math.max(MIN_PREMIUM_FACTOR, settings?.dailyPremiumFactor ?? DEFAULT_DAILY_PREMIUM_FACTOR)
  const weeklyFactor = Math.max(MIN_PREMIUM_FACTOR, settings?.weeklyPremiumFactor ?? DEFAULT_WEEKLY_PREMIUM_FACTOR)
  const globalFactor = Math.max(MIN_PREMIUM_FACTOR, settings?.globalPremiumFactor ?? DEFAULT_GLOBAL_PREMIUM_FACTOR)

  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')

  let divisor = globalFactor // globalFactor always applies

  if (isDaily) {
    divisor = dailyFactor * globalFactor
  } else if (isWeekly) {
    divisor = weeklyFactor * globalFactor
  }

  return premium / divisor
}

/**
 * Get the number of days in a specific month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Get ISO week number for a date
 * Note: This is a local implementation to avoid circular dependencies with app/helpers
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/**
 * Get the number of weeks in a specific month
 */
export function getWeeksInMonth(year: number, month: number): number {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  // Get the week number for first and last day
  const firstWeek = getISOWeekNumber(firstDay)
  const lastWeek = getISOWeekNumber(lastDay)

  // Calculate weeks in month
  return lastWeek - firstWeek + 1
}

export interface EarningsCalculation {
  actionPremium: number      // Premium per action (was actionPrize)
  actionEarnings: number     // Earnings per action (was actionProfit)
  actionValuation: number    // Total valuation (earnings + premium)
  dailyPremium?: number      // Daily premium
  dailyEarnings?: number     // Daily earnings
  dailyTotal?: number        // Daily total (earnings + premium)
  weeklyPremium?: number     // Weekly premium
  weeklyEarnings?: number    // Weekly earnings
  weeklyTotal?: number       // Weekly total (earnings + premium)
}

interface CalculateEarningsParams {
  listRole?: string | null
  premiumPercentage?: number
  listBudget?: string | null
  userEquity?: string | null
  numTasks: number
  date: Date
}

/**
 * Calculate earnings for a completed task
 * Note: Premium calculations use user.equity (not availableBalance) for security
 */
export function calculateTaskEarnings({
  listRole,
  premiumPercentage,
  listBudget,
  userEquity,
  numTasks,
  date
}: CalculateEarningsParams): EarningsCalculation {
  const result: EarningsCalculation = {
    actionPremium: 0,
    actionEarnings: 0,
    actionValuation: 0
  }

  // Early return if no tasks
  if (numTasks === 0) return result

  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  const equity = parseFloat(userEquity || '0')
  const budget = parseFloat(listBudget || '0')
  const budgetAllocation = (premiumPercentage || 0) / 100 // Convert percentage to decimal

  // 1. Calculate actionPremium (if premiumPercentage is set)
  // Premium is calculated from equity (availableBalance - stash)
  if (budgetAllocation > 0 && equity > 0) {
    result.actionPremium = (budgetAllocation * equity) / numTasks
    
    // For daily/weekly lists, divide by 30 or 4 respectively
    if (isDaily) {
      result.dailyPremium = result.actionPremium / 30
    } else if (isWeekly) {
      result.weeklyPremium = result.actionPremium / 4
    }
  } else if (budgetAllocation > 0 && equity <= 0) {
    // If premiumPercentage is set but equity is 0 or null, still set actionPremium to 0
    // This ensures the structure is consistent even when equity is missing
    result.actionPremium = 0
    if (isDaily) {
      result.dailyPremium = 0
    } else if (isWeekly) {
      result.weeklyPremium = 0
    }
  }

  // 2. Calculate actionEarnings (if list has budget)
  if (budget > 0) {
    result.actionEarnings = budget / numTasks
    
    // For daily/weekly lists, divide by 30 or 4 respectively
    if (isDaily) {
      result.dailyEarnings = result.actionEarnings / 30
    } else if (isWeekly) {
      result.weeklyEarnings = result.actionEarnings / 4
    }
  }

  // 3. Calculate actionValuation (total = earnings + premium)
  result.actionValuation = result.actionEarnings + result.actionPremium
  
  // For daily/weekly lists, calculate daily/weekly totals
  if (isDaily) {
    result.dailyTotal = result.actionValuation / 30
  } else if (isWeekly) {
    result.weeklyTotal = result.actionValuation / 4
  }

  return result
}

/**
 * Calculate the total premium pool from user equity and budget percentage
 * Premium pool = (premiumPercentage / 100) * userEquity
 */
export function calculatePremiumPool(premiumPercentage: number, userEquity: number): number {
  return (premiumPercentage / 100) * userEquity
}

// Alias for backwards compatibility
export const calculatePrizePool = calculatePremiumPool

/**
 * Calculate budget percentage from currency value and user equity
 * premiumPercentage = (currencyValue / userEquity) * 100
 */
export function calculatepremiumPercentageFromCurrency(currencyValue: number, userEquity: number): number {
  if (userEquity <= 0) return 0
  return (currencyValue / userEquity) * 100
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
 * Get per-completer premium based on list role (cadence)
 * Returns the appropriate premium value (dailyPremium, weeklyPremium, or actionPremium)
 * 
 * When premiumFactorSettings is provided, applies the premium factors:
 * - For daily lists: divides by dailyPremiumFactor AND globalPremiumFactor
 * - For weekly lists: divides by weeklyPremiumFactor AND globalPremiumFactor
 * - For all other lists: divides by globalPremiumFactor only
 * 
 * Note: The raw premium values (dailyPremium, weeklyPremium) in EarningsCalculation
 * may already have the legacy /30 or /4 division applied. When using premiumFactorSettings,
 * use actionPremium as the base and let applyPremiumFactors handle the division.
 */
export function getPerCompleterPremium(
  earnings: EarningsCalculation,
  listRole?: string | null,
  premiumFactorSettings?: PremiumFactorSettings | null
): number {
  // If premium factor settings are provided, use actionPremium as base and apply factors
  if (premiumFactorSettings) {
    return applyPremiumFactors(earnings.actionPremium || 0, listRole, premiumFactorSettings)
  }
  
  // Legacy behavior: use pre-calculated dailyPremium/weeklyPremium
  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  
  if (isDaily) {
    // If dailyPremium is explicitly set, use it; otherwise fall back to actionPremium
    return earnings.dailyPremium !== undefined ? earnings.dailyPremium : (earnings.actionPremium || 0)
  } else if (isWeekly) {
    // If weeklyPremium is explicitly set, use it; otherwise fall back to actionPremium
    return earnings.weeklyPremium !== undefined ? earnings.weeklyPremium : (earnings.actionPremium || 0)
  } else {
    return earnings.actionPremium || 0
  }
}

// Alias for backwards compatibility
export const getPerCompleterPrize = getPerCompleterPremium

/**
 * Get per-completer earnings based on list role (cadence)
 * Returns the appropriate earnings value (dailyEarnings, weeklyEarnings, or actionEarnings)
 */
export function getPerCompleterEarnings(
  earnings: EarningsCalculation,
  listRole?: string | null
): number {
  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  
  if (isDaily) {
    return earnings.dailyEarnings || 0
  } else if (isWeekly) {
    return earnings.weeklyEarnings || 0
  } else {
    return earnings.actionEarnings || 0
  }
}

// Alias for backwards compatibility
export const getPerCompleterProfit = getPerCompleterEarnings

/**
 * Calculate earnings per task based on budget, number of tasks, and cadence
 * This is a convenience function for cases where you only need earnings calculation
 */
export function getEarningsPerTask(
  listBudget: number | string | null | undefined,
  numTasks: number,
  listRole?: string | null
): number {
  if (numTasks === 0) return 0
  
  const budget = typeof listBudget === 'number' 
    ? listBudget 
    : parseFloat(String(listBudget || '0'))
  
  if (budget <= 0) return 0
  
  const actionEarnings = budget / numTasks
  const isDaily = listRole?.startsWith('daily.')
  const isWeekly = listRole?.startsWith('weekly.')
  
  if (isDaily) {
    return actionEarnings / 30
  } else if (isWeekly) {
    return actionEarnings / 4
  } else {
    return actionEarnings
  }
}

// Alias for backwards compatibility
export const getProfitPerTask = getEarningsPerTask

/**
 * Calculate stash delta (premium only) and earnings delta separately
 * Stash should only contain premium, earnings is tracked separately in user.profit
 * Returns { stashDelta, profitDelta } where both are guaranteed to be >= 0 for additions
 */
export function calculateStashAndEarningsDeltas(
  premiumDelta: number,
  earningsDelta: number,
  isAddition: boolean = true
): { stashDelta: number; profitDelta: number } {
  if (isAddition) {
    // For additions: only positive deltas go to stash/earnings
    return {
      stashDelta: Math.max(0, premiumDelta),
      profitDelta: Math.max(0, earningsDelta)
    }
  } else {
    // For removals: only negative deltas are allowed
    return {
      stashDelta: Math.min(0, premiumDelta),
      profitDelta: Math.min(0, earningsDelta)
    }
  }
}

// Alias for backwards compatibility
export const calculateStashAndProfitDeltas = calculateStashAndEarningsDeltas

interface UserValuesParams {
  currentStash: number
  currentProfit: number
  currentAvailableBalance: number
  currentTotalGains: number
  stashDelta: number
  profitDelta: number
}

interface UpdatedUserValues {
  newStash: number
  newProfit: number
  newEquity: number
  newAvailableBalance: number
  newTotalGains: number
}

/**
 * Calculate updated user values ensuring they never go below 0
 * Returns { newStash, newProfit, newEquity, newAvailableBalance, newTotalGains }
 * All values are guaranteed to be >= 0
 */
export function calculateUpdatedUserValues(params: UserValuesParams): UpdatedUserValues {
  const {
    currentStash,
    currentProfit,
    currentAvailableBalance,
    currentTotalGains,
    stashDelta,
    profitDelta
  } = params

  // Ensure current values are never negative
  const safeStash = Math.max(0, currentStash)
  const safeProfit = Math.max(0, currentProfit)
  const safeAvailableBalance = Math.max(0, currentAvailableBalance)
  const safeTotalGains = Math.max(0, currentTotalGains)

  // Calculate new values
  const newStash = Math.max(0, safeStash + stashDelta)
  const newProfit = Math.max(0, safeProfit + profitDelta)
  const newAvailableBalance = Math.max(0, safeAvailableBalance)
  
  // totalGains accumulates the sum of all premium (stash) and earnings over time
  const totalGainsDelta = stashDelta + profitDelta
  const newTotalGains = Math.max(0, safeTotalGains + totalGainsDelta)

  // Equity = availableBalance - stash (stash only contains premium, not earnings)
  const newEquity = Math.max(0, newAvailableBalance - newStash)

  return {
    newStash,
    newProfit,
    newEquity,
    newAvailableBalance,
    newTotalGains
  }
}

