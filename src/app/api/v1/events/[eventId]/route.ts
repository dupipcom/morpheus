/**
 * Event detail API Route Handler (Phase 8)
 *
 * GET: Event detail (owner/manager).
 * PUT: Update event fields (owner/manager).
 * DELETE: Published → CANCELLED (soft); draft → hard delete.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText, sanitizeHTML, sanitizeURL } from '@/lib/utils/sanitize'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { updateEvent, cancelEvent } from '@/lib/services/events'

async function authOwnerManager(
  params: Promise<{ eventId: string }>
): Promise<{ user: { id: string }; eventId: string } | { error: NextResponse }> {
  const { userId } = await auth()
  if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const user = await prisma.user.findUnique({ where: { userId }, select: { id: true } })
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) }

  const { eventId } = await params
  const role = await getViewerRole(user.id, 'event', eventId)
  if (role !== 'OWNER' && role !== 'MANAGER') {
    return { error: NextResponse.json({ error: 'Only owners and managers can manage this event' }, { status: 403 }) }
  }

  return { user, eventId }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await authOwnerManager(params)
    if ('error' in authResult) return authResult.error

    const event = await prisma.event.findUnique({
      where: { id: authResult.eventId },
      include: { rsvps: true, staff: true }
    })
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    return NextResponse.json({ event })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/events/[eventId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await authOwnerManager(params)
    if ('error' in authResult) return authResult.error

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = sanitizeText(body.name.trim())
    if (typeof body.summary === 'string') data.summary = sanitizeText(body.summary)
    if (typeof body.description === 'string') data.description = sanitizeHTML(body.description)
    if (typeof body.startsAt === 'string') data.startsAt = new Date(body.startsAt)
    if (typeof body.endsAt === 'string') data.endsAt = body.endsAt ? new Date(body.endsAt) : null
    if (typeof body.timezone === 'string') data.timezone = body.timezone
    if (typeof body.isOnline === 'boolean') data.isOnline = body.isOnline
    if (typeof body.onlineUrl === 'string') data.onlineUrl = sanitizeURL(body.onlineUrl)
    if (body.location !== undefined) data.location = typeof body.location === 'object' ? body.location : null
    // `!== undefined` semantics: a string sets the field, null/empty clears it
    // (the manage dialog sends null to remove a cover/flier).
    if (body.venueName !== undefined) data.venueName = typeof body.venueName === 'string' ? (body.venueName.trim() ? sanitizeText(body.venueName.trim()) : null) : null
    if (body.coverDocumentId !== undefined) data.coverDocumentId = typeof body.coverDocumentId === 'string' ? body.coverDocumentId : null
    if (body.flierDocumentId !== undefined) data.flierDocumentId = typeof body.flierDocumentId === 'string' ? body.flierDocumentId : null
    if (body.capacity !== undefined) data.capacity = typeof body.capacity === 'number' && body.capacity > 0 ? body.capacity : null
    if (typeof body.visibility === 'string') data.visibility = body.visibility

    const event = await updateEvent(authResult.eventId, data)

    return NextResponse.json({ event })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in PUT /api/v1/events/[eventId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await authOwnerManager(params)
    if ('error' in authResult) return authResult.error

    const event = await cancelEvent(authResult.eventId)

    return NextResponse.json({ success: true, event })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in DELETE /api/v1/events/[eventId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
