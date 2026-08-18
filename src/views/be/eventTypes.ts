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
  location?: { name?: string; address?: string; lat?: number; lng?: number } | null
  capacity?: number | null
  visibility?: string
  ownerType?: string
}
