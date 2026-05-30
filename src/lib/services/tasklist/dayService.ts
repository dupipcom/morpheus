/**
 * Day model service
 * Handles Day entity operations including ticker updates and task tracking
 */

import prisma from '@/lib/prisma'
import { getWeekNumber } from '@/app/helpers'
import type { Task, TickerEntry, Productivity, Day } from './types'
import { aggregateCompleterEarningsFromTaskList } from './earningsService'
import { updateProductivityForList } from './productivityUtils'
import { getTaskKey, getYearFromISO } from './helpers'

/**
 * Calculate date components (week, month, quarter, semester) from a date
 */
export function calculateDateComponents(dateISO: string): {
  weekNumber: number
  month: number
  quarter: number
  semester: number
  year: number
} {
  const dateObj = new Date(dateISO)
  const [_, weekNumberResult] = getWeekNumber(dateObj)
  const weekNumber = typeof weekNumberResult === 'number' ? weekNumberResult : Number(weekNumberResult) || 1
  const month = dateObj.getMonth() + 1
  const quarter = Math.ceil(month / 3)
  const semester = month <= 6 ? 1 : 2
  const year = getYearFromISO(dateISO)

  return { weekNumber, month, quarter, semester, year }
}

/**
 * Find or create a Day entry for a user and date
 */
export async function findOrCreateDay(
  userId: string,
  dateISO: string
): Promise<Day> {
  const { weekNumber, month, quarter, semester } = calculateDateComponents(dateISO)

  let existingDay = await prisma.day.findFirst({
    where: {
      userId: userId,
      date: dateISO
    }
  })

  if (!existingDay) {
    existingDay = await prisma.day.create({
      data: {
        userId: userId,
        date: dateISO,
        week: weekNumber,
        month: month,
        quarter: quarter,
        semester: semester,
        ticker: [],
        tasks: []
      }
    })
  }

  return existingDay as unknown as Day
}

/**
 * Update Day ticker with profit and prize for completed tasks
 */
export async function updateDayTicker(
  userId: string,
  dateISO: string,
  taskListId: string,
  doneTasks: Task[],
  userBalance?: number,
  userStash?: number,
  userEquity?: number
): Promise<void> {
  try {
    const { weekNumber, month, quarter, semester, year } = calculateDateComponents(dateISO)

    let existingDay = await prisma.day.findFirst({
      where: {
        userId: userId,
        date: dateISO
      }
    })

    if (!existingDay) {
      existingDay = await prisma.day.create({
        data: {
          userId: userId,
          date: dateISO,
          week: weekNumber,
          month: month,
          quarter: quarter,
          semester: semester,
          ticker: [],
          tasks: []
        }
      })
    }

    if (doneTasks.length > 0) {
      const aggregated = await aggregateCompleterEarningsFromTaskList(taskListId, userId, year, dateISO)
      const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []

      const newTickers: TickerEntry[] = doneTasks.map((task) => {
        const taskId = task.id || task.localeKey || task.name || undefined
        return {
          listId: taskListId,
          taskId: taskId,
          profit: aggregated.profit || 0,
          prize: aggregated.prize || 0
        }
      })

      const newTaskIds = new Set(newTickers.map((t) => t.taskId).filter(Boolean))
      const filteredTickers = (existingTickers as TickerEntry[]).filter(
        (t) => !t.taskId || !newTaskIds.has(t.taskId)
      )
      const updatedTickers = [...filteredTickers, ...newTickers]

      const balance = userBalance !== undefined ? userBalance : (typeof existingDay.balance === 'number' ? existingDay.balance : 0)
      const stash = userStash !== undefined ? userStash : (typeof existingDay.stash === 'number' ? existingDay.stash : 0)
      const equity = userEquity !== undefined ? userEquity : (typeof existingDay.equity === 'number' ? existingDay.equity : 0)

      await prisma.day.update({
        where: { id: existingDay.id },
        data: {
          ticker: updatedTickers as unknown as Record<string, unknown>[],
          balance: balance,
          stash: stash,
          equity: equity,
          week: weekNumber,
          month: month,
          quarter: quarter,
          semester: semester
        }
      })
    } else {
      const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
      const filteredTickers = (existingTickers as TickerEntry[]).filter((t) => t.listId !== taskListId)

      const balance = userBalance !== undefined ? userBalance : (typeof existingDay.balance === 'number' ? existingDay.balance : 0)
      const stash = userStash !== undefined ? userStash : (typeof existingDay.stash === 'number' ? existingDay.stash : 0)
      const equity = userEquity !== undefined ? userEquity : (typeof existingDay.equity === 'number' ? existingDay.equity : 0)

      await prisma.day.update({
        where: { id: existingDay.id },
        data: {
          ticker: filteredTickers as unknown as Record<string, unknown>[],
          balance: balance,
          stash: stash,
          equity: equity
        }
      })
    }
  } catch (error) {
    console.error('Error updating Day ticker:', error)
  }
}

