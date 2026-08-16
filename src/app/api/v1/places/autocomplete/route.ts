import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'

const PLACES_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
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

    const upstreamParams = new URLSearchParams({ input, key: apiKey })
    if (sessionToken) upstreamParams.set('sessiontoken', sessionToken)

    const response = await fetch(`${PLACES_AUTOCOMPLETE_URL}?${upstreamParams.toString()}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error('Places autocomplete upstream status:', response.status)
      throw new ApiError(502, 'UPSTREAM_ERROR', 'Upstream error')
    }

    const data = (await response.json()) as {
      status?: string
      predictions?: Array<{ place_id?: string; description?: string }>
    }
    if (data.status && data.status !== 'OK') {
      console.error('Places autocomplete upstream status:', data.status)
    }
    const predictions: PlacePrediction[] = (data.predictions || [])
      .map((p) => ({ placeId: p.place_id || '', description: p.description || '' }))
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
