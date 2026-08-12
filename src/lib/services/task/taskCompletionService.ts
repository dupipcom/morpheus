import prisma from '@/lib/prisma'
import type { TaskStatus } from '@/generated/prisma'

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
 * Update a task's status after a completion or deletion.
 * One-off tasks (no rrule) that reach their counter become COMPLETED; when
 * completions drop below the counter they reset to OPEN.
 */
export async function updateTaskOccurrenceDates(
  taskId: string,
  operation: 'complete' | 'delete',
  occurrenceDate: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      rrule: true,
      times: true,
      jobs: {
        where: { status: 'ACCEPTED' },
        select: { id: true }
      }
    }
  })

  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
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
