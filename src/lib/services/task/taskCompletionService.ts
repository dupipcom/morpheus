import prisma from '@/lib/prisma'
import type { Task, TaskStatus } from '@/generated/prisma/client'
import { getWeekRange, nextOccurrenceAfter, rruleFrequency } from './recurrenceService'

/**
 * Task completion data for a specific date
 */
export interface TaskCompletionForDate {
  count: number
  completers: Array<{ id: string; completedAt: Date }>
  status: TaskStatus
}

/**
 * Get task completion count and data for a specific date
 * Returns count of ACCEPTED jobs for the given occurrence date
 */
export async function getTaskCompletionCountForDate(
  taskId: string,
  occurrenceDate: string
): Promise<TaskCompletionForDate> {
  // Fetch task with jobs for the specific date
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      times: true,
      jobs: {
        where: {
          occurrenceDate,
          status: 'ACCEPTED'
        },
        select: {
          workerId: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const count = task.jobs.length
  const times = task.times || 1

  return {
    count,
    completers: task.jobs.map(j => ({
      id: j.workerId,
      completedAt: j.createdAt
    })),
    status: calculateStatusFromCount(count, times)
  }
}

/**
 * Get total completion count across all dates
 * Returns sum of all ACCEPTED jobs for this task
 */
export async function getTaskTotalCompletionCount(taskId: string): Promise<number> {
  const count = await prisma.job.count({
    where: {
      taskId,
      status: 'ACCEPTED'
    }
  })

  return count
}

/**
 * Calculate task status based on completion count vs times
 */
export function calculateStatusFromCount(count: number, times: number): TaskStatus {
  if (count >= times) {
    return 'DONE'
  } else if (count > 0) {
    return 'IN_PROGRESS'
  }
  return 'OPEN'
}

/**
 * Calculate the status for a non-recurring task based on completion count
 * Returns COMPLETED if done, OPEN if not done, or null if task is recurring
 */
function calculateNonRecurringTaskStatus(
  rrule: string | null | undefined,
  completedCount: number,
  requiredTimes: number
): 'OPEN' | 'COMPLETED' | null {
  if (rrule) {
    return null
  }
  return completedCount >= requiredTimes ? 'COMPLETED' : 'OPEN'
}

/**
 * Count ACCEPTED jobs for a specific occurrence of a task.
 * Weekly tasks aggregate across the whole Monday-Sunday week (same rule as
 * getTasksForDate); all others match the exact occurrence date.
 */
export async function countAcceptedForOccurrence(
  taskId: string,
  rrule: string | null,
  occurrenceDate: string
): Promise<number> {
  const dates =
    rruleFrequency(rrule) === 'WEEKLY'
      ? getWeekRange(occurrenceDate).allDates
      : [occurrenceDate]
  return prisma.job.count({
    where: { taskId, status: 'ACCEPTED', occurrenceDate: { in: dates } }
  })
}

/**
 * Update a task's status after a completion or deletion.
 * One-off tasks (no rrule) that reach their counter become COMPLETED; when
 * completions drop below the counter they reset to OPEN.
 * Recurring tasks (rrule) materialize their next occurrence as a new Task row
 * once the occurrence's accepted count reaches times; un-accepting rolls the
 * materialization back.
 */
export async function updateTaskOccurrenceDates(
  taskId: string,
  operation: 'complete' | 'delete',
  occurrenceDate: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      jobs: {
        where: { status: 'ACCEPTED' },
        select: { id: true }
      }
    }
  })

  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  // Recurring tasks: advance the series on completion
  if (task.rrule) {
    if (operation === 'complete') {
      const count = await countAcceptedForOccurrence(taskId, task.rrule, occurrenceDate)
      if (count >= (task.times || 1)) {
        await materializeOccurrence(task, occurrenceDate)
      }
    } else if (task.status === 'COMPLETED' && task.completedOn === occurrenceDate) {
      // Un-accept after a materialized completion: restore the occurrence and
      // remove the child only if nothing has attached to it yet
      const count = await countAcceptedForOccurrence(taskId, task.rrule, occurrenceDate)
      if (count < (task.times || 1)) {
        await prisma.task.update({
          where: { id: taskId },
          data: { status: 'OPEN', completedOn: null }
        })
        const next = nextOccurrenceAfter(task, occurrenceDate)
        if (next) {
          const child = await prisma.task.findFirst({
            where: { recurringTaskId: taskId, dtstart: next },
            select: { id: true }
          })
          if (child && (await prisma.job.count({ where: { taskId: child.id } })) === 0) {
            await prisma.task.delete({ where: { id: child.id } })
          }
        }
      }
    }
    return
  }

  const newStatus = calculateNonRecurringTaskStatus(task.rrule, task.jobs.length, task.times || 1)

  if (operation === 'complete' && newStatus === 'COMPLETED') {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'COMPLETED', completedOn: occurrenceDate }
    })
  } else if (operation === 'delete' && newStatus === 'OPEN') {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'OPEN', completedOn: null }
    })
  }
}

