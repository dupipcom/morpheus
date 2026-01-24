/**
 * Utility functions for budget distribution across tasks, categories, and areas
 */

/**
 * Allocation type - stores both nominal and percentage values
 * Used for budget and prize allocations
 */
export interface AllocationType {
  nominal?: number  // Nominal (currency) amount
  percent?: number  // Percentage value (0-100)
}

/**
 * Entity allocation structure - matches Prisma EntityBudgetAllocation embedded type
 * Represents allocation for any entity (task, area, category) with both budget and prize
 */
export interface EntityBudgetAllocation {
  budget?: AllocationType  // Budget allocation for this entity
  prize?: AllocationType   // Prize allocation for this entity
}

/**
 * Entity allocations type - matches Prisma EntityAllocationsType
 */
export interface EntityAllocationsType {
  entityId?: string
  entityType?: string      // Entity type: "tasks", "lists", "projects"
  entitySubtype?: string   // Entity subtype: "area", "categories", "notes", or any string
  allocation?: EntityBudgetAllocation
}

/**
 * BudgetDistribution using unified entity allocations
 */
export interface BudgetDistribution {
  areas?: EntityAllocationsType[]
  categories?: EntityAllocationsType[]
  tasks?: EntityAllocationsType[]
}

/**
 * Legacy types for backward compatibility
 */
export interface LegacyTaskAllocation {
  percentage?: number
  amount?: number
}

// Alias for backward compatibility
export type TaskBudgetAllocation = EntityBudgetAllocation
export type TasksAllocationsType = EntityAllocationsType

export interface TaskBudgetAllocationResult {
  taskId: string
  budget: number
  prize: number
  earnings: number
  premium: number // Total: prize + earnings
}

/**
 * Helper to extract nominal value from allocation
 * @param allocation - AllocationType object
 * @param totalBudget - Total budget for percentage calculation
 * @returns The nominal value
 */
export function getAllocationNominal(allocation: AllocationType | undefined, totalBudget: number): number {
  if (!allocation) return 0
  if (allocation.nominal != null) return allocation.nominal
  if (allocation.percent != null) return (allocation.percent / 100) * totalBudget
  return 0
}

/**
 * Helper to extract percentage value from allocation
 * @param allocation - AllocationType object
 * @param totalBudget - Total budget for percentage calculation
 * @returns The percentage value
 */
export function getAllocationPercent(allocation: AllocationType | undefined, totalBudget: number): number {
  if (!allocation) return 0
  if (allocation.percent != null) return allocation.percent
  if (allocation.nominal != null && totalBudget > 0) return (allocation.nominal / totalBudget) * 100
  return 0
}

/**
 * Create an AllocationType from nominal and percentage values
 */
export function createAllocation(nominal?: number, percent?: number): AllocationType {
  return {
    nominal: nominal ?? undefined,
    percent: percent ?? undefined
  }
}

/**
 * Distribute a list's budget across areas based on percentage allocations
 * @param totalBudget - Total budget to distribute
 * @param areaPercentages - Map of area to percentage (should total 100)
 * @returns Map of area to allocated budget amount
 */
export function distributeBudgetByArea(
  totalBudget: number,
  areaPercentages: Record<string, number>
): Record<string, number> {
  const distribution: Record<string, number> = {}
  const areas = Object.keys(areaPercentages)
  
  if (areas.length === 0) return distribution
  
  // Validate percentages sum to 100 (with small tolerance for rounding)
  const totalPercentage = Object.values(areaPercentages).reduce((sum, pct) => sum + pct, 0)
  if (Math.abs(totalPercentage - 100) > 0.01) {
    console.warn(`Area percentages sum to ${totalPercentage}%, expected 100%`)
  }
  
  // Calculate allocation for each area
  let allocated = 0
  areas.forEach((area, index) => {
    if (index === areas.length - 1) {
      // Last area gets remainder to avoid rounding errors
      distribution[area] = totalBudget - allocated
    } else {
      const amount = (totalBudget * areaPercentages[area]) / 100
      distribution[area] = Math.round(amount * 100) / 100 // Round to 2 decimal places
      allocated += distribution[area]
    }
  })
  
  return distribution
}

