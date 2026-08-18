/**
 * Public tasklist detail API Route Handler
 *
 * GET: Allowlist-projected public payload for a published list. Unauthenticated
 * (an optional Clerk session enriches the viewer block). 404 unless the list is
 * published (publicVisible) and PUBLIC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getPublicTaskList } from '@/lib/services/list'

/**
 * GET /api/v1/tasklists/public/[publicUrl]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicUrl: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    const { publicUrl } = await params

    const taskList = await getPublicTaskList(publicUrl, userId ?? null)

    return NextResponse.json({ taskList })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/tasklists/public/[publicUrl]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
