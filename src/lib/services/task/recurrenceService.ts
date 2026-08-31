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
 *
 * COMPLETED/DONE rows only read as completed while their accepted-job count
 * still meets the target: a recurring occurrence whose completions were
 * rolled back below `times` must fall through to the count-based statuses
 * instead of displaying a stale "completed". One-off rows (no rrule) keep the
 * passthrough even with fewer jobs — they have no per-date counter and are
 * only marked COMPLETED/DONE deliberately (status menu).
 */
export function deriveDateStatus(
  task: { status: TaskStatus; rrule?: string | null },
  acceptedCount: number,
  times?: number | null
): TaskStatus {
  const required = times || 1

  if ((task.status === 'COMPLETED' || task.status === 'DONE') && acceptedCount >= required) {
    return task.status
  }
  if (acceptedCount >= required) {
    return 'DONE'
  } else if (acceptedCount > 0) {
    return 'IN_PROGRESS'
  } else if (task.status && ['READY', 'STEADY', 'IN_PROGRESS'].includes(task.status)) {
    // When no jobs exist for this date, respect manually-set task status
    // This allows users to mark tasks as "ready" or "steady" before completion
    return task.status
  } else if (!task.rrule && (task.status === 'COMPLETED' || task.status === 'DONE')) {
    // Permanently completed one-off tasks (marked via the status menu) stay
    // completed: they appear on every date and have no per-date counter.
    return task.status
  }

  return 'OPEN'
}

/**
 * Check if a task should appear on a specific date based on its RRULE.
 *
 * Visibility model: an entry stays visible for its whole occurrence window —
 * from its occurrence date until the next occurrence takes over (a weekly
 * Monday task shows Mon–Sun, a monthly task the whole month). One-off tasks
 * (no rrule) appear on all dates until completed, then only on their
 * completion day. Recurring tasks stay visible when completed: the completed
 * row shows as done for the rest of its window, while the materialized child
 * row takes over at the next occurrence.
 *
 * @param task - The task to check (needs rrule, dtstart, status)
 * @param targetDate - The date to check against (YYYY-MM-DD)
 * @param isOneOffList - Whether the task belongs to a one-off list
 */
export function taskOccursOnDate(
  task: { rrule: string | null; dtstart: string | null; status: TaskStatus; completedOn?: string | null; createdAt?: Date | null },
  targetDate: string,
  isOneOffList: boolean = false
): boolean {
  // Legacy weekly rules with no explicit BYDAY (signup default lists, migrated
  // templates) appear on every day of the week: the old engine treated
  // "no weekdays specified" as "all days", and the default lists rely on it.
  // The rrule lib instead anchors on the DTSTART weekday, which would hide
  // these tasks on 6 of 7 days.
  const isLegacyWeekly =
    rruleFrequency(task.rrule) === 'WEEKLY' && !/BYDAY=/i.test(task.rrule || '')

  // Tasks with COMPLETED status should not appear in recurring lists, except
  // within their occurrence window (materialized occurrences stay visible as
  // done until the next occurrence takes over)
  // In one-off lists, COMPLETED tasks always appear (as done)
  if (task.status === 'COMPLETED' && !isOneOffList) {
    // One-off and legacy-everyday tasks: visible on their completion day only
    // (no per-week window to fill — the next row materializes the series)
    if (!task.rrule || isLegacyWeekly) {
      return task.completedOn === targetDate
    }

    const fallbackDate = task.createdAt ? task.createdAt.toISOString().slice(0, 10) : null
    const rule = parseRuleForTask(task.rrule, task.dtstart, fallbackDate)
    if (!rule) {
      return task.completedOn === targetDate
    }

    // Window of the occurrence the task was completed in: [occ, next) where
    // occ is the latest occurrence on/before completedOn (fallback: the
    // completion day itself) and next is the following occurrence (the child
    // row's window). No next occurrence (series exhausted by UNTIL/COUNT) →
    // only the completion day shows, then the task is over.
    const completedOn = toUtcMidnight(task.completedOn || targetDate)
    const occ = rule.before(completedOn, true) ?? completedOn
    const next = rule.after(occ)
    if (next === null) {
      return task.completedOn === targetDate
    }
    const target = toUtcMidnight(targetDate)
    return target >= occ && target < next
  }

  // Tasks without recurrence rules are one-time tasks: appear on all dates
  if (!task.rrule) {
    return true
  }

  // Legacy weekly rules appear every day (see above)
  if (isLegacyWeekly) {
    return true
  }

  const fallbackDate = task.createdAt ? task.createdAt.toISOString().slice(0, 10) : null
  const rule = parseRuleForTask(task.rrule, task.dtstart, fallbackDate)
  // Unparseable rule: keep appearing (matches legacy default behavior)
  if (!rule) {
    return true
  }

  const target = toUtcMidnight(targetDate)

  // Window check: visible once the first occurrence has passed (the latest
  // occurrence on/before the target date anchors the current entry), until the
  // next occurrence takes over. Between-window days (e.g. Tuesday after a
  // Monday occurrence) stay covered by the most recent occurrence. Finite
  // series (UNTIL/COUNT, e.g. a delete-onwards cap) have no next occurrence to
  // hand the window to — their last occurrence shows only on its own day.
  const occ = rule.before(target, true)
  if (!occ) {
    return false
  }
  const next = rule.after(occ)
  return next === null ? formatYmdUtc(occ) === targetDate : true
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
  // For recurring lists (daily/weekly), filter out COMPLETED one-off tasks
  // except those completed on the target date itself; COMPLETED recurring
  // tasks stay in the query — taskOccursOnDate keeps them visible as done for
  // the rest of their occurrence window.
  const tasks = await prisma.task.findMany({
    where: {
      listId,
      // Only filter out COMPLETED tasks for non-one-off lists
      ...(isOneOffList
        ? {}
        : {
            OR: [
              { status: { not: 'COMPLETED' } },
              { status: 'COMPLETED', completedOn: targetDate },
              { status: 'COMPLETED', rrule: { not: null } }
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
