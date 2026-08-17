/**
 * Event RSVP API Route Handler (Phase 8)
 *
 * POST: { status } → idempotent upsert (INTERESTED | GOING; NOT_GOING removes
 * the row). Returns fresh counts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { upsertRsvp } from '@/lib/services/events'

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
    const body = await request.json().catch(() => null)
    const { status } = (body || {}) as Record<string, unknown>

    if (typeof status !== 'string') {
      return NextResponse.json({ error: 'status is required' }, { status: 400 })
    }

    const result = await upsertRsvp({ viewerUserId: user.id, eventId, status })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/events/[eventId]/rsvp:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
