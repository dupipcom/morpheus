/**
 * Public event payload API Route Handler (Phase 8)
 *
 * GET: Allowlist-projected public payload (unauthenticated; optional session
 * enriches the viewer RSVP/like block). 404 unless PUBLISHED + PUBLIC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getPublicEvent } from '@/lib/services/events'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicUrl: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    const { publicUrl } = await params

    const event = await getPublicEvent(publicUrl, userId ?? null)

    return NextResponse.json({ event })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/events/public/[publicUrl]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
