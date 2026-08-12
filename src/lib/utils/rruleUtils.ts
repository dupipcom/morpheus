/**
 * RRULE string helpers (RFC-5545) used by services to build cadence values
 */

const JS_DAY_TO_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/**
 * Build an RRULE string from a legacy recurrence object
 * ({ frequency, interval, byWeekday, byMonthDay, byMonth, endDate, occurrenceCount })
 */
export function buildRRuleFromLegacy(recurrence: {
  frequency?: string | null
  interval?: number | null
  byWeekday?: number[]
  byMonthDay?: number[]
  byMonth?: number[]
  endDate?: Date | string | null
  occurrenceCount?: number | null
} | null | undefined): string | null {
  if (!recurrence || !recurrence.frequency || recurrence.frequency === 'NONE') return null

  const parts = [`FREQ=${recurrence.frequency}`]
  const interval = recurrence.interval || 1
  if (interval !== 1) parts.push(`INTERVAL=${interval}`)

  const byWeekday = (recurrence.byWeekday || [])
    .map((n) => JS_DAY_TO_RRULE[n])
    .filter(Boolean)
  if (byWeekday.length > 0) parts.push(`BYDAY=${byWeekday.join(',')}`)

  const byMonthDay = recurrence.byMonthDay || []
  if (byMonthDay.length > 0) parts.push(`BYMONTHDAY=${byMonthDay.join(',')}`)

  const byMonth = recurrence.byMonth || []
  if (byMonth.length > 0) parts.push(`BYMONTH=${byMonth.join(',')}`)

  if (recurrence.endDate) {
    const until = new Date(recurrence.endDate)
    if (!isNaN(until.getTime())) {
      parts.push(`UNTIL=${until.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
    }
  } else if (recurrence.occurrenceCount) {
    parts.push(`COUNT=${recurrence.occurrenceCount}`)
  }

  return parts.join(';')
}

/**
 * Derive a default RRULE string from a list role prefix
 * (daily.* -> FREQ=DAILY, weekly.* -> FREQ=WEEKLY, else null)
 */
export function rruleFromListRole(role: string | null | undefined): string | null {
  const prefix = (role || '').split('.')[0]
  if (prefix === 'daily') return 'FREQ=DAILY'
  if (prefix === 'weekly') return 'FREQ=WEEKLY'
  return null
}

/**
 * Generate a URL-safe slug from a name, appending a short suffix for uniqueness
 */
export function slugifyList(name: string | null | undefined, idSuffix: string): string {
  const base = (name || 'list')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'list'
  return `${base}-${idSuffix}`
}
