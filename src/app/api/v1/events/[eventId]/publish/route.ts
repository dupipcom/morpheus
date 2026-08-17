/**
 * Event publish API Route Handler (Phase 8)
 *
 * POST: DRAFT → PUBLISHED with validation (name, startsAt, location-or-online,
 * cover). Owner/manager only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { publishEvent } from '@/lib/services/events'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId }, select: { id: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { eventId } = await params
    const role = await getViewerRole(user.id, 'event', eventId)
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return NextResponse.json({ error: 'Only owners and managers can publish this event' }, { status: 403 })
    }

    const event = await publishEvent(eventId)

    return NextResponse.json({ event })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/events/[eventId]/publish:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
