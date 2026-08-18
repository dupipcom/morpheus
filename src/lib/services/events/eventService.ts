/**
 * Events Service (Phase 8)
 *
 * Public `Event` entity: pages, discovery, RSVP, list/project links, staff,
 * likes and notes-as-comments discussion. Ticketing is deliberately NOT here
 * (Phase 9). Life events moved to `LifeEvent` (migration 0027) and their API
 * to `/api/v1/life-events`.
 *
 * Ownership: USER or ORG (Phase 7) via ownerType/orgId; the ownership kit's
 * ORG branch applies unchanged. Counts are computed with batched groupBy,
 * never per-card.
 */

import prisma from '@/lib/prisma'
import { ApiError } from '@/lib/services/errors'
import { slugify, ensureUniqueSlug } from '@/lib/public/slug'
import { getLikeState, getCounts } from '@/lib/services/social'
import { getCurrentUser, batchEnrichUserProfiles } from '@/lib/services/visibility'
import { assertOrgManagerRole } from '@/lib/services/org'

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'] as const
const RSVP_STATUSES = ['INTERESTED', 'GOING', 'NOT_GOING'] as const
const STAFF_ROLES = ['SCANNER', 'MANAGER'] as const

/** Slug for an event: slugify(name)-<id4>, always generated at creation. */
async function generateEventPublicUrl(name: string, id: string): Promise<string> {
  const base = `${slugify(name)}-${id.slice(-4)}`
  return ensureUniqueSlug(base, async (candidate) => {
    const existing = await prisma.event.findUnique({ where: { publicUrl: candidate }, select: { id: true } })
    return Boolean(existing)
  })
}

export interface CreateEventInput {
  viewerUserId: string // internal user id (creator/steward)
  name: string
  summary?: string | null
  description?: string | null
  startsAt: string | Date
  endsAt?: string | Date | null
  timezone?: string | null
  doorsAt?: string | Date | null
  isOnline?: boolean
  onlineUrl?: string | null
  location?: unknown
  venueName?: string | null
  coverDocumentId?: string | null
  flierDocumentId?: string | null
  capacity?: number | null
  visibility?: 'PUBLIC' | 'PRIVATE' | 'FRIENDS' | 'CLOSE_FRIENDS' | 'HIDDEN'
  listIds?: string[]
  projectIds?: string[]
  categories?: string[]
  tags?: string[]
  ownerType?: 'USER' | 'ORG'
  orgId?: string | null
}

/**
 * Create an event (DRAFT). Generates publicUrl, creates the proceeds wallet
 * (kind EVENT), honours ownerType/orgId (ORG requires MANAGER+ — enforced by
 * the route via assertOrgManagerRole).
 */
export async function createEvent(input: CreateEventInput) {
  if (input.ownerType === 'ORG' && input.orgId) {
    await assertOrgManagerRole(input.viewerUserId, input.orgId)
  }

  const event = await prisma.event.create({
    data: {
      name: input.name,
      publicUrl: `pending-${Date.now()}`, // placeholder replaced below (unique index)
      summary: input.summary ?? null,
      description: input.description ?? null,
      status: 'DRAFT',
      visibility: input.visibility ?? 'PRIVATE',
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      timezone: input.timezone || 'UTC',
      doorsAt: input.doorsAt ? new Date(input.doorsAt) : null,
      isOnline: input.isOnline ?? false,
      onlineUrl: input.onlineUrl ?? null,
      location: input.location ?? null,
      venueName: input.venueName ?? null,
      coverDocumentId: input.coverDocumentId ?? null,
      flierDocumentId: input.flierDocumentId ?? null,
      capacity: input.capacity ?? null,
      currency: 'DPIP',
      ownerType: input.ownerType === 'ORG' ? 'ORG' : 'USER',
      orgId: input.ownerType === 'ORG' ? input.orgId ?? null : null,
      userId: input.viewerUserId,
      listIds: input.listIds ?? [],
      projectIds: input.projectIds ?? [],
      categories: (input.categories as never) ?? ([] as never),
      tags: input.tags ?? []
    }
  })

  const publicUrl = await generateEventPublicUrl(event.name, event.id)
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { publicUrl }
  })

  // Proceeds wallet (kind EVENT)
  await prisma.wallet.create({
    data: {
      userId: input.viewerUserId,
      name: `${event.name} wallet`,
      kind: 'EVENT',
      ownerType: input.ownerType === 'ORG' ? 'ORG' : 'USER',
      orgId: input.ownerType === 'ORG' ? input.orgId ?? null : null,
      eventId: event.id,
      balance: 0,
      pendingBalance: 0,
      address: null
    }
  }).catch((error) => console.error('Error creating event wallet:', error))

  return updated
}

/**
 * Update event fields (OWNER/MANAGER via the ownership kit, done in routes).
 */
export async function updateEvent(eventId: string, data: Record<string, unknown>) {
  const existing = await prisma.event.findUnique({ where: { id: eventId } })
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  }

  const update: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) update[key] = value
  }

  return prisma.event.update({ where: { id: eventId }, data: update })
}