/**
 * Remove uncompleted tasks from Day entry
 */
export async function removeUncompletedTasksFromDay(
  userId: string,
  dateISO: string,
  taskListId: string,
  taskList: { tasks: Task[] },
  uncompletedNames: string[],
  userBalanceValues: { userBalance: number; userStash: number; userEquity: number }
): Promise<void> {
  try {
    const existingDay = await prisma.day.findFirst({
      where: {
        userId: userId,
        date: dateISO
      }
    })

    if (!existingDay) return

    const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []
    const unNames = new Set(uncompletedNames.map((s) => (s || '').toLowerCase()))

    // Remove uncompleted tasks from day.tasks using taskId (id, localeKey, or name)
    const tasksToRemove = existingTasks.filter((t: Record<string, unknown>) => {
      const task = t as unknown as Task
      const taskKey = getTaskKey(task)
      const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
      if (task.id || task.localeKey) {
        return unNames.has(taskKeyLower)
      }
      const taskName = typeof task.name === 'string' ? task.name.toLowerCase() : ''
      return unNames.has(taskName)
    })

    const updatedTasks = existingTasks.filter((t: Record<string, unknown>) => {
      const task = t as unknown as Task
      const taskKey = getTaskKey(task)
      const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
      if (task.id || task.localeKey) {
        return !unNames.has(taskKeyLower)
      }
      const taskName = typeof task.name === 'string' ? task.name.toLowerCase() : ''
      return !unNames.has(taskName)
    })

    const { weekNumber, month, quarter, semester } = calculateDateComponents(dateISO)

    // Remove all ticker entries for uncompleted tasks
    const existingTickers = Array.isArray(existingDay.ticker) ? existingDay.ticker : []
    const uncompletedTaskIds = new Set(
      tasksToRemove
        .map((t: Record<string, unknown>) => {
          const task = t as unknown as Task
          return task.id || task.localeKey || task.name
        })
        .filter(Boolean)
    )

    const updatedTickers = (existingTickers as TickerEntry[]).filter((t) => {
      if (t.taskId) {
        return !uncompletedTaskIds.has(t.taskId)
      }
      return t.listId !== taskListId
    })

    // Update productivity for this list based on tasks in day.tasks
    const existingProductivity = (existingDay.productivity as Productivity | null) || null
    const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
      existingProductivity,
      taskListId,
      taskList.tasks,
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
  } catch (dayError) {
    console.error('Error removing uncompleted tasks from Day entry:', dayError)
  }
}

/**
 * Update Day entry with completed tasks
 */
