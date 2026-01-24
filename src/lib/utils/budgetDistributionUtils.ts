/**
 * Utility functions for budget distribution across tasks, categories, and areas
 */

/**
 * Task allocation structure - matches Prisma TaskAllocation embedded type
 * Represents allocation for a single task (percentage or nominal amount)
 */
export interface TaskAllocation {
  percentage?: number  // Percentage of budget allocated to this task
  amount?: number      // Nominal amount allocated to this task
}

export interface BudgetDistribution {
  areas?: Record<string, number>
  categories?: Record<string, number>
  tasks?: Record<string, { budget: number; prize: number }>
}

export interface TaskBudgetAllocation {
  taskId: string
  budget: number
  prize: number
  earnings: number
  premium: number // Total: prize + earnings
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
 * Calculate budget and prize allocation for each task
 * @param tasks - Array of tasks with their properties
 * @param listBudget - Total list budget
 * @param prizePercentage - Percentage of budget allocated to prize (0-100)
 * @param budgetDistribution - Optional custom distribution by area/category
 * @returns Array of task budget allocations
 */
export function calculateTaskBudgetAllocations(
  tasks: Array<{ id: string; area: string; categories: string[]; budget?: number; prize?: number }>,
  listBudget: number,
  prizePercentage: number = 0,
  budgetDistribution?: BudgetDistribution
): TaskBudgetAllocation[] {
  if (!tasks || tasks.length === 0 || listBudget <= 0) {
    return []
  }
  
  const allocations: TaskBudgetAllocation[] = []
  
  // Calculate total budget for earnings and prize
  const totalPrizeBudget = (listBudget * prizePercentage) / 100
  const totalEarningsBudget = listBudget - totalPrizeBudget
  
  // Check if we have custom per-task allocations
  const hasCustomTaskBudgets = budgetDistribution?.tasks && Object.keys(budgetDistribution.tasks).length > 0
  
  if (hasCustomTaskBudgets) {
    // Use custom per-task allocations
    tasks.forEach(task => {
      const customAllocation = budgetDistribution.tasks?.[task.id]
      const budget = customAllocation?.budget ?? task.budget ?? 0
      const prize = customAllocation?.prize ?? task.prize ?? 0
      
      allocations.push({
        taskId: task.id,
        budget,
        prize,
        earnings: budget,
        premium: budget + prize
      })
    })
  } else if (budgetDistribution?.areas || budgetDistribution?.categories) {
    // Distribute based on area or category allocations
    const areaDistribution = budgetDistribution.areas 
      ? distributeBudgetByArea(totalEarningsBudget, budgetDistribution.areas)
      : null
    const categoryDistribution = budgetDistribution.categories
      ? distributeBudgetByCategory(totalEarningsBudget, budgetDistribution.categories)
      : null
    
    const prizeBudgetDistribution = budgetDistribution.areas
      ? distributeBudgetByArea(totalPrizeBudget, budgetDistribution.areas)
      : budgetDistribution.categories
        ? distributeBudgetByCategory(totalPrizeBudget, budgetDistribution.categories)
        : null
    
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
      
      if (areaDistribution && task.area in areaDistribution) {
        const areaCount = tasksPerArea[task.area] || 1
        earningsBudget = areaDistribution[task.area] / areaCount
        prizeBudget = (prizeBudgetDistribution?.[task.area] || 0) / areaCount
      } else if (categoryDistribution && task.categories.length > 0) {
        // Average across all categories this task belongs to
        const categoryBudgets = task.categories
          .filter(cat => cat in categoryDistribution)
          .map(cat => categoryDistribution[cat] / (tasksPerCategory[cat] || 1))
        earningsBudget = categoryBudgets.reduce((sum, b) => sum + b, 0) / Math.max(categoryBudgets.length, 1)
        
        const categoryPrizes = task.categories
          .filter(cat => prizeBudgetDistribution && cat in prizeBudgetDistribution)
          .map(cat => (prizeBudgetDistribution?.[cat] || 0) / (tasksPerCategory[cat] || 1))
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
    const earningsPerTask = totalEarningsBudget / tasks.length
    const prizePerTask = totalPrizeBudget / tasks.length
    
    tasks.forEach((task, index) => {
      // For last task, use remainder to avoid rounding errors
      const isLast = index === tasks.length - 1
      const budget = isLast 
        ? totalEarningsBudget - (earningsPerTask * index)
        : Math.round(earningsPerTask * 100) / 100
      const prize = isLast
        ? totalPrizeBudget - (prizePerTask * index)
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
 * @returns Object with isValid flag and error message if invalid
 */
export function validateBudgetDistribution(
  distribution: BudgetDistribution,
  totalBudget: number
): { isValid: boolean; error?: string } {
  // Validate area percentages
  if (distribution.areas) {
    const totalPercentage = Object.values(distribution.areas).reduce((sum, pct) => sum + pct, 0)
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return {
        isValid: false,
        error: `Area percentages sum to ${totalPercentage.toFixed(2)}%, expected 100%`
      }
    }
  }
  
  // Validate category percentages
  if (distribution.categories) {
    const totalPercentage = Object.values(distribution.categories).reduce((sum, pct) => sum + pct, 0)
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return {
        isValid: false,
        error: `Category percentages sum to ${totalPercentage.toFixed(2)}%, expected 100%`
      }
    }
  }
  
  // Validate per-task allocations don't exceed total budget
  if (distribution.tasks) {
    const totalTaskBudget = Object.values(distribution.tasks).reduce(
      (sum, allocation) => sum + allocation.budget + allocation.prize,
      0
    )
    if (totalTaskBudget > totalBudget * 1.01) { // Allow 1% tolerance
      return {
        isValid: false,
        error: `Per-task allocations ($${totalTaskBudget.toFixed(2)}) exceed total budget ($${totalBudget.toFixed(2)})`
      }
    }
  }
  
  return { isValid: true }
}
