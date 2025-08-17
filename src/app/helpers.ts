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
    return array[1]
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
