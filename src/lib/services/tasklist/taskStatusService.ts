/**
 * Task status update service
 * Handles updating task status in completedTasks and day.tasks
 */

import prisma from '@/lib/prisma'
import type { Task, TaskList, CompletedTasks, Productivity } from './types'
import {
  getTaskKey,
  createTaskMatcher,
  getYearFromISO,
  buildTaskForDay,
  getTodayISO
} from './helpers'
import { parseCompletedTasksBucket } from './completionService'
import { calculateCompletionRate, updateProductivityForList } from './productivityUtils'
import { aggregateCompleterEarningsFromTaskList } from './earningsService'
import { calculateDateComponents } from './dayService'

/**
 * Find a task in the task list (tasks array only - templateTasks is deprecated)
 */
export function findTaskInList(
  taskList: TaskList,
  taskId?: string,
  taskKey?: string
): Task | null {
  // Use tasks array only - templateTasks is deprecated
  const tasks = Array.isArray(taskList.tasks)
    ? taskList.tasks
    : []

  const taskMatcher = createTaskMatcher(taskId, taskKey)

  // First try to find by taskId
  if (taskId) {
    const found = tasks.find((task) => task.id === taskId || task.localeKey === taskId)
    if (found) return found
  }

  // Fall back to taskKey for localization matching
  if (taskKey) {
    const found = tasks.find(taskMatcher)
    if (found) return found
  }

  return null
}

/**
 * Update task status in completedTasks structure
 */
