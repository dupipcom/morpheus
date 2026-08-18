import { NextResponse } from "next/server";
import { locales, defaultLocale } from './app/constants'
import { pathHasLocale } from './app/helpers'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { getBestLocale } from '@/lib/i18n'
import { parseCookies } from '@/lib/utils/localeUtils'

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

const PROFILE_OK_COOKIE = 'dpip_profile_ok'
const PROFILE_OK_TTL_SECONDS = 60 * 60 * 24 // 24h

/**
 * Fire-and-forget call to the Node-runtime bootstrap route so a `User` +
 * `Profile` are guaranteed to exist for a freshly signed-in Clerk user.
 * Prisma cannot run in edge middleware, so we hop to a Node route while
 * forwarding the caller's cookies so Clerk `auth()` resolves the same user.
 */
function ensureProfileBootstrap(request: Request) {
  try {
    const origin = new URL(request.url).origin
    const cookie = request.headers.get('cookie') || ''
    // No await: we set the cookie synchronously so subsequent requests skip.
    // The layout backstop covers the race for this same request.
    void fetch(`${origin}/api/v1/user/ensure`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      // Node runtime routes are fine with keepalive here.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Never let bootstrap failures block a request.
  }
}

function withProfileOkCookie(response: NextResponse): NextResponse {
  response.cookies.set(PROFILE_OK_COOKIE, '1', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: PROFILE_OK_TTL_SECONDS,
  })
  return response
}

async function middleware(request: Request, auth: any) {
  const { pathname } = new URL(request.url)

  // Skip API routes
  if(pathname.includes('api')) {
    return
  }

  if(pathname.includes('sitemap.xml')) {
    return NextResponse.next()
  }

  // Check if user is logged in for root and locale paths
  const { userId } = await auth()

  // Middleware-layer enforcement: guarantee a User + Profile exist for every
  // authenticated visitor. Cookie-gated so we only pay the round-trip once
  // per session (or until the TTL expires).
  const cookieHeaderForBootstrap = request.headers.get('cookie') || ''
  const parsedForBootstrap = parseCookies(cookieHeaderForBootstrap)
  const needsProfileBootstrap = !!userId && parsedForBootstrap[PROFILE_OK_COOKIE] !== '1'
  if (needsProfileBootstrap) {
    ensureProfileBootstrap(request)
  }
  
  // Handle root path "/" - redirect authenticated users to app profile
  if (pathname === '/') {
    if (userId) {
      const cookieHeader = request.headers.get('cookie') || ''
      const cookies = parseCookies(cookieHeader)
      const locale = getLocale(request.headers, cookies)
      const url = new URL(request.url)
      url.pathname = `/${locale}/app/profile`
      const res = NextResponse.redirect(url)
      return needsProfileBootstrap ? withProfileOkCookie(res) : res
    }
  }

  // Handle locale paths "/{locale}" - redirect authenticated users to app profile
  if (pathname.match(/^\/[a-z]{2}$/)) {
    if (userId) {
      const url = new URL(request.url)
      url.pathname = `${pathname}/app/profile`
      const res = NextResponse.redirect(url)
      return needsProfileBootstrap ? withProfileOkCookie(res) : res
    }
  }

  // Handle @username routes - resolve across the shared /@ namespace (users,
  // orgs, projects — Phase 5/7) and redirect to the localized route. Prisma
  // cannot run in edge middleware, so the lookup hops to the Node-runtime
  // /api/v1/resolve-handle route (same pattern as ensureProfileBootstrap);
  // an unknown handle falls back to the profile route, which 404s.
  if (pathname.startsWith('/@')) {
    const username = pathname.substring(2) // Remove /@
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = parseCookies(cookieHeader)
    const locale = getLocale(request.headers, cookies)

    let targetPath = `/${locale}/profile/${username}`
    const handle = username.split('/')[0]
    if (handle) {
      try {
        const origin = new URL(request.url).origin
        const lookup = await fetch(`${origin}/api/v1/resolve-handle?handle=${encodeURIComponent(handle)}`, {
          signal: AbortSignal.timeout(3000)
        })
        if (lookup.ok) {
          const data = (await lookup.json()) as { kind?: string }
          if (data.kind === 'org') targetPath = `/${locale}/o/${handle}`
          else if (data.kind === 'project') targetPath = `/${locale}/p/${handle}`
        }
      } catch (error) {
        // Best-effort: fall back to the profile route (which 404s if unknown)
        console.error('[middleware] /@ handle resolution failed:', error)
      }
    }

    const url = new URL(request.url)
    url.pathname = targetPath
    const res = NextResponse.redirect(url)
    return needsProfileBootstrap ? withProfileOkCookie(res) : res
  }

  const hasLocale = pathHasLocale(pathname)
 
  // If path already has locale, let it through
  if (hasLocale) {
    // Optionally tag crawlers to prefer English metadata without changing routing
    if (shouldFlagBotForEnglish(request.headers)) {
      const res = NextResponse.next()
      res.cookies.set('dpip_bot_en', '1', { path: '/', httpOnly: false })
      return needsProfileBootstrap ? withProfileOkCookie(res) : res
    }
    if (needsProfileBootstrap) {
      return withProfileOkCookie(NextResponse.next())
    }
    return
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
    return needsProfileBootstrap ? withProfileOkCookie(res) : res
  }

  // For other routes, redirect to localized version
  const locale = getLocale(request.headers, cookies)
  const url = new URL(request.url)
  url.pathname = `/${locale}${pathname}`

  const res = NextResponse.redirect(url)
  if (shouldFlagBotForEnglish(request.headers)) {
    res.cookies.set('dpip_bot_en', '1', { path: '/', httpOnly: false })
  }
  return needsProfileBootstrap ? withProfileOkCookie(res) : res
}

const isProtectedRoute = createRouteMatcher(['app/(.*)'])

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) auth.protect()

  return middleware(req, auth)
})
 
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|sitemap)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}