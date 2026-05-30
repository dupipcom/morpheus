import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchCalendarAvailability } from '@/lib/services/caldav'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET /api/v1/meet-me/availability?username=xxx&start=ISO&end=ISO
 *
 * Fetches the calendar busy slots for a target user from their Stalwart
 * CalDAV calendar. The requesting user must be authenticated.
 * Uses the requesting user's Clerk OIDC token to authenticate against
 * Stalwart (since Stalwart trusts Clerk as its OIDC provider).
 */
export async function GET(req: NextRequest) {
  const { userId, getToken } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const targetUsername = searchParams.get('username')
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')

  if (!targetUsername || !startParam || !endParam) {
    return NextResponse.json(
      { error: 'username, start, and end query parameters are required' },
      { status: 400 }
    )
  }

  const rangeStart = new Date(startParam)
  const rangeEnd = new Date(endParam)

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  if (rangeEnd <= rangeStart) {
    return NextResponse.json({ error: 'end must be after start' }, { status: 400 })
  }

  // Limit query range to 60 days max to prevent abuse
  const maxRangeMs = 60 * 24 * 60 * 60 * 1000
  if (rangeEnd.getTime() - rangeStart.getTime() > maxRangeMs) {
    return NextResponse.json({ error: 'Date range cannot exceed 60 days' }, { status: 400 })
  }

  // Verify the target profile exists
  const targetProfile = await prisma.profile.findFirst({
    where: { username: targetUsername },
    select: { userId: true },
  })

  if (!targetProfile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Get OIDC token from Clerk to authenticate against Stalwart
  const accessToken = await getToken()

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Failed to obtain authentication token' },
      { status: 500 }
    )
  }

  const result = await fetchCalendarAvailability(
    targetUsername,
    rangeStart,
    rangeEnd,
    accessToken
  )

  if (result.error) {
    // Still return busy slots (may be empty) but include the error
    return NextResponse.json(
      { busy: result.busy, warning: result.error },
      { status: 200 }
    )
  }

  return NextResponse.json({ busy: result.busy })
}
