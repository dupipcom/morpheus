import { NextResponse } from "next/server";
import { match } from '@formatjs/intl-localematcher'
import Negotiator from 'negotiator'
import { locales, defaultLocale } from './app/constants'
import { pathHasLocale } from './app/helpers'

 
function getLocale(headers) { 
  const languages = new Negotiator({ headers }).languages()
  if (languages.every((lang) => lang === "*")) return defaultLocale
  return match(languages, locales, defaultLocale)
}
 
export function middleware(request) {
  const { pathname } = request.nextUrl
  const hasLocale = pathHasLocale(pathname)
 
  if (hasLocale) return
 
  const locale = getLocale(request.headers)
  request.nextUrl.pathname = `/${locale}${pathname}`

  return NextResponse.redirect(request.nextUrl)
}
 
export const config = {
  matcher: [
    '/((?!services|subs|members|app|.well-known|api|login|favicon.ico|fonts|images|scripts|og-image.png|sitemap|robots|_next).*)',
  ],
}