/**
 * DRAFT → PUBLISHED with validation (name, startsAt, location-or-online).
 * A cover is optional — publishing must not be blocked on an attachment.
 */
export async function publishEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  }

  const problems: string[] = []
  if (!event.name?.trim()) problems.push('name')
  if (!event.startsAt) problems.push('startsAt')
  if (!event.isOnline && !event.location) problems.push('location (or isOnline)')
  if (problems.length > 0) {
    throw new ApiError(400, 'VALIDATION', `Cannot publish — missing: ${problems.join(', ')}`)
  }

  return prisma.event.update({
    where: { id: eventId },
    data: { status: 'PUBLISHED' }
  })
}

/**
 * Management/feed listing: scope=mine | org:<id> | attending; filters.
 */
export async function listEvents(params: {
  viewerUserId: string
  scope?: string | null
  status?: string | null
  cursor?: string | null
  limit?: number
}) {
  const { viewerUserId, scope, status, cursor, limit = 20 } = params
  const take = Math.min(limit, 50)

  const where: Record<string, unknown> = {}
  if (scope === 'attending') {
    where.rsvps = { some: { userId: viewerUserId, status: { in: ['GOING', 'INTERESTED'] } } }
  } else if (scope?.startsWith('org:')) {
    where.ownerType = 'ORG'
    where.orgId = scope.slice(4)
  } else {
    where.OR = [{ userId: viewerUserId }, { ownerType: 'ORG', orgId: { in: await viewerOrgIds(viewerUserId) } }]
  }
  if (status) where.status = status

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: 'asc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  const hasMore = events.length > take
  const items = hasMore ? events.slice(0, take) : events

  return { events: items, nextCursor: hasMore ? items[items.length - 1].id : null }
}

async function viewerOrgIds(viewerUserId: string): Promise<string[]> {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: viewerUserId },
    select: { orgId: true }
  })
  return memberships.map((m) => m.orgId)
}

/**
 * Public discovery: PUBLISHED + visibility PUBLIC only; near=lat,lng,radiusKm
 * filters by bounding box computed server-side; ?project= filters by project.
 */
