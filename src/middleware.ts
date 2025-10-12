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
 
// Basic bot detection using common crawler user-agent substrings
function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false
  const botPatterns = [
    'googlebot', 'bingbot', 'yandex', 'baiduspider', 'duckduckbot', 'slurp', 'sogou', 'exabot', 'facebot', 'ia_archiver',
    'twitterbot', 'facebookexternalhit', 'linkedinbot', 'embedly', 'quora link preview', 'showyoubot', 'outbrain', 'pinterest',
    'redditbot', 'applebot', 'petalbot', 'discordbot', 'telegrambot'
  ]
  const ua = userAgent.toLowerCase()
  return botPatterns.some(p => ua.includes(p))
}

function shouldFlagBotForEnglish(headers: Headers): boolean {
  const userAgent = headers.get('user-agent')
  const acceptLanguage = headers.get('accept-language')
  // Flag well-known crawlers that typically don't send meaningful language,
  // or when accept-language header is missing/empty.
  if (!isBotUserAgent(userAgent)) return false
  if (!acceptLanguage || acceptLanguage.trim().length === 0) return true
  // If present but generic or wildcard, prefer English
  if (acceptLanguage.trim() === '*' ) return true
  return false
}

async function middleware(request: Request, auth: any) {
  const { pathname } = new URL(request.url)

  // Skip API routes
  if(pathname.includes('api')) {
    return
  }

  // Check if user is logged in for root and locale paths
  const { userId } = await auth()
  
  // Handle root path "/" - redirect authenticated users to app profile
  if (pathname === '/') {
    if (userId) {
      const cookieHeader = request.headers.get('cookie') || ''
      const cookies = parseCookies(cookieHeader)
      const locale = getLocale(request.headers, cookies)
      const url = new URL(request.url)
      url.pathname = `/${locale}/app/profile`
      return NextResponse.redirect(url)
    }
  }

  // Handle locale paths "/{locale}" - redirect authenticated users to app profile
  if (pathname.match(/^\/[a-z]{2}$/)) {
    if (userId) {
      const url = new URL(request.url)
      url.pathname = `${pathname}/app/profile`
      return NextResponse.redirect(url)
    }
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
  if (hasLocale) {
    // Optionally tag crawlers to prefer English metadata without changing routing
    if (shouldFlagBotForEnglish(request.headers)) {
      const res = NextResponse.next()
      res.cookies.set('dpip_bot_en', '1', { path: '/', httpOnly: false })
      return res
    }
    return
  }

  // Handle direct username routes (without @) - redirect to localized profile route
  if (pathname.match(/^\/[^\/]+$/) && !pathname.startsWith('/app') && !pathname.startsWith('/api')) {
    const username = pathname.substring(1) // Remove leading /
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = parseCookies(cookieHeader)
    const locale = getLocale(request.headers, cookies)
    const url = new URL(request.url)
    url.pathname = `/${locale}/profile/${username}`
    const res = NextResponse.redirect(url)
    if (shouldFlagBotForEnglish(request.headers)) {
      res.cookies.set('dpip_bot_en', '1', { path: '/', httpOnly: false })
    }
    return res
  }

  // Parse cookies from request
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = parseCookies(cookieHeader)
 
  // For app routes, redirect to localized version
  if (pathname.startsWith('/app/')) {
    const locale = getLocale(request.headers, cookies)
    const url = new URL(request.url)
    url.pathname = `/${locale}${pathname}`
    const res = NextResponse.redirect(url)
    if (shouldFlagBotForEnglish(request.headers)) {
      res.cookies.set('dpip_bot_en', '1', { path: '/', httpOnly: false })
    }
    return res
  }

  // For other routes, redirect to localized version
  const locale = getLocale(request.headers, cookies)
  const url = new URL(request.url)
  url.pathname = `/${locale}${pathname}`

  const res = NextResponse.redirect(url)
  if (shouldFlagBotForEnglish(request.headers)) {
    res.cookies.set('dpip_bot_en', '1', { path: '/', httpOnly: false })
  }
  return res
}

const isProtectedRoute = createRouteMatcher(['app/(.*)'])

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) auth.protect()

  return middleware(req, auth)
})
 
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}