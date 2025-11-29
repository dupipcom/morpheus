/**
 * Recurrence utilities for flexible task recurrence system
 * Handles task copying based on recurrence rules (Google Calendar-style)
 */

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'NONE'
  interval: number
  byWeekday: number[]        // ISO 8601: 1=Monday, ..., 7=Sunday
  byMonthDay: number[]       // 1-31
  byMonth: number[]          // 1-12 (for yearly)
  endDate?: Date | string | null
  occurrenceCount?: number | null
}

/**
 * Check if a task should be copied to a target date based on its recurrence rule
 */
export function shouldCopyTaskToDate(task: any, targetDate: Date): boolean {
  if (!task.recurrence) return false // No recurrence = ephemeral task only

  const { frequency, interval, byWeekday, byMonthDay, byMonth, endDate, occurrenceCount } = task.recurrence

  // Check if recurrence has ended
  if (endDate) {
    const end = new Date(endDate)
    if (targetDate > end) return false
  }

  if (frequency === 'NONE') {
    return false // One-time tasks don't recur
  }

  // Determine if target date matches the recurrence pattern
  return matchesRecurrencePattern(task.recurrence, targetDate, task.firstOccurrence)
}

/**
 * Check if a date matches a recurrence pattern
 */
function matchesRecurrencePattern(
  recurrence: RecurrenceRule,
  targetDate: Date,
  firstOccurrence?: Date | string | null
): boolean {
  const { frequency, interval, byWeekday, byMonthDay, byMonth } = recurrence

  // Get reference date (first occurrence or today)
  const refDate = firstOccurrence ? new Date(firstOccurrence) : new Date()

  // Normalize to start of day for comparison
  const target = normalizeToStartOfDay(targetDate)
  const ref = normalizeToStartOfDay(refDate)

  switch (frequency) {
    case 'DAILY':
      return matchesDailyPattern(target, ref, interval)

    case 'WEEKLY':
      return matchesWeeklyPattern(target, ref, interval, byWeekday)

    case 'MONTHLY':
      return matchesMonthlyPattern(target, ref, interval, byMonthDay)

    case 'YEARLY':
      return matchesYearlyPattern(target, ref, interval, byMonth, byMonthDay)

    case 'NONE':
      return false

    default:
      return false
  }
}

/**
 * Check if target date matches daily recurrence pattern
 */
function matchesDailyPattern(target: Date, ref: Date, interval: number): boolean {
  if (target < ref) return false

  const daysDiff = Math.floor((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24))
  return daysDiff % interval === 0
}

/**
 * Check if target date matches weekly recurrence pattern
 */
function matchesWeeklyPattern(
  target: Date,
  ref: Date,
  interval: number,
  byWeekday: number[]
): boolean {
  if (target < ref) return false

  // ISO weekday: 1=Monday, 7=Sunday
  const targetWeekday = getISOWeekday(target)

  // If specific weekdays are specified, check if target is one of them
  if (byWeekday && byWeekday.length > 0) {
    if (!byWeekday.includes(targetWeekday)) {
      return false
    }
  }

  // Check if target is N weeks from reference
  const weeksDiff = Math.floor((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24 * 7))
  return weeksDiff % interval === 0
}

/**
 * Check if target date matches monthly recurrence pattern
 */
function matchesMonthlyPattern(
  target: Date,
  ref: Date,
  interval: number,
  byMonthDay: number[]
): boolean {
  if (target < ref) return false

  const targetDay = target.getDate()

  // If specific month days are specified, check if target matches
  if (byMonthDay && byMonthDay.length > 0) {
    // Handle end-of-month cases (e.g., 31st in months with 30 days)
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    const matchesDay = byMonthDay.some(day => {
      return day === targetDay || (day > daysInMonth && targetDay === daysInMonth)
    })
    if (!matchesDay) return false
  }

  // Check if target is N months from reference
  const monthsDiff = (target.getFullYear() - ref.getFullYear()) * 12 + (target.getMonth() - ref.getMonth())
  return monthsDiff % interval === 0
}

/**
 * Check if target date matches yearly recurrence pattern
 */
