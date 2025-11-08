/**
 * Utility functions for budget calculations
 */

import prisma from '@/lib/prisma'

/**
 * Recalculates and updates the user's budget allocation based on all their task lists
 * @param userId - The MongoDB ObjectId of the user
 */
export async function recalculateUserBudget(userId: string): Promise<void> {
  try {
    // Get all task lists owned by the user
    const taskLists = await prisma.taskList.findMany({
      where: {
        owners: {
          has: userId
        }
      },
      select: {
        budgetPercentage: true
      }
    })

    // Calculate total used budget (sum of all budgetPercentage values)
    const usedBudget = taskLists.reduce((sum, list) => {
      return sum + (list.budgetPercentage || 0)
    }, 0)

    // Calculate remaining budget
    const remainingBudget = Math.max(0, 100 - usedBudget)

    // Update the user's budget fields
    await prisma.user.update({
      where: { id: userId },
      data: {
        usedBudget,
        remainingBudget
      }
    })
  } catch (error) {
    console.error('Error recalculating user budget:', error)
    throw error
  }
}

/**
 * Gets the user's remaining budget percentage
 * @param userId - The MongoDB ObjectId of the user
 * @returns The remaining budget percentage (0-100)
 */
export async function getRemainingBudget(userId: string): Promise<number> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        remainingBudget: true
      }
    })

    return user?.remainingBudget ?? 100
  } catch (error) {
    console.error('Error getting remaining budget:', error)
    return 100 // Default to 100% if error
  }
}

/**
 * Validates if a budget percentage allocation is valid
 * @param userId - The MongoDB ObjectId of the user
 * @param newPercentage - The new percentage to allocate
 * @param currentListId - Optional: ID of the list being updated (to exclude from current allocation)
 * @returns True if the allocation is valid, false otherwise
 */
export async function validateBudgetAllocation(
  userId: string,
  newPercentage: number,
  currentListId?: string
): Promise<boolean> {
  try {
    // Get all task lists owned by the user, excluding the current one
    const where: any = {
      owners: { has: userId }
    }
    
    if (currentListId) {
      where.id = { not: currentListId }
    }

    const taskLists = await prisma.taskList.findMany({
      where,
      select: {
        budgetPercentage: true
      }
    })

    // Calculate total used budget (excluding current list)
    const usedBudget = taskLists.reduce((sum, list) => {
      return sum + (list.budgetPercentage || 0)
    }, 0)

    // Check if new allocation would exceed 100%
    return (usedBudget + newPercentage) <= 100
  } catch (error) {
    console.error('Error validating budget allocation:', error)
    return false
  }
}

