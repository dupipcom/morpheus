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
 * Represents allocation for any entity (task, area, category) with both budget and premium
 */
export interface EntityBudgetAllocation {
  budget?: AllocationType   // Budget allocation for this entity
  premium?: AllocationType  // Premium allocation for this entity (was prize)
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
  premium: number   // Premium allocation (was prize)
  earnings: number  // Budget earnings
  totalGains: number // Total: premium + earnings
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
 * Convert EntityAllocationsType array to lookup maps for budget and premium
 * @param allocations - Array of EntityAllocationsType
 * @param budgetTotal - Total budget for percentage calculation
 * @param premiumTotal - Total premium pool for percentage calculation
 * @returns Object with budget and premium lookup maps
 */
export function convertEntityAllocationsToMaps(
  allocations: EntityAllocationsType[] | undefined,
  budgetTotal: number,
  premiumTotal: number
): { budgets: Record<string, number>; premiums: Record<string, number> } {
  const budgets: Record<string, number> = {}
  const premiums: Record<string, number> = {}
  
  if (!allocations || !Array.isArray(allocations)) {
    return { budgets, premiums }
  }
  
  allocations.forEach(item => {
    if (item.entityId) {
      budgets[item.entityId] = getAllocationNominal(item.allocation?.budget, budgetTotal)
      premiums[item.entityId] = getAllocationNominal(item.allocation?.premium, premiumTotal)
    }
  })
  
  return { budgets, premiums }
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
 * Get task earnings and premium from budget distribution
 * Extracts the budget and premium values for a specific task from the distribution
 * 
 * @param taskId - The task ID to look up
 * @param budgetDistribution - The budget distribution object
 * @param listBudget - Total list budget for percentage calculations
 * @param premiumPool - Total premium pool for percentage calculations
 * @returns Object with taskEarnings and taskPrize, or null if not found
 */
export function getTaskAllocationFromDistribution(
  taskId: string,
  budgetDistribution: BudgetDistribution | null | undefined,
  listBudget: number,
  premiumPool: number
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
        taskPrize: getAllocationNominal(taskAllocation.allocation.premium, premiumPool)
      }
    }
  }

  return null
}

/**
 * Calculate budget and premium allocation for each task
 * @param tasks - Array of tasks with their properties
 * @param listBudget - Total list budget
 * @param premiumPool - Total premium pool available
 * @param budgetDistribution - Optional custom distribution by area/category
 * @returns Array of task budget allocations
 */
export function calculateTaskBudgetAllocations(
  tasks: Array<{ id: string; area: string; categories: string[]; budget?: number; premium?: number }>,
  listBudget: number,
  premiumPool: number = 0,
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
      
      // Extract budget and premium from AllocationType objects
      const budget = customAllocation?.budget 
        ? getAllocationNominal(customAllocation.budget, listBudget)
        : (task.budget ?? 0)
      const premium = customAllocation?.premium 
        ? getAllocationNominal(customAllocation.premium, premiumPool)
        : (task.premium ?? 0)
      
      allocations.push({
        taskId: task.id,
        budget,
        premium,
        earnings: budget,
        totalGains: budget + premium
      })
    })
  } else if (budgetDistribution?.areas?.length || budgetDistribution?.categories?.length) {
    // Distribute based on area or category allocations (now array-based)
    const { budgets: areaDistribution, premiums: areaPremiumDistribution } = 
      convertEntityAllocationsToMaps(budgetDistribution.areas, listBudget, premiumPool)
    const { budgets: categoryDistribution, premiums: categoryPremiumDistribution } = 
      convertEntityAllocationsToMaps(budgetDistribution.categories, listBudget, premiumPool)
    
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
      let premiumBudget = 0
      
      if (Object.keys(areaDistribution).length > 0 && task.area in areaDistribution) {
        const areaCount = tasksPerArea[task.area] || 1
        earningsBudget = areaDistribution[task.area] / areaCount
        premiumBudget = (areaPremiumDistribution?.[task.area] || 0) / areaCount
      } else if (Object.keys(categoryDistribution).length > 0 && task.categories.length > 0) {
        // Average across all categories this task belongs to
        const categoryBudgets = task.categories
          .filter(cat => cat in categoryDistribution)
          .map(cat => categoryDistribution[cat] / (tasksPerCategory[cat] || 1))
        earningsBudget = categoryBudgets.reduce((sum, b) => sum + b, 0) / Math.max(categoryBudgets.length, 1)
        
        const categoryPremiums = task.categories
          .filter(cat => cat in categoryPremiumDistribution)
          .map(cat => (categoryPremiumDistribution?.[cat] || 0) / (tasksPerCategory[cat] || 1))
        premiumBudget = categoryPremiums.reduce((sum, p) => sum + p, 0) / Math.max(categoryPremiums.length, 1)
      }
      
      allocations.push({
        taskId: task.id,
        budget: Math.round(earningsBudget * 100) / 100,
        premium: Math.round(premiumBudget * 100) / 100,
        earnings: Math.round(earningsBudget * 100) / 100,
        totalGains: Math.round((earningsBudget + premiumBudget) * 100) / 100
      })
    })
  } else {
    // Default: Equal distribution across all tasks
    const earningsPerTask = listBudget > 0 ? listBudget / tasks.length : 0
    const premiumPerTask = premiumPool > 0 ? premiumPool / tasks.length : 0
    
    tasks.forEach((task, index) => {
      // For last task, use remainder to avoid rounding errors
      const isLast = index === tasks.length - 1
      const budget = isLast
        ? listBudget - (earningsPerTask * index)
        : Math.round(earningsPerTask * 100) / 100
      const premium = isLast
        ? premiumPool - (premiumPerTask * index)
        : Math.round(premiumPerTask * 100) / 100
      
      allocations.push({
        taskId: task.id,
        budget,
        premium,
        earnings: budget,
        totalGains: budget + premium
      })
    })
  }
  
  return allocations
}

/**
 * Validate that a budget distribution is valid
 * @param distribution - Budget distribution object containing areas, categories, or per-task allocations
 * @param totalBudget - Total budget amount available for distribution
 * @param premiumPool - Optional premium pool for validation (defaults to 0)
 * @returns Object with isValid flag and error message if invalid
 */
export function validateBudgetDistribution(
  distribution: BudgetDistribution,
  totalBudget: number,
  premiumPool: number = 0
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
        const premiumNominal = getAllocationNominal(item.allocation?.premium, premiumPool)
        return sum + budgetNominal + premiumNominal
      },
      0
    )
    const totalAvailable = totalBudget + premiumPool
    if (totalTaskBudget > totalAvailable * 1.01) { // Allow 1% tolerance
      return {
        isValid: false,
        error: `Per-task allocations ($${totalTaskBudget.toFixed(2)}) exceed total available ($${totalAvailable.toFixed(2)})`
      }
    }
  }
  
  return { isValid: true }
}