function matchesYearlyPattern(
  target: Date,
  ref: Date,
  interval: number,
  byMonth: number[],
  byMonthDay: number[]
): boolean {
  if (target < ref) return false

  const targetMonth = target.getMonth() + 1 // 1-12
  const targetDay = target.getDate()

  // Check month matches
  if (byMonth && byMonth.length > 0) {
    if (!byMonth.includes(targetMonth)) return false
  }

  // Check day matches
  if (byMonthDay && byMonthDay.length > 0) {
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    const matchesDay = byMonthDay.some(day => {
      return day === targetDay || (day > daysInMonth && targetDay === daysInMonth)
    })
    if (!matchesDay) return false
  }

  // Check if target is N years from reference
  const yearsDiff = target.getFullYear() - ref.getFullYear()
  return yearsDiff % interval === 0
}

/**
 * Calculate the next occurrence date for a task
 */
export function calculateNextOccurrence(task: any, fromDate: Date = new Date()): Date | null {
  if (!task.recurrence) return null

  const { frequency, interval, byWeekday, byMonthDay, byMonth, endDate } = task.recurrence

  if (frequency === 'NONE') return null

  let next = new Date(fromDate)
  next = normalizeToStartOfDay(next)

  // Check if already at end
  if (endDate && next >= new Date(endDate)) return null

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + interval)
      break

    case 'WEEKLY':
      if (byWeekday && byWeekday.length > 0) {
        next = findNextWeekday(next, byWeekday, interval)
      } else {
        next.setDate(next.getDate() + (7 * interval))
      }
      break

    case 'MONTHLY':
      if (byMonthDay && byMonthDay.length > 0) {
        next = findNextMonthDay(next, byMonthDay, interval)
      } else {
        next.setMonth(next.getMonth() + interval)
      }
      break

    case 'YEARLY':
      next.setFullYear(next.getFullYear() + interval)
      break
  }

  return next
}

/**
 * Find the next occurrence of a weekday
 */
function findNextWeekday(from: Date, weekdays: number[], weekInterval: number): Date {
  const next = new Date(from)
  const currentWeekday = getISOWeekday(next)

  // Find next weekday in the list
  const sortedWeekdays = [...weekdays].sort((a, b) => a - b)
  let targetWeekday = sortedWeekdays.find(day => day > currentWeekday)

  if (targetWeekday) {
    // Next occurrence is later this week
    const daysAhead = targetWeekday - currentWeekday
    next.setDate(next.getDate() + daysAhead)
  } else {
    // Next occurrence is in a future week
    targetWeekday = sortedWeekdays[0]
    const daysAhead = (7 - currentWeekday) + targetWeekday + (7 * (weekInterval - 1))
    next.setDate(next.getDate() + daysAhead)
  }

  return next
}

/**
 * Find the next occurrence of a month day
 */
function findNextMonthDay(from: Date, monthDays: number[], monthInterval: number): Date {
  const next = new Date(from)
  const currentDay = next.getDate()

  // Sort month days
  const sortedDays = [...monthDays].sort((a, b) => a - b)

  // Find next day in current month
  let targetDay = sortedDays.find(day => day > currentDay)

  if (targetDay) {
    // Next occurrence is later this month
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(targetDay, daysInMonth))
  } else {
    // Next occurrence is in a future month
    next.setMonth(next.getMonth() + monthInterval)
    targetDay = sortedDays[0]
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(targetDay, daysInMonth))
  }

  return next
}

/**
 * Get ISO weekday (1=Monday, 7=Sunday)
 */
export function getISOWeekday(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 7 : day // Convert Sunday from 0 to 7
}

/**
 * Convert ISO weekday to JavaScript weekday (0=Sunday, 6=Saturday)
 */
export function convertISOWeekdayToJS(isoDay: number): number {
  return isoDay === 7 ? 0 : isoDay
}

/**
 * Normalize date to start of day (midnight)
 */
function normalizeToStartOfDay(date: Date): Date {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

/**
 * Format recurrence rule for display
 */
export function formatRecurrenceDisplay(recurrence: RecurrenceRule | null | undefined, locale: string = 'en'): string {
  if (!recurrence) return 'Does not repeat'

  const { frequency, interval } = recurrence

  if (frequency === 'NONE') return 'Does not repeat'

  const frequencyLabels: Record<string, { singular: string, plural: string }> = {
    DAILY: { singular: 'day', plural: 'days' },
    WEEKLY: { singular: 'week', plural: 'weeks' },
    MONTHLY: { singular: 'month', plural: 'months' },
    YEARLY: { singular: 'year', plural: 'years' },
  }

  const label = frequencyLabels[frequency]
  if (!label) return 'Custom recurrence'

  if (interval === 1) {
    return `Every ${label.singular}`
  } else {
    return `Every ${interval} ${label.plural}`
  }
}
