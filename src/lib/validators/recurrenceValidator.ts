/**
 * Validation logic for recurrence rules
 */

export interface RecurrenceRuleValidationError {
  field: string
  message: string
}

/**
 * Validate a recurrence rule
 * Returns null if valid, or an error object if invalid
 */
export function validateRecurrenceRule(recurrence: any): RecurrenceRuleValidationError | null {
  if (!recurrence) {
    return null // Recurrence is optional
  }

  // Validate frequency
  const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'NONE']
  if (!validFrequencies.includes(recurrence.frequency)) {
    return {
      field: 'frequency',
      message: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`
    }
  }

  // Validate interval
  if (recurrence.interval !== undefined && recurrence.interval !== null) {
    if (!Number.isInteger(recurrence.interval) || recurrence.interval < 1) {
      return {
        field: 'interval',
        message: 'Interval must be a positive integer'
      }
    }
  }

  // Validate byWeekday (1-7 for ISO weekdays)
  if (recurrence.byWeekday && Array.isArray(recurrence.byWeekday)) {
    const invalidWeekdays = recurrence.byWeekday.filter((day: number) => day < 1 || day > 7)
    if (invalidWeekdays.length > 0) {
      return {
        field: 'byWeekday',
        message: 'Weekdays must be between 1 (Monday) and 7 (Sunday)'
      }
    }
  }

  // Validate byMonthDay (1-31)
  if (recurrence.byMonthDay && Array.isArray(recurrence.byMonthDay)) {
    const invalidDays = recurrence.byMonthDay.filter((day: number) => day < 1 || day > 31)
    if (invalidDays.length > 0) {
      return {
        field: 'byMonthDay',
        message: 'Month days must be between 1 and 31'
      }
    }
  }

  // Validate byMonth (1-12)
  if (recurrence.byMonth && Array.isArray(recurrence.byMonth)) {
    const invalidMonths = recurrence.byMonth.filter((month: number) => month < 1 || month > 12)
    if (invalidMonths.length > 0) {
      return {
        field: 'byMonth',
        message: 'Months must be between 1 and 12'
      }
    }
  }

  // Validate endDate
  if (recurrence.endDate) {
    const endDate = new Date(recurrence.endDate)
    if (isNaN(endDate.getTime())) {
      return {
        field: 'endDate',
        message: 'Invalid end date format'
      }
    }
  }

  // Validate occurrenceCount
  if (recurrence.occurrenceCount !== undefined && recurrence.occurrenceCount !== null) {
    if (!Number.isInteger(recurrence.occurrenceCount) || recurrence.occurrenceCount < 1) {
      return {
        field: 'occurrenceCount',
        message: 'Occurrence count must be a positive integer'
      }
    }
  }

  // Logical validations
  if (recurrence.frequency === 'WEEKLY' && recurrence.byWeekday && recurrence.byWeekday.length === 0) {
    return {
      field: 'byWeekday',
      message: 'Weekly recurrence requires at least one weekday'
    }
  }

  if (recurrence.frequency === 'MONTHLY' && recurrence.byMonthDay && recurrence.byMonthDay.length === 0) {
    return {
      field: 'byMonthDay',
      message: 'Monthly recurrence requires at least one day of month'
    }
  }

  if (recurrence.frequency === 'YEARLY') {
    if (recurrence.byMonth && recurrence.byMonth.length === 0) {
      return {
        field: 'byMonth',
        message: 'Yearly recurrence requires at least one month'
      }
    }
    if (recurrence.byMonthDay && recurrence.byMonthDay.length === 0) {
      return {
        field: 'byMonthDay',
        message: 'Yearly recurrence requires at least one day of month'
      }
    }
  }

  return null // Valid
}

/**
 * Sanitize a recurrence rule to ensure it has valid defaults
 */
export function sanitizeRecurrenceRule(recurrence: any): any {
  if (!recurrence) return null

  return {
    frequency: recurrence.frequency || 'DAILY',
    interval: Math.max(1, Number(recurrence.interval) || 1),
    byWeekday: Array.isArray(recurrence.byWeekday) ? recurrence.byWeekday : [],
    byMonthDay: Array.isArray(recurrence.byMonthDay) ? recurrence.byMonthDay : [],
    byMonth: Array.isArray(recurrence.byMonth) ? recurrence.byMonth : [],
    endDate: recurrence.endDate || null,
    occurrenceCount: recurrence.occurrenceCount || null,
  }
}