export async function updateTaskStatus(params: {
  taskListId: string
  userId: string
  taskId?: string
  taskKey?: string
  newStatus: string
  newCount?: number
  newTimes?: number
  dateISO: string
  userBalanceValues: { userBalance: number; userStash: number; userEquity: number }
}): Promise<TaskList> {
  const { taskListId, userId, taskId, taskKey, newStatus, newCount, newTimes, dateISO, userBalanceValues } = await params

  // Include tasks relation to get tasks from Task collection (templateTasks is deprecated)
  const taskListToUpdate = await prisma.list.findUnique({
    where: { id: taskListId },
    include: { tasks: true }
  })
  if (!taskListToUpdate) {
    throw new Error('TaskList not found')
  }

  const taskMatcher = createTaskMatcher(taskId, taskKey)

  // Find base task
  let baseTask = findTaskInList(taskListToUpdate as unknown as TaskList, taskId, taskKey)

  // ephemeralTasks is deprecated - non-recurring tasks are now in the Task collection

  // Update task in completedTasks
  const completedTasks = ((taskListToUpdate as Record<string, unknown>).completedTasks as CompletedTasks) || {}
  const year = getYearFromISO(dateISO)
  const yearBucket = completedTasks[year] || {}
  const dateBucket = yearBucket[dateISO]

  let { openTasks, closedTasks } = parseCompletedTasksBucket(dateBucket as Task[] | { openTasks: Task[]; closedTasks: Task[]; completion: number })

  // If no data exists for this date but we have a baseTask, initialize from tasks
  // templateTasks is deprecated - using Task collection only
  if (openTasks.length === 0 && closedTasks.length === 0 && baseTask) {
    const blueprintTasks: Task[] = Array.isArray(taskListToUpdate.tasks)
      ? (taskListToUpdate.tasks as Task[])
      : []
    openTasks = blueprintTasks.map((t) => ({ ...t, count: 0, status: 'open' }))
  }

  if (baseTask) {
    // Find task in openTasks or closedTasks
    const openIndex = openTasks.findIndex(taskMatcher)
    const closedIndex = closedTasks.findIndex(taskMatcher)

    const existingTask = openIndex >= 0 ? openTasks[openIndex] : (closedIndex >= 0 ? closedTasks[closedIndex] : null)
    const currentCount = existingTask?.count || 0
    const currentTimes = existingTask?.times || baseTask.times || 1
    const updatedCount = newCount !== undefined ? newCount : currentCount
    const updatedTimes = newTimes !== undefined ? newTimes : currentTimes

    const buildUpdatedTask = (task: Task): Task => {
      const updated = { ...task, status: newStatus }
      if (newCount !== undefined) updated.count = updatedCount
      if (newTimes !== undefined) updated.times = updatedTimes
      return updated
    }

    if (closedIndex >= 0 && newStatus !== 'done') {
      // Move from closedTasks to openTasks
      const taskToMove = buildUpdatedTask(closedTasks[closedIndex])
      closedTasks.splice(closedIndex, 1)
      openTasks.push(taskToMove)
    } else if (openIndex >= 0 && newStatus === 'done') {
      // Move from openTasks to closedTasks
      const taskToMove = buildUpdatedTask(openTasks[openIndex])
      openTasks.splice(openIndex, 1)
      closedTasks.push(taskToMove)
    } else if (openIndex >= 0) {
      openTasks[openIndex] = buildUpdatedTask(openTasks[openIndex])
    } else if (closedIndex >= 0) {
      closedTasks[closedIndex] = buildUpdatedTask(closedTasks[closedIndex])
    } else {
      // Add new task
      const updatedTask = { ...baseTask, status: newStatus, count: updatedCount, times: updatedTimes }
      if (newStatus === 'done') {
        closedTasks.push(updatedTask)
      } else {
        openTasks.push(updatedTask)
      }
    }

    // Calculate completion rate
    const completionRate = calculateCompletionRate(openTasks, closedTasks)

    yearBucket[dateISO] = {
      openTasks: openTasks,
      closedTasks: closedTasks,
      completion: completionRate
    }
    completedTasks[year] = yearBucket
  }

  // ephemeralTasks is deprecated - non-recurring tasks are now in the Task collection
  const updated = await prisma.list.update({
    where: { id: taskListToUpdate.id },
    data: {
      completedTasks: completedTasks
    } as Record<string, unknown>,
    include: { template: true }
  })

  // Update Day entry
  if (baseTask && dateISO) {
    try {
      const existingDay = await prisma.day.findFirst({
        where: {
          userId: userId,
          date: dateISO
        }
      })

      // If status is "open" or "ignored", remove the task from day.tasks
      if (newStatus === 'open' || newStatus === 'ignored') {
        if (existingDay) {
          const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []

          const taskKeyVal = getTaskKey(baseTask)
          const taskKeyLower = typeof taskKeyVal === 'string' ? taskKeyVal.toLowerCase() : taskKeyVal

          const updatedTasks = existingTasks.filter((t: Record<string, unknown>) => {
            const task = t as unknown as Task
            const key = getTaskKey(task)
            return key !== taskKeyLower && key !== taskKeyVal
          })

          const { weekNumber, month, quarter, semester } = calculateDateComponents(dateISO)

          // Remove ticker entries
          const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
          const taskIdForTicker = baseTask.id || baseTask.localeKey || baseTask.name
          const updatedTickers = existingTickers.filter((t: Record<string, unknown>) => {
            if (taskIdForTicker) {
              return (t as { taskId?: string }).taskId !== taskIdForTicker
            }
            return (t as { listId?: string }).listId !== taskListToUpdate.id
          })

          // Update productivity
          const existingProductivity = (existingDay.productivity as Productivity | null) || null
          const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
            existingProductivity,
            taskListToUpdate.id,
            taskListToUpdate.tasks as Task[],
            updatedTasks as unknown as Task[]
          )

          await prisma.day.update({
            where: { id: existingDay.id },
            data: {
              tasks: updatedTasks as unknown as Record<string, unknown>[],
              ticker: updatedTickers as unknown as Record<string, unknown>[],
              productivity: updatedProductivity as unknown as Record<string, unknown>,
              progress: newProgress,
              balance: userBalanceValues.userBalance,
              stash: userBalanceValues.userStash,
              equity: userBalanceValues.userEquity,
              week: weekNumber,
              month: month,
              quarter: quarter,
              semester: semester
            }
          })
        }
        return updated as unknown as TaskList
      }

      // Add/update task in day.tasks
      if (newStatus && newStatus !== 'open' && newStatus !== 'ignored') {
        const updatedTaskInList = openTasks.find(taskMatcher) || closedTasks.find(taskMatcher)
        const currentStatus = updatedTaskInList?.status || newStatus || 'open'

        const taskForDay = buildTaskForDay(baseTask, currentStatus)
        taskForDay.count = updatedTaskInList?.count ?? baseTask.count ?? 0
        taskForDay.completedOn = updatedTaskInList?.completedOn || baseTask.completedOn
        taskForDay.completers = updatedTaskInList?.completers || baseTask.completers || []

        const { weekNumber, month, quarter, semester } = calculateDateComponents(dateISO)

        if (existingDay) {
          const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []

          const taskKeyVal = getTaskKey(taskForDay)
          const taskKeyLower = typeof taskKeyVal === 'string' ? taskKeyVal.toLowerCase() : taskKeyVal

          const taskIndex = existingTasks.findIndex((t: Record<string, unknown>) => {
            const task = t as unknown as Task
            const key = getTaskKey(task)
            return key === taskKeyLower || key === taskKeyVal
          })

          let updatedTasks: Record<string, unknown>[]
          if (taskIndex >= 0) {
            updatedTasks = [...existingTasks]
            updatedTasks[taskIndex] = { ...existingTasks[taskIndex], ...taskForDay }
          } else {
            updatedTasks = [...existingTasks, taskForDay as Record<string, unknown>]
          }

          // Handle ticker for done status
          const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
          let updatedTickers = existingTickers

          if (currentStatus === 'done') {
            const aggregated = await aggregateCompleterEarningsFromTaskList(taskListToUpdate.id, userId, year, dateISO)
            const tickerTaskId = taskForDay.id || taskForDay.localeKey || taskForDay.name
            const newTicker = {
              listId: taskListToUpdate.id,
              taskId: tickerTaskId,
              earnings: aggregated.earnings || 0,
              premium: aggregated.premium || 0
            }
            const filteredTickers = existingTickers.filter((t: Record<string, unknown>) => {
              return !(t as { taskId?: string }).taskId || (t as { taskId?: string }).taskId !== tickerTaskId
            })
            updatedTickers = [...filteredTickers, newTicker]
          }

          // Update productivity
          const existingProductivity = (existingDay.productivity as Productivity | null) || null
          const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
            existingProductivity,
            taskListToUpdate.id,
            taskListToUpdate.tasks as Task[],
            updatedTasks as unknown as Task[]
          )

          await prisma.day.update({
            where: { id: existingDay.id },
            data: {
              tasks: updatedTasks,
              ticker: updatedTickers as unknown as Record<string, unknown>[],
              productivity: updatedProductivity as unknown as Record<string, unknown>,
              progress: newProgress,
              balance: userBalanceValues.userBalance,
              stash: userBalanceValues.userStash,
              equity: userBalanceValues.userEquity,
              week: weekNumber,
              month: month,
              quarter: quarter,
              semester: semester
            }
          })
        } else {
          // Create new day
          let ticker: Record<string, unknown>[] = []

          if (currentStatus === 'done') {
            const aggregated = await aggregateCompleterEarningsFromTaskList(taskListToUpdate.id, userId, year, dateISO)
            const tickerTaskId = taskForDay.id || taskForDay.localeKey || taskForDay.name
            ticker = [{
              listId: taskListToUpdate.id,
              taskId: tickerTaskId,
              earnings: aggregated.earnings || 0,
              premium: aggregated.premium || 0
            }]
          }

          const { productivity: newProductivity, progress: newProgress } = updateProductivityForList(
            null,
            taskListToUpdate.id,
            taskListToUpdate.tasks as Task[],
            [taskForDay]
          )

          await prisma.day.create({
            data: {
              userId: userId,
              date: dateISO,
              tasks: [taskForDay] as unknown as Record<string, unknown>[],
              ticker: ticker,
              productivity: newProductivity as unknown as Record<string, unknown>,
              progress: newProgress,
              balance: userBalanceValues.userBalance,
              stash: userBalanceValues.userStash,
              equity: userBalanceValues.userEquity,
              week: weekNumber,
              month: month,
              quarter: quarter,
              semester: semester
            }
          })
        }
      }
    } catch (dayError) {
      console.error('Error updating Day entry:', dayError)
    }
  }

  return updated as unknown as TaskList
}

