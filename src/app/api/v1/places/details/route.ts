import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'

// Places API (New) place details — the legacy maps.googleapis.com
// place/details endpoint rejects HTTP-referer-restricted API keys and is
// discontinued by Google, so the proxy speaks the New API (GET /v1/places/{id}).
const PLACES_DETAILS_URL = 'https://places.googleapis.com/v1/places'
// New API requires an explicit field mask. Validated against the live API:
// the paths are the bare Place field names (`id,displayName,...` — the
// `places.`-prefixed forms from the docs are rejected by mask validation).
const PLACES_FIELD_MASK = 'id,displayName,formattedAddress,location'
const FETCH_TIMEOUT_MS = 10_000
// New API place IDs are long encodings (150+ chars common) — generous cap.
const MAX_PLACE_ID_LENGTH = 500
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

/**
 * The API key is HTTP-referer restricted, so the server-side upstream call
 * must echo the browser's referer (it has none of its own). Falls back to
 * Origin. Missing both → Google rejects the key on the referer check.
 */
function getUpstreamReferer(request: NextRequest): string | null {
  return request.headers.get('referer') || request.headers.get('origin')
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
      throw new ApiError(400, 'INVALID_PLACE_ID', 'placeId must be between 1 and 500 characters')
    }
    const sessionToken = (searchParams.get('sessionToken') || '').slice(0, MAX_SESSION_TOKEN_LENGTH)

    const apiKey = getPlacesApiKey() // 503 when GOOGLE_PLACES_API_KEY is unset

    const cached = cacheGet(placeId)
    if (cached) {
      return NextResponse.json({ location: cached })
    }

    const upstreamUrl = new URL(`${PLACES_DETAILS_URL}/${encodeURIComponent(placeId)}`)
    if (sessionToken) upstreamUrl.searchParams.set('sessionToken', sessionToken)

    const headers: Record<string, string> = {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    }
    const referer = getUpstreamReferer(request)
    if (referer) headers['Referer'] = referer

    const response = await fetch(upstreamUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (response.status === 404) {
      console.error('Places details upstream: place not found')
      throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found')
    }
    if (!response.ok) {
      const errData = (await response.json().catch(() => null)) as {
        error?: { status?: string; message?: string }
      } | null
      console.error(
        'Places details upstream error:',
        response.status,
        errData?.error?.status,
        errData?.error?.message
      )
      throw new ApiError(502, 'UPSTREAM_ERROR', 'Upstream error')
    }

    const data = (await response.json()) as {
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
    }

    const lat = data.location?.latitude
    const lng = data.location?.longitude
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      console.error('Places details upstream: missing location for placeId')
      throw new ApiError(404, 'PLACE_NOT_FOUND', 'Place not found')
    }

    const location: PlaceLocation = {
      lat,
      lng,
      placeId,
      name: data.displayName?.text || undefined,
      address: data.formattedAddress || undefined,
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
