import { rrulestr, type RRule } from 'rrule'
import prisma from '@/lib/prisma'
import type { Task, TaskStatus } from '@/generated/prisma/client'

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

// Shared with client handlers via taskUtils (pure); re-exported for API stability
import { rruleFrequency, getCounterWindow } from '@/lib/utils/taskUtils'
export { rruleFrequency } from '@/lib/utils/taskUtils'

/**
 * Parse a YYYY-MM-DD date as UTC midnight to avoid timezone/DST drift
 */
export function toUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/** Format a Date as YYYY-MM-DD using UTC components */
function formatYmdUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Add days to a YYYY-MM-DD date (UTC) and return the result as YYYY-MM-DD */
function addDaysUtc(dateStr: string, days: number): string {
  const date = toUtcMidnight(dateStr)
  date.setUTCDate(date.getUTCDate() + days)
  return formatYmdUtc(date)
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
 * Compute the next occurrence strictly after completedDate for a recurring task.
 * Returns YYYY-MM-DD, or null when the series is exhausted (UNTIL/COUNT) or the
 * task is one-off. Mirrors taskOccursOnDate's legacy-quirk handling so the
 * materialized row starts where the engine would next show the task.
 */
export function nextOccurrenceAfter(
  task: { rrule: string | null; dtstart: string | null; createdAt?: Date | null },
  completedDate: string
): string | null {
  if (!task.rrule) return null

  // Legacy WEEKLY rules with no BYDAY appear on every day (see taskOccursOnDate):
  // the next occurrence is simply tomorrow.
  if (rruleFrequency(task.rrule) === 'WEEKLY' && !/BYDAY=/i.test(task.rrule)) {
    return addDaysUtc(completedDate, 1)
  }

  const fallbackDate = task.createdAt ? task.createdAt.toISOString().slice(0, 10) : null
  const rule = parseRuleForTask(task.rrule, task.dtstart, fallbackDate)
  // Unparseable rule: the task appears on all dates, so advance one day
  if (!rule) return addDaysUtc(completedDate, 1)

  const next = rule.after(toUtcMidnight(completedDate)) // exclusive of completedDate
  return next ? formatYmdUtc(next) : null
}

/**
 * Derive the date-scoped status for a task from its accepted-job count.
 * Extracted from getTasksForDate so materialization and past-pending paths
 * derive status identically. Only ACCEPTED jobs count.
 */
export function deriveDateStatus(
  task: { status: TaskStatus },
  acceptedCount: number,
  times?: number | null
): TaskStatus {
  // Tasks with COMPLETED or DONE status should always show as completed
  // regardless of date or job records. This is for tasks that were marked as
  // permanently completed (e.g., one-time tasks that are done)
  if (task.status === 'COMPLETED' || task.status === 'DONE') {
    return task.status
  }

  const required = times || 1
  if (acceptedCount >= required) {
    return 'DONE'
  } else if (acceptedCount > 0) {
    return 'IN_PROGRESS'
  } else if (task.status && ['READY', 'STEADY', 'IN_PROGRESS'].includes(task.status)) {
    // When no jobs exist for this date, respect manually-set task status
    // This allows users to mark tasks as "ready" or "steady" before completion
    return task.status
  }

  return 'OPEN'
}

/**
 * Check if a task should appear on a specific date based on its RRULE
 * - Tasks without an rrule are one-off tasks: they appear on all dates
 * - Tasks with COMPLETED status only appear in one-off lists (as done), or in
 *   recurring lists on the day they were completed (completedOn)
 * @param task - The task to check (needs rrule, dtstart, status)
 * @param targetDate - The date to check against (YYYY-MM-DD)
 * @param isOneOffList - Whether the task belongs to a one-off list
 */
export function taskOccursOnDate(
  task: { rrule: string | null; dtstart: string | null; status: TaskStatus; completedOn?: string | null; createdAt?: Date | null },
  targetDate: string,
  isOneOffList: boolean = false
): boolean {
  // Tasks with COMPLETED status should not appear in recurring lists, except
  // on their own completion day (materialized occurrences stay visible as done)
  // In one-off lists, COMPLETED tasks always appear (as done)
  if (task.status === 'COMPLETED' && !isOneOffList && task.completedOn !== targetDate) {
    return false
  }

  // Tasks without recurrence rules are one-time tasks: appear on all dates
  if (!task.rrule) {
    return true
  }

  // Legacy weekly rules with no explicit BYDAY (signup default lists, migrated
  // templates) must appear on every day of the week: the old engine treated
  // "no weekdays specified" as "all days", and the default lists rely on it.
  // The rrule lib instead anchors on the DTSTART weekday, which would hide
  // these tasks on 6 of 7 days.
  if (rruleFrequency(task.rrule) === 'WEEKLY' && !/BYDAY=/i.test(task.rrule)) {
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
  // For recurring lists (daily/weekly), filter out COMPLETED tasks except those
  // completed on the target date itself (materialized occurrences stay visible
  // as done on their completion day)
  const tasks = await prisma.task.findMany({
    where: {
      listId,
      // Only filter out COMPLETED tasks for non-one-off lists
      ...(isOneOffList
        ? {}
        : {
            OR: [
              { status: { not: 'COMPLETED' } },
              { status: 'COMPLETED', completedOn: targetDate }
            ]
          })
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

    // The counter window derives from the task's RRULE frequency: ISO week for
    // WEEKLY, calendar month for MONTHLY, calendar year for YEARLY, exact date
    // otherwise. Jobs within the window drive dateCount/dateStatus.
    const win = getCounterWindow(task, targetDate)
    const relevantJobs = task.jobs.filter(j =>
      j.occurrenceDate && j.occurrenceDate >= win.start && j.occurrenceDate <= win.end
    )

    // Calculate status based on relevant jobs
    const acceptedJobs = relevantJobs.filter(j => j.status === 'ACCEPTED')
    const count = acceptedJobs.length
    const dateStatus = deriveDateStatus(task, count, task.times)

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
