/**
 * Ephemeral task service
 * Handles operations on ephemeral (temporary) tasks within a task list
 */

import prisma from '@/lib/prisma'
import type {
  Task,
  TaskList,
  EphemeralTasks,
  EphemeralTasksOps,
  EphemeralCloseOp,
  EphemeralUpdateOp,
  EphemeralReopenOp,
  CompletedTasks
} from './types'
import { formatDateForCompletedOn, getTodayISO, getYearFromISO } from './helpers'
import { parseCompletedTasksBucket } from './completionService'
import { calculateCompletionRate } from './productivityUtils'

/**
 * Generate a unique ephemeral task ID
 */
export function generateEphemeralTaskId(): string {
  return `ephemeral_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Process ephemeral tasks operations
 */
export async function processEphemeralTasks(params: {
  taskListId: string
  operations: EphemeralTasksOps
}): Promise<TaskList> {
  const { taskListId, operations } = params

  const taskList = await prisma.list.findUnique({ where: { id: taskListId } })
  if (!taskList) {
    throw new Error('TaskList not found')
  }

  const current = ((taskList as Record<string, unknown>).ephemeralTasks as EphemeralTasks) || { open: [], closed: [] }
  let open = Array.isArray(current.open) ? [...current.open] : []
  let closed = Array.isArray(current.closed) ? [...current.closed] : []

  // Handle add operation
  if (operations.add) {
    const t = operations.add
    const newTask: Task = {
      id: t.id || generateEphemeralTaskId(),
      name: t.name,
      status: t.status || 'open',
      area: t.area || 'self',
      categories: t.categories || ['custom'],
      cadence: t.cadence || 'ephemeral',
      times: t.times || 1,
      count: t.count || 0,
      contacts: t.contacts || [],
      things: t.things || [],
      favorite: !!t.favorite,
      isEphemeral: true,
      createdAt: new Date().toISOString()
    }
    open = [newTask, ...open]
  }

  // Handle close operation(s)
  if (operations.close) {
    const closeOps = Array.isArray(operations.close) ? operations.close : [operations.close]
    const completedOnDate = formatDateForCompletedOn(new Date())

    closeOps.forEach((closeOp: EphemeralCloseOp) => {
      const { id, count } = closeOp
      const item = open.find((x) => x.id === id)
      open = open.filter((x) => x.id !== id)
      if (item) {
        closed = [{
          ...item,
          status: 'done',
          count: count || item.count,
          completedAt: new Date().toISOString(),
          completedOn: completedOnDate
        }, ...closed]
      }
    })
  }

  // Handle update operation(s)
  if (operations.update) {
    const updateOps = Array.isArray(operations.update) ? operations.update : [operations.update]

    updateOps.forEach((updateOp: EphemeralUpdateOp) => {
      const { id, count, status } = updateOp
      open = open.map((x) => {
        if (x.id === id) {
          const updated = { ...x }
          if (count !== undefined) updated.count = count
          if (status) updated.status = status
          return updated
        }
        return x
      })
    })
  }

  // Handle reopen operation(s)
  if (operations.reopen) {
    const reopenOps = Array.isArray(operations.reopen) ? operations.reopen : [operations.reopen]

    reopenOps.forEach((reopenOp: EphemeralReopenOp) => {
      const { id, count } = reopenOp
      const item = closed.find((x) => x.id === id)
      closed = closed.filter((x) => x.id !== id)
      if (item) {
        // Remove completedAt and completedOn when reopening
        const { completedAt, completedOn, ...taskWithoutCompletedFields } = item
        open = [{
          ...taskWithoutCompletedFields,
          status: 'open',
          count: count !== undefined ? count : (item.count || 0)
        }, ...open]
      }
    })
  }

  // Calculate completion rate for today
  const today = new Date()
  const year = today.getFullYear()
  const todayISO = getTodayISO()

  const completedTasks = ((taskList as Record<string, unknown>).completedTasks as CompletedTasks) || {}
  const yearData = completedTasks[year] || {}
  let todayData = yearData[todayISO]

  // Parse today's data
  let { openTasks, closedTasks: closedTasksForDay } = parseCompletedTasksBucket(
    todayData as Task[] | { openTasks: Task[]; closedTasks: Task[]; completion: number }
  )

  // Calculate completion rate
  const completionRate = calculateCompletionRate(openTasks, closedTasksForDay)

  // Update completedTasks with completion for today
  const updatedCompletedTasks = {
    ...completedTasks,
    [year]: {
      ...yearData,
      [todayISO]: {
        openTasks: openTasks,
        closedTasks: closedTasksForDay,
        completion: completionRate
      }
    }
  }

  const saved = await prisma.list.update({
    where: { id: taskList.id },
    data: {
      ephemeralTasks: { open, closed },
      completedTasks: updatedCompletedTasks
    } as Record<string, unknown>
  })

  return saved as unknown as TaskList
}
