import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const FETCH_TIMEOUT_MS = 10_000
const MAX_LATLNG_RANGE = { lat: 90, lng: 180 }

function getPlacesApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY || ''
  if (!key) {
    throw new ApiError(503, 'PLACES_NOT_CONFIGURED', 'Places not configured')
  }
  return key
}

// In-memory LRU cache (key = lat,lng) — 5-min TTL, cap 200 entries
const cache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 200

function cacheGet(key: string): unknown | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  // LRU touch
  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

function cacheSet(key: string, value: unknown): void {
  cache.delete(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

// Simple per-user rate limit: 30 requests / 10 min (same as autocomplete)
const userTimestamps = new Map<string, number[]>()
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

function enforceRateLimit(userId: string): void {
  const now = Date.now()
  const stamps = (userTimestamps.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (stamps.length >= RATE_LIMIT_MAX) {
    throw new ApiError(429, 'RATE_LIMITED', 'Rate limit exceeded')
  }
  stamps.push(now)
  userTimestamps.set(userId, stamps)
}

function parseCoordinate(value: string | null, max: number): number {
  const num = Number(value)
  if (!Number.isFinite(num) || Math.abs(num) > max) {
    throw new ApiError(400, 'INVALID_COORDINATES', 'Invalid coordinates')
  }
  return num
}

/**
 * GET /api/v1/places/geocode?lat=&lng=
 * Reverse-geocodes a coordinate into enriched place metadata
 * ({ lat, lng, placeId, name, address }) via the Google Geocode API.
 * Server-side only — the API key never reaches the client.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const lat = parseCoordinate(searchParams.get('lat'), MAX_LATLNG_RANGE.lat)
    const lng = parseCoordinate(searchParams.get('lng'), MAX_LATLNG_RANGE.lng)

    const apiKey = getPlacesApiKey() // 503 when unset
    enforceRateLimit(userId)

    const cacheKey = `${lat},${lng}`
    const cached = cacheGet(cacheKey)
    if (cached !== undefined) {
      return NextResponse.json(cached)
    }

    const upstreamParams = new URLSearchParams({ latlng: `${lat},${lng}`, key: apiKey })
    const response = await fetch(`${GEOCODE_URL}?${upstreamParams.toString()}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error('Places geocode upstream status:', response.status)
      throw new ApiError(502, 'UPSTREAM_ERROR', 'Upstream error')
    }

    const data = (await response.json()) as {
      status?: string
      results?: Array<{
        place_id?: string
        formatted_address?: string
        address_components?: Array<{ long_name?: string }>
      }>
    }
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Places geocode upstream status:', data.status)
    }

    // Store the reverse-geocoded data but do NOT invent a place name: the
    // first address component is often just a street number and would read as
    // a misleading place name. The client shows `address` and the user can
    // refine the location through PlacePicker if they want a named place.
    const result = data.results?.[0]
    const payload = result
      ? {
          location: {
            lat,
            lng,
            placeId: result.place_id || undefined,
            address: result.formatted_address || undefined
          }
        }
      : { location: { lat, lng } }

    cacheSet(cacheKey, payload)
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error geocoding place:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
