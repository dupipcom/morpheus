/**
 * Internal fetch kit for public pages
 * Shared base-URL + x-internal-fetch-secret + React.cache() logic,
 * previously inlined in profile/[userName]/page.tsx and magazine/[articleslug]/page.tsx
 */
import { cache } from 'react'

function getInternalBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function buildInternalFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (process.env.INTERNAL_FETCH_SECRET) {
    headers['x-internal-fetch-secret'] = process.env.INTERNAL_FETCH_SECRET
  }
  return headers
}

/**
 * Fetch an endpoint of the same app (using the internal secret to bypass the
 * public router), returning the parsed JSON body or null on any failure.
 */
async function internalGetJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${getInternalBaseUrl()}${path}`, {
      headers: buildInternalFetchHeaders(),
    })

    if (!response.ok) {
      return null
    }

    // Check if response is actually JSON before parsing
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      return null
    }

    return (await response.json()) as T
  } catch (error) {
    // Silently fail during build - data is optional
    if (process.env.NODE_ENV === 'development') {
      console.error(`Error fetching ${path}:`, error)
    }
    return null
  }
}

/**
 * React.cache()-wrapped version: identical calls within the same render pass
 * are deduped (e.g. the profile fetch between generateMetadata and the page).
 */
export const cachedInternalGet: <T>(path: string) => Promise<T | null> = cache(internalGetJson)
