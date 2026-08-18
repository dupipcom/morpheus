/**
 * Public organization API Route Handler (Phase 7)
 *
 * GET: Allowlist-projected public payload for a published org.
 * Unauthenticated; 404 unless publicVisible and ACTIVE.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getPublicOrg } from '@/lib/services/org'

/**
 * GET /api/v1/orgs/public/[username]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    const { username } = await params

    const organization = await getPublicOrg(username, userId ?? null)

    return NextResponse.json({ organization })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/orgs/public/[username]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