/**
 * Materialize the next occurrence of a recurring task as a new Task row with
 * status and counters reset (OPEN, no jobs, completedOn null, times copied),
 * and mark the completed occurrence COMPLETED so it stops appearing on future
 * dates (taskOccursOnDate keeps it visible on its own completion day).
 * Idempotent: a retried acceptance reuses the existing child row.
 */
async function materializeOccurrence(task: Task, occurrenceDate: string): Promise<void> {
  const next = nextOccurrenceAfter(task, occurrenceDate)

  await prisma.$transaction(async (tx) => {
    if (next) {
      const existing = await tx.task.findFirst({
        where: { recurringTaskId: task.id, dtstart: next },
        select: { id: true }
      })
      if (!existing) {
        await tx.task.create({
          data: {
            name: task.name,
            categories: task.categories as never,
            area: task.area as never,
            times: task.times,
            localeKey: task.localeKey,
            premiumType: task.premiumType,
            premium: task.premium,
            location: task.location as never,
            visibility: task.visibility as never,
            quality: task.quality,
            redacted: task.redacted ?? false,
            rrule: task.rrule,
            dtstart: next,
            status: 'OPEN',
            completedOn: null,
            recurringTaskId: task.id,
            listId: task.listId
          }
        })
      }
    }

    await tx.task.update({
      where: { id: task.id },
      data: { status: 'COMPLETED', completedOn: occurrenceDate }
    })
  })
}

/**
 * Get all completers for a task across all dates
 * Useful for analytics and historical tracking
 */
export async function getTaskCompletersHistory(
  taskId: string
): Promise<Array<{ workerId: string; occurrenceDate: string; completedAt: Date }>> {
  const jobs = await prisma.job.findMany({
    where: {
      taskId,
      status: 'ACCEPTED'
    },
    select: {
      workerId: true,
      occurrenceDate: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  })

  return jobs.map(j => ({
    workerId: j.workerId,
    occurrenceDate: j.occurrenceDate || '',
    completedAt: j.createdAt
  }))
}

/**
 * Check if a task is completed for a specific date
 */
export async function isTaskCompletedForDate(
  taskId: string,
  occurrenceDate: string
): Promise<boolean> {
  const completion = await getTaskCompletionCountForDate(taskId, occurrenceDate)
  return completion.status === 'DONE'
}

/**
 * Get completion percentage for a task on a specific date
 * Returns value between 0 and 1
 */
export async function getTaskCompletionPercentageForDate(
  taskId: string,
  occurrenceDate: string
): Promise<number> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { times: true }
  })

  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const completion = await getTaskCompletionCountForDate(taskId, occurrenceDate)
  const times = task.times || 1

  return Math.min(completion.count / times, 1.0)
}