/**
 * Update task redacted status across all task list structures
 */
export async function updateTaskRedacted(params: {
  taskListId: string
  taskKey: string
  redacted: boolean
}): Promise<TaskList> {
  const { taskListId, taskKey, redacted } = await params

  // Include tasks relation to get tasks from Task collection (templateTasks is deprecated)
  const taskListToUpdate = await prisma.list.findUnique({
    where: { id: taskListId },
    include: { tasks: true }
  })
  if (!taskListToUpdate) {
    throw new Error('TaskList not found')
  }

  const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey

  const updateRedactedStatus = (task: Task): Task => {
    const key = getTaskKey(task)
    if (key === taskKeyLower || key === taskKey) {
      return { ...task, redacted }
    }
    return task
  }

  // Update Task records in the Task collection directly
  // Find matching task IDs to update
  const taskIdsToUpdate = taskListToUpdate.tasks
    .filter((task) => {
      const key = getTaskKey(task as unknown as Task)
      return (key === taskKeyLower || key === taskKey) && task.id
    })
    .map((task) => task.id)

  // Batch update using updateMany for efficiency
  if (taskIdsToUpdate.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: taskIdsToUpdate } },
      data: { redacted }
    })
  }

  // ephemeralTasks is deprecated - non-recurring tasks are now in the Task collection

  // Update in completedTasks (all dates)
  const completedTasks = ((taskListToUpdate as Record<string, unknown>).completedTasks as CompletedTasks) || {}
  const years = Object.keys(completedTasks)

  for (const yearStr of years) {
    const year = Number(yearStr)
    const yearBucket = completedTasks[year] || {}
    const dates = Object.keys(yearBucket)

    for (const date of dates) {
      const dateBucket = yearBucket[date]

      if (Array.isArray(dateBucket)) {
        // Legacy structure
        yearBucket[date] = dateBucket.map(updateRedactedStatus)
      } else if (dateBucket && typeof dateBucket === 'object') {
        // New structure
        const bucket = dateBucket as { openTasks?: Task[]; closedTasks?: Task[]; completion?: number }
        let openTasks = Array.isArray(bucket.openTasks) ? [...bucket.openTasks] : []
        let closedTasks = Array.isArray(bucket.closedTasks) ? [...bucket.closedTasks] : []

        openTasks = openTasks.map(updateRedactedStatus)
        closedTasks = closedTasks.map(updateRedactedStatus)

        yearBucket[date] = {
          ...bucket,
          openTasks,
          closedTasks
        }
      }
    }

    completedTasks[year] = yearBucket
  }

  // Update the list completedTasks only
  // Tasks relation is already updated via prisma.task.updateMany() above
  // ephemeralTasks is deprecated - non-recurring tasks are now in the Task collection
  const updated = await prisma.list.update({
    where: { id: taskListToUpdate.id },
    data: {
      completedTasks: completedTasks
    } as Record<string, unknown>,
    include: { template: true }
  })

  return updated as unknown as TaskList
}
