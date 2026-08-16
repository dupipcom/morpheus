import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'

const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'
const PLACE_DETAILS_FIELDS = 'geometry,name,formatted_address'
const FETCH_TIMEOUT_MS = 10_000
const MAX_PLACE_ID_LENGTH = 200
const MAX_SESSION_TOKEN_LENGTH = 100
const CACHE_CAP = 200
const CACHE_TTL_MS = 5 * 60 * 1000

export interface PlaceLocation {
  lat: number
  lng: number
  placeId?: string
  name?: string
  address?: string
}

// In-memory LRU cache. Key = placeId (per the plan; the sessionToken is
// optional and not part of the key).
const cache = new Map<string, { location: PlaceLocation; expiresAt: number }>()

/** GOOGLE_PLACES_API_KEY is server-only; it is read here and never returned or logged. */
function getPlacesApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    throw new ApiError(503, 'PLACES_NOT_CONFIGURED', 'Places not configured')
  }
  return key
}

function cacheGet(key: string): PlaceLocation | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  // Touch: move to the end so eviction favours least recently used
  cache.delete(key)
  cache.set(key, entry)
  return entry.location
}

function cacheSet(key: string, location: PlaceLocation): void {
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
  cache.set(key, { location, expiresAt: now + CACHE_TTL_MS })
}

// GET /api/v1/places/details?placeId=&sessionToken=
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const placeId = (searchParams.get('placeId') || '').trim()
    if (placeId.length < 1 || placeId.length > MAX_PLACE_ID_LENGTH) {
      throw new ApiError(400, 'INVALID_PLACE_ID', 'placeId is required')
    }
    const sessionToken = (searchParams.get('sessionToken') || '').slice(0, MAX_SESSION_TOKEN_LENGTH)

    const apiKey = getPlacesApiKey() // 503 when GOOGLE_PLACES_API_KEY is unset

    const cached = cacheGet(placeId)
    if (cached) {
      return NextResponse.json({ location: cached })
    }

    const upstreamParams = new URLSearchParams({
      place_id: placeId,
      fields: PLACE_DETAILS_FIELDS,
      key: apiKey,
    })
    if (sessionToken) upstreamParams.set('sessiontoken', sessionToken)

    const response = await fetch(`${PLACES_DETAILS_URL}?${upstreamParams.toString()}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error('Places details upstream status:', response.status)
      throw new ApiError(502, 'UPSTREAM_ERROR', 'Upstream error')
    }

    const data = (await response.json()) as {
      status?: string
      result?: {
        geometry?: { location?: { lat?: number; lng?: number } }
        name?: string
        formatted_address?: string
      }
    }

    const result = data.result
    const lat = result?.geometry?.location?.lat
    const lng = result?.geometry?.location?.lng
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      console.error('Places details upstream status:', data.status || 'NO_RESULT')
      throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found')
    }

    const location: PlaceLocation = {
      lat,
      lng,
      placeId,
      name: result?.name || undefined,
      address: result?.formatted_address || undefined,
    }

    cacheSet(placeId, location)

    return NextResponse.json({ location })
  } catch (error) {
    console.error('Error in GET /api/v1/places/details:', error)
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
