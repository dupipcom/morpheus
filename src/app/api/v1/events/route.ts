/**
 * Events API Route Handler (Phase 8)
 *
 * GET: Management/feed listing (scope=mine | org:<id> | attending, status).
 * POST: Create an event (DRAFT). Body per eventService.CreateEventInput.
 * Ownership: creator is the steward; ORG ownership requires MANAGER+.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText, sanitizeHTML, sanitizeURL } from '@/lib/utils/sanitize'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listEvents, createEvent, EVENT_STATUSES } from '@/lib/services/events'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i
const ALLOWED_VISIBILITIES = ['PUBLIC', 'PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'HIDDEN']

/**
 * GET /api/v1/events
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope')
    const status = searchParams.get('status')
    const cursor = searchParams.get('cursor')
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const result = await listEvents({
      viewerUserId: user.id,
      scope,
      status: status && EVENT_STATUSES.includes(status as (typeof EVENT_STATUSES)[number]) ? status : undefined,
      cursor,
      limit: Number.isNaN(limit) ? 20 : limit
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/events:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/events
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      name, summary, description, startsAt, endsAt, timezone, doorsAt,
      isOnline, onlineUrl, location, venueName, coverDocumentId, flierDocumentId,
      capacity, visibility, listIds, projectIds, categories, tags, ownerType, orgId
    } = body as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (typeof startsAt !== 'string' || isNaN(new Date(startsAt).getTime())) {
      return NextResponse.json({ error: 'startsAt must be a valid date' }, { status: 400 })
    }
    if (visibility !== undefined && (typeof visibility !== 'string' || !ALLOWED_VISIBILITIES.includes(visibility))) {
      return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
    }

    let parsedListIds: string[] | undefined
    if (listIds !== undefined) {
      if (!Array.isArray(listIds) || !listIds.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) {
        return NextResponse.json({ error: 'listIds must be an array of list IDs' }, { status: 400 })
      }
      parsedListIds = listIds as string[]
    }

    let parsedProjectIds: string[] | undefined
    if (projectIds !== undefined) {
      if (!Array.isArray(projectIds) || !projectIds.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) {
        return NextResponse.json({ error: 'projectIds must be an array of project IDs' }, { status: 400 })
      }
      parsedProjectIds = projectIds as string[]
    }

    const event = await createEvent({
      viewerUserId: user.id,
      name: sanitizeText(name.trim()),
      summary: typeof summary === 'string' ? sanitizeText(summary) : null,
      description: typeof description === 'string' ? sanitizeHTML(description) : null,
      startsAt,
      endsAt: typeof endsAt === 'string' ? endsAt : null,
      timezone: typeof timezone === 'string' ? timezone : null,
      doorsAt: typeof doorsAt === 'string' ? doorsAt : null,
      isOnline: isOnline === true,
      onlineUrl: typeof onlineUrl === 'string' ? sanitizeURL(onlineUrl) : null,
      location: location && typeof location === 'object' ? location : null,
      venueName: typeof venueName === 'string' ? sanitizeText(venueName) : null,
      coverDocumentId: typeof coverDocumentId === 'string' ? coverDocumentId : null,
      flierDocumentId: typeof flierDocumentId === 'string' ? flierDocumentId : null,
      capacity: typeof capacity === 'number' && capacity > 0 ? capacity : null,
      visibility: typeof visibility === 'string' ? (visibility as 'PUBLIC' | 'PRIVATE' | 'FRIENDS' | 'CLOSE_FRIENDS' | 'HIDDEN') : undefined,
      listIds: parsedListIds,
      projectIds: parsedProjectIds,
      categories: Array.isArray(categories) ? categories.filter((c): c is string => typeof c === 'string') : undefined,
      tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : undefined,
      ownerType: ownerType === 'ORG' ? 'ORG' : undefined,
      orgId: typeof orgId === 'string' ? orgId : null
    })

    return NextResponse.json({ event })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/events:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