/**
 * Distribute a list's budget across categories based on percentage allocations
 * @param totalBudget - Total budget to distribute
 * @param categoryPercentages - Map of category to percentage (should total 100)
 * @returns Map of category to allocated budget amount
 */
export function distributeBudgetByCategory(
  totalBudget: number,
  categoryPercentages: Record<string, number>
): Record<string, number> {
  const distribution: Record<string, number> = {}
  const categories = Object.keys(categoryPercentages)
  
  if (categories.length === 0) return distribution
  
  // Validate percentages sum to 100 (with small tolerance for rounding)
  const totalPercentage = Object.values(categoryPercentages).reduce((sum, pct) => sum + pct, 0)
  if (Math.abs(totalPercentage - 100) > 0.01) {
    console.warn(`Category percentages sum to ${totalPercentage}%, expected 100%`)
  }
  
  // Calculate allocation for each category
  let allocated = 0
  categories.forEach((category, index) => {
    if (index === categories.length - 1) {
      // Last category gets remainder to avoid rounding errors
      distribution[category] = totalBudget - allocated
    } else {
      const amount = (totalBudget * categoryPercentages[category]) / 100
      distribution[category] = Math.round(amount * 100) / 100 // Round to 2 decimal places
      allocated += distribution[category]
    }
  })
  
  return distribution
}

/**
 * Convert EntityAllocationsType array to lookup maps for budget and prize
 * @param allocations - Array of EntityAllocationsType
 * @param budgetTotal - Total budget for percentage calculation
 * @param prizeTotal - Total prize pool for percentage calculation
 * @returns Object with budget and prize lookup maps
 */
function convertEntityAllocationsToMaps(
  allocations: EntityAllocationsType[] | undefined,
  budgetTotal: number,
  prizeTotal: number
): { budgets: Record<string, number>; prizes: Record<string, number> } {
  const budgets: Record<string, number> = {}
  const prizes: Record<string, number> = {}
  
  if (!allocations || !Array.isArray(allocations)) {
    return { budgets, prizes }
  }
  
  allocations.forEach(item => {
    if (item.entityId) {
      budgets[item.entityId] = getAllocationNominal(item.allocation?.budget, budgetTotal)
      prizes[item.entityId] = getAllocationNominal(item.allocation?.prize, prizeTotal)
    }
  })
  
  return { budgets, prizes }
}

/**
 * Find entity allocation by ID from array
 */
export function findEntityAllocation(
  allocations: EntityAllocationsType[] | undefined,
  entityId: string
): EntityBudgetAllocation | undefined {
  if (!allocations || !Array.isArray(allocations)) return undefined
  const item = allocations.find(a => a.entityId === entityId)
  return item?.allocation
}

/**
 * Calculate nominal value from percentage
 * @param percent - Percentage value (0-100)
 * @param total - Total budget to calculate from
 * @returns The nominal value
 */
export function percentToNominal(percent: number, total: number): number {
  if (total <= 0) return 0
  return (percent / 100) * total
}

/**
 * Calculate percentage from nominal value
 * @param nominal - Nominal (currency) value
 * @param total - Total budget to calculate percentage of
 * @returns The percentage value (0-100)
 */
export function nominalToPercent(nominal: number, total: number): number {
  if (total <= 0) return 0
  return (nominal / total) * 100
}

/**
 * Get task earnings and prize from budget distribution
 * Extracts the budget and prize values for a specific task from the distribution
 * 
 * @param taskId - The task ID to look up
 * @param budgetDistribution - The budget distribution object
 * @param listBudget - Total list budget for percentage calculations
 * @param prizePool - Total prize pool for percentage calculations
 * @returns Object with taskEarnings and taskPrize, or null if not found
 */
