import { NextResponse } from "next/server";
import { match } from '@formatjs/intl-localematcher'
import Negotiator from 'negotiator'
import { locales, defaultLocale } from './app/constants'
import { pathHasLocale } from './app/helpers'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'


 
function getLocale(headers) { 
  const languages = new Negotiator({ headers }).languages()
  if (languages.every((lang) => lang === "*")) return defaultLocale
  return match(languages, locales, defaultLocale)
}
 
function middleware(request) {
  const { pathname } = request.nextUrl

  if(pathname.includes('api') || pathname.includes('app')) {
    return
  }

  const hasLocale = pathHasLocale(pathname)
 
  if (hasLocale) return
 
  const locale = getLocale(request.headers)
  request.nextUrl.pathname = `/${locale}${pathname}`

  return NextResponse.redirect(request.nextUrl)
}

const isProtectedRoute = createRouteMatcher(['app/dashboard/(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()

  return middleware(req)
})
 
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}