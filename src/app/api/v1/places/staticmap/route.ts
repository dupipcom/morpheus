import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'

const STATIC_MAP_URL = 'https://maps.googleapis.com/maps/api/staticmap'
const FETCH_TIMEOUT_MS = 10_000
const DEFAULT_SIZE = '640x360'
const ALLOWED_SIZES = new Set([DEFAULT_SIZE])
const DEFAULT_ZOOM = 14
const MIN_ZOOM = 1
const MAX_ZOOM = 20
const RATE_MAX_REQUESTS = 30
const RATE_WINDOW_MS = 10 * 60 * 1000

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

function enforceRateLimit(userId: string): void {
  const now = Date.now()
  const recent = (rateTimestamps.get(userId) || []).filter((ts) => now - ts < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX_REQUESTS) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests')
  }
  recent.push(now)
  rateTimestamps.set(userId, recent)
}

// GET /api/v1/places/staticmap?lat=&lng=&zoom=&size=
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const lat = parseFloat(searchParams.get('lat') || '')
    const lng = parseFloat(searchParams.get('lng') || '')
    if (isNaN(lat) || lat < -90 || lat > 90) {
      throw new ApiError(400, 'INVALID_LAT', 'lat must be between -90 and 90')
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      throw new ApiError(400, 'INVALID_LNG', 'lng must be between -180 and 180')
    }

    const rawZoom = searchParams.get('zoom')
    let zoom = DEFAULT_ZOOM
    if (rawZoom !== null) {
      zoom = parseFloat(rawZoom)
      if (isNaN(zoom)) {
        throw new ApiError(400, 'INVALID_ZOOM', 'zoom must be a number')
      }
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)))
    }

    const rawSize = searchParams.get('size')
    const size = rawSize === null ? DEFAULT_SIZE : rawSize
    if (!ALLOWED_SIZES.has(size)) {
      throw new ApiError(400, 'INVALID_SIZE', 'size must be 640x360')
    }

    const apiKey = getPlacesApiKey() // 503 when GOOGLE_PLACES_API_KEY is unset
    enforceRateLimit(userId)

    const upstreamParams = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: String(zoom),
      size,
      markers: `color:red|${lat},${lng}`,
      key: apiKey,
    })

    const response = await fetch(`${STATIC_MAP_URL}?${upstreamParams.toString()}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error('Places staticmap upstream status:', response.status)
      throw new ApiError(502, 'UPSTREAM_ERROR', 'Upstream error')
    }

    const body = new Uint8Array(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') || 'image/png'

    // The API key stays server-side; the client only ever sees the image bytes.
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/v1/places/staticmap:', error)
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
