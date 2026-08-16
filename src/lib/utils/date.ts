/**
 * Date/time kit — single home for the date helpers shared across Do, Be, and views.
 *
 * RULE: all persisted dates are UTC `YYYY-MM-DD` strings
 * (`Job.occurrenceDate`, `Task.dtstart`, `Day.date`); `DateTime` columns are
 * instants only. Events (Phase 8) are the first true instants and carry their
 * own `timezone`.
 */

/**
 * ISO-8601 week number (Monday-based) for a date.
 *
 * Arithmetic from the ISO-correct copy formerly in `src/app/helpers.ts`
 * (kept over the two local-time copies that returned only a week number):
 * the date is normalized to a UTC calendar day, then moved to the nearest
 * Thursday — the anchor day of the ISO week. The ISO year is the year of
 * that Thursday, and the week number is the count of full weeks from the
 * year's first day. Returning the year alongside the week keeps year
 * rollover correct (e.g. 2024-12-30 is week 1 of ISO year 2025).
 */
export function getWeekNumber(date: Date): { week: number; year: number } {
  // Copy date so don't modify original
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  // Get first day of year (ISO year = year of the Thursday)
  const year = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  // Calculate full weeks to nearest Thursday
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { week, year }
}

/** 'YYYY-MM-DD' key of the date's UTC calendar day */
export function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

/** UTC midnight from a 'YYYY-MM-DD' key */
export function fromDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`)
}

/** UTC midnight of the UTC calendar day containing `date` */
export function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Short locale-aware date, e.g. 'Apr 8, 2024' for 'en-US'.
 * Consolidates the `toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })`
 * pattern duplicated across views (datePickerButton, dateRangeSelector).
 */
export function formatDateForLocale(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Compare two 'YYYY-MM-DD' keys. Keys are zero-padded and UTC, so string
 * equality is exact; no parsing required.
 */
export function isSameDateKey(a: string, b: string): boolean {
  return a === b
}
