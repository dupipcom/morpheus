/**
 * Handler for updateTaskCompletion operation
 * Manages individual task completion/uncompletion with earnings tracking
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  calculateTaskEarnings,
  getPerCompleterPrize,
  getPerCompleterProfit
} from '@/lib/utils/earningsUtils'
import {
  Task,
  TaskList,
  TaskListPostBody,
  EphemeralTasks,
  CompletedTasks,
  Productivity
} from '@/lib/services/tasklist'
import {
  getTaskKey,
  createTaskMatcher,
  parseNumericValue,
  getYearFromISO,
  getTodayISO,
  getUserBalanceValues,
  buildTaskForDay
} from '@/lib/services/tasklist'
import { parseCompletedTasksBucket } from '@/lib/services/tasklist'
import { calculateCompletionRate, updateProductivityForList } from '@/lib/services/tasklist'
import {
  calculateStashAndProfitDeltasForTaskList,
  updateUserStashAndProfit
} from '@/lib/services/tasklist'
import { calculateDateComponents, updateDayTicker, findOrCreateDay } from '@/lib/services/tasklist'

interface UserData {
  id: string
  availableBalance?: number | string | null
  stash?: number | string | null
  equity?: number | string | null
}

/**
 * Handle update task completion request
 */
export async function updateTaskCompletionHandler(
  body: TaskListPostBody,
  user: UserData
): Promise<NextResponse> {
  const taskListId = body.taskListId!
  const taskList = await prisma.list.findUnique({ where: { id: taskListId } })

  if (!taskList) {
    return NextResponse.json({ error: 'TaskList not found' }, { status: 404 })
  }

  const taskId = body.taskId
  const taskKey = body.taskKey
  const newStatus = body.status || 'open'
  const newCount = body.count !== undefined ? Number(body.count) : undefined
  const newTimes = body.times !== undefined ? Number(body.times) : undefined
  const dateISO = body.date || getTodayISO()
  const isCompleted = body.isCompleted === true
  const isUncompleted = body.isCompleted === false && body.isUncompleted !== false

  const taskMatcher = createTaskMatcher(taskId, taskKey)

  // Get task from templateTasks or tasks to use as base
  let baseTask: Task | null = null
  const tasks = Array.isArray(taskList.tasks)
    ? (taskList.tasks as Task[])
    : (Array.isArray((taskList as Record<string, unknown>).templateTasks)
      ? ((taskList as Record<string, unknown>).templateTasks as Task[])
      : [])

  // First try to find by taskId
  if (taskId) {
    baseTask = tasks.find((task) => task.id === taskId || task.localeKey === taskId) || null
  }

  // Fall back to taskKey for localization matching
  if (!baseTask && taskKey) {
    baseTask = tasks.find(taskMatcher) || null
  }

  // Check templateTasks if not found
  if (!baseTask) {
    const templateTasks = Array.isArray((taskList as Record<string, unknown>).templateTasks)
      ? ((taskList as Record<string, unknown>).templateTasks as Task[])
      : []
    if (taskId) {
      baseTask = templateTasks.find((task) => task.id === taskId || task.localeKey === taskId) || null
    }
    if (!baseTask && taskKey) {
      baseTask = templateTasks.find(taskMatcher) || null
    }
  }

  // Check ephemeral tasks
  let ephemeralTasks = ((taskList as Record<string, unknown>).ephemeralTasks as EphemeralTasks) || { open: [], closed: [] }
  let open = Array.isArray(ephemeralTasks.open) ? ephemeralTasks.open : []
  let closed = Array.isArray(ephemeralTasks.closed) ? ephemeralTasks.closed : []

  const ephemeralTask = [...open, ...closed].find(taskMatcher)

  if (!baseTask && !ephemeralTask) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const taskToUse = ephemeralTask || baseTask!

  // Update completedTasks structure
  let completedTasks = ((taskList as Record<string, unknown>).completedTasks as CompletedTasks) || {}
  const year = getYearFromISO(dateISO)
  const yearBucket = completedTasks[year] || {}
  const dateBucket = yearBucket[dateISO]

  let { openTasks, closedTasks } = parseCompletedTasksBucket(
    dateBucket as Task[] | { openTasks: Task[]; closedTasks: Task[]; completion: number }
  )

  // Initialize from taskList.tasks if first time
  if (openTasks.length === 0 && closedTasks.length === 0 && taskToUse) {
    const blueprintTasks: Task[] = Array.isArray(taskList.tasks)
      ? (taskList.tasks as Task[])
      : (Array.isArray((taskList as Record<string, unknown>).templateTasks)
        ? ((taskList as Record<string, unknown>).templateTasks as Task[])
        : [])
    openTasks = blueprintTasks.map((t) => ({ ...t, count: 0, status: 'open', completers: [] }))
  }

  if (taskToUse) {
    const openIndex = openTasks.findIndex(taskMatcher)
    const closedIndex = closedTasks.findIndex(taskMatcher)

    let existingTask = openIndex >= 0 ? openTasks[openIndex] : (closedIndex >= 0 ? closedTasks[closedIndex] : null)

    if (!existingTask) {
      existingTask = {
        ...taskToUse,
        count: 0,
        status: 'open',
        completers: []
      }
    }

    const currentCount = existingTask.count || 0
    const times = newTimes !== undefined ? newTimes : (existingTask.times || 1)
    const updatedCount = newCount !== undefined
      ? newCount
      : (isCompleted ? currentCount + 1 : (isUncompleted ? Math.max(0, currentCount - 1) : currentCount))

    // Update completers if completing/uncompleting
    let updatedCompleters = Array.isArray(existingTask.completers) ? [...existingTask.completers] : []

    if (isCompleted && updatedCount > currentCount) {
      const delta = updatedCount - currentCount
      for (let i = 0; i < delta; i++) {
        const perCompleterEarnings = getPerCompleterProfit(calculateTaskEarnings({
          listRole: taskList.role,
          budgetPercentage: (taskList as Record<string, unknown>).budgetPercentage as number | undefined,
          listBudget: taskList.budget != null ? String(taskList.budget) : null,
          userEquity: user.equity != null ? String(user.equity) : null,
          numTasks: tasks.length || 1,
          date: new Date(dateISO)
        }), taskList.role)

        const perCompleterPrize = getPerCompleterPrize(calculateTaskEarnings({
          listRole: taskList.role,
          budgetPercentage: (taskList as Record<string, unknown>).budgetPercentage as number | undefined,
          listBudget: taskList.budget != null ? String(taskList.budget) : null,
          userEquity: user.equity != null ? String(user.equity) : null,
          numTasks: tasks.length || 1,
          date: new Date(dateISO)
        }), taskList.role)

        updatedCompleters.push({
          id: user.id,
          earnings: perCompleterEarnings,
          prize: perCompleterPrize,
          time: updatedCompleters.length + 1,
          completedAt: new Date()
        })
      }
    } else if (isUncompleted && updatedCount < currentCount && updatedCompleters.length > 0) {
      updatedCompleters.pop()
    }

    // Determine final status
    const finalStatus = newStatus || (updatedCount >= times ? 'done' : (updatedCount > 0 ? 'in progress' : 'open'))

    const updatedTask: Task = {
      ...existingTask,
      ...taskToUse,
      count: updatedCount,
      times: times,
      status: finalStatus,
      completers: updatedCompleters
    }

    // Remove from old location and add to new
    if (openIndex >= 0) {
      openTasks.splice(openIndex, 1)
    }
    if (closedIndex >= 0) {
      closedTasks.splice(closedIndex, 1)
    }

    // Add to appropriate array
    if (finalStatus === 'done' || updatedCount >= times) {
      closedTasks.push(updatedTask)
    } else {
      openTasks.push(updatedTask)
    }

    // Calculate completion rate
    const completionRate = calculateCompletionRate(openTasks, closedTasks)

    yearBucket[dateISO] = {
      openTasks: openTasks,
      closedTasks: closedTasks,
      completion: completionRate
    }
    completedTasks[year] = yearBucket

    // Update ephemeral tasks if needed
    if (ephemeralTask) {
      if (finalStatus === 'done' && updatedCount >= times) {
        open = open.filter((t) => !taskMatcher(t))
        closed = closed.filter((t) => !taskMatcher(t))
        closed.push({ ...ephemeralTask, status: 'done', count: updatedCount })
      } else {
        open = open.map((t) => {
          if (taskMatcher(t)) {
            return { ...t, status: finalStatus, count: updatedCount }
          }
          return t
        })
        closed = closed.filter((t) => !taskMatcher(t))
        if (!open.find(taskMatcher)) {
          open.push({ ...ephemeralTask, status: finalStatus, count: updatedCount })
        }
      }
      ephemeralTasks = { open, closed }
    }

    // Update user stash and profit, and Day when tasks are completed/uncompleted
    if (isCompleted || isUncompleted) {
      try {
        const deltas = await calculateStashAndProfitDeltasForTaskList(taskList.id, user.id, year, dateISO, isCompleted)
        const updatedUserValues = await updateUserStashAndProfit(user.id, deltas.stashDelta, deltas.profitDelta)

        const userBalance = updatedUserValues?.availableBalance ?? parseNumericValue(user.availableBalance)
        const userStash = updatedUserValues?.stash ?? parseNumericValue(user.stash)
        const userEquity = updatedUserValues?.equity ?? parseNumericValue(user.equity)

        const { weekNumber, month, quarter, semester } = calculateDateComponents(dateISO)

        let existingDay = await prisma.day.findFirst({
          where: {
            userId: user.id,
            date: dateISO
          }
        })

        if (!existingDay) {
          existingDay = await prisma.day.create({
            data: {
              userId: user.id,
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

        // Get done tasks for ticker
        const closedTasksForDate = Array.isArray(yearBucket[dateISO]?.closedTasks)
          ? (yearBucket[dateISO] as { closedTasks: Task[] }).closedTasks
          : []
        const doneTasks = closedTasksForDate.filter((t) =>
          t.status === 'done' || (t.count || 0) >= (t.times || 1)
        )

        await updateDayTicker(user.id, dateISO, taskList.id, doneTasks, userBalance, userStash, userEquity)

        // Update Day.tasks array
        const existingTasks = Array.isArray(existingDay.tasks) ? existingDay.tasks : []
        const taskKeyVal = getTaskKey(updatedTask)
        const taskKeyLower = typeof taskKeyVal === 'string' ? taskKeyVal.toLowerCase() : taskKeyVal

        const taskIndex = existingTasks.findIndex((t: Record<string, unknown>) => {
          const task = t as unknown as Task
          const key = getTaskKey(task)
          return key === taskKeyLower || key === taskKeyVal
        })

        const taskForDay = buildTaskForDay(updatedTask, finalStatus)
        taskForDay.count = updatedCount
        taskForDay.times = times
        taskForDay.completedOn = (finalStatus === 'done' && updatedCount >= times) ? dateISO : undefined
        taskForDay.completers = updatedCompleters

        let updatedTasksArray = [...existingTasks]
        if (taskIndex >= 0) {
          updatedTasksArray[taskIndex] = { ...updatedTasksArray[taskIndex], ...taskForDay }
        } else if (finalStatus !== 'open' && finalStatus !== 'ignored') {
          updatedTasksArray.push(taskForDay as Record<string, unknown>)
        }

        // Remove task if now open or ignored
        updatedTasksArray = updatedTasksArray.filter((t: Record<string, unknown>) => {
          const task = t as unknown as Task
          const key = getTaskKey(task)
          if (key === taskKeyLower || key === taskKeyVal) {
            return task.status !== 'open' && task.status !== 'ignored'
          }
          return true
        })

        // Update productivity
        const existingProductivity = (existingDay.productivity as Productivity | null) || null
        const { productivity: updatedProductivity, progress: newProgress } = updateProductivityForList(
          existingProductivity,
          taskList.id,
          taskList.tasks as Task[],
          updatedTasksArray as unknown as Task[]
        )

        await prisma.day.update({
          where: { id: existingDay.id },
          data: {
            tasks: updatedTasksArray as unknown as Record<string, unknown>[],
            productivity: updatedProductivity as unknown as Record<string, unknown>,
            progress: newProgress,
            balance: userBalance,
            stash: userStash,
            equity: userEquity,
            week: weekNumber,
            month: month,
            quarter: quarter,
            semester: semester
          }
        })
      } catch (dayError) {
        console.error('Error updating Day:', dayError)
      }
    }
  }

  const updated = await prisma.list.update({
    where: { id: taskList.id },
    data: {
      ephemeralTasks: ephemeralTasks,
      completedTasks: completedTasks,
      updatedAt: new Date()
    } as Record<string, unknown>,
    include: { template: true }
  })

  return NextResponse.json({ taskList: updated })
}
