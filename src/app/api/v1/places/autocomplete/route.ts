import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'

// Places API (New) autocomplete — the legacy maps.googleapis.com
// place/autocomplete endpoint rejects HTTP-referer-restricted API keys and is
// discontinued by Google, so the proxy speaks the New API (POST place:autocomplete).
const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete'
// New API requires an explicit field mask; placeId/text are used for the list.
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress'
const FETCH_TIMEOUT_MS = 10_000
const MAX_INPUT_LENGTH = 200
const MAX_SESSION_TOKEN_LENGTH = 100
const MAX_PREDICTIONS = 5
const CACHE_CAP = 200
const CACHE_TTL_MS = 5 * 60 * 1000
const RATE_MAX_REQUESTS = 30
const RATE_WINDOW_MS = 10 * 60 * 1000

export interface PlacePrediction {
  placeId: string
  description: string
}

// In-memory LRU cache. Key = `${input}|${sessionToken}`.
const cache = new Map<string, { predictions: PlacePrediction[]; expiresAt: number }>()
// Per-user request timestamps (ms) for rate limiting.
const rateTimestamps = new Map<string, number[]>()

/** GOOGLE_PLACES_API_KEY is server-only; it is read here and never returned or logged. */
function getPlacesApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    throw new ApiError(503, 'PLACES_NOT_CONFIGURED', 'Places not configured')
  }
  return key
}

function cacheGet(key: string): PlacePrediction[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  // Touch: move to the end so eviction favours least recently used
  cache.delete(key)
  cache.set(key, entry)
  return entry.predictions
}

function cacheSet(key: string, predictions: PlacePrediction[]): void {
  const now = Date.now()
  // Prune expired entries
  for (const [k, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(k)
  }
  // Evict oldest (first inserted) when over capacity
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { predictions, expiresAt: now + CACHE_TTL_MS })
}

function enforceRateLimit(userId: string): void {
  const now = Date.now()
  const recent = (rateTimestamps.get(userId) || []).filter((ts) => now - ts < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX_REQUESTS) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests')
  }
  recent.push(now)
  rateTimestamps.set(userId, recent)
}

/**
 * The API key is HTTP-referer restricted, so the server-side upstream call
 * must echo the browser's referer (it has none of its own). Falls back to
 * Origin. Missing both → Google rejects the key on the referer check.
 */
function getUpstreamReferer(request: NextRequest): string | null {
  return request.headers.get('referer') || request.headers.get('origin')
}

// GET /api/v1/places/autocomplete?input=&sessionToken=
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const input = (searchParams.get('input') || '').trim()
    if (input.length < 1 || input.length > MAX_INPUT_LENGTH) {
      throw new ApiError(400, 'INVALID_INPUT', 'Input must be between 1 and 200 characters')
    }
    const sessionToken = (searchParams.get('sessionToken') || '').slice(0, MAX_SESSION_TOKEN_LENGTH)

    const apiKey = getPlacesApiKey() // 503 when GOOGLE_PLACES_API_KEY is unset
    enforceRateLimit(userId)

    const cacheKey = `${input}|${sessionToken}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      return NextResponse.json({ predictions: cached })
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    }
    const referer = getUpstreamReferer(request)
    if (referer) headers['Referer'] = referer

    const body: { input: string; sessionToken?: string } = { input }
    if (sessionToken) body.sessionToken = sessionToken

    const response = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      const errData = (await response.json().catch(() => null)) as {
        error?: { status?: string; message?: string }
      } | null
      console.error(
        'Places autocomplete upstream error:',
        response.status,
        errData?.error?.status,
        errData?.error?.message
      )
      throw new ApiError(502, 'UPSTREAM_ERROR', 'Upstream error')
    }

    const data = (await response.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string
          text?: { text?: string }
          structuredFormat?: { mainText?: { text?: string } }
        }
      }>
    }
    const predictions: PlacePrediction[] = (data.suggestions || [])
      .map((s) => {
        const p = s.placePrediction
        return {
          placeId: p?.placeId || '',
          description: p?.text?.text || p?.structuredFormat?.mainText?.text || ''
        }
      })
      .filter((p) => p.placeId && p.description)
      .slice(0, MAX_PREDICTIONS)

    cacheSet(cacheKey, predictions)

    return NextResponse.json({ predictions })
  } catch (error) {
    console.error('Error in GET /api/v1/places/autocomplete:', error)
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