export function getTaskAllocationFromDistribution(
  taskId: string,
  budgetDistribution: BudgetDistribution | null | undefined,
  listBudget: number,
  prizePool: number
): { taskEarnings: number; taskPrize: number } | null {
  if (!budgetDistribution?.tasks || !taskId) {
    return null
  }

  // Handle array-based EntityAllocationsType format
  if (Array.isArray(budgetDistribution.tasks)) {
    const taskAllocation = budgetDistribution.tasks.find((t) => t.entityId === taskId)
    if (taskAllocation?.allocation) {
      return {
        taskEarnings: getAllocationNominal(taskAllocation.allocation.budget, listBudget),
        taskPrize: getAllocationNominal(taskAllocation.allocation.prize, prizePool)
      }
    }
  }

  return null
}

/**
 * Calculate budget and prize allocation for each task
 * @param tasks - Array of tasks with their properties
 * @param listBudget - Total list budget
 * @param prizePool - Total prize pool available
 * @param budgetDistribution - Optional custom distribution by area/category
 * @returns Array of task budget allocations
 */
export function calculateTaskBudgetAllocations(
  tasks: Array<{ id: string; area: string; categories: string[]; budget?: number; prize?: number }>,
  listBudget: number,
  prizePool: number = 0,
  budgetDistribution?: BudgetDistribution
): TaskBudgetAllocationResult[] {
  if (!tasks || tasks.length === 0) {
    return []
  }
  
  const allocations: TaskBudgetAllocationResult[] = []
  
  // Check if we have custom per-task allocations (now array-based)
  const hasCustomTaskBudgets = budgetDistribution?.tasks && Array.isArray(budgetDistribution.tasks) && budgetDistribution.tasks.length > 0
  
  if (hasCustomTaskBudgets) {
    // Use custom per-task allocations with new EntityAllocationsType structure
    tasks.forEach(task => {
      const customAllocation = findEntityAllocation(budgetDistribution.tasks, task.id)
      
      // Extract budget and prize from AllocationType objects
      const budget = customAllocation?.budget 
        ? getAllocationNominal(customAllocation.budget, listBudget)
        : (task.budget ?? 0)
      const prize = customAllocation?.prize 
        ? getAllocationNominal(customAllocation.prize, prizePool)
        : (task.prize ?? 0)
      
      allocations.push({
        taskId: task.id,
        budget,
        prize,
        earnings: budget,
        premium: budget + prize
      })
    })
  } else if (budgetDistribution?.areas?.length || budgetDistribution?.categories?.length) {
    // Distribute based on area or category allocations (now array-based)
    const { budgets: areaDistribution, prizes: areaPrizeDistribution } = 
      convertEntityAllocationsToMaps(budgetDistribution.areas, listBudget, prizePool)
    const { budgets: categoryDistribution, prizes: categoryPrizeDistribution } = 
      convertEntityAllocationsToMaps(budgetDistribution.categories, listBudget, prizePool)
    
    // Count tasks per area/category for fair distribution
    const tasksPerArea: Record<string, number> = {}
    const tasksPerCategory: Record<string, number> = {}
    
    tasks.forEach(task => {
      tasksPerArea[task.area] = (tasksPerArea[task.area] || 0) + 1
      task.categories.forEach(cat => {
        tasksPerCategory[cat] = (tasksPerCategory[cat] || 0) + 1
      })
    })
    
    // Allocate to each task
    tasks.forEach(task => {
      let earningsBudget = 0
      let prizeBudget = 0
      
      if (Object.keys(areaDistribution).length > 0 && task.area in areaDistribution) {
        const areaCount = tasksPerArea[task.area] || 1
        earningsBudget = areaDistribution[task.area] / areaCount
        prizeBudget = (areaPrizeDistribution?.[task.area] || 0) / areaCount
      } else if (Object.keys(categoryDistribution).length > 0 && task.categories.length > 0) {
        // Average across all categories this task belongs to
        const categoryBudgets = task.categories
          .filter(cat => cat in categoryDistribution)
          .map(cat => categoryDistribution[cat] / (tasksPerCategory[cat] || 1))
        earningsBudget = categoryBudgets.reduce((sum, b) => sum + b, 0) / Math.max(categoryBudgets.length, 1)
        
        const categoryPrizes = task.categories
          .filter(cat => cat in categoryPrizeDistribution)
          .map(cat => (categoryPrizeDistribution?.[cat] || 0) / (tasksPerCategory[cat] || 1))
        prizeBudget = categoryPrizes.reduce((sum, p) => sum + p, 0) / Math.max(categoryPrizes.length, 1)
      }
      
      allocations.push({
        taskId: task.id,
        budget: Math.round(earningsBudget * 100) / 100,
        prize: Math.round(prizeBudget * 100) / 100,
        earnings: Math.round(earningsBudget * 100) / 100,
        premium: Math.round((earningsBudget + prizeBudget) * 100) / 100
      })
    })
  } else {
    // Default: Equal distribution across all tasks
    const earningsPerTask = listBudget > 0 ? listBudget / tasks.length : 0
    const prizePerTask = prizePool > 0 ? prizePool / tasks.length : 0
    
    tasks.forEach((task, index) => {
      // For last task, use remainder to avoid rounding errors
      const isLast = index === tasks.length - 1
      const budget = isLast
        ? listBudget - (earningsPerTask * index)
        : Math.round(earningsPerTask * 100) / 100
      const prize = isLast
        ? prizePool - (prizePerTask * index)
        : Math.round(prizePerTask * 100) / 100
      
      allocations.push({
        taskId: task.id,
        budget,
        prize,
        earnings: budget,
        premium: budget + prize
      })
    })
  }
  
  return allocations
}

