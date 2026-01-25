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
 * Get the week range (Monday-Sunday) for a given date in YYYY-MM-DD format
 */
export function getWeekRange(dateStr: string): { weekStart: string; weekEnd: string; allDates: string[] } {
  const date = new Date(dateStr)

  // Get Monday of the week (start of week)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  const monday = new Date(date)
  monday.setDate(diff)

  // Get Sunday of the week (end of week)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  // Format as YYYY-MM-DD
  const formatDate = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Generate all dates in the week
  const allDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const weekDate = new Date(monday)
    weekDate.setDate(monday.getDate() + i)
    allDates.push(formatDate(weekDate))
  }

  return {
    weekStart: formatDate(monday),
    weekEnd: formatDate(sunday),
    allDates
  }
}

/**
 * Check if a task should appear on a specific date based on its recurrence rule
 */
export function shouldTaskAppearOnDate(task: Task, targetDate: Date): boolean {
  // Tasks with COMPLETED status should never appear (non-recurring tasks that are done)
  if (task.status === 'COMPLETED') {
    return false
  }

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
 * For weekly tasks, aggregates job data across the entire week
 */
export async function getTasksForDate(
  listId: string,
  targetDate: string
): Promise<TaskForDate[]> {
  const targetDateObj = new Date(targetDate)
  const weekRange = getWeekRange(targetDate)

  // 1. Fetch all tasks for the list with all jobs (we'll filter later)
  const tasks = await prisma.task.findMany({
    where: { listId },
    include: {
      jobs: {
        include: {
          worker: {
            select: { id: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  const result: TaskForDate[] = []

  for (const task of tasks) {
    // Check if this task should appear on the target date
    if (!shouldTaskAppearOnDate(task, targetDateObj)) {
      continue
    }

    // Determine if this is a weekly task
    const recurrence = task.recurrence as any
    const isWeeklyTask = recurrence?.frequency === 'WEEKLY'

    // Filter jobs based on task type
    let relevantJobs: Job[]
    if (isWeeklyTask) {
      // For weekly tasks, get all jobs within the same week
      relevantJobs = task.jobs.filter(j =>
        j.occurrenceDate && weekRange.allDates.includes(j.occurrenceDate)
      )

      // Debug logging for weekly tasks
      if (process.env.NODE_ENV === 'development' && relevantJobs.length > 0) {
        console.log(`[Weekly Task] ${task.name}: Found ${relevantJobs.length} jobs in week ${weekRange.weekStart} - ${weekRange.weekEnd}`)
      }
    } else {
      // For non-weekly tasks, only get jobs for the specific date
      relevantJobs = task.jobs.filter(j => j.occurrenceDate === targetDate)
    }

    // Calculate status based on relevant jobs
    const acceptedJobs = relevantJobs.filter(j => j.status === 'ACCEPTED')
    const count = acceptedJobs.length
    const times = task.times || 1

    let dateStatus: TaskStatus = 'OPEN'
    if (count >= times) {
      dateStatus = 'DONE'
    } else if (count > 0) {
      dateStatus = 'IN_PROGRESS'
    } else if (count === 0 && task.status && ['READY', 'STEADY', 'IN_PROGRESS'].includes(task.status)) {
      // When no jobs exist for this date, respect manually-set task status
      // This allows users to mark tasks as "ready" or "steady" before completion
      dateStatus = task.status
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
