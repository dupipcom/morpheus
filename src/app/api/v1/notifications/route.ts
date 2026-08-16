/**
 * Notifications API Route Handler
 *
 * GET: List the current user's notifications, newest first (last 30),
 *      with unread count.
 * POST: Mark notifications as read (given ids, or all when omitted).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listNotifications, markNotificationsRead } from '@/lib/services/notification'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * GET /api/v1/notifications
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

    const result = await listNotifications({ userId: user.id, take: 30 })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/notifications (mark read)
 * Body: { ids?: string[] } — 24-hex notification ObjectIds.
 * Marks the given notifications as read; without `ids`, marks all of the
 * user's unread notifications. Returns the number newly marked.
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

    const { ids } = body as { ids?: unknown }

    let parsedIds: string[] | undefined
    if (ids !== undefined) {
      if (!Array.isArray(ids) || !ids.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) {
        return NextResponse.json({ error: 'ids must be an array of notification IDs' }, { status: 400 })
      }
      parsedIds = ids as string[]
    }

    const updated = await markNotificationsRead({ userId: user.id, ids: parsedIds })

    return NextResponse.json({ updated })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in POST /api/v1/notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
