import { NextResponse } from "next/server";
import { locales, defaultLocale } from './app/constants'
import { pathHasLocale } from './app/helpers'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { getBestLocale } from '@/lib/i18n'
import { parseCookies } from '@/lib/localeUtils'

function getLocale(headers: Headers, cookies: Record<string, string>) { 
  // First check for user preference cookie
  const userLocale = cookies['dpip_user_locale']
  if (userLocale && locales.includes(userLocale)) {
    return userLocale
  }
  
  // Fall back to browser locale
  const acceptLanguage = headers.get('accept-language') || ''
  return getBestLocale(acceptLanguage)
}
 
function middleware(request: Request) {
  const { pathname } = new URL(request.url)

  // Skip API routes
  if(pathname.includes('api')) {
    return
  }

  // Handle @username routes - redirect to localized profile route
  if (pathname.startsWith('/@')) {
    const username = pathname.substring(2) // Remove /@
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = parseCookies(cookieHeader)
    const locale = getLocale(request.headers, cookies)
    const url = new URL(request.url)
    url.pathname = `/${locale}/profile/${username}`
    return NextResponse.redirect(url)
  }

  const hasLocale = pathHasLocale(pathname)
 
  // If path already has locale, let it through
  if (hasLocale) return

  // Handle direct username routes (without @) - redirect to localized profile route
  if (pathname.match(/^\/[^\/]+$/) && !pathname.startsWith('/app') && !pathname.startsWith('/api')) {
    const username = pathname.substring(1) // Remove leading /
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = parseCookies(cookieHeader)
    const locale = getLocale(request.headers, cookies)
    const url = new URL(request.url)
    url.pathname = `/${locale}/profile/${username}`
    return NextResponse.redirect(url)
  }

  // Parse cookies from request
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = parseCookies(cookieHeader)
 
  // For app routes, redirect to localized version
  if (pathname.startsWith('/app/')) {
    const locale = getLocale(request.headers, cookies)
    const url = new URL(request.url)
    url.pathname = `/${locale}${pathname}`
    return NextResponse.redirect(url)
  }

  // For other routes, redirect to localized version
  const locale = getLocale(request.headers, cookies)
  const url = new URL(request.url)
  url.pathname = `/${locale}${pathname}`

  return NextResponse.redirect(url)
}

const isProtectedRoute = createRouteMatcher(['app/(.*)'])

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