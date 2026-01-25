/**
 * Task completion service
 * Handles recording completions and managing completedTasks structure
 */

import prisma from '@/lib/prisma'
import {
  calculateTaskEarnings,
  calculateBudgetConsumption,
  initializeRemainingBudget,
  getPerCompleterPrize,
  getPerCompleterProfit
} from '@/lib/utils/earningsUtils'
import type {
  Task,
  TaskList,
  TaskCompleter,
  DateBucket,
  CompletedTasks,
  EphemeralTasks
} from './types'
import {
  getTaskKey,
  sanitizeTask,
  formatDateForCompletedOn,
  getYearFromISO,
  parseNumericValue,
  getUserBalanceValues
} from './helpers'
import { calculateCompletionRate } from './productivityUtils'
import {
  calculateStashAndProfitDeltasForTaskList,
  updateUserStashAndProfit
} from './earningsService'
import {
  removeUncompletedTasksFromDay,
  updateDayWithTasks,
  updateDayTicker
} from './dayService'

/**
 * Process completed tasks array, merging old and new structures
 */
export function parseCompletedTasksBucket(
  dateBucket: DateBucket | Task[] | null | undefined
): { openTasks: Task[]; closedTasks: Task[] } {
  let openTasks: Task[] = []
  let closedTasks: Task[] = []

  if (Array.isArray(dateBucket)) {
    // Legacy structure: migrate to new structure
    openTasks = dateBucket.filter((t) => t.status !== 'done')
    closedTasks = dateBucket.filter((t) => t.status === 'done')
  } else if (dateBucket && ('openTasks' in dateBucket || 'closedTasks' in dateBucket)) {
    openTasks = Array.isArray(dateBucket.openTasks) ? [...dateBucket.openTasks] : []
    closedTasks = Array.isArray(dateBucket.closedTasks) ? [...dateBucket.closedTasks] : []
  }

  return { openTasks, closedTasks }
}

/**
 * Build completers array for a task completion
 */
export function buildCompleters(
  existingCompleters: TaskCompleter[],
  delta: number,
  userId: string,
  perCompleterEarnings: number,
  perCompleterPremium: number,
  startTime: number
): TaskCompleter[] {
  const appended: TaskCompleter[] = []
  for (let i = 0; i < delta; i++) {
    appended.push({
      id: userId,
      earnings: perCompleterEarnings,
      premium: perCompleterPremium,
      time: startTime + i + 1,
      completedAt: new Date()
    })
  }
  return [...existingCompleters, ...appended]
}

/**
 * Separate tasks into open and closed based on status
 */
export function separateTasksByStatus(
  byKey: Record<string, Task>,
  closedTaskKeys: Set<string>,
  closedTasks: Task[],
  completedOnDate: string
): { finalOpenTasks: Task[]; finalClosedTasks: Task[] } {
  const finalOpenTasks: Task[] = []
  const finalClosedTasks: Task[] = []
  const processedKeys = new Set<string>()

  for (const task of Object.values(byKey)) {
    const key = getTaskKey(task)
    if (!key || processedKeys.has(key)) continue
    processedKeys.add(key)

    const taskStatus = task.status
    const taskCount = task.count || 0
    const taskTimes = task.times || 1

    // Check if this task was originally in closedTasks to preserve completedOn
    const wasInClosed = closedTaskKeys.has(key)
    const existingClosedTask = wasInClosed ? closedTasks.find((t) => getTaskKey(t) === key) : null
    const existingCompletedOn = existingClosedTask?.completedOn

    // Task is done if status is 'done' or count >= times
    if (taskStatus === 'done' || taskCount >= taskTimes) {
      finalClosedTasks.push({
        ...task,
        completedOn: existingCompletedOn || completedOnDate
      })
    } else {
      // Task is open - remove completedOn if it exists
      const { completedOn, ...taskWithoutCompletedOn } = task
      finalOpenTasks.push(taskWithoutCompletedOn as Task)
    }
  }

  // Also include any closedTasks that weren't updated
  for (const closedTask of closedTasks) {
    const key = getTaskKey(closedTask)
    if (key && !processedKeys.has(key)) {
      finalClosedTasks.push(closedTask)
    }
  }

  return { finalOpenTasks, finalClosedTasks }
}

