/**
 * Productivity calculation utilities
 * Handles list-level and overall productivity tracking
 */

import type { Productivity, ListProductivity, Task } from './types'
import { getTaskKey } from './helpers'

/**
 * Calculate productivity for a single list
 * totalTasks: count from list tasks (all tasks in the list)
 * completedTasks: count from day tasks (only tasks stored in day.tasks that are done)
 */
export function calculateListProductivity(
  listId: string,
  totalTasksFromList: number,
  dayTasks: Task[]
): ListProductivity {
  const totalTasks = totalTasksFromList || 1
  const completedTasks = dayTasks.filter((t) => t.status === 'done').length
  const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  return {
    totalTasks,
    completedTasks,
    percentage
  }
}

/**
 * Calculate overall progress from productivity object (average of all lists)
 */
export function calculateOverallProgress(productivity: Productivity | null | undefined): number {
  if (!productivity || typeof productivity !== 'object') return 0

  const listIds = Object.keys(productivity)
  if (listIds.length === 0) return 0

  const totalPercentage = listIds.reduce((sum, listId) => {
    const listProd = productivity[listId]
    if (listProd && typeof listProd === 'object' && typeof listProd.percentage === 'number') {
      return sum + listProd.percentage
    }
    return sum
  }, 0)

  return totalPercentage / listIds.length
}

/**
 * Update productivity for a specific list and recalculate overall progress
 * Uses dayTasks (tasks stored in day.tasks) filtered by matching tasks from the list
 */
export function updateProductivityForList(
  existingProductivity: Productivity | null | undefined,
  listId: string,
  listTasks: Task[],
  dayTasks: Task[]
): { productivity: Productivity; progress: number } {
  // Total tasks count from the list
  const totalTasksFromList = listTasks.length || 1

  // Create a set of task keys from the list to match against day tasks
  const listTaskKeys = new Set(
    listTasks.map((t) => {
      const key = getTaskKey(t)
      return typeof key === 'string' ? key.toLowerCase() : key
    })
  )

  // Filter day tasks to only include those that match tasks from this list
  const tasksForThisList = dayTasks.filter((dayTask) => {
    const dayTaskKey = getTaskKey(dayTask)
    const dayTaskKeyLower = typeof dayTaskKey === 'string' ? dayTaskKey.toLowerCase() : dayTaskKey
    return listTaskKeys.has(dayTaskKeyLower)
  })

  // Calculate productivity: totalTasks from list, completedTasks from day tasks
  const listProductivity = calculateListProductivity(listId, totalTasksFromList, tasksForThisList)

  const updatedProductivity: Productivity = {
    ...(existingProductivity && typeof existingProductivity === 'object' ? existingProductivity : {}),
    [listId]: listProductivity
  }

  const overallProgress = calculateOverallProgress(updatedProductivity)

  return { productivity: updatedProductivity, progress: overallProgress }
}

/**
 * Calculate completion rate for a day (closedTasks / totalTasks * 100)
 */
export function calculateCompletionRate(openTasks: Task[], closedTasks: Task[]): number {
  const totalTasks = openTasks.length + closedTasks.length
  if (totalTasks === 0) return 0
  return (closedTasks.length / totalTasks) * 100
}
