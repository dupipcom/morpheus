/**
 * Task Value Refresh Service
 * Handles refreshing task financial values (earnings, premium, totalGains)
 * when list structure changes (tasks added/removed, budget updated, etc.)
 */

import prisma from '@/lib/prisma'
import { calculateTaskBudgetFromDistribution } from './taskMigrationService'
import type { BudgetDistribution } from '@/lib/utils/budgetDistributionUtils'

/**
 * Refresh all task values in a list based on budget distribution
 *
 * This function recalculates and persists earnings, premium, and totalGains
 * for ALL tasks in a list. It should be called whenever:
 * - A task is added to the list
 * - A task is removed from the list
 * - List budget, premiumPercentage, or budgetDistribution changes
 *
 * @param listId - The ID of the list to refresh task values for
 */
export async function refreshListTaskValues(listId: string): Promise<void> {
  // Fetch list with all tasks
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      id: true,
      budget: true,
      budgetDistribution: true,
      premiumPercentage: true,
      tasks: true
    }
  })

  if (!list) {
    console.warn(`refreshListTaskValues: List ${listId} not found`)
    return
  }

  const tasks = list.tasks || []

  // No tasks to refresh
  if (tasks.length === 0) {
    return
  }

  // Calculate and update each task's financial values
  const updatePromises = tasks.map(async (task) => {
    const allocation = calculateTaskBudgetFromDistribution({
      task,
      list: {
        budget: list.budget,
        budgetDistribution: list.budgetDistribution as BudgetDistribution | null,
        premiumPercentage: list.premiumPercentage,
        tasks: tasks
      }
    })

    // Update task with new values
    return prisma.task.update({
      where: { id: task.id },
      data: {
        earnings: allocation.budget,
        premium: allocation.premium,
        totalGains: allocation.totalGains
      }
    })
  })

  await Promise.all(updatePromises)

  console.log(`refreshListTaskValues: Refreshed ${tasks.length} tasks for list ${listId}`)
}

/**
 * Refresh a single task's financial values
 *
 * This is a lighter-weight operation when you only need to update one task.
 * It still fetches the list to calculate distribution-based values.
 *
 * @param taskId - The ID of the task to refresh
 */
export async function refreshSingleTaskValue(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      area: true,
      categories: true,
      listId: true
    }
  })

  if (!task || !task.listId) {
    console.warn(`refreshSingleTaskValue: Task ${taskId} not found or has no list`)
    return
  }

  const list = await prisma.list.findUnique({
    where: { id: task.listId },
    select: {
      id: true,
      budget: true,
      budgetDistribution: true,
      premiumPercentage: true,
      tasks: {
        select: {
          id: true,
          area: true,
          categories: true
        }
      }
    }
  })

  if (!list) {
    console.warn(`refreshSingleTaskValue: List ${task.listId} not found`)
    return
  }

  const allocation = calculateTaskBudgetFromDistribution({
    task,
    list: {
      budget: list.budget,
      budgetDistribution: list.budgetDistribution as BudgetDistribution | null,
      premiumPercentage: list.premiumPercentage,
      tasks: list.tasks
    }
  })

  await prisma.task.update({
    where: { id: taskId },
    data: {
      earnings: allocation.budget,
      premium: allocation.premium,
      totalGains: allocation.totalGains
    }
  })
}