/**
 * Record task completions for a task list
 * Main entry point for the recordCompletions operation
 */
export async function recordCompletions(params: {
  taskListId: string
  user: { id: string; availableBalance?: number | string | null; stash?: number | string | null; equity?: number | string | null }
  incomingTasks: Task[]
  justCompletedNames: string[]
  justUncompletedNames: string[]
  dateISO: string
}): Promise<{ taskList: TaskList; earnings: ReturnType<typeof calculateTaskEarnings> }> {
  const { taskListId, user, incomingTasks, justCompletedNames, justUncompletedNames, dateISO } = await params

  // Include tasks relation to get tasks from Task collection (templateTasks is deprecated)
  const taskList = await prisma.list.findUnique({
    where: { id: taskListId },
    include: { tasks: true }
  })
  if (!taskList) {
    throw new Error('TaskList not found')
  }

  // Use tasks array only - templateTasks is deprecated
  const blueprintTasks: Task[] = Array.isArray(taskList.tasks)
    ? (taskList.tasks as Task[])
    : []

  const totalTasks = blueprintTasks.length || incomingTasks.length || 1

  // Get user's available balance for earnings calculation
  const userRecord = await prisma.user.findUnique({ where: { id: user.id } })

  // Calculate earnings for task completion
  const completionDate = new Date(dateISO)
  const taskListBudget = parseNumericValue(taskList.budget)

  const earnings = calculateTaskEarnings({
    listRole: taskList.role,
    budgetPercentage: ((taskList as Record<string, any>).premiumPercentage !== undefined
      ? (taskList as Record<string, any>).premiumPercentage
      : (taskList as Record<string, any>).budgetPercentage) as number | undefined,
    listBudget: taskListBudget != null ? String(taskListBudget) : null,
    userEquity: userRecord?.equity != null ? String(userRecord.equity) : null,
    numTasks: totalTasks,
    date: completionDate
  })

  const perCompleterPrize = getPerCompleterPrize(earnings, taskList.role)
  const perCompleterEarnings = getPerCompleterProfit(earnings, taskList.role)

  // Build completedTasks map
  const year = getYearFromISO(dateISO)
  const priorCompleted = ((taskList as Record<string, unknown>).completedTasks as CompletedTasks) || {}
  const yearBucket = priorCompleted[year] || {}
  const dateBucket = yearBucket[dateISO]

  let { openTasks, closedTasks } = parseCompletedTasksBucket(dateBucket as DateBucket | Task[])

  // Check if this is the first completion for this date
  const isFirstCompletion = openTasks.length === 0 && closedTasks.length === 0 && justCompletedNames.length > 0

  // If first completion, copy tasks from taskList.tasks to openTasks
  if (isFirstCompletion) {
    openTasks = blueprintTasks.map((t) => sanitizeTask({ ...t, count: 0, status: 'open' }))
  }

  // Build task lookup map
  const byKey: Record<string, Task> = {}
  const closedTaskKeys = new Set<string>()

  openTasks.forEach((t) => {
    const key = getTaskKey(t)
    if (key) byKey[key] = t
  })
  closedTasks.forEach((t) => {
    const key = getTaskKey(t)
    if (key) {
      byKey[key] = t
      closedTaskKeys.add(key)
    }
  })

  // Process incoming tasks
  const nameSet = new Set(justCompletedNames.map((s) => typeof s === 'string' ? s.toLowerCase() : s))

  // First pass: add any new tasks from incomingTasks
  for (const incoming of incomingTasks) {
    const key = getTaskKey(incoming)
    if (!key) continue
    const existing = byKey[key]

    if (!existing) {
      byKey[key] = sanitizeTask({
        ...incoming,
        count: incoming.count || 0,
        status: incoming.status || 'open',
        completers: []
      })
    }
  }

  // Second pass: process tasks for completion/uncompletion logic
  for (const incoming of incomingTasks) {
    const key = getTaskKey(incoming)
    if (!key) continue
    const existing = byKey[key]
    if (!existing) continue

    const prevCompletersLen = Array.isArray(existing.completers) ? existing.completers.length : 0
    let newCount: number
    let delta: number

    if (nameSet.size > 0) {
      const nm = typeof incoming.name === 'string' ? incoming.name.toLowerCase() : ''
      if (!nameSet.has(nm)) {
        byKey[key] = sanitizeTask({
          ...existing,
          ...incoming,
          status: existing.status || 'open',
          redacted: existing.redacted !== undefined ? existing.redacted : (incoming.redacted !== undefined ? incoming.redacted : false)
        })
        continue
      }
      newCount = prevCompletersLen + 1
      delta = 1
    } else {
      newCount = incoming.count !== undefined ? Number(incoming.count) : prevCompletersLen
      delta = Math.max(0, newCount - prevCompletersLen)
    }

    if (delta <= 0) {
      byKey[key] = sanitizeTask({
        ...existing,
        ...incoming,
        completers: existing.completers || [],
        count: incoming.count !== undefined ? Number(incoming.count) : prevCompletersLen,
        status: existing.status || 'open',
        redacted: existing.redacted !== undefined ? existing.redacted : (incoming.redacted !== undefined ? incoming.redacted : false)
      })
      continue
    }

    const baseCompleters = Array.isArray(existing.completers) ? existing.completers : []
    const newCompleters = buildCompleters(baseCompleters, delta, user.id, perCompleterEarnings, perCompleterPrize, prevCompletersLen)

    byKey[key] = sanitizeTask({
      ...existing,
      ...incoming,
      status: incoming.status || 'done',
      completers: newCompleters,
      count: newCount,
      redacted: existing.redacted !== undefined ? existing.redacted : (incoming.redacted !== undefined ? incoming.redacted : false)
    })
  }

  // Handle uncompletions
  if (justUncompletedNames.length > 0) {
    const unNames = new Set(justUncompletedNames.map((s) => (s || '').toLowerCase()))
    const incomingTasksByKey: Record<string, Task> = {}
    for (const incoming of incomingTasks) {
      const key = getTaskKey(incoming)
      if (key) incomingTasksByKey[key] = incoming
    }

    // Check closedTasks for tasks to reopen
    for (let i = closedTasks.length - 1; i >= 0; i--) {
      const t = closedTasks[i]
      const nm = typeof t.name === 'string' ? t.name.toLowerCase() : ''
      if (unNames.has(nm)) {
        const comps = Array.isArray(t.completers) ? [...t.completers] : []
        if (comps.length > 0) comps.pop()
        const { completedOn, ...taskWithoutCompletedOn } = t
        const key = getTaskKey(t)
        const preservedStatus = incomingTasksByKey[key]?.status || t.status || 'open'
        const preservedRedacted = t.redacted !== undefined ? t.redacted : false
        const updatedTask = { ...taskWithoutCompletedOn, status: preservedStatus, completers: comps, count: comps.length, redacted: preservedRedacted }
        closedTasks.splice(i, 1)
        if (key) byKey[key] = updatedTask
      }
    }

    // Handle tasks in byKey
    const values = Object.values(byKey)
    for (const t of values) {
      const nm = typeof t.name === 'string' ? t.name.toLowerCase() : ''
      if (!unNames.has(nm)) continue
      const comps = Array.isArray(t.completers) ? [...t.completers] : []
      if (comps.length > 0) comps.pop()
      const { completedOn, ...taskWithoutCompletedOn } = t
      const preservedStatus = t.status || 'open'
      const preservedRedacted = t.redacted !== undefined ? t.redacted : false
      const updatedTask = { ...taskWithoutCompletedOn, status: preservedStatus, completers: comps, count: comps.length, redacted: preservedRedacted }
      const k = getTaskKey(updatedTask)
      if (k) byKey[k] = updatedTask
    }
  }

  // Separate into open and closed
  const completedOnDate = formatDateForCompletedOn(completionDate)
  const { finalOpenTasks, finalClosedTasks } = separateTasksByStatus(byKey, closedTaskKeys, closedTasks, completedOnDate)

  // Calculate completion rate
  const completionRate = calculateCompletionRate(finalOpenTasks, finalClosedTasks)

  // Save new structure
  const nextCompleted = {
    ...priorCompleted,
    [year]: {
      ...yearBucket,
      [dateISO]: {
        openTasks: finalOpenTasks,
        closedTasks: finalClosedTasks,
        completion: completionRate
      }
    }
  }

  // Update ephemeral tasks
  let updatedEphemeralTasks = ((taskList as Record<string, unknown>).ephemeralTasks as EphemeralTasks) || { open: [], closed: [] }
  let ephemeralOpen = Array.isArray(updatedEphemeralTasks.open) ? updatedEphemeralTasks.open : []
  let ephemeralClosed = Array.isArray(updatedEphemeralTasks.closed) ? updatedEphemeralTasks.closed : []

  ephemeralOpen = ephemeralOpen.map((task) => {
    const key = getTaskKey(task)
    const incomingTask = incomingTasks.find((t) => getTaskKey(t) === key)
    if (incomingTask) {
      const updated = { ...task }
      if (incomingTask.status) updated.status = incomingTask.status
      if (incomingTask.count !== undefined) updated.count = incomingTask.count
      return updated
    }
    return task
  })

  ephemeralClosed = ephemeralClosed.map((task) => {
    const key = getTaskKey(task)
    const incomingTask = incomingTasks.find((t) => getTaskKey(t) === key)
    if (incomingTask) {
      const updated = { ...task }
      if (incomingTask.status) updated.status = incomingTask.status
      if (incomingTask.count !== undefined) updated.count = incomingTask.count
      return updated
    }
    return task
  })

  updatedEphemeralTasks = { open: ephemeralOpen, closed: ephemeralClosed }

  // Calculate budget consumption
  const numCompletedInThisCall = justCompletedNames.length
  let newRemainingBudget = (taskList as Record<string, unknown>).remainingBudget as string | null | undefined
  if (numCompletedInThisCall > 0) {
    newRemainingBudget = initializeRemainingBudget(newRemainingBudget, taskListBudget != null ? String(taskListBudget) : null)
    newRemainingBudget = calculateBudgetConsumption(newRemainingBudget, taskListBudget != null ? String(taskListBudget) : null, totalTasks)
  }

  const saved = await prisma.list.update({
    where: { id: taskList.id },
    data: {
      completedTasks: nextCompleted,
      ephemeralTasks: updatedEphemeralTasks,
      remainingBudget: newRemainingBudget
    } as Record<string, unknown>,
    include: { template: true }
  })

  // Update user stash and profit
  if (userRecord) {
    let totalStashDelta = 0
    let totalProfitDelta = 0

    if (justCompletedNames.length > 0 || justUncompletedNames.length > 0) {
      if (justCompletedNames.length > 0) {
        const deltas = await calculateStashAndProfitDeltasForTaskList(taskList.id, user.id, year, dateISO, true)
        totalStashDelta += deltas.stashDelta
        totalProfitDelta += deltas.profitDelta
      }

      if (justUncompletedNames.length > 0) {
        const deltas = await calculateStashAndProfitDeltasForTaskList(taskList.id, user.id, year, dateISO, false)
        totalStashDelta += deltas.stashDelta
        totalProfitDelta += deltas.profitDelta
      }

      await updateUserStashAndProfit(userRecord.id, totalStashDelta, totalProfitDelta)
    }
  }

  // Update Day entry for uncompleted tasks
  if (justUncompletedNames.length > 0 && dateISO) {
    const userBalanceValues = getUserBalanceValues(user)
    await removeUncompletedTasksFromDay(
      user.id,
      dateISO,
      taskList.id,
      { tasks: taskList.tasks as Task[] },
      justUncompletedNames,
      userBalanceValues
    )
  }

  // Update Day entry for completed tasks
  const tasksToCopy = incomingTasks.filter((task) => {
    const status = task.status || 'open'
    return status !== 'open' && status !== 'ignored'
  })

  if (tasksToCopy.length > 0 && dateISO) {
    const userBalanceValues = getUserBalanceValues(user)
    await updateDayWithTasks(
      user.id,
      dateISO,
      taskList.id,
      { tasks: taskList.tasks as Task[] },
      tasksToCopy,
      userBalanceValues
    )
  }

  return { taskList: saved as unknown as TaskList, earnings }
}
