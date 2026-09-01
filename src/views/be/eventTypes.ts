/**
 * Shared event shapes for the Be events UI (Phase 8).
 *
 * `EventSummary` is satisfied by public discovery items (which carry
 * goingCount/interestedCount) and by mine/attending list items (which carry
 * status/publicUrl/media ids but no counts). `EventManage` covers the full
 * records returned by POST /api/v1/events and GET/PUT /api/v1/events/[eventId].
 */
export interface EventSummary {
  id: string
  publicUrl: string
  name: string
  status?: string
  startsAt?: string | null
  endsAt?: string | null
  timezone?: string | null
  coverDocumentId?: string | null
  flierDocumentId?: string | null
  summary?: string | null
  goingCount?: number
  interestedCount?: number
}

export interface EventManage extends EventSummary {
  description?: string | null
  isOnline?: boolean
  onlineUrl?: string | null
  venueName?: string | null
  location?: { name?: string; address?: string; lat?: number; lng?: number; placeId?: string } | null
  capacity?: number | null
  visibility?: string
  ownerType?: string
}

/** Enriched public payload from GET /api/v1/events/public/[publicUrl]. */
export interface EventDetailPayload {
  id: string
  name: string
  publicUrl?: string
  summary?: string | null
  description?: string | null
  startsAt?: string | null
  endsAt?: string | null
  timezone?: string | null
  isOnline?: boolean
  onlineUrl?: string | null
  location?: { name?: string; address?: string; lat?: number; lng?: number; placeId?: string } | null
  venueName?: string | null
  cover?: string | null
  flier?: string | null
  capacity?: number | null
  host?: {
    type?: string
    org?: { name?: string | null; username?: string | null } | null
    profile?: { userName?: string | null } | null
  } | null
  lists?: Array<{ id: string; name: string; publicUrl?: string | null; publicTagline?: string | null }>
  projects?: Array<{ id: string; name: string; username?: string | null }>
  counts?: { going?: number; interested?: number; likes?: number }
  viewer?: { rsvp?: string | null; isLiked?: boolean }
}
