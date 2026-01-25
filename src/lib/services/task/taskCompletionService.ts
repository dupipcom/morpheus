import prisma from '@/lib/prisma'
import type { Task, TaskStatus, Job } from '@/generated/prisma'
import { calculateNextOccurrence } from './taskRecurrenceService'

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
 * Update task occurrence dates after a completion or deletion
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
      firstOccurrence: true,
      lastOccurrence: true,
      recurrence: true,
      times: true,
      jobs: {
        where: { status: 'ACCEPTED' },
        select: {
          occurrenceDate: true,
          createdAt: true
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  })

  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const updateData: {
    firstOccurrence?: Date | null
    lastOccurrence?: Date | null
    nextOccurrence?: Date | null
    status?: 'OPEN' | 'COMPLETED'
  } = {}

  if (operation === 'complete') {
    // Set firstOccurrence if this is the first completion ever
    if (!task.firstOccurrence && task.jobs.length > 0) {
      const firstJob = task.jobs[0]
      if (firstJob.occurrenceDate) {
        updateData.firstOccurrence = new Date(firstJob.occurrenceDate)
      }
    }

    // Update lastOccurrence to the most recent completion date
    const lastJob = task.jobs[task.jobs.length - 1]
    if (lastJob?.occurrenceDate) {
      updateData.lastOccurrence = new Date(lastJob.occurrenceDate)

      // Calculate next occurrence if task has recurrence
      if (task.recurrence) {
        const nextOccurrence = calculateNextOccurrence(task as Task, updateData.lastOccurrence)
        updateData.nextOccurrence = nextOccurrence
      }
    }

    // Check if this is a non-recurring task that is now complete
    // If so, mark it as COMPLETED so it won't appear on future days
    const recurrence = task.recurrence as { frequency?: string } | null
    const isNonRecurring = !recurrence || recurrence.frequency === 'NONE'
    const requiredTimes = task.times || 1
    const completedCount = task.jobs.length

    if (isNonRecurring && completedCount >= requiredTimes) {
      updateData.status = 'COMPLETED'
    }
  } else if (operation === 'delete') {
    // Recalculate lastOccurrence from remaining jobs
    if (task.jobs.length === 0) {
      // No more completions
      updateData.lastOccurrence = null
      updateData.firstOccurrence = null
      updateData.nextOccurrence = null
    } else {
      // Set first and last from remaining jobs
      const firstJob = task.jobs[0]
      const lastJob = task.jobs[task.jobs.length - 1]

      if (firstJob?.occurrenceDate) {
        updateData.firstOccurrence = new Date(firstJob.occurrenceDate)
      }

      if (lastJob?.occurrenceDate) {
        updateData.lastOccurrence = new Date(lastJob.occurrenceDate)

        // Calculate next occurrence if task has recurrence
        if (task.recurrence) {
          const nextOccurrence = calculateNextOccurrence(task as Task, updateData.lastOccurrence)
          updateData.nextOccurrence = nextOccurrence
        }
      }
    }

    // If this is a non-recurring task that is no longer complete, reset to OPEN
    const recurrence = task.recurrence as { frequency?: string } | null
    const isNonRecurring = !recurrence || recurrence.frequency === 'NONE'
    const requiredTimes = task.times || 1
    const remainingCount = task.jobs.length

    if (isNonRecurring && remainingCount < requiredTimes) {
      updateData.status = 'OPEN'
    }
  }

  // Only update if there are changes
  if (Object.keys(updateData).length > 0) {
    await prisma.task.update({
      where: { id: taskId },
      data: updateData
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
