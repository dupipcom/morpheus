import { locales, defaultLocale } from './constants'

export const pathHasLocale = (pathname: string) => locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

export const stripLocaleFromPath = (pathname: string) => {
  if (pathHasLocale(pathname)) {
    const array = pathname.split('/')
    array.shift()
    array.shift()
    return "/" + array.join('/')
  }
  return pathname
}

export const getLocaleFromPath= (pathname: string) => {
  if (pathHasLocale(pathname)) {
    const array = pathname.split('/')
    const potentialLocale = array[1]
    // Validate that the extracted value is actually a valid locale
    if (locales.includes(potentialLocale as any)) {
      return potentialLocale
    }
  }
  return defaultLocale
}

export function getWeekNumber(d: Date) {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    // Return array of year and week number
    return ['Week ', weekNo];
}

/**
 * Formats two ISO date strings (YYYY-MM-DD) as a human-readable date range.
 * Examples: "Apr 8–14", "Mar 31–Apr 6"
 * Assumes startStr is chronologically before or equal to endStr.
 */
export function formatDateRange(startStr: string, endStr: string): string {
  const start = new Date(startStr + 'T00:00:00Z')
  const end = new Date(endStr + 'T00:00:00Z')
  const startMonth = start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const endMonth = end.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const startDay = start.getUTCDate()
  const endDay = end.getUTCDate()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`
  }
  return `${startMonth} ${startDay}–${endMonth} ${endDay}`
}

/**
 * Returns a human-readable date range string for a given ISO week number and year.
 * The ISO week starts on Monday. Example output: "Apr 8–14"
 */
export function getWeekDateRange(year: number, weekNumber: number): string {
  // ISO week 1 is the week containing January 4th
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7 // 1=Mon, …, 7=Sun
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1))
  const weekStart = new Date(week1Monday)
  weekStart.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6)

  return formatDateRange(
    weekStart.toISOString().split('T')[0],
    weekEnd.toISOString().split('T')[0]
  )
}