/**
 * Validate that a budget distribution is valid
 * @param distribution - Budget distribution object containing areas, categories, or per-task allocations
 * @param totalBudget - Total budget amount available for distribution
 * @param prizePool - Optional prize pool for validation (defaults to 0)
 * @returns Object with isValid flag and error message if invalid
 */
export function validateBudgetDistribution(
  distribution: BudgetDistribution,
  totalBudget: number,
  prizePool: number = 0
): { isValid: boolean; error?: string } {
  // Validate area percentages (now using EntityAllocationsType array)
  if (distribution.areas && Array.isArray(distribution.areas) && distribution.areas.length > 0) {
    const totalPercentage = distribution.areas.reduce((sum, item) => {
      return sum + getAllocationPercent(item.allocation?.budget, totalBudget)
    }, 0)
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return {
        isValid: false,
        error: `Area percentages sum to ${totalPercentage.toFixed(2)}%, expected 100%`
      }
    }
  }
  
  // Validate category percentages (now using EntityAllocationsType array)
  if (distribution.categories && Array.isArray(distribution.categories) && distribution.categories.length > 0) {
    const totalPercentage = distribution.categories.reduce((sum, item) => {
      return sum + getAllocationPercent(item.allocation?.budget, totalBudget)
    }, 0)
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return {
        isValid: false,
        error: `Category percentages sum to ${totalPercentage.toFixed(2)}%, expected 100%`
      }
    }
  }
  
  // Validate per-task allocations don't exceed total budget (now using EntityAllocationsType array)
  if (distribution.tasks && Array.isArray(distribution.tasks) && distribution.tasks.length > 0) {
    const totalTaskBudget = distribution.tasks.reduce(
      (sum, item) => {
        const budgetNominal = getAllocationNominal(item.allocation?.budget, totalBudget)
        const prizeNominal = getAllocationNominal(item.allocation?.prize, prizePool)
        return sum + budgetNominal + prizeNominal
      },
      0
    )
    const totalAvailable = totalBudget + prizePool
    if (totalTaskBudget > totalAvailable * 1.01) { // Allow 1% tolerance
      return {
        isValid: false,
        error: `Per-task allocations ($${totalTaskBudget.toFixed(2)}) exceed total available ($${totalAvailable.toFixed(2)})`
      }
    }
  }
  
  return { isValid: true }
}
