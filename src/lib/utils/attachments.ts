/**
 * Shared validation helpers for the attachments API surface (server-only).
 * Kept pure (no Prisma/storage imports) so routes can share one contract.
 */
import { ApiError } from '@/lib/services/errors'

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/

/** True for 24-char hex ObjectId strings. */
export function isValidObjectId(id: string): boolean {
  return OBJECT_ID_PATTERN.test(id)
}

/**
 * Parse the canonical attachment location shape ({ lat, lng, placeId?, name?,
 * address? }). Numeric lat/lng are required; anything else throws
 * ApiError(400). Returns undefined for absent/null (the caller decides
 * whether "absent" and "clear" are distinct).
 */
export function parseLocation(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'INVALID_LOCATION', 'location must be an object')
  }
  const location = value as Record<string, unknown>
  if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    throw new ApiError(400, 'INVALID_LOCATION', 'location requires numeric lat and lng')
  }
  return location
}
