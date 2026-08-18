/**
 * Event activity feed API Route Handler (Phase 8)
 *
 * GET: PUBLISHED events visible to the viewer (PUBLIC + FRIENDS +
 * CLOSE_FRIENDS from the viewer's friend lists), prioritized CLOSE_FRIENDS →
 * FRIENDS → PUBLIC. Used by the BeView activity tab.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listFeedEvents } from '@/lib/services/events'

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

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)

    const result = await listFeedEvents(user.id, Number.isNaN(limit) ? 20 : limit)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/events/feed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