export async function listPublicEvents(params: {
  from?: string | null
  to?: string | null
  q?: string | null
  near?: string | null
  category?: string | null
  project?: string | null
  cursor?: string | null
  limit?: number
}) {
  const { from, to, q, near, category, project, cursor, limit = 20 } = params
  const take = Math.min(limit, 50)

  const where: Record<string, unknown> = { status: 'PUBLISHED', visibility: 'PUBLIC' }
  if (from) where.startsAt = { gte: new Date(from) }
  if (to) where.startsAt = { ...(where.startsAt as object), lte: new Date(to) }
  if (q?.trim()) where.name = { contains: q.trim() }
  if (category) where.categories = { has: category }
  if (project) where.projectIds = { has: project }
  if (near) {
    const [lat, lng, radiusKm] = near.split(',').map(Number)
    if (!isNaN(lat) && !isNaN(lng) && !isNaN(radiusKm) && radiusKm > 0) {
      const deltaLat = radiusKm / 111
      const deltaLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))
      where.location = {
        lat: { gte: lat - deltaLat, lte: lat + deltaLat },
        lng: { gte: lng - deltaLng, lte: lng + deltaLng }
      }
    }
  }

  const events = await prisma.event.findMany({
    where,
    select: {
      id: true, name: true, publicUrl: true, summary: true, startsAt: true, endsAt: true,
      timezone: true, isOnline: true, location: true, venueName: true,
      coverDocumentId: true, categories: true, ownerType: true, orgId: true, userId: true
    },
    orderBy: { startsAt: 'asc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  const hasMore = events.length > take
  const items = hasMore ? events.slice(0, take) : events

  const counts = await batchRsvpCounts(items.map((e) => e.id))

  return {
    events: items.map((event) => ({
      ...event,
      goingCount: counts[event.id]?.GOING ?? 0,
      interestedCount: counts[event.id]?.INTERESTED ?? 0
    })),
    nextCursor: hasMore ? items[items.length - 1].id : null
  }
}

async function batchRsvpCounts(eventIds: string[]): Promise<Record<string, Record<string, number>>> {
  if (eventIds.length === 0) return {}
  const grouped = await prisma.eventRsvp.groupBy({
    by: ['eventId', 'status'],
    where: { eventId: { in: eventIds } },
    _count: { _all: true }
  })
  const counts: Record<string, Record<string, number>> = {}
  for (const group of grouped) {
    counts[group.eventId] = counts[group.eventId] ?? {}
    counts[group.eventId][group.status] = group._count._all
  }
  return counts
}

/**
 * Public event payload (allowlist projection) + viewer block when
 * authenticated. 404 unless PUBLISHED + visibility PUBLIC.
 */
export async function getPublicEvent(publicUrl: string, viewerUserId: string | null) {
  const event = await prisma.event.findUnique({
    where: { publicUrl },
    include: {
      rsvps: { select: { id: true, status: true, userId: true } },
      lists: {
        where: { publicVisible: true, visibility: 'PUBLIC' },
        select: { id: true, name: true, publicUrl: true, publicTagline: true }
      },
      projects: {
        where: { publicVisible: true },
        select: { id: true, name: true, username: true }
      }
    }
  })
  if (!event || event.status !== 'PUBLISHED' || event.visibility !== 'PUBLIC') {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  }

  const currentUser = await getCurrentUser(viewerUserId)
  const viewerInternalId = currentUser?.id ?? null

  const likeState = await getLikeState(viewerUserId, 'event', event.id)
  const goingCount = event.rsvps.filter((r) => r.status === 'GOING').length
  const interestedCount = event.rsvps.filter((r) => r.status === 'INTERESTED').length
  const viewerRsvp = viewerInternalId
    ? event.rsvps.find((r) => r.userId === viewerInternalId)?.status ?? null
    : null

  const [hostProfiles, org] = await Promise.all([
    batchEnrichUserProfiles([event.userId], currentUser),
    event.ownerType === 'ORG' && event.orgId
      ? prisma.organization.findUnique({
          where: { id: event.orgId },
          select: { id: true, name: true, username: true, imageUrl: true }
        })
      : Promise.resolve(null)
  ])

  return {
    id: event.id,
    name: event.name,
    publicUrl: event.publicUrl,
    summary: event.summary,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    doorsAt: event.doorsAt,
    isOnline: event.isOnline,
    onlineUrl: event.onlineUrl,
    location: event.location,
    venueName: event.venueName,
    cover: event.coverDocumentId,
    flier: event.flierDocumentId,
    capacity: event.capacity,
    currency: event.currency,
    ownerType: event.ownerType,
    host: event.ownerType === 'ORG' ? { type: 'ORG', org } : {
      type: 'USER',
      profile: hostProfiles.get(event.userId)?.profile ?? null
    },
    lists: event.lists,
    projects: event.projects,
    categories: event.categories,
    tags: event.tags,
    counts: {
      going: goingCount,
      interested: interestedCount,
      likes: likeState.likeCount
    },
    viewer: {
      rsvp: viewerRsvp,
      isLiked: likeState.isLiked
    }
  }
}

/**
 * RSVP upsert (idempotent toggles: re-sending the same status is a no-op;
 * sending NOT_GOING removes the RSVP row).
 */
export async function upsertRsvp(params: { viewerUserId: string; eventId: string; status: string }) {
  const { viewerUserId, eventId, status } = params

  if (!RSVP_STATUSES.includes(status as (typeof RSVP_STATUSES)[number])) {
    throw new ApiError(400, 'VALIDATION', `status must be one of ${RSVP_STATUSES.join(', ')}`)
  }

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  }

  if (status === 'NOT_GOING') {
    await prisma.eventRsvp.deleteMany({ where: { eventId, userId: viewerUserId } })
  } else {
    await prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId: viewerUserId } },
      update: { status },
      create: { eventId, userId: viewerUserId, status }
    })
  }

  const counts = await batchRsvpCounts([eventId])
  return {
    status,
    goingCount: counts[eventId]?.GOING ?? 0,
    interestedCount: counts[eventId]?.INTERESTED ?? 0
  }
}

/** Link/unlink a list (m:m). */
export async function setListLink(eventId: string, listId: string, linked: boolean) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { listIds: true } })
  if (!event) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  const listIds = linked
    ? [...new Set([...event.listIds, listId])]
    : event.listIds.filter((id) => id !== listId)
  await prisma.event.update({ where: { id: eventId }, data: { listIds } })
}

/** Link/unlink a project (m:m). */
export async function setProjectLink(eventId: string, projectId: string, linked: boolean) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { projectIds: true } })
  if (!event) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  const projectIds = linked
    ? [...new Set([...event.projectIds, projectId])]
    : event.projectIds.filter((id) => id !== projectId)
  await prisma.event.update({ where: { id: eventId }, data: { projectIds } })
}

/** Staff management (door/gate permissions, used by Phase 10). */
export async function setStaff(eventId: string, staffUserId: string, role: string, present: boolean) {
  if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
    throw new ApiError(400, 'VALIDATION', `role must be one of ${STAFF_ROLES.join(', ')}`)
  }
  if (present) {
    await prisma.eventStaff.upsert({
      where: { eventId_userId: { eventId, userId: staffUserId } },
      update: { role },
      create: { eventId, userId: staffUserId, role }
    })
  } else {
    await prisma.eventStaff.deleteMany({ where: { eventId, userId: staffUserId } })
  }
}

/** DELETE on a published event → soft CANCELLED, never a hard delete. */
export async function cancelEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  if (event.status === 'PUBLISHED') {
    return prisma.event.update({
      where: { id: eventId },
      data: { status: 'CANCELLED' }
    })
  }
  await prisma.event.delete({ where: { id: eventId } })
  return null
}