export async function updateDayWithTasks(
  userId: string,
  dateISO: string,
  taskListId: string,
  taskList: { tasks: Task[] },
  tasksToCopy: Task[],
  userBalanceValues: { userBalance: number; userStash: number; userEquity: number }
): Promise<void> {
  try {
    const existingDay = await prisma.day.findFirst({
      where: {
        userId: userId,
        date: dateISO
      }
    })

    const { weekNumber, month, quarter, semester, year } = calculateDateComponents(dateISO)

    if (existingDay) {
      const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []
      const updatedTasks = [...existingTasks]

      // For each task to copy, update or append to day.tasks
      tasksToCopy.forEach((incomingTask) => {
        const taskKey = getTaskKey(incomingTask)
        const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey

        const taskIndex = updatedTasks.findIndex((t: Record<string, unknown>) => {
          const existingTask = t as unknown as Task
          const key = getTaskKey(existingTask)
          return key === taskKeyLower || key === taskKey
        })

        const taskForDay = {
          id: incomingTask.id || undefined,
          name: incomingTask.name,
          categories: incomingTask.categories || [],
          area: incomingTask.area || 'self',
          status: incomingTask.status || 'open',
          cadence: incomingTask.cadence || 'daily',
          times: incomingTask.times || 1,
          count: incomingTask.count || 0,
          localeKey: incomingTask.localeKey || undefined,
          persons: incomingTask.persons || [],
          things: incomingTask.things || [],
          events: incomingTask.events || [],
          notes: incomingTask.notes || [],
          documents: incomingTask.documents || [],
          favorite: incomingTask.favorite || false,
          isEphemeral: incomingTask.isEphemeral || false,
          createdAt: incomingTask.createdAt || undefined,
          completedOn: incomingTask.completedOn || undefined,
          completers: incomingTask.completers || [],
          dueDate: incomingTask.dueDate || undefined,
          budget: incomingTask.budget || undefined,
          visibility: incomingTask.visibility || undefined,
          quality: incomingTask.quality || undefined
        }

        if (taskIndex >= 0) {
          updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], ...taskForDay }
        } else {
          updatedTasks.push(taskForDay as Record<string, unknown>)
        }
      })

      // Only add ticker entries for tasks with status "done"
      const doneTasks = tasksToCopy.filter((task) => task.status === 'done')

      // Update productivity for this list
      const existingProductivity = (existingDay.productivity as Productivity | null) || null
      const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
        existingProductivity,
        taskListId,
        taskList.tasks,
        updatedTasks as unknown as Task[]
      )

      // Update Day ticker using helper function
      await updateDayTicker(userId, dateISO, taskListId, doneTasks, userBalanceValues.userBalance, userBalanceValues.userStash, userBalanceValues.userEquity)

      // Update Day with tasks and productivity
      await prisma.day.update({
        where: { id: existingDay.id },
        data: {
          tasks: updatedTasks as unknown as Record<string, unknown>[],
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
      // Create new day with the tasks
      const tasksForDay = tasksToCopy.map((incomingTask) => ({
        id: incomingTask.id || undefined,
        name: incomingTask.name,
        categories: incomingTask.categories || [],
        area: incomingTask.area || 'self',
        status: incomingTask.status || 'open',
        cadence: incomingTask.cadence || 'daily',
        times: incomingTask.times || 1,
        count: incomingTask.count || 0,
        localeKey: incomingTask.localeKey || undefined,
        persons: incomingTask.persons || [],
        things: incomingTask.things || [],
        events: incomingTask.events || [],
        notes: incomingTask.notes || [],
        documents: incomingTask.documents || [],
        favorite: incomingTask.favorite || false,
        isEphemeral: incomingTask.isEphemeral || false,
        createdAt: incomingTask.createdAt || undefined,
        completedOn: incomingTask.completedOn || undefined,
        completers: incomingTask.completers || [],
        dueDate: incomingTask.dueDate || undefined,
        budget: incomingTask.budget || undefined,
        visibility: incomingTask.visibility || undefined,
        quality: incomingTask.quality || undefined
      }))

      // Only add ticker entries for tasks with status "done"
      const doneTasks = tasksForDay.filter((task) => task.status === 'done')
      let ticker: TickerEntry[] = []

      // Calculate productivity
      const { productivity: newProductivity, progress: newProgress } = updateProductivityForList(
        null,
        taskListId,
        taskList.tasks,
        tasksForDay as Task[]
      )

      if (doneTasks.length > 0) {
        const aggregated = await aggregateCompleterEarningsFromTaskList(taskListId, userId, year, dateISO)

        // Create ticker array with unique taskIds
        const tickerEntries = doneTasks.map((task) => ({
          listId: taskListId,
          taskId: task.id || task.localeKey || task.name || undefined,
          profit: aggregated.profit || 0,
          prize: aggregated.prize || 0
        }))

        const taskIdMap = new Map<string, TickerEntry>()
        tickerEntries.forEach((entry) => {
          const key = entry.taskId || `no-id-${taskIdMap.size}`
          taskIdMap.set(key, entry as TickerEntry)
        })
        ticker = Array.from(taskIdMap.values())
      }

      await prisma.day.create({
        data: {
          userId: userId,
          date: dateISO,
          tasks: tasksForDay as unknown as Record<string, unknown>[],
          ticker: ticker as unknown as Record<string, unknown>[],
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
  } catch (dayError) {
    console.error('Error updating Day entry:', dayError)
  }
}
