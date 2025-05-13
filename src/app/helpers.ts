import { locales } from './constants'

export const pathHasLocale = (pathname) => locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

export const stripLocaleFromPath = (pathname) => {
  if (pathHasLocale(pathname)) {
    const array = pathname.split('/')
    array.shift()
    array.shift()
    return "/" + array.join('/')
  }
  return pathname
}

export const getLocaleFromPath= (pathname) => {
  if (pathHasLocale(pathname)) {
    const array = pathname.split('/')
    return array[1]
  }
  return pathname
}