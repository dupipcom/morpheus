import prisma from '@/lib/prisma'
import type { Task, Job, TaskStatus } from '@/generated/prisma'

/**
 * Task with date-specific status and completion data
 */
export interface TaskForDate {
  task: Task
  dateStatus: TaskStatus
  dateCount: number
  completers: Array<{ id: string; completedAt: Date }>
}

/**
 * Check if a task should appear on a specific date based on its recurrence rule
 */
export function shouldTaskAppearOnDate(task: Task, targetDate: Date): boolean {
  // Tasks without recurrence rules are one-time tasks
  // They appear on all dates (or until completed/archived)
  if (!task.recurrence) {
    return true
  }

  const recurrence = task.recurrence as any
  const frequency = recurrence.frequency

  // Handle NONE frequency (one-time tasks)
  if (frequency === 'NONE') {
    return true
  }

  // Check if task has started (firstOccurrence)
  if (task.firstOccurrence && targetDate < task.firstOccurrence) {
    return false
  }

  // Check if recurrence has ended
  if (recurrence.endDate && targetDate > new Date(recurrence.endDate)) {
    return false
  }

  const interval = recurrence.interval || 1
  const targetTime = targetDate.getTime()
  const startTime = task.firstOccurrence ? task.firstOccurrence.getTime() : 0

  switch (frequency) {
    case 'DAILY': {
      if (!task.firstOccurrence) return true
      const daysSinceStart = Math.floor((targetTime - startTime) / (1000 * 60 * 60 * 24))
      return daysSinceStart % interval === 0
    }

    case 'WEEKLY': {
      const targetDay = targetDate.getDay() // 0 = Sunday, 6 = Saturday
      const byWeekday = recurrence.byWeekday || []

      // If no specific weekdays specified, appear on all days
      if (byWeekday.length === 0) return true

      // Check if target day is in the allowed weekdays
      return byWeekday.includes(targetDay)
    }

    case 'MONTHLY': {
      const targetDay = targetDate.getDate()
      const byMonthDay = recurrence.byMonthDay || []

      // If no specific days specified, appear on all days
      if (byMonthDay.length === 0) return true

      return byMonthDay.includes(targetDay)
    }

    case 'YEARLY': {
      if (!task.firstOccurrence) return true
      const targetMonth = targetDate.getMonth()
      const targetDay = targetDate.getDate()
      const startMonth = task.firstOccurrence.getMonth()
      const startDay = task.firstOccurrence.getDate()

      return targetMonth === startMonth && targetDay === startDay
    }

    default:
      return true
  }
}

/**
 * Get tasks that should appear for a specific date with date-specific completion status
 */
export async function getTasksForDate(
  listId: string,
  targetDate: string
): Promise<TaskForDate[]> {
  // 1. Fetch all tasks for the list
  const tasks = await prisma.task.findMany({
    where: { listId },
    include: {
      jobs: {
        where: { occurrenceDate: targetDate },
        include: {
          worker: {
            select: { id: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  const targetDateObj = new Date(targetDate)
  const result: TaskForDate[] = []

  for (const task of tasks) {
    // Check if this task should appear on the target date
    if (!shouldTaskAppearOnDate(task, targetDateObj)) {
      continue
    }

    // Calculate date-specific status based on jobs for this specific date
    const jobsForDate = task.jobs
    const acceptedJobs = jobsForDate.filter(j => j.status === 'ACCEPTED')
    const count = acceptedJobs.length
    const times = task.times || 1

    let dateStatus: TaskStatus = 'OPEN'
    if (count >= times) {
      dateStatus = 'DONE'
    } else if (count > 0) {
      dateStatus = 'IN_PROGRESS'
    }

    result.push({
      task,
      dateStatus,
      dateCount: count,
      completers: acceptedJobs.map(j => ({
        id: j.workerId,
        completedAt: j.createdAt
      }))
    })
  }

  return result
}

/**
 * Calculate next occurrence date for a task based on its recurrence rule
 */
export function calculateNextOccurrence(task: Task, fromDate: Date): Date | null {
  if (!task.recurrence) return null

  const recurrence = task.recurrence as any
  const frequency = recurrence.frequency

  if (frequency === 'NONE') return null

  const interval = recurrence.interval || 1
  const nextDate = new Date(fromDate)

  switch (frequency) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + interval)
      break

    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + (7 * interval))
      break

    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + interval)
      break

    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + interval)
      break

    default:
      return null
  }

  // Check if we've exceeded the end date
  if (recurrence.endDate && nextDate > new Date(recurrence.endDate)) {
    return null
  }

  return nextDate
}
