import { rrulestr } from 'rrule'
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
 * Parse a task's RRULE string into an RRule instance, returning null when unparseable.
 *
 * Always injects an explicit DTSTART at UTC midnight: rrulestr() otherwise
 * defaults dtstart to the current moment AND inherits the current time-of-day
 * into byhour/byminute/bysecond, which breaks date-only occurrence checks.
 */
function parseRuleForTask(
  rrule: string,
  dtstart: string | null | undefined,
  fallbackDate: string | null
): RRule | null {
  if (!rrule) return null
  try {
    const effectiveStart = dtstart || fallbackDate
    if (!effectiveStart) return null

    // Strip any existing DTSTART line and the RRULE prefix
    const ruleBody = rrule
      .split('\n')
      .map((line) => line.replace(/^RRULE:/i, ''))
      .filter((line) => !/^DTSTART/i.test(line))
      .join('\n')

    return rrulestr(`DTSTART:${effectiveStart.replace(/-/g, '')}T000000Z\nRRULE:${ruleBody}`)
  } catch {
    return null
  }
}

/**
 * Extract the FREQ value from an RRULE string (e.g. "WEEKLY"), or null
 */
export function rruleFrequency(rrule: string | null | undefined): string | null {
  const match = (rrule || '').match(/FREQ=([A-Z]+)/i)
  return match ? match[1].toUpperCase() : null
}

/**
 * Parse a YYYY-MM-DD date as UTC midnight to avoid timezone/DST drift
 */
function toUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/**
 * Get the week range (Monday-Sunday) for a given date in YYYY-MM-DD format
 */
export function getWeekRange(dateStr: string): { weekStart: string; weekEnd: string; allDates: string[] } {
  const date = toUtcMidnight(dateStr)

  // Get Monday of the week (start of week)
  const day = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day // adjust when day is sunday
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() + diff)

  // Get Sunday of the week (end of week)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  // Format as YYYY-MM-DD
  const formatDate = (d: Date) => {
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Generate all dates in the week
  const allDates: string[] = []
  for (let i = 0; i < 7; i++) {
    const weekDate = new Date(monday)
    weekDate.setUTCDate(monday.getUTCDate() + i)
    allDates.push(formatDate(weekDate))
  }

  return {
    weekStart: formatDate(monday),
    weekEnd: formatDate(sunday),
    allDates
  }
}

/**
 * Check if a task should appear on a specific date based on its RRULE
 * - Tasks without an rrule are one-off tasks: they appear on all dates
 * - Tasks with COMPLETED status only appear in one-off lists (as done)
 * @param task - The task to check (needs rrule, dtstart, status)
 * @param targetDate - The date to check against (YYYY-MM-DD)
 * @param isOneOffList - Whether the task belongs to a one-off list
 */
export function taskOccursOnDate(
  task: { rrule: string | null; dtstart: string | null; status: TaskStatus; createdAt?: Date | null },
  targetDate: string,
  isOneOffList: boolean = false
): boolean {
  // Tasks with COMPLETED status should not appear in recurring lists
  // But in one-off lists, COMPLETED tasks should still appear (as done)
  if (task.status === 'COMPLETED' && !isOneOffList) {
    return false
  }

  // Tasks without recurrence rules are one-time tasks: appear on all dates
  if (!task.rrule) {
    return true
  }

  const fallbackDate = task.createdAt ? task.createdAt.toISOString().slice(0, 10) : null
  const rule = parseRuleForTask(task.rrule, task.dtstart, fallbackDate)
  // Unparseable rule: keep appearing (matches legacy default behavior)
  if (!rule) {
    return true
  }

  const target = toUtcMidnight(targetDate)

  // Inclusive check for an occurrence landing exactly on the target date
  return rule.between(target, target, true).length > 0
}

/**
 * Get tasks that should appear for a specific date with date-specific completion status
 * For weekly tasks, aggregates job data across the entire week
 * @param listId - The list ID to fetch tasks for
 * @param targetDate - The date to filter tasks for (YYYY-MM-DD format)
 * @param listRole - Optional list role to determine if it's a one-off list (avoids extra DB query if provided)
 */
export async function getTasksForDate(
  listId: string,
  targetDate: string,
  listRole?: string | null
): Promise<TaskForDate[]> {
  const weekRange = getWeekRange(targetDate)

  // Determine if this is a one-off list (should show all tasks including COMPLETED)
  // Use provided listRole if available, otherwise fetch from DB
  let role = listRole
  if (role === undefined) {
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: { role: true }
    })
    role = list?.role
  }

  const rolePrefix = role?.split('.')[0] || ''
  const isOneOffList = rolePrefix === 'one-off' || rolePrefix === 'oneoff'

  // 1. Fetch all tasks for the list with all jobs
  // For one-off lists, include COMPLETED tasks (they should appear as done)
  // For recurring lists (daily/weekly), filter out COMPLETED tasks
  const tasks = await prisma.task.findMany({
    where: {
      listId,
      // Only filter out COMPLETED tasks for non-one-off lists
      ...(isOneOffList ? {} : { status: { not: 'COMPLETED' } })
    },
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
    if (!taskOccursOnDate(task, targetDate, isOneOffList)) {
      continue
    }

    // Weekly tasks aggregate jobs across the whole week
    const isWeeklyTask = rruleFrequency(task.rrule) === 'WEEKLY'

    // Filter jobs based on task type
    let relevantJobs: Job[]
    if (isWeeklyTask) {
      // For weekly tasks, get all jobs within the same week
      relevantJobs = task.jobs.filter(j =>
        j.occurrenceDate && weekRange.allDates.includes(j.occurrenceDate)
      )
    } else {
      // For non-weekly tasks, only get jobs for the specific date
      relevantJobs = task.jobs.filter(j => j.occurrenceDate === targetDate)
    }

    // Calculate status based on relevant jobs
    const acceptedJobs = relevantJobs.filter(j => j.status === 'ACCEPTED')
    const count = acceptedJobs.length
    const times = task.times || 1

    let dateStatus: TaskStatus = 'OPEN'

    // Tasks with COMPLETED or DONE status should always show as completed
    // regardless of date or job records. This is for tasks that were marked as
    // permanently completed (e.g., one-time tasks that are done)
    if (task.status === 'COMPLETED' || task.status === 'DONE') {
      dateStatus = task.status
    } else if (count >= times) {
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
