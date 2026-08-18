/**
 * Public project detail API Route Handler
 *
 * GET: Allowlist-projected public payload for a published project.
 * Unauthenticated (an optional Clerk session enriches the viewer block).
 * 404 unless the project is published (publicVisible).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getPublicProject } from '@/lib/services/projects'

/**
 * GET /api/v1/projects/public/[username]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    const { username } = await params

    const project = await getPublicProject(username, userId ?? null)

    return NextResponse.json({ project })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/projects/public/[username]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